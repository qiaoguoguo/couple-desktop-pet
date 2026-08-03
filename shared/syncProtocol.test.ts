import { describe, expect, it } from "vitest";
import {
  MESSAGE_TEXT_MAX_LENGTH,
  PAIR_CODE_LENGTH,
  PAIR_CODE_TTL_MS,
  parseServerToClientMessage,
  validateMessageText,
} from "./syncProtocol";

describe("sync protocol constants", () => {
  it("uses the MVP limits from the approved realtime design", () => {
    expect(MESSAGE_TEXT_MAX_LENGTH).toBe(300);
    expect(PAIR_CODE_LENGTH).toBe(6);
    expect(PAIR_CODE_TTL_MS).toBe(10 * 60 * 1000);
  });
});

describe("validateMessageText", () => {
  it("trims and accepts short text", () => {
    expect(validateMessageText("  想你啦  ")).toEqual({ ok: true, text: "想你啦" });
  });

  it("rejects empty text", () => {
    expect(validateMessageText("   ")).toEqual({
      ok: false,
      code: "message_empty",
      message: "Message text is empty",
    });
  });

  it("rejects text over 300 code points", () => {
    const result = validateMessageText("星".repeat(301));

    expect(result).toEqual({
      ok: false,
      code: "message_too_long",
      message: "Message text exceeds 300 characters",
    });
  });
});

describe("parseServerToClientMessage", () => {
  it("parses a valid received message", () => {
    expect(
      parseServerToClientMessage({
        type: "message.received",
        pairId: "pair_1",
        serverMessageId: "msg_1",
        fromDeviceId: "dev_a",
        text: "你好",
        sentAt: "2026-08-03T12:00:00.000Z",
      }),
    ).toEqual({
      type: "message.received",
      pairId: "pair_1",
      serverMessageId: "msg_1",
      fromDeviceId: "dev_a",
      text: "你好",
      sentAt: "2026-08-03T12:00:00.000Z",
    });
  });

  it("rejects malformed messages", () => {
    expect(parseServerToClientMessage({ type: "message.received" })).toBeNull();
    expect(parseServerToClientMessage(null)).toBeNull();
  });
});
