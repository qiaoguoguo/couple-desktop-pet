import { describe, expect, it } from "vitest";
import { ACTIVITY_STATUS_CAPABILITY } from "./activityStatus";
import { PROFILE_SYNC_CAPABILITY } from "./profileProtocol";
import { SPARK_SYNC_CAPABILITY } from "./sparkProtocol";
import {
  MESSAGE_TEXT_MAX_LENGTH,
  PAIR_CODE_LENGTH,
  PAIR_CODE_TTL_MS,
  parseServerToClientMessage,
  readSupportedCapabilities,
  validateStructuredMessageContent,
  validateMessageText,
  type AcceptPairCodeRequest,
  type AcceptPairCodeResponse,
  type CreatePairCodeRequest,
  type PairCodeStatusResponse,
} from "./syncProtocol";

const syncedProfile = {
  version: 1,
  nickname: "小满",
  city: {
    provider: "weatherapi",
    providerLocationId: 1785728,
    name: "杭州",
    region: "浙江",
    country: "中国",
    latitude: 30.27,
    longitude: 120.15,
  },
  updatedAt: "2026-08-18T08:00:00.000Z",
} as const;

const profileUpdate = {
  version: 1,
  nickname: "小满",
  city: syncedProfile.city,
} as const;

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

  it("parses valid received surprise content", () => {
    expect(
      parseServerToClientMessage({
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
      }),
    ).toEqual({
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
  });

  it("falls back to text when received content has an unknown version", () => {
    expect(
      parseServerToClientMessage({
        type: "message.received",
        pairId: "pair_1",
        serverMessageId: "server_1",
        fromDeviceId: "dev_b",
        text: "一份小心意在等你。惊喜暗号：7482。",
        sentAt: "2026-08-12T10:00:00.000Z",
        content: {
          kind: "surprise",
          version: 2,
          theme: "general",
          secret: "7482",
        },
      }),
    ).toEqual(
      expect.objectContaining({
        type: "message.received",
        text: "一份小心意在等你。惊喜暗号：7482。",
        content: undefined,
      }),
    );
  });

  it("falls back to text when received content has extra keys", () => {
    expect(
      parseServerToClientMessage({
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
          displayText: "future copy",
        },
      }),
    ).toEqual(
      expect.objectContaining({
        type: "message.received",
        text: "一份小心意在等你。惊喜暗号：7482。",
        content: undefined,
      }),
    );
  });

  it("keeps legacy received messages compatible with extra fields", () => {
    expect(
      parseServerToClientMessage({
        type: "message.received",
        pairId: "pair_1",
        serverMessageId: "server_1",
        fromDeviceId: "dev_b",
        text: "普通消息",
        sentAt: "2026-08-12T10:00:00.000Z",
        futureField: { ignored: true },
      }),
    ).toEqual({
      type: "message.received",
      pairId: "pair_1",
      serverMessageId: "server_1",
      fromDeviceId: "dev_b",
      text: "普通消息",
      sentAt: "2026-08-12T10:00:00.000Z",
    });
  });

  it("rejects malformed messages", () => {
    expect(parseServerToClientMessage({ type: "message.received" })).toBeNull();
    expect(parseServerToClientMessage(null)).toBeNull();
  });

  it("rejects error messages with unknown error codes", () => {
    expect(
      parseServerToClientMessage({
        type: "error",
        code: "not_a_code",
        message: "bad",
      }),
    ).toBeNull();
  });

  it("preserves both supported auth.ok capabilities and filters unknown ones", () => {
    expect(
      parseServerToClientMessage({
        type: "auth.ok",
        requestId: "auth_1",
        pairId: "pair_1",
        capabilities: [
          ACTIVITY_STATUS_CAPABILITY,
          PROFILE_SYNC_CAPABILITY,
          SPARK_SYNC_CAPABILITY,
          "future-capability",
        ],
      }),
    ).toEqual({
      type: "auth.ok",
      requestId: "auth_1",
      pairId: "pair_1",
      capabilities: [
        ACTIVITY_STATUS_CAPABILITY,
        PROFILE_SYNC_CAPABILITY,
        SPARK_SYNC_CAPABILITY,
      ],
    });
  });

  it("reads both supported client capability values", () => {
    expect(
      readSupportedCapabilities([
        PROFILE_SYNC_CAPABILITY,
        ACTIVITY_STATUS_CAPABILITY,
        SPARK_SYNC_CAPABILITY,
        "future-capability",
      ]),
    ).toEqual([
      PROFILE_SYNC_CAPABILITY,
      ACTIVITY_STATUS_CAPABILITY,
      SPARK_SYNC_CAPABILITY,
    ]);
  });

  it("parses spark snapshot updates", () => {
    expect(
      parseServerToClientMessage({
        type: "spark.updated",
        pairId: "pair_1",
        snapshot: {
          version: 1,
          pairId: "pair_1",
          streakDays: 28,
          tier: "heartflame",
          calendarState: "qualified_today",
          lastQualifiedDate: "2026-08-19",
          timezone: "Asia/Shanghai",
          asOf: "2026-08-19T02:00:00.000Z",
          refreshAt: "2026-08-19T16:00:00.000Z",
        },
      }),
    ).toEqual({
      type: "spark.updated",
      pairId: "pair_1",
      snapshot: expect.objectContaining({ streakDays: 28, tier: "heartflame" }),
    });
  });

  it("keeps legacy auth.ok messages compatible without capabilities", () => {
    expect(
      parseServerToClientMessage({
        type: "auth.ok",
        requestId: "auth_1",
        pairId: "pair_1",
      }),
    ).toEqual({
      type: "auth.ok",
      requestId: "auth_1",
      pairId: "pair_1",
    });
  });

  it("rejects auth.ok capabilities that are not string arrays", () => {
    expect(
      parseServerToClientMessage({
        type: "auth.ok",
        requestId: "auth_1",
        pairId: "pair_1",
        capabilities: [ACTIVITY_STATUS_CAPABILITY, 7],
      }),
    ).toBeNull();

    expect(
      parseServerToClientMessage({
        type: "auth.ok",
        requestId: "auth_1",
        pairId: "pair_1",
        capabilities: ACTIVITY_STATUS_CAPABILITY,
      }),
    ).toBeNull();
  });

  it("parses paired peer activity status updates", () => {
    expect(
      parseServerToClientMessage({
        type: "peer.status",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
        activityStatus: "slacking",
        changedAt: "2026-08-06T12:00:00.000Z",
      }),
    ).toMatchObject({
      type: "peer.status",
      activityStatus: "slacking",
    });

    expect(
      parseServerToClientMessage({
        type: "peer.status",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
        activityStatus: null,
        changedAt: "2026-08-06T12:00:00.000Z",
      }),
    ).toMatchObject({
      type: "peer.status",
      activityStatus: null,
    });
  });

  it("rejects unknown peer activity status values", () => {
    expect(
      parseServerToClientMessage({
        type: "peer.status",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
        activityStatus: "playing-games",
        changedAt: "2026-08-06T12:00:00.000Z",
      }),
    ).toBeNull();
  });

  it("parses peer profile updates", () => {
    expect(
      parseServerToClientMessage({
        type: "peer.profile",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
        profile: syncedProfile,
        changedAt: "2026-08-18T08:01:00.000Z",
      }),
    ).toEqual({
      type: "peer.profile",
      pairId: "pair_1",
      peerDeviceId: "dev_b",
      profile: syncedProfile,
      changedAt: "2026-08-18T08:01:00.000Z",
    });
  });

  it("rejects peer profile updates with malformed profiles", () => {
    expect(
      parseServerToClientMessage({
        type: "peer.profile",
        pairId: "pair_1",
        peerDeviceId: "dev_b",
        profile: { ...syncedProfile, version: 2 },
        changedAt: "2026-08-18T08:01:00.000Z",
      }),
    ).toBeNull();
  });

  it.each([
    "profile_incomplete",
    "weather_not_configured",
    "provider_unavailable",
    "quota_exhausted",
    "rate_limited",
  ])("parses shared profile and weather error code %s", (code) => {
    expect(
      parseServerToClientMessage({ type: "error", code, message: "unavailable" }),
    ).toMatchObject({ type: "error", code });
  });
});

describe("pairing profile contracts", () => {
  it("keeps request profiles and response peer profiles optional", () => {
    const legacyCreate: CreatePairCodeRequest = {
      deviceId: "dev_a",
      deviceSecret: "secret_a",
      displayName: "小满",
    };
    const createWithProfile: CreatePairCodeRequest = {
      ...legacyCreate,
      profile: profileUpdate,
    };
    const acceptWithProfile: AcceptPairCodeRequest = {
      ...legacyCreate,
      code: "123456",
      profile: profileUpdate,
    };
    const legacyAcceptResponse: AcceptPairCodeResponse = {
      pairId: "pair_1",
      peerDeviceId: "dev_b",
    };
    const pairedStatus: PairCodeStatusResponse = {
      status: "paired",
      pairId: "pair_1",
      peerDeviceId: "dev_b",
      peerProfile: syncedProfile,
    };

    expect(legacyCreate).not.toHaveProperty("profile");
    expect(createWithProfile.profile).toEqual(profileUpdate);
    expect(acceptWithProfile.profile).toEqual(profileUpdate);
    expect(legacyAcceptResponse).not.toHaveProperty("peerProfile");
    expect(pairedStatus).toMatchObject({ peerProfile: syncedProfile });
  });
});

describe("validateStructuredMessageContent", () => {
  const themes = [
    "cheer",
    "apology",
    "birthday",
    "festival",
    "miss",
    "general",
  ] as const;

  it.each(themes)("accepts surprise theme %s", (theme) => {
    expect(
      validateStructuredMessageContent({
        kind: "surprise",
        version: 1,
        theme,
        secret: "A-7482",
        note: "看到它的时候，就当我抱了你一下。",
      }),
    ).toEqual({
      ok: true,
      content: {
        kind: "surprise",
        version: 1,
        theme,
        secret: "A-7482",
        note: "看到它的时候，就当我抱了你一下。",
      },
    });
  });

  it("normalizes surrounding whitespace and omits an empty note", () => {
    expect(
      validateStructuredMessageContent({
        kind: "surprise",
        version: 1,
        theme: "general",
        secret: "  A-1024  ",
        note: "   ",
      }),
    ).toEqual({
      ok: true,
      content: {
        kind: "surprise",
        version: 1,
        theme: "general",
        secret: "A-1024",
      },
    });
  });

  it("rejects surprise content with keys outside the allowlist", () => {
    expect(
      validateStructuredMessageContent({
        kind: "surprise",
        version: 1,
        theme: "general",
        secret: "7482",
        displayText: "future copy",
      }),
    ).toEqual({
      ok: false,
      code: "malformed_message",
      message: expect.any(String),
    });
  });

  it.each([
    {
      name: "empty secret",
      content: {
        kind: "surprise",
        version: 1,
        theme: "general",
        secret: "   ",
      },
    },
    {
      name: "25 Unicode character secret",
      content: {
        kind: "surprise",
        version: 1,
        theme: "general",
        secret: "A".repeat(25),
      },
    },
    {
      name: "secret with spaces",
      content: {
        kind: "surprise",
        version: 1,
        theme: "general",
        secret: "74 82",
      },
    },
    {
      name: "secret with underscore",
      content: {
        kind: "surprise",
        version: 1,
        theme: "general",
        secret: "A_1024",
      },
    },
    {
      name: "121 character note",
      content: {
        kind: "surprise",
        version: 1,
        theme: "general",
        secret: "7482",
        note: "想".repeat(121),
      },
    },
    {
      name: "unknown kind",
      content: {
        kind: "gift",
        version: 1,
        theme: "general",
        secret: "7482",
      },
    },
    {
      name: "unknown theme",
      content: {
        kind: "surprise",
        version: 1,
        theme: "comfort",
        secret: "7482",
      },
    },
    {
      name: "non-integer version",
      content: {
        kind: "surprise",
        version: 1.5,
        theme: "general",
        secret: "7482",
      },
    },
  ])("rejects $name", ({ content }) => {
    expect(validateStructuredMessageContent(content)).toEqual({
      ok: false,
      code: "malformed_message",
      message: expect.any(String),
    });
  });
});
