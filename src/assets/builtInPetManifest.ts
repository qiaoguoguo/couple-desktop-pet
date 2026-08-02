export type PetActionName = "idle" | "walk" | "drag" | "happy" | "sleep";

export interface PetActionDefinition {
  fps: number;
  loop: boolean;
  frames: readonly string[];
}

export interface BuiltInPetManifest {
  id: string;
  name: string;
  baseSize: {
    width: number;
    height: number;
  };
  actions: Record<PetActionName, PetActionDefinition>;
}

export const builtInPetManifest = {
  id: "star-sleeper",
  name: "星星睡衣小星人",
  baseSize: { width: 256, height: 320 },
  actions: {
    idle: {
      fps: 6,
      loop: true,
      frames: [
        "pets/star-sleeper/idle-01.png",
        "pets/star-sleeper/idle-02.png",
        "pets/star-sleeper/idle-03.png",
        "pets/star-sleeper/idle-04.png",
      ],
    },
    walk: {
      fps: 8,
      loop: true,
      frames: [
        "pets/star-sleeper/walk-01.png",
        "pets/star-sleeper/walk-02.png",
        "pets/star-sleeper/walk-03.png",
        "pets/star-sleeper/walk-04.png",
        "pets/star-sleeper/walk-05.png",
        "pets/star-sleeper/walk-06.png",
      ],
    },
    drag: {
      fps: 4,
      loop: true,
      frames: ["pets/star-sleeper/drag-01.png", "pets/star-sleeper/drag-02.png"],
    },
    happy: {
      fps: 8,
      loop: false,
      frames: [
        "pets/star-sleeper/happy-01.png",
        "pets/star-sleeper/happy-02.png",
        "pets/star-sleeper/happy-03.png",
        "pets/star-sleeper/happy-04.png",
      ],
    },
    sleep: {
      fps: 3,
      loop: true,
      frames: [
        "pets/star-sleeper/sleep-01.png",
        "pets/star-sleeper/sleep-02.png",
        "pets/star-sleeper/sleep-03.png",
        "pets/star-sleeper/sleep-04.png",
      ],
    },
  },
} as const satisfies BuiltInPetManifest;
