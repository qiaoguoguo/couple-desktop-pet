import { describe, expect, it } from "vitest";
import { toWebSocketRelayUrl } from "./relayUrl";

describe("toWebSocketRelayUrl", () => {
  it("converts http relay URLs to ws endpoint", () => {
    expect(toWebSocketRelayUrl("http://127.0.0.1:8787")).toBe(
      "ws://127.0.0.1:8787/ws",
    );
  });

  it("converts https relay URLs to wss endpoint", () => {
    expect(toWebSocketRelayUrl("https://relay.example.com/")).toBe(
      "wss://relay.example.com/ws",
    );
  });
});
