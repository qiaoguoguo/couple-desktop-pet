import { describe, expect, it } from "vitest";
import {
  completeRemoteMessageDismissal,
  createEmptyRemoteMessageQueue,
  enqueueRemoteMessage,
  markRemoteMessageDismissing,
  markRemoteMessageHovered,
  revealRemoteSurprise,
} from "./remoteMessageQueue";

describe("remoteMessageQueue", () => {
  it("makes the first incoming message active", () => {
    const state = enqueueRemoteMessage(createEmptyRemoteMessageQueue(), {
      id: "msg_1",
      fromDeviceId: "dev_b",
      text: "想你啦",
      at: "2026-08-03T12:00:00.000Z",
    });

    expect(state.active).toEqual({
      id: "msg_1",
      fromDeviceId: "dev_b",
      text: "想你啦",
      at: "2026-08-03T12:00:00.000Z",
      stage: "visible",
    });
    expect(state.queue).toEqual([]);
  });

  it("queues later messages until the active message is dismissed", () => {
    const withFirst = enqueueRemoteMessage(createEmptyRemoteMessageQueue(), {
      id: "msg_1",
      fromDeviceId: "dev_b",
      text: "第一条",
      at: "2026-08-03T12:00:00.000Z",
    });
    const withSecond = enqueueRemoteMessage(withFirst, {
      id: "msg_2",
      fromDeviceId: "dev_b",
      text: "第二条",
      at: "2026-08-03T12:00:01.000Z",
    });

    expect(withSecond.active?.id).toBe("msg_1");
    expect(withSecond.queue.map((message) => message.id)).toEqual(["msg_2"]);
  });

  it("marks only the active matching message through hover and dismissal stages", () => {
    const state = enqueueRemoteMessage(createEmptyRemoteMessageQueue(), {
      id: "msg_1",
      fromDeviceId: "dev_b",
      text: "摸摸头",
      at: "2026-08-03T12:00:00.000Z",
    });

    expect(markRemoteMessageHovered(state, "other").active?.stage).toBe("visible");
    expect(markRemoteMessageHovered(state, "msg_1").active?.stage).toBe("hovered");
    expect(
      markRemoteMessageDismissing(
        markRemoteMessageHovered(state, "msg_1"),
        "msg_1",
      ).active?.stage,
    ).toBe("dismissing");
  });

  it("promotes queued messages after completing dismissal", () => {
    const withFirst = enqueueRemoteMessage(createEmptyRemoteMessageQueue(), {
      id: "msg_1",
      fromDeviceId: "dev_b",
      text: "第一条",
      at: "2026-08-03T12:00:00.000Z",
    });
    const withSecond = enqueueRemoteMessage(withFirst, {
      id: "msg_2",
      fromDeviceId: "dev_b",
      text: "第二条",
      at: "2026-08-03T12:00:01.000Z",
    });

    const next = completeRemoteMessageDismissal(withSecond, "msg_1");

    expect(next.active?.id).toBe("msg_2");
    expect(next.active?.stage).toBe("visible");
    expect(next.queue).toEqual([]);
  });

  it("starts surprise messages collapsed and ignores hover acknowledgement", () => {
    const state = enqueueRemoteMessage(createEmptyRemoteMessageQueue(), {
      id: "msg_surprise",
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

    expect(state.active).toMatchObject({
      id: "msg_surprise",
      stage: "collapsed",
      content: {
        kind: "surprise",
        version: 1,
        theme: "general",
        secret: "7482",
      },
    });
    expect(markRemoteMessageHovered(state, "msg_surprise")).toBe(state);
  });

  it("reveals only the active matching collapsed surprise", () => {
    const state = enqueueRemoteMessage(createEmptyRemoteMessageQueue(), {
      id: "msg_surprise",
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

    expect(revealRemoteSurprise(state, "other")).toBe(state);

    const revealed = revealRemoteSurprise(state, "msg_surprise");
    expect(revealed.active).toMatchObject({
      id: "msg_surprise",
      stage: "revealed",
    });
    expect(revealRemoteSurprise(revealed, "msg_surprise")).toBe(revealed);
  });

  it("keeps text behind a surprise in FIFO order until dismissal completes", () => {
    const withSurprise = enqueueRemoteMessage(createEmptyRemoteMessageQueue(), {
      id: "msg_surprise",
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
    const withText = enqueueRemoteMessage(withSurprise, {
      id: "msg_text",
      fromDeviceId: "dev_b",
      text: "普通消息",
      at: "2026-08-12T10:00:01.000Z",
    });

    expect(withText.active?.id).toBe("msg_surprise");
    expect(withText.queue.map((message) => message.id)).toEqual(["msg_text"]);

    const dismissing = markRemoteMessageDismissing(
      revealRemoteSurprise(withText, "msg_surprise"),
      "msg_surprise",
    );
    const promoted = completeRemoteMessageDismissal(dismissing, "msg_surprise");

    expect(promoted.active).toMatchObject({
      id: "msg_text",
      stage: "visible",
      text: "普通消息",
    });
    expect(promoted.queue).toEqual([]);
  });
});
