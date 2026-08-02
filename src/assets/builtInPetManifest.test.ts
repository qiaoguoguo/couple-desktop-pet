import { describe, expect, it } from "vitest";
import {
  builtInPetManifest,
  idleActionNames,
  interactionOptions,
  type InteractionActionName,
} from "./builtInPetManifest";

describe("builtInPetManifest", () => {
  it("defines six single-click interaction options", () => {
    expect(interactionOptions.map((option) => option.id)).toEqual([
      "act-cute",
      "act-typing",
      "act-wave",
      "act-hug",
      "act-pout",
      "act-drowsy",
    ] satisfies InteractionActionName[]);
    expect(interactionOptions.map((option) => option.label)).toEqual([
      "撒娇卖萌",
      "敲电脑",
      "打招呼",
      "求抱抱",
      "生气鼓脸",
      "困困打盹",
    ]);
  });

  it("keeps every idle and interaction action at least five seconds long", () => {
    const longActionIds = [
      ...idleActionNames,
      ...interactionOptions.map((option) => option.id),
    ];

    for (const actionId of longActionIds) {
      expect(
        builtInPetManifest.actions[actionId].durationMs,
      ).toBeGreaterThanOrEqual(5000);
    }
  });

  it("marks idle, movement, and interaction categories explicitly", () => {
    expect(builtInPetManifest.actions["idle-breathe"].category).toBe("idle");
    expect(builtInPetManifest.actions.walk.category).toBe("movement");
    expect(builtInPetManifest.actions["act-cute"].category).toBe(
      "interaction",
    );
  });
});
