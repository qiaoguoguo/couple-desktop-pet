import { describe, expect, it } from "vitest";
import { RealtimeClient, type RealtimeClientEvent } from "./realtimeClient";

class FakeWebSocket extends EventTarget {
  static readonly OPEN = 1;
  static latest: FakeWebSocket | null = null;

  readonly sentJson: unknown[] = [];
  readyState = 0;

  constructor(readonly url: string) {
    super();
    FakeWebSocket.latest = this;
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
}

describe("RealtimeClient", () => {
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
});

function expectLatestSocket(): FakeWebSocket {
  if (!FakeWebSocket.latest) {
    throw new Error("Expected fake socket to be created");
  }

  return FakeWebSocket.latest;
}
