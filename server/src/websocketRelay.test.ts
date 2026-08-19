import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTIVITY_STATUS_CAPABILITY } from "../../shared/activityStatus.js";
import {
  PROFILE_SYNC_CAPABILITY,
  type ProfileUpdateV1,
} from "../../shared/profileProtocol.js";
import { SPARK_SYNC_CAPABILITY } from "../../shared/sparkProtocol.js";
import { ProfileEventHub } from "./profileEvents.js";
import { createRelayServer, type RelayServer } from "./server.js";
import { SparkRepository } from "./spark/sparkRepository.js";

interface SocketInbox {
  messages: unknown[];
  waiters: Array<(message: unknown) => void>;
}

let tempDir = "";
let relay: RelayServer;
let baseUrl = "";
let wsUrl = "";
const inboxes = new WeakMap<WebSocket, SocketInbox>();
const readTimeoutMs = 1500;
const noMessageTimeoutMs = 150;
let nowValue = "2026-08-03T12:00:00.000Z";

const cityA = {
  provider: "weatherapi",
  providerLocationId: 1785728,
  name: "杭州",
  region: "浙江",
  country: "中国",
  latitude: 30.27,
  longitude: 120.15,
} as const;

const profileA = {
  version: 1,
  nickname: "小满",
  city: cityA,
} as const;

const profileB = {
  version: 1,
  nickname: "阿岚",
  city: {
    ...cityA,
    providerLocationId: 1795565,
    name: "上海",
    region: "上海",
    latitude: 31.23,
    longitude: 121.47,
  },
} as const;

beforeEach(async () => {
  nowValue = "2026-08-03T12:00:00.000Z";
  tempDir = mkdtempSync(join(tmpdir(), "couple-pet-relay-ws-"));
  relay = await createRelayServer({
    host: "127.0.0.1",
    port: 0,
    databasePath: join(tempDir, "relay.sqlite"),
    now: () => new Date(nowValue),
  });
  baseUrl = `http://127.0.0.1:${relay.port}`;
  wsUrl = `ws://127.0.0.1:${relay.port}/ws`;
});

afterEach(async () => {
  await relay.close();
  rmSync(tempDir, { recursive: true, force: true });
  vi.restoreAllMocks();
});

describe("websocket relay", () => {
  it("advertises spark-v1 and sends an initial snapshot only to capable clients", async () => {
    const pair = await createPair();
    const capable = await connectAndAuth("dev_a", "secret_a", pair.pairId, {
      capabilities: [SPARK_SYNC_CAPABILITY],
    });

    await expect(readJson(capable)).resolves.toMatchObject({
      type: "spark.updated",
      pairId: pair.pairId,
      snapshot: {
        pairId: pair.pairId,
        streakDays: 0,
        tier: "unlit",
      },
    });
    await expect(readJson(capable)).resolves.toMatchObject({ type: "peer.offline" });
    const capableClosed = onceClose(capable);
    capable.close();
    await capableClosed;

    const legacy = await connectAndAuth("dev_b", "secret_b", pair.pairId, {
      capabilities: [],
    });
    await expect(readJson(legacy)).resolves.toMatchObject({ type: "peer.offline" });
    await expectNoJson(legacy);
    legacy.close();
  });

  it("keeps authentication, messaging, presence, and cleanup usable when the initial spark snapshot fails", async () => {
    const pair = await createPair();
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.spyOn(SparkRepository.prototype, "getSnapshot").mockImplementationOnce(() => {
      throw new Error("private sqlite snapshot detail");
    });
    const alice = await connectAndAuth("dev_a", "secret_a", pair.pairId, {
      capabilities: [SPARK_SYNC_CAPABILITY],
    });

    await expect(readJson(alice)).resolves.toMatchObject({ type: "peer.offline" });
    const bob = await connectAndAuth("dev_b", "secret_b", pair.pairId, {
      capabilities: [],
    });
    await expect(readJson(bob)).resolves.toMatchObject({ type: "peer.online" });
    await expect(readJson(alice)).resolves.toMatchObject({ type: "peer.online" });

    sendText(alice, pair.pairId, "after_snapshot_failure", "认证仍然可用");
    await expect(readJson(bob)).resolves.toMatchObject({ type: "message.received" });
    await expect(readJson(alice)).resolves.toMatchObject({ type: "message.delivered" });

    const aliceClosed = onceClose(alice);
    alice.close();
    await aliceClosed;
    await expect(readJson(bob)).resolves.toMatchObject({
      type: "peer.offline",
      peerDeviceId: "dev_a",
    });
    expect(errorSpy).toHaveBeenCalledWith("Initial Spark snapshot failed", {
      category: "spark_initial_snapshot_failed",
      pairId: pair.pairId,
    });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain(
      "private sqlite snapshot detail",
    );

    bob.close();
  });

  it("records one weekday text interaction and pushes one snapshot to both capable peers", async () => {
    const pair = await createPair();
    const { alice, bob } = await connectSparkPeers(pair.pairId);

    sendText(alice, pair.pairId, "first", "想你啦");
    await expect(readJson(bob)).resolves.toMatchObject({ type: "message.received" });
    await expect(readJson(alice)).resolves.toMatchObject({ type: "message.delivered" });
    await expect(readJson(bob)).resolves.toMatchObject({
      type: "spark.updated",
      snapshot: { streakDays: 1, tier: "glimmer" },
    });
    await expect(readJson(alice)).resolves.toMatchObject({
      type: "spark.updated",
      snapshot: { streakDays: 1, tier: "glimmer" },
    });

    sendText(alice, pair.pairId, "duplicate", "今天第二次想你");
    await expect(readJson(bob)).resolves.toMatchObject({ type: "message.received" });
    await expect(readJson(alice)).resolves.toMatchObject({ type: "message.delivered" });
    await expectNoJson(alice);
    await expectNoJson(bob);

    alice.close();
    bob.close();
  });

  it("does not acknowledge or qualify a peer message when its async send callback fails", async () => {
    const pair = await createPair();
    const { alice, bob } = await connectSparkPeers(pair.pairId);
    const recordInteraction = vi.spyOn(
      SparkRepository.prototype,
      "recordQualifiedInteraction",
    );
    const originalSend = WebSocket.prototype.send;
    vi.spyOn(WebSocket.prototype, "send").mockImplementation((function (
      this: WebSocket,
      ...args: unknown[]
    ) {
      const payload = args[0];
      let message: { type?: unknown } | null = null;
      try {
        message = JSON.parse(String(payload)) as { type?: unknown };
      } catch {
        message = null;
      }

      if (message?.type === "message.received") {
        const callback =
          typeof args[1] === "function"
            ? args[1]
            : typeof args[2] === "function"
              ? args[2]
              : undefined;
        queueMicrotask(() => {
          callback?.(new Error("private async transport detail"));
        });
        return;
      }

      Reflect.apply(originalSend, this, args);
    }) as never);

    sendText(alice, pair.pairId, "async-failure", "这条消息没有刷入对端");

    const senderResult = await readJson(alice);
    expect(senderResult).toEqual({
      type: "error",
      requestId: "async-failure",
      code: "peer_offline",
      message: "Peer is offline",
    });
    expect(JSON.stringify(senderResult)).not.toContain("private async transport detail");
    await expectNoJson(alice);
    await expectNoJson(bob);
    expect(recordInteraction).not.toHaveBeenCalled();

    const snapshotResponse = await postJson(`${baseUrl}/pairs/spark/snapshot`, {
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      pairId: pair.pairId,
    });
    expect(snapshotResponse.status).toBe(200);
    await expect(snapshotResponse.json()).resolves.toMatchObject({
      pairId: pair.pairId,
      streakDays: 0,
      tier: "unlit",
    });

    alice.close();
    bob.close();
  });

  it("qualifies structured surprises but ignores weekend sends", async () => {
    const pair = await createPair();
    const { alice, bob } = await connectSparkPeers(pair.pairId);

    alice.send(JSON.stringify({
      type: "message.send",
      requestId: "surprise_first",
      pairId: pair.pairId,
      clientMessageId: "surprise_first",
      text: "给你一个惊喜",
      content: {
        kind: "surprise",
        version: 1,
        theme: "general",
        secret: "7482",
      },
    }));
    await expect(readJson(bob)).resolves.toMatchObject({ type: "message.received" });
    await expect(readJson(alice)).resolves.toMatchObject({ type: "message.delivered" });
    await expect(readJson(bob)).resolves.toMatchObject({
      type: "spark.updated",
      snapshot: { streakDays: 1 },
    });
    await expect(readJson(alice)).resolves.toMatchObject({ type: "spark.updated" });

    nowValue = "2026-08-08T04:00:00.000Z";
    sendText(alice, pair.pairId, "weekend", "周末也想你");
    await expect(readJson(bob)).resolves.toMatchObject({ type: "message.received" });
    await expect(readJson(alice)).resolves.toMatchObject({ type: "message.delivered" });
    await expectNoJson(alice);
    await expectNoJson(bob);

    alice.close();
    bob.close();
  });

  it("does not qualify peer-offline or malformed sends", async () => {
    const pair = await createPair();
    const alice = await connectAndAuth("dev_a", "secret_a", pair.pairId, {
      capabilities: [SPARK_SYNC_CAPABILITY],
    });
    await expect(readJson(alice)).resolves.toMatchObject({
      type: "spark.updated",
      snapshot: { streakDays: 0 },
    });
    await expect(readJson(alice)).resolves.toMatchObject({ type: "peer.offline" });

    sendText(alice, pair.pairId, "offline", "在吗");
    await expect(readJson(alice)).resolves.toMatchObject({
      type: "error",
      code: "peer_offline",
    });
    alice.send("not-json");
    await expect(readJson(alice)).resolves.toMatchObject({
      type: "error",
      code: "malformed_message",
    });

    const bob = await connectAndAuth("dev_b", "secret_b", pair.pairId, {
      capabilities: [SPARK_SYNC_CAPABILITY],
    });
    await expect(readJson(bob)).resolves.toMatchObject({
      type: "spark.updated",
      snapshot: { streakDays: 0 },
    });

    alice.close();
    bob.close();
  });

  it("keeps legacy delivery successful and still accounts it server-side", async () => {
    const pair = await createPair();
    const alice = await connectAndAuth("dev_a", "secret_a", pair.pairId);
    await expect(readJson(alice)).resolves.toMatchObject({ type: "peer.offline" });
    const bob = await connectAndAuth("dev_b", "secret_b", pair.pairId);
    await expect(readJson(bob)).resolves.toMatchObject({ type: "peer.online" });
    await expect(readJson(alice)).resolves.toMatchObject({ type: "peer.online" });

    sendText(alice, pair.pairId, "legacy", "旧客户端消息");
    await expect(readJson(bob)).resolves.toMatchObject({ type: "message.received" });
    await expect(readJson(alice)).resolves.toMatchObject({ type: "message.delivered" });
    await expectNoJson(alice);
    await expectNoJson(bob);

    const replacement = await connectAndAuth("dev_a", "secret_a", pair.pairId, {
      capabilities: [SPARK_SYNC_CAPABILITY],
    });
    await expect(readJson(replacement)).resolves.toMatchObject({
      type: "spark.updated",
      snapshot: { streakDays: 1 },
    });

    replacement.close();
    bob.close();
  });

  it("delivers the original message when spark persistence fails", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const pair = await createPair();
    const { alice, bob } = await connectSparkPeers(pair.pairId);
    vi.spyOn(SparkRepository.prototype, "recordQualifiedInteraction")
      .mockImplementationOnce(() => {
        throw new Error("sqlite detail must stay private");
      });

    sendText(alice, pair.pairId, "persistence-failure", "不要记录这段正文");
    await expect(readJson(bob)).resolves.toMatchObject({ type: "message.received" });
    await expect(readJson(alice)).resolves.toMatchObject({ type: "message.delivered" });
    await expectNoJson(alice);
    await expectNoJson(bob);
    expect(errorSpy).toHaveBeenCalledWith("Spark persistence failed", {
      category: "spark_persistence_failed",
      pairId: pair.pairId,
    });
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("不要记录这段正文");
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("sqlite detail");

    alice.close();
    bob.close();
  });

  it("authenticates paired devices and forwards an online message", async () => {
    const pair = await createPair();
    const alice = await connectAndAuth("dev_a", "secret_a", pair.pairId);

    await expect(readJson(alice)).resolves.toMatchObject({
      type: "peer.offline",
      pairId: pair.pairId,
      peerDeviceId: "dev_b",
      changedAt: "2026-08-03T12:00:00.000Z",
    });

    const bob = await connectAndAuth("dev_b", "secret_b", pair.pairId);

    await expect(readJson(bob)).resolves.toMatchObject({
      type: "peer.online",
      peerDeviceId: "dev_a",
      changedAt: "2026-08-03T12:00:00.000Z",
    });
    await expect(readJson(alice)).resolves.toMatchObject({
      type: "peer.online",
      peerDeviceId: "dev_b",
      changedAt: "2026-08-03T12:00:00.000Z",
    });

    alice.send(
      JSON.stringify({
        type: "message.send",
        requestId: "req_msg",
        pairId: pair.pairId,
        clientMessageId: "local_1",
        text: "想你啦",
      }),
    );

    await expect(readJson(bob)).resolves.toMatchObject({
      type: "message.received",
      pairId: pair.pairId,
      fromDeviceId: "dev_a",
      text: "想你啦",
    });
    await expect(readJson(alice)).resolves.toMatchObject({
      type: "message.delivered",
      requestId: "req_msg",
      clientMessageId: "local_1",
    });

    alice.close();
    await expect(readJson(bob)).resolves.toMatchObject({
      type: "peer.offline",
      pairId: pair.pairId,
      peerDeviceId: "dev_a",
      changedAt: "2026-08-03T12:00:00.000Z",
    });
    bob.close();
  });

  it("forwards valid surprise message content and confirms delivery", async () => {
    const pair = await createPair();
    const alice = await connectAndAuth("dev_a", "secret_a", pair.pairId);
    await expect(readJson(alice)).resolves.toMatchObject({ type: "peer.offline" });
    const bob = await connectAndAuth("dev_b", "secret_b", pair.pairId);
    await expect(readJson(bob)).resolves.toMatchObject({ type: "peer.online" });
    await expect(readJson(alice)).resolves.toMatchObject({ type: "peer.online" });

    alice.send(
      JSON.stringify({
        type: "message.send",
        requestId: "msg_surprise",
        pairId: pair.pairId,
        clientMessageId: "local_surprise",
        text: "一份小心意在等你。惊喜暗号：7482。",
        content: {
          kind: "surprise",
          version: 1,
          theme: "apology",
          secret: "7482",
          note: "是我不好。",
        },
      }),
    );

    await expect(readJson(bob)).resolves.toMatchObject({
      type: "message.received",
      pairId: pair.pairId,
      fromDeviceId: "dev_a",
      text: "一份小心意在等你。惊喜暗号：7482。",
      content: {
        kind: "surprise",
        version: 1,
        theme: "apology",
        secret: "7482",
        note: "是我不好。",
      },
    });
    await expect(readJson(alice)).resolves.toMatchObject({
      type: "message.delivered",
      requestId: "msg_surprise",
      clientMessageId: "local_surprise",
    });

    alice.close();
    bob.close();
  });

  it("rejects malformed surprise content without forwarding sensitive fields", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const pair = await createPair();
    const alice = await connectAndAuth("dev_a", "secret_a", pair.pairId);
    await expect(readJson(alice)).resolves.toMatchObject({ type: "peer.offline" });
    const bob = await connectAndAuth("dev_b", "secret_b", pair.pairId);
    await expect(readJson(bob)).resolves.toMatchObject({ type: "peer.online" });
    await expect(readJson(alice)).resolves.toMatchObject({ type: "peer.online" });

    alice.send(
      JSON.stringify({
        type: "message.send",
        requestId: "msg_bad_surprise",
        pairId: pair.pairId,
        clientMessageId: "local_bad_surprise",
        text: "一份小心意在等你。惊喜暗号：7482。",
        content: {
          kind: "surprise",
          version: 1,
          theme: "apology",
          secret: "74 82",
          note: "是我不好。",
        },
      }),
    );

    const errorMessage = await readJson(alice);
    expect(errorMessage).toMatchObject({
      type: "error",
      requestId: "msg_bad_surprise",
      code: "malformed_message",
    });
    expect(JSON.stringify(errorMessage)).not.toContain("74 82");
    expect(JSON.stringify(errorMessage)).not.toContain("是我不好。");
    await expectNoJson(bob);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("74 82");
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("是我不好。");

    alice.close();
    bob.close();
  });

  it("restores console.error after the log-safety assertion", () => {
    expect(vi.isMockFunction(console.error)).toBe(false);
  });

  it("rejects surprise content with extra keys and does not forward it", async () => {
    const pair = await createPair();
    const alice = await connectAndAuth("dev_a", "secret_a", pair.pairId);
    await expect(readJson(alice)).resolves.toMatchObject({ type: "peer.offline" });
    const bob = await connectAndAuth("dev_b", "secret_b", pair.pairId);
    await expect(readJson(bob)).resolves.toMatchObject({ type: "peer.online" });
    await expect(readJson(alice)).resolves.toMatchObject({ type: "peer.online" });

    alice.send(
      JSON.stringify({
        type: "message.send",
        requestId: "msg_extra_surprise",
        pairId: pair.pairId,
        clientMessageId: "local_extra_surprise",
        text: "一份小心意在等你。惊喜暗号：7482。",
        content: {
          kind: "surprise",
          version: 1,
          theme: "general",
          secret: "7482",
          displayText: "future copy",
        },
      }),
    );

    await expect(readJson(alice)).resolves.toMatchObject({
      type: "error",
      requestId: "msg_extra_surprise",
      code: "malformed_message",
    });
    await expectNoJson(bob);

    alice.close();
    bob.close();
  });

  it("keeps forwarding legacy pure-text messages without structured content", async () => {
    const pair = await createPair();
    const alice = await connectAndAuth("dev_a", "secret_a", pair.pairId);
    await expect(readJson(alice)).resolves.toMatchObject({ type: "peer.offline" });
    const bob = await connectAndAuth("dev_b", "secret_b", pair.pairId);
    await expect(readJson(bob)).resolves.toMatchObject({ type: "peer.online" });
    await expect(readJson(alice)).resolves.toMatchObject({ type: "peer.online" });

    alice.send(
      JSON.stringify({
        type: "message.send",
        requestId: "msg_text_only",
        pairId: pair.pairId,
        clientMessageId: "local_text_only",
        text: "今天也要好好吃饭",
      }),
    );

    const received = await readJson(bob);
    expect(received).toMatchObject({
      type: "message.received",
      pairId: pair.pairId,
      fromDeviceId: "dev_a",
      text: "今天也要好好吃饭",
    });
    expect(received).not.toHaveProperty("content");
    await expect(readJson(alice)).resolves.toMatchObject({
      type: "message.delivered",
      requestId: "msg_text_only",
      clientMessageId: "local_text_only",
    });

    alice.close();
    bob.close();
  });

  it("reports the peer as offline immediately after auth when the peer is absent", async () => {
    const pair = await createPair();
    const alice = await connectAndAuth("dev_a", "secret_a", pair.pairId);

    await expect(readJson(alice)).resolves.toMatchObject({
      type: "peer.offline",
      pairId: pair.pairId,
      peerDeviceId: "dev_b",
      changedAt: "2026-08-03T12:00:00.000Z",
    });

    alice.close();
  });

  it("rejects sends when the peer is offline", async () => {
    const pair = await createPair();
    const alice = await connectAndAuth("dev_a", "secret_a", pair.pairId);

    await expect(readJson(alice)).resolves.toMatchObject({
      type: "peer.offline",
      pairId: pair.pairId,
      peerDeviceId: "dev_b",
      changedAt: "2026-08-03T12:00:00.000Z",
    });

    alice.send(
      JSON.stringify({
        type: "message.send",
        requestId: "req_offline",
        pairId: pair.pairId,
        clientMessageId: "local_2",
        text: "在吗",
      }),
    );

    await expect(readJson(alice)).resolves.toEqual({
      type: "error",
      requestId: "req_offline",
      code: "peer_offline",
      message: "Peer is offline",
    });

    alice.close();
  });

  it("does not rebroadcast presence when a device replaces its own socket", async () => {
    const pair = await createPair();
    const alice = await connectAndAuth("dev_a", "secret_a", pair.pairId);

    await expect(readJson(alice)).resolves.toMatchObject({
      type: "peer.offline",
      pairId: pair.pairId,
      peerDeviceId: "dev_b",
      changedAt: "2026-08-03T12:00:00.000Z",
    });

    const bob = await connectAndAuth("dev_b", "secret_b", pair.pairId);

    await expect(readJson(bob)).resolves.toMatchObject({
      type: "peer.online",
      pairId: pair.pairId,
      peerDeviceId: "dev_a",
      changedAt: "2026-08-03T12:00:00.000Z",
    });
    await expect(readJson(alice)).resolves.toMatchObject({
      type: "peer.online",
      pairId: pair.pairId,
      peerDeviceId: "dev_b",
      changedAt: "2026-08-03T12:00:00.000Z",
    });

    const aliceReplacement = await connectAndAuth(
      "dev_a",
      "secret_a",
      pair.pairId,
    );

    await expect(readJson(aliceReplacement)).resolves.toMatchObject({
      type: "peer.online",
      pairId: pair.pairId,
      peerDeviceId: "dev_b",
      changedAt: "2026-08-03T12:00:00.000Z",
    });
    await expectNoJson(bob);

    aliceReplacement.close();
    await expect(readJson(bob)).resolves.toMatchObject({
      type: "peer.offline",
      pairId: pair.pairId,
      peerDeviceId: "dev_a",
      changedAt: "2026-08-03T12:00:00.000Z",
    });
    bob.close();
  });

  it("sends the persisted peer profile after profile-capable authentication", async () => {
    const pair = await createPair();
    await saveProfile("dev_a", "secret_a", profileA);
    await saveProfile("dev_b", "secret_b", profileB);

    const alice = await connectAndAuth("dev_a", "secret_a", pair.pairId, {
      capabilities: [ACTIVITY_STATUS_CAPABILITY, PROFILE_SYNC_CAPABILITY],
    });

    await expect(readJson(alice)).resolves.toEqual({
      type: "peer.profile",
      pairId: pair.pairId,
      peerDeviceId: "dev_b",
      profile: {
        ...profileB,
        updatedAt: "2026-08-03T12:00:00.001Z",
      },
      changedAt: "2026-08-03T12:00:00.001Z",
    });
    await expect(readJson(alice)).resolves.toMatchObject({
      type: "peer.offline",
      peerDeviceId: "dev_b",
    });

    alice.close();
  });

  it("does not send an initial persisted profile without profile capability", async () => {
    const pair = await createPair();
    await saveProfile("dev_b", "secret_b", profileB);

    const legacyAlice = await connectAndAuth("dev_a", "secret_a", pair.pairId, {
      capabilities: undefined,
    });

    await expect(readJson(legacyAlice)).resolves.toMatchObject({
      type: "peer.offline",
      peerDeviceId: "dev_b",
    });
    await expectNoJson(legacyAlice);
    legacyAlice.close();
  });

  it("pushes one peer profile after a committed HTTP profile save", async () => {
    const pair = await createPair();
    await saveProfile("dev_b", "secret_b", profileB);
    const alice = await connectAndAuth("dev_a", "secret_a", pair.pairId, {
      capabilities: [ACTIVITY_STATUS_CAPABILITY, PROFILE_SYNC_CAPABILITY],
    });
    await expect(readJson(alice)).resolves.toMatchObject({
      type: "peer.profile",
      profile: { updatedAt: "2026-08-03T12:00:00.001Z" },
    });
    await expect(readJson(alice)).resolves.toMatchObject({ type: "peer.offline" });

    await saveProfile("dev_b", "secret_b", {
      ...profileB,
      nickname: "阿岚的新昵称",
    });

    await expect(readJson(alice)).resolves.toEqual({
      type: "peer.profile",
      pairId: pair.pairId,
      peerDeviceId: "dev_b",
      profile: {
        ...profileB,
        nickname: "阿岚的新昵称",
        updatedAt: "2026-08-03T12:00:00.002Z",
      },
      changedAt: "2026-08-03T12:00:00.002Z",
    });
    await expectNoJson(alice);

    alice.close();
  });

  it("suppresses old-pair profile projection after unpair and re-pair", async () => {
    const pair = await createPair();
    const alice = await connectAndAuth("dev_a", "secret_a", pair.pairId, {
      capabilities: [ACTIVITY_STATUS_CAPABILITY, PROFILE_SYNC_CAPABILITY],
    });
    await expect(readJson(alice)).resolves.toMatchObject({ type: "peer.profile" });
    await expect(readJson(alice)).resolves.toMatchObject({ type: "peer.offline" });

    const unpairResponse = await postJson(`${baseUrl}/pairs/unpair`, {
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      pairId: pair.pairId,
    });
    expect(unpairResponse.status).toBe(200);
    const replacementPair = await createPairFor(
      "dev_b",
      "secret_b",
      "dev_c",
      "secret_c",
    );
    expect(replacementPair.pairId).not.toBe(pair.pairId);

    await saveProfile("dev_b", "secret_b", profileB);
    await expectNoJson(alice);
    alice.close();
  });

  it("projects profile updates exactly once to the replacement socket", async () => {
    const pair = await createPair();
    await saveProfile("dev_b", "secret_b", profileB);
    const alice = await connectAndAuth("dev_a", "secret_a", pair.pairId, {
      capabilities: [ACTIVITY_STATUS_CAPABILITY, PROFILE_SYNC_CAPABILITY],
    });
    await expect(readJson(alice)).resolves.toMatchObject({ type: "peer.profile" });
    await expect(readJson(alice)).resolves.toMatchObject({ type: "peer.offline" });
    const aliceClosed = onceClose(alice);

    const replacement = await connectAndAuth("dev_a", "secret_a", pair.pairId, {
      capabilities: [ACTIVITY_STATUS_CAPABILITY, PROFILE_SYNC_CAPABILITY],
    });
    await expect(readJson(replacement)).resolves.toMatchObject({
      type: "peer.profile",
    });
    await expect(readJson(replacement)).resolves.toMatchObject({
      type: "peer.offline",
    });
    await aliceClosed;

    await saveProfile("dev_b", "secret_b", {
      ...profileB,
      nickname: "只投影一次",
    });
    await expect(readJson(replacement)).resolves.toMatchObject({
      type: "peer.profile",
      peerDeviceId: "dev_b",
      profile: {
        nickname: "只投影一次",
        updatedAt: "2026-08-03T12:00:00.002Z",
      },
    });
    await expectNoJson(replacement);
    replacement.close();
  });

  it("orders initial profile before online presence and current peer status", async () => {
    const pair = await createPair();
    await saveProfile("dev_a", "secret_a", profileA);
    await saveProfile("dev_b", "secret_b", profileB);
    const bob = await connectAndAuth("dev_b", "secret_b", pair.pairId, {
      capabilities: [ACTIVITY_STATUS_CAPABILITY, PROFILE_SYNC_CAPABILITY],
    });
    await expect(readJson(bob)).resolves.toMatchObject({ type: "peer.profile" });
    await expect(readJson(bob)).resolves.toMatchObject({ type: "peer.offline" });
    bob.send(
      JSON.stringify({
        type: "status.update",
        requestId: "status_before_profile_peer",
        pairId: pair.pairId,
        activityStatus: "dazing",
      }),
    );
    await expectNoJson(bob);

    const alice = await connectAndAuth("dev_a", "secret_a", pair.pairId, {
      capabilities: [ACTIVITY_STATUS_CAPABILITY, PROFILE_SYNC_CAPABILITY],
    });
    const orderedMessages = [
      await readJson(alice),
      await readJson(alice),
      await readJson(alice),
    ];
    expect(orderedMessages).toMatchObject([
      { type: "peer.profile", peerDeviceId: "dev_b" },
      { type: "peer.online", peerDeviceId: "dev_b" },
      {
        type: "peer.status",
        peerDeviceId: "dev_b",
        activityStatus: "dazing",
      },
    ]);

    alice.close();
    bob.close();
  });

  it("tears down the profile event subscription when websocket relay closes", async () => {
    const originalSubscribe = ProfileEventHub.prototype.subscribe;
    const unsubscribe = vi.fn();
    const subscribeSpy = vi
      .spyOn(ProfileEventHub.prototype, "subscribe")
      .mockImplementation(function (this: ProfileEventHub, listener) {
        const removeListener = originalSubscribe.call(this, listener);
        return () => {
          unsubscribe();
          removeListener();
        };
      });
    let extraRelay: RelayServer | null = null;

    try {
      extraRelay = await createRelayServer({
        host: "127.0.0.1",
        port: 0,
        databasePath: join(tempDir, "listener-teardown.sqlite"),
      });
      await extraRelay.close();
      extraRelay = null;

      expect(unsubscribe).toHaveBeenCalledTimes(1);
    } finally {
      subscribeSpy.mockRestore();
      await extraRelay?.close();
    }
  });

  it("does not send peer profiles to legacy clients without capability", async () => {
    const pair = await createPair();
    const alice = await connectAndAuth("dev_a", "secret_a", pair.pairId, {
      capabilities: [ACTIVITY_STATUS_CAPABILITY],
    });
    await expect(readJson(alice)).resolves.toMatchObject({ type: "peer.offline" });

    await saveProfile("dev_b", "secret_b", profileB);
    await expectNoJson(alice);

    alice.close();
  });

  it("does not project self or unrelated profile updates as the peer", async () => {
    const pair = await createPair();
    await saveProfile("dev_b", "secret_b", profileB);
    const otherPair = await createPairFor(
      "dev_c",
      "secret_c",
      "dev_d",
      "secret_d",
    );
    const alice = await connectAndAuth("dev_a", "secret_a", pair.pairId, {
      capabilities: [ACTIVITY_STATUS_CAPABILITY, PROFILE_SYNC_CAPABILITY],
    });
    await expect(readJson(alice)).resolves.toMatchObject({
      type: "peer.profile",
      peerDeviceId: "dev_b",
    });
    await expect(readJson(alice)).resolves.toMatchObject({ type: "peer.offline" });

    await saveProfile("dev_a", "secret_a", profileA);
    await saveProfile("dev_c", "secret_c", profileA);
    await expectNoJson(alice);

    expect(otherPair.pairId).not.toBe(pair.pairId);
    alice.close();
  });

  it("forwards activity status updates only to the paired peer", async () => {
    const pair = await createPair();
    const otherPair = await createPairFor("dev_c", "secret_c", "dev_d", "secret_d");
    const charlie = await connectAndAuth("dev_c", "secret_c", otherPair.pairId);
    await expect(readJson(charlie)).resolves.toMatchObject({ type: "peer.offline" });
    const alice = await connectAndAuth("dev_a", "secret_a", pair.pairId);
    await expect(readJson(alice)).resolves.toMatchObject({ type: "peer.offline" });
    const bob = await connectAndAuth("dev_b", "secret_b", pair.pairId);
    await expect(readJson(bob)).resolves.toMatchObject({ type: "peer.online" });
    await expect(readJson(alice)).resolves.toMatchObject({ type: "peer.online" });

    alice.send(
      JSON.stringify({
        type: "status.update",
        requestId: "status_1",
        pairId: pair.pairId,
        activityStatus: "slacking",
      }),
    );

    await expect(readJson(bob)).resolves.toMatchObject({
      type: "peer.status",
      pairId: pair.pairId,
      peerDeviceId: "dev_a",
      activityStatus: "slacking",
      changedAt: "2026-08-03T12:00:00.000Z",
    });
    await expectNoJson(alice);
    await expectNoJson(charlie);

    alice.send(
      JSON.stringify({
        type: "status.update",
        requestId: "status_clear",
        pairId: pair.pairId,
        activityStatus: null,
      }),
    );

    await expect(readJson(bob)).resolves.toMatchObject({
      type: "peer.status",
      pairId: pair.pairId,
      peerDeviceId: "dev_a",
      activityStatus: null,
      changedAt: "2026-08-03T12:00:00.000Z",
    });
    await expectNoJson(alice);

    alice.close();
    bob.close();
    charlie.close();
  });

  it("does not send peer status events to legacy clients without capability", async () => {
    const pair = await createPair();
    const alice = await connectAndAuth("dev_a", "secret_a", pair.pairId);
    await expect(readJson(alice)).resolves.toMatchObject({ type: "peer.offline" });
    const legacyBob = await connectAndAuth("dev_b", "secret_b", pair.pairId, {
      capabilities: undefined,
    });
    await expect(readJson(legacyBob)).resolves.toMatchObject({ type: "peer.online" });
    await expect(readJson(alice)).resolves.toMatchObject({ type: "peer.online" });

    alice.send(
      JSON.stringify({
        type: "status.update",
        requestId: "status_for_legacy",
        pairId: pair.pairId,
        activityStatus: "slacking",
      }),
    );

    await expectNoJson(legacyBob);
    await expectNoJson(alice);

    alice.close();
    legacyBob.close();
  });

  it("rejects activity status updates for an incorrect pair", async () => {
    const pair = await createPair();
    const alice = await connectAndAuth("dev_a", "secret_a", pair.pairId);
    await expect(readJson(alice)).resolves.toMatchObject({ type: "peer.offline" });

    alice.send(
      JSON.stringify({
        type: "status.update",
        requestId: "status_wrong_pair",
        pairId: "pair_wrong",
        activityStatus: "dazing",
      }),
    );

    await expect(readJson(alice)).resolves.toEqual({
      type: "error",
      requestId: "status_wrong_pair",
      code: "auth_failed",
      message: "Pair authentication failed",
    });

    const bob = await connectAndAuth("dev_b", "secret_b", pair.pairId);
    await expect(readJson(bob)).resolves.toMatchObject({ type: "peer.online" });
    await expect(readJson(alice)).resolves.toMatchObject({ type: "peer.online" });
    await expectNoJson(bob);

    alice.send(
      JSON.stringify({
        type: "status.update",
        requestId: "status_after_wrong_pair",
        pairId: pair.pairId,
        activityStatus: "slacking",
      }),
    );
    await expect(readJson(bob)).resolves.toMatchObject({
      type: "peer.status",
      pairId: pair.pairId,
      peerDeviceId: "dev_a",
      activityStatus: "slacking",
    });
    await expectNoJson(alice);

    alice.close();
    bob.close();
  });

  it("rejects unknown activity status values", async () => {
    const pair = await createPair();
    const alice = await connectAndAuth("dev_a", "secret_a", pair.pairId);
    await expect(readJson(alice)).resolves.toMatchObject({ type: "peer.offline" });

    alice.send(
      JSON.stringify({
        type: "status.update",
        requestId: "status_unknown",
        pairId: pair.pairId,
        activityStatus: "playing-games",
      }),
    );

    await expect(readJson(alice)).resolves.toEqual({
      type: "error",
      requestId: "status_unknown",
      code: "malformed_message",
      message: "Malformed websocket message",
    });

    alice.close();
  });

  it("sends the current activity status to a later-authenticated paired peer", async () => {
    const pair = await createPair();
    const alice = await connectAndAuth("dev_a", "secret_a", pair.pairId);
    await expect(readJson(alice)).resolves.toMatchObject({ type: "peer.offline" });

    alice.send(
      JSON.stringify({
        type: "status.update",
        requestId: "status_before_peer",
        pairId: pair.pairId,
        activityStatus: "overtime",
      }),
    );
    await expectNoJson(alice);

    const bob = await connectAndAuth("dev_b", "secret_b", pair.pairId);
    await expect(readJson(bob)).resolves.toMatchObject({
      type: "peer.online",
      peerDeviceId: "dev_a",
    });
    await expect(readJson(bob)).resolves.toMatchObject({
      type: "peer.status",
      pairId: pair.pairId,
      peerDeviceId: "dev_a",
      activityStatus: "overtime",
    });

    alice.close();
    bob.close();
  });
});

async function createPair(): Promise<{ pairId: string }> {
  return createPairFor("dev_a", "secret_a", "dev_b", "secret_b");
}

async function createPairFor(
  deviceAId: string,
  deviceASecret: string,
  deviceBId: string,
  deviceBSecret: string,
): Promise<{ pairId: string }> {
  const codeResponse = await postJson(`${baseUrl}/pair-codes`, {
    deviceId: deviceAId,
    deviceSecret: deviceASecret,
    displayName: "星星桌宠",
  });
  const code = (await codeResponse.json()) as { code: string };
  const pairResponse = await postJson(`${baseUrl}/pairs/accept`, {
    deviceId: deviceBId,
    deviceSecret: deviceBSecret,
    displayName: "星星桌宠",
    code: code.code,
  });
  return (await pairResponse.json()) as { pairId: string };
}

async function connectAndAuth(
  deviceId: string,
  deviceSecret: string,
  pairId: string,
  options: { capabilities?: string[] } = {
    capabilities: [ACTIVITY_STATUS_CAPABILITY],
  },
): Promise<WebSocket> {
  const socket = new WebSocket(wsUrl);
  await onceOpen(socket);
  trackSocket(socket);
  socket.send(
    JSON.stringify({
      type: "auth",
      requestId: `auth_${deviceId}`,
      deviceId,
      deviceSecret,
      pairId,
      ...(options.capabilities === undefined
        ? {}
        : { capabilities: options.capabilities }),
    }),
  );
  const authMessage = await readJson(socket);
  expect(authMessage).toMatchObject({
    type: "auth.ok",
    pairId,
    capabilities: expect.arrayContaining([ACTIVITY_STATUS_CAPABILITY]),
  });
  if (options.capabilities?.includes(PROFILE_SYNC_CAPABILITY)) {
    expect(authMessage).toMatchObject({
      capabilities: expect.arrayContaining([
        ACTIVITY_STATUS_CAPABILITY,
        PROFILE_SYNC_CAPABILITY,
      ]),
    });
  }
  expect(authMessage).toMatchObject({
    capabilities: expect.arrayContaining([SPARK_SYNC_CAPABILITY]),
  });
  return socket;
}

async function connectSparkPeers(pairId: string): Promise<{
  alice: WebSocket;
  bob: WebSocket;
}> {
  const capabilities = [SPARK_SYNC_CAPABILITY];
  const alice = await connectAndAuth("dev_a", "secret_a", pairId, { capabilities });
  await expect(readJson(alice)).resolves.toMatchObject({ type: "spark.updated" });
  await expect(readJson(alice)).resolves.toMatchObject({ type: "peer.offline" });
  const bob = await connectAndAuth("dev_b", "secret_b", pairId, { capabilities });
  await expect(readJson(bob)).resolves.toMatchObject({ type: "spark.updated" });
  await expect(readJson(bob)).resolves.toMatchObject({ type: "peer.online" });
  await expect(readJson(alice)).resolves.toMatchObject({ type: "peer.online" });
  return { alice, bob };
}

function sendText(
  socket: WebSocket,
  pairId: string,
  requestId: string,
  text: string,
): void {
  socket.send(JSON.stringify({
    type: "message.send",
    requestId,
    pairId,
    clientMessageId: requestId,
    text,
  }));
}

function onceOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
}

function readJson(
  socket: WebSocket,
  timeoutMs: number = readTimeoutMs,
): Promise<unknown> {
  const inbox = inboxes.get(socket);
  if (!inbox) {
    throw new Error("Socket is not tracked");
  }

  const next = inbox.messages.shift();
  if (next) {
    return Promise.resolve(next);
  }

  return new Promise((resolve, reject) => {
    const waiter = (message: unknown) => {
      clearTimeout(timeout);
      resolve(message);
    };
    const timeout = setTimeout(() => {
      const waiterIndex = inbox.waiters.indexOf(waiter);
      if (waiterIndex >= 0) {
        inbox.waiters.splice(waiterIndex, 1);
      }
      reject(new Error("Timed out waiting for websocket message"));
    }, timeoutMs);

    inbox.waiters.push(waiter);
  });
}

async function expectNoJson(socket: WebSocket): Promise<void> {
  await expect(readJson(socket, noMessageTimeoutMs)).rejects.toThrow(
    "Timed out waiting for websocket message",
  );
}

function trackSocket(socket: WebSocket): void {
  const inbox: SocketInbox = { messages: [], waiters: [] };
  inboxes.set(socket, inbox);
  socket.on("message", (data) => {
    const message = JSON.parse(data.toString()) as unknown;
    const waiter = inbox.waiters.shift();
    if (waiter) {
      waiter(message);
      return;
    }

    inbox.messages.push(message);
  });
}

function postJson(url: string, body: unknown): Promise<Response> {
  return fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function onceClose(socket: WebSocket): Promise<void> {
  return new Promise((resolve) => {
    socket.once("close", () => resolve());
  });
}

async function saveProfile(
  deviceId: string,
  deviceSecret: string,
  profile: ProfileUpdateV1,
): Promise<void> {
  const response = await fetch(`${baseUrl}/devices/profile`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ deviceId, deviceSecret, profile }),
  });
  expect(response.status).toBe(200);
}
