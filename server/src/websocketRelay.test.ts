import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import WebSocket from "ws";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
const readTimeoutMs = 500;

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
});

async function createPair(): Promise<{ pairId: string }> {
  const codeResponse = await postJson(`${baseUrl}/pair-codes`, {
    deviceId: "dev_a",
    deviceSecret: "secret_a",
    displayName: "星星桌宠",
  });
  const code = (await codeResponse.json()) as { code: string };
  const pairResponse = await postJson(`${baseUrl}/pairs/accept`, {
    deviceId: "dev_b",
    deviceSecret: "secret_b",
    displayName: "星星桌宠",
    code: code.code,
  });
  return (await pairResponse.json()) as { pairId: string };
}

async function connectAndAuth(
  deviceId: string,
  deviceSecret: string,
  pairId: string,
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
    }),
  );
  await expect(readJson(socket)).resolves.toMatchObject({ type: "auth.ok", pairId });
  return socket;
}

function onceOpen(socket: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
}

function readJson(socket: WebSocket): Promise<unknown> {
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
    }, readTimeoutMs);

    inbox.waiters.push(waiter);
  });
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
