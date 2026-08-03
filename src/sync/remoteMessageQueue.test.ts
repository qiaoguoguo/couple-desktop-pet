import { describe, expect, it } from "vitest";
import {
  completeRemoteMessageDismissal,
  createEmptyRemoteMessageQueue,
  enqueueRemoteMessage,
  markRemoteMessageDismissing,
  markRemoteMessageHovered,
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
});
