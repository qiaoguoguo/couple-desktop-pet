import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTIVITY_STATUS_CAPABILITY } from "../../shared/activityStatus.js";
import { createRelayServer, type RelayServer } from "./server.js";

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

beforeEach(async () => {
  tempDir = mkdtempSync(join(tmpdir(), "couple-pet-relay-ws-"));
  relay = await createRelayServer({
    host: "127.0.0.1",
    port: 0,
    databasePath: join(tempDir, "relay.sqlite"),
    now: () => new Date("2026-08-03T12:00:00.000Z"),
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
  await expect(readJson(socket)).resolves.toMatchObject({
    type: "auth.ok",
    pairId,
    capabilities: [ACTIVITY_STATUS_CAPABILITY],
  });
  return socket;
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
