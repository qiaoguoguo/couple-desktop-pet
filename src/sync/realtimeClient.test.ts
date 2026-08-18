import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ACTIVITY_STATUS_CAPABILITY } from "../../shared/activityStatus";
import { PROFILE_SYNC_CAPABILITY } from "../../shared/profileProtocol";
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
      activityStatus: null,
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
      capabilities: [ACTIVITY_STATUS_CAPABILITY, PROFILE_SYNC_CAPABILITY],
    });

    fakeSocket.emitMessage({
      type: "auth.ok",
      requestId: "auth_1",
      pairId: "pair_1",
      capabilities: [ACTIVITY_STATUS_CAPABILITY],
    });
    expect(events).toContainEqual({ type: "status", status: "connected" });
    expect(fakeSocket.sentJson[1]).toMatchObject({
      type: "status.update",
      pairId: "pair_1",
      activityStatus: null,
    });

    const result = client.sendMessage("  想你啦  ");
    expect(result.ok).toBe(true);
    expect(fakeSocket.sentJson[2]).toMatchObject({
      type: "message.send",
      pairId: "pair_1",
      text: "想你啦",
    });
  });

  it("sends structured surprise content with the fallback text", () => {
    const events: RealtimeClientEvent[] = [];
    const client = newRealtimeClient(events, { activityStatus: null });

    client.connect();
    const fakeSocket = expectLatestSocket();
    fakeSocket.emitOpen();
    fakeSocket.emitMessage({
      type: "auth.ok",
      requestId: "auth_1",
      pairId: "pair_1",
      capabilities: [ACTIVITY_STATUS_CAPABILITY],
    });

    const result = client.sendMessage(
      "一份小心意在等你。惊喜暗号：7482。",
      {
        kind: "surprise",
        version: 1,
        theme: "general",
        secret: "7482",
      },
    );

    expect(result.ok).toBe(true);
    expect(fakeSocket.sentJson.at(-1)).toMatchObject({
      type: "message.send",
      pairId: "pair_1",
      text: "一份小心意在等你。惊喜暗号：7482。",
      content: {
        kind: "surprise",
        version: 1,
        theme: "general",
        secret: "7482",
      },
    });
  });

  it("sends the configured activity status after authentication", () => {
    const events: RealtimeClientEvent[] = [];
    const client = newRealtimeClient(events, { activityStatus: "overtime" });

    client.connect();
    const fakeSocket = expectLatestSocket();
    fakeSocket.emitOpen();
    fakeSocket.emitMessage({
      type: "auth.ok",
      requestId: "auth_1",
      pairId: "pair_1",
      capabilities: [ACTIVITY_STATUS_CAPABILITY],
    });

    expect(fakeSocket.sentJson[1]).toMatchObject({
      type: "status.update",
      pairId: "pair_1",
      activityStatus: "overtime",
    });
  });

  it("sends live activity status changes and resends the latest value after reconnect", () => {
    vi.useFakeTimers();
    const events: RealtimeClientEvent[] = [];
    const client = newRealtimeClient(events, { activityStatus: null });

    client.connect();
    const firstSocket = expectLatestSocket();
    firstSocket.emitOpen();
    firstSocket.emitMessage({
      type: "auth.ok",
      requestId: "auth_1",
      pairId: "pair_1",
      capabilities: [ACTIVITY_STATUS_CAPABILITY],
    });

    expect(client.setActivityStatus("dazing")).toEqual({ synced: true });
    expect(firstSocket.sentJson.at(-1)).toMatchObject({
      type: "status.update",
      pairId: "pair_1",
      activityStatus: "dazing",
    });

    firstSocket.emitClose();
    expect(client.setActivityStatus("slacking")).toEqual({ synced: false });

    vi.advanceTimersByTime(1000);
    const secondSocket = expectLatestSocket();
    secondSocket.emitOpen();
    secondSocket.emitMessage({
      type: "auth.ok",
      requestId: "auth_2",
      pairId: "pair_1",
      capabilities: [ACTIVITY_STATUS_CAPABILITY],
    });

    expect(secondSocket.sentJson[1]).toMatchObject({
      type: "status.update",
      pairId: "pair_1",
      activityStatus: "slacking",
    });
  });

  it("does not send activity status to legacy relays that omit the capability", () => {
    const events: RealtimeClientEvent[] = [];
    const client = newRealtimeClient(events, { activityStatus: "overtime" });

    client.connect();
    const fakeSocket = expectLatestSocket();
    fakeSocket.emitOpen();
    expect(fakeSocket.sentJson[0]).toMatchObject({
      type: "auth",
      capabilities: [ACTIVITY_STATUS_CAPABILITY, PROFILE_SYNC_CAPABILITY],
    });

    fakeSocket.emitMessage({
      type: "auth.ok",
      requestId: "auth_1",
      pairId: "pair_1",
    });

    expect(events).toContainEqual({ type: "status", status: "connected" });
    expect(fakeSocket.sentJson).toHaveLength(1);

    const result = client.sendMessage("聊天仍可用");
    expect(result.ok).toBe(true);
    expect(fakeSocket.sentJson[1]).toMatchObject({
      type: "message.send",
      pairId: "pair_1",
      text: "聊天仍可用",
    });
  });

  it("emits peer activity status events from relay messages", () => {
    const events: RealtimeClientEvent[] = [];
    const client = newRealtimeClient(events, { activityStatus: null });

    client.connect();
    const fakeSocket = expectLatestSocket();
    fakeSocket.emitOpen();
    fakeSocket.emitMessage({
      type: "peer.status",
      pairId: "pair_1",
      peerDeviceId: "dev_b",
      activityStatus: "slacking",
      changedAt: "2026-08-06T12:00:00.000Z",
    });

    expect(events).toContainEqual({
      type: "peerStatus",
      peerDeviceId: "dev_b",
      peerActivityStatus: "slacking",
      changedAt: "2026-08-06T12:00:00.000Z",
    });
  });

  it("advertises profile-v1 and emits peer profiles", () => {
    const events: RealtimeClientEvent[] = [];
    const client = newRealtimeClient(events, { activityStatus: null });
    const profile = {
      version: 1 as const,
      nickname: "阿岚",
      city: {
        provider: "weatherapi" as const,
        providerLocationId: 1796236,
        name: "Shanghai",
        region: "Shanghai",
        country: "China",
        latitude: 31.23,
        longitude: 121.47,
      },
      updatedAt: "2026-08-18T08:01:00.000Z",
    };

    client.connect();
    const fakeSocket = expectLatestSocket();
    fakeSocket.emitOpen();
    expect(fakeSocket.sentJson[0]).toMatchObject({
      type: "auth",
      capabilities: expect.arrayContaining([PROFILE_SYNC_CAPABILITY]),
    });

    fakeSocket.emitMessage({
      type: "peer.profile",
      pairId: "pair_1",
      peerDeviceId: "dev_b",
      profile,
      changedAt: profile.updatedAt,
    });

    expect(events).toContainEqual({
      type: "peerProfile",
      peerDeviceId: "dev_b",
      profile,
      changedAt: profile.updatedAt,
    });
  });

  it("emits valid structured content from received messages", () => {
    const events: RealtimeClientEvent[] = [];
    const client = newRealtimeClient(events, { activityStatus: null });

    client.connect();
    const fakeSocket = expectLatestSocket();
    fakeSocket.emitOpen();
    fakeSocket.emitMessage({
      type: "message.received",
      pairId: "pair_1",
      serverMessageId: "server_1",
      fromDeviceId: "dev_b",
      text: "一份小心意在等你。惊喜暗号：7482。",
      sentAt: "2026-08-12T10:00:00.000Z",
      content: {
        kind: "surprise",
        version: 1,
        theme: "general",
        secret: "7482",
      },
    });

    expect(events).toContainEqual({
      type: "message",
      id: "server_1",
      fromDeviceId: "dev_b",
      text: "一份小心意在等你。惊喜暗号：7482。",
      at: "2026-08-12T10:00:00.000Z",
      content: {
        kind: "surprise",
        version: 1,
        theme: "general",
        secret: "7482",
      },
    });
  });

  it("downgrades unknown received content versions to text-only events", () => {
    const events: RealtimeClientEvent[] = [];
    const client = newRealtimeClient(events, { activityStatus: null });

    client.connect();
    const fakeSocket = expectLatestSocket();
    fakeSocket.emitOpen();
    fakeSocket.emitMessage({
      type: "message.received",
      pairId: "pair_1",
      serverMessageId: "server_2",
      fromDeviceId: "dev_b",
      text: "一份小心意在等你。惊喜暗号：A-1024。",
      sentAt: "2026-08-12T10:00:01.000Z",
      content: {
        kind: "surprise",
        version: 2,
        theme: "general",
        secret: "A-1024",
      },
    });

    expect(events).toContainEqual({
      type: "message",
      id: "server_2",
      fromDeviceId: "dev_b",
      text: "一份小心意在等你。惊喜暗号：A-1024。",
      at: "2026-08-12T10:00:01.000Z",
      content: undefined,
    });
  });

  it("emits an error for malformed incoming messages", () => {
    const events: RealtimeClientEvent[] = [];
    const client = new RealtimeClient({
      relayUrl: "http://127.0.0.1:8787",
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      pairId: "pair_1",
      activityStatus: null,
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

  it("emits peer presence timestamps from relay events", () => {
    const events: RealtimeClientEvent[] = [];
    const client = new RealtimeClient({
      relayUrl: "http://127.0.0.1:8787",
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      pairId: "pair_1",
      activityStatus: null,
      webSocketFactory: (url) => new FakeWebSocket(url) as unknown as WebSocket,
      onEvent: (event) => events.push(event),
    });

    client.connect();
    const fakeSocket = expectLatestSocket();
    fakeSocket.emitOpen();
    fakeSocket.emitMessage({
      type: "peer.offline",
      pairId: "pair_1",
      peerDeviceId: "dev_b",
      changedAt: "2026-08-06T08:00:00.000Z",
      lastSeenAt: "2026-08-06T07:58:00.000Z",
    });

    expect(events).toContainEqual({
      type: "presence",
      peerPresence: "offline",
      peerDeviceId: "dev_b",
      changedAt: "2026-08-06T08:00:00.000Z",
      lastSeenAt: "2026-08-06T07:58:00.000Z",
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
      activityStatus: null,
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
      activityStatus: null,
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
      activityStatus: null,
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

function newRealtimeClient(
  events: RealtimeClientEvent[],
  overrides: { activityStatus: "slacking" | "dazing" | "overtime" | null },
): RealtimeClient {
  return new RealtimeClient({
    relayUrl: "http://127.0.0.1:8787",
    deviceId: "dev_a",
    deviceSecret: "secret_a",
    pairId: "pair_1",
    webSocketFactory: (url) => new FakeWebSocket(url) as unknown as WebSocket,
    onEvent: (event) => events.push(event),
    ...overrides,
  });
}

function expectLatestSocket(): FakeWebSocket {
  if (!FakeWebSocket.latest) {
    throw new Error("Expected fake socket to be created");
  }

  return FakeWebSocket.latest;
}
