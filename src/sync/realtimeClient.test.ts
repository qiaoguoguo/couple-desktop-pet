import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RealtimeClient, type RealtimeClientEvent } from "./realtimeClient";

class FakeWebSocket extends EventTarget {
  static readonly OPEN = 1;
  static latest: FakeWebSocket | null = null;
  static instances: FakeWebSocket[] = [];

  readonly sentJson: unknown[] = [];
  readyState = 0;

  constructor(readonly url: string) {
    super();
    FakeWebSocket.latest = this;
    FakeWebSocket.instances.push(this);
  }

  send(data: string): void {
    this.sentJson.push(JSON.parse(data) as unknown);
  }

  close(): void {
    this.readyState = 3;
    this.dispatchEvent(new Event("close"));
  }

  emitOpen(): void {
    this.readyState = FakeWebSocket.OPEN;
    this.dispatchEvent(new Event("open"));
  }

  emitMessage(message: unknown): void {
    this.dispatchEvent(
      new MessageEvent("message", { data: JSON.stringify(message) }),
    );
  }

  emitClose(): void {
    this.readyState = 3;
    this.dispatchEvent(new Event("close"));
  }
}

describe("RealtimeClient", () => {
  beforeEach(() => {
    FakeWebSocket.latest = null;
    FakeWebSocket.instances = [];
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("authenticates and sends messages over websocket", () => {
    const events: RealtimeClientEvent[] = [];
    const client = new RealtimeClient({
      relayUrl: "http://127.0.0.1:8787",
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      pairId: "pair_1",
      webSocketFactory: (url) => new FakeWebSocket(url) as unknown as WebSocket,
      onEvent: (event) => events.push(event),
    });

    client.connect();
    const fakeSocket = expectLatestSocket();
    expect(fakeSocket.url).toBe("ws://127.0.0.1:8787/ws");

    fakeSocket.emitOpen();
    expect(fakeSocket.sentJson[0]).toMatchObject({
      type: "auth",
      deviceId: "dev_a",
      pairId: "pair_1",
    });

    fakeSocket.emitMessage({
      type: "auth.ok",
      requestId: "auth_1",
      pairId: "pair_1",
    });
    expect(events).toContainEqual({ type: "status", status: "connected" });

    const result = client.sendMessage("  想你啦  ");
    expect(result.ok).toBe(true);
    expect(fakeSocket.sentJson[1]).toMatchObject({
      type: "message.send",
      pairId: "pair_1",
      text: "想你啦",
    });
  });

  it("emits an error for malformed incoming messages", () => {
    const events: RealtimeClientEvent[] = [];
    const client = new RealtimeClient({
      relayUrl: "http://127.0.0.1:8787",
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      pairId: "pair_1",
      webSocketFactory: (url) => new FakeWebSocket(url) as unknown as WebSocket,
      onEvent: (event) => events.push(event),
    });

    client.connect();
    const fakeSocket = expectLatestSocket();
    fakeSocket.emitOpen();
    fakeSocket.emitMessage({ type: "unknown" });

    expect(events).toContainEqual({
      type: "error",
      message: "Malformed relay message",
    });
  });

  it("reconnects after an unexpected close with bounded backoff", () => {
    vi.useFakeTimers();
    const events: RealtimeClientEvent[] = [];
    const client = new RealtimeClient({
      relayUrl: "http://127.0.0.1:8787",
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      pairId: "pair_1",
      webSocketFactory: (url) => new FakeWebSocket(url) as unknown as WebSocket,
      onEvent: (event) => events.push(event),
    });

    client.connect();
    const firstSocket = expectLatestSocket();
    firstSocket.emitOpen();
    firstSocket.emitClose();

    expect(events).toContainEqual({ type: "status", status: "disconnected" });
    expect(FakeWebSocket.instances).toHaveLength(1);

    vi.advanceTimersByTime(999);
    expect(FakeWebSocket.instances).toHaveLength(1);

    vi.advanceTimersByTime(1);
    expect(FakeWebSocket.instances).toHaveLength(2);
    expect(FakeWebSocket.instances[1]?.url).toBe("ws://127.0.0.1:8787/ws");
  });

  it("does not reconnect after an explicit disconnect", () => {
    vi.useFakeTimers();
    const client = new RealtimeClient({
      relayUrl: "http://127.0.0.1:8787",
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      pairId: "pair_1",
      webSocketFactory: (url) => new FakeWebSocket(url) as unknown as WebSocket,
      onEvent: () => undefined,
    });

    client.connect();
    expectLatestSocket().emitOpen();
    client.disconnect();

    vi.advanceTimersByTime(30_000);

    expect(FakeWebSocket.instances).toHaveLength(1);
  });

  it("stops reconnecting after auth failure", () => {
    vi.useFakeTimers();
    const events: RealtimeClientEvent[] = [];
    const client = new RealtimeClient({
      relayUrl: "http://127.0.0.1:8787",
      deviceId: "dev_a",
      deviceSecret: "wrong_secret",
      pairId: "pair_1",
      webSocketFactory: (url) => new FakeWebSocket(url) as unknown as WebSocket,
      onEvent: (event) => events.push(event),
    });

    client.connect();
    const socket = expectLatestSocket();
    socket.emitOpen();
    socket.emitMessage({
      type: "error",
      requestId: "auth_1",
      code: "auth_failed",
      message: "Device authentication failed",
    });
    socket.emitClose();

    vi.advanceTimersByTime(30_000);

    expect(events).toContainEqual({ type: "status", status: "authFailed" });
    expect(FakeWebSocket.instances).toHaveLength(1);
  });
});

function expectLatestSocket(): FakeWebSocket {
  if (!FakeWebSocket.latest) {
    throw new Error("Expected fake socket to be created");
  }

  return FakeWebSocket.latest;
}
