import { describe, expect, it } from "vitest";
import {
  createEmptyRemoteMessageQueue,
  enqueueRemoteMessage,
  type RemoteMessageQueueState,
} from "../sync/remoteMessageQueue";
import { projectStaticEdgeNotice } from "./edgeNoticeProjection";

function queueMessages(count: number): RemoteMessageQueueState {
  let queue = createEmptyRemoteMessageQueue();

  for (let index = 0; index < count; index += 1) {
    queue = enqueueRemoteMessage(queue, {
      id: `message-${index + 1}`,
      fromDeviceId: "dev-b",
      text: index === 0 ? "今晚一起看电影吗？" : `排队消息 ${index + 1}`,
      at: `2026-08-17T10:00:${String(index).padStart(2, "0")}.000Z`,
    });
  }

  return queue;
}

describe("projectStaticEdgeNotice", () => {
  it("returns null without an active remote queue item", () => {
    expect(projectStaticEdgeNotice(createEmptyRemoteMessageQueue())).toBeNull();
  });

  it("projects only the active text as a persistent expanded message", () => {
    const remoteMessages = queueMessages(3);
    const before = structuredClone(remoteMessages);
    const notice = projectStaticEdgeNotice(remoteMessages);

    expect(notice).toMatchObject({
      presentation: "expanded",
      expiresAt: null,
      presenceMarker: null,
      snapshot: { presence: null },
      active: {
        kind: "message",
        id: "message-1",
        title: "今晚一起看电影吗？",
        unreadCount: 3,
      },
    });
    expect(notice?.snapshot.remote).toEqual(notice?.active);
    expect(notice?.active?.kind).not.toBe("presence");
    expect(notice?.presentation).not.toBe("marker");
    expect(remoteMessages).toEqual(before);
  });

  it("keeps an active text ahead of a queued surprise", () => {
    const withText = enqueueRemoteMessage(createEmptyRemoteMessageQueue(), {
      id: "message-active",
      fromDeviceId: "dev-b",
      text: "先看到我",
      at: "2026-08-17T10:00:00.000Z",
    });
    const withQueuedSurprise = enqueueRemoteMessage(withText, {
      id: "surprise-queued",
      fromDeviceId: "dev-b",
      text: "外卖到了，取件码 7482，惊喜暗号 A-1024",
      at: "2026-08-17T10:00:01.000Z",
      content: {
        kind: "surprise",
        version: 1,
        theme: "general",
        secret: "A-1024",
        note: "取件码 7482",
      },
    });

    expect(projectStaticEdgeNotice(withQueuedSurprise)?.active).toMatchObject({
      kind: "message",
      id: "message-active",
      title: "先看到我",
      unreadCount: 2,
    });
  });

  it("projects a persistent expanded surprise without private content", () => {
    const remoteMessages = enqueueRemoteMessage(
      createEmptyRemoteMessageQueue(),
      {
        id: "surprise-1",
        fromDeviceId: "dev-b",
        text: "外卖到了，取件码 7482，惊喜暗号 A-1024",
        at: "2026-08-17T10:00:00.000Z",
        content: {
          kind: "surprise",
          version: 1,
          theme: "apology",
          secret: "A-1024",
          note: "取件码 7482，请原谅我",
        },
      },
    );
    const notice = projectStaticEdgeNotice(remoteMessages);
    const serialized = JSON.stringify(notice);

    expect(notice).toMatchObject({
      presentation: "expanded",
      expiresAt: null,
      presenceMarker: null,
      snapshot: { presence: null },
      active: {
        kind: "surprise",
        id: "surprise-1",
        title: "有一份心意正在等你",
        detail: "点一下，让惊喜慢慢打开",
        unreadCount: 1,
      },
    });
    expect(notice?.snapshot.remote).toEqual(notice?.active);
    expect(serialized).not.toMatch(
      /A-1024|7482|secret|note|外卖|取件码|暗号/,
    );
  });
});
