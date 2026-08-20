import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { getEdgePhaseMotion } from "../pet/edgeInteraction";
import { getBuiltInEdgeProfile } from "./builtInEdgeInteraction";

const sides = ["left", "right", "top", "bottom"] as const;
const phases = ["enter", "idle", "react"] as const;
const expectedContactAnchors = {
  left: { x: 0.2203125, y: 0.5 },
  right: { x: 0.778125, y: 0.5 },
  top: { x: 0.5, y: 0.05 },
  bottom: { x: 0.5, y: 0.367 },
} as const;

const retainedAssets = [
  {
    path: "src/assets/pets/q-girl/edge-interaction/top/idle/0001.png",
    width: 640,
    height: 720,
  },
  {
    path: "src/assets/pets/q-girl/edge-companion/side/idle.png",
    width: 1254,
    height: 1254,
  },
  {
    path: "src/assets/pets/q-girl/edge-companion/bottom/idle.png",
    width: 1303,
    height: 1207,
  },
] as const;

describe("getBuiltInEdgeProfile", () => {
  it("returns static profiles for all four Q-girl edges only", () => {
    for (const side of sides) {
      const profile = getBuiltInEdgeProfile("builtin:q-girl", side);

      expect(profile?.side).toBe(side);
      expect(profile?.contactAnchor).toEqual(expectedContactAnchors[side]);
    }

    expect(getBuiltInEdgeProfile("builtin:q-boy", "top")).toBeNull();
    expect(getBuiltInEdgeProfile("imported:any", "right")).toBeNull();
    expect(getBuiltInEdgeProfile("custom:pet", "bottom")).toBeNull();
  });

  it("uses the retained top frame for every dormant phase", () => {
    for (const side of sides) {
      const profile = getBuiltInEdgeProfile("builtin:q-girl", side);

      if (!profile) {
        throw new Error(`Missing built-in edge profile for ${side}`);
      }

      expect(profile.enter).toBe(profile.idle);
      expect(profile.react).toBe(profile.idle);

      for (const phase of phases) {
        expect(profile[phase]).toEqual({
          frames: [
            expect.stringContaining(
              "/q-girl/edge-interaction/top/idle/0001.png",
            ),
          ],
          fps: 1,
          loop: false,
          durationMs: 1000,
          frameAnchors: [expectedContactAnchors[side]],
        });
      }

      expect(getEdgePhaseMotion(profile, "exit")).toEqual(profile.idle);
    }
  });

  it("keeps side and bottom companions while top uses the hanging frame", () => {
    expect(getBuiltInEdgeProfile("builtin:q-girl", "left")?.companion).toMatchObject({
      placement: "side",
      mirrorX: true,
    });
    expect(getBuiltInEdgeProfile("builtin:q-girl", "right")?.companion).toMatchObject({
      placement: "side",
      mirrorX: false,
    });
    expect(getBuiltInEdgeProfile("builtin:q-girl", "bottom")?.companion).toMatchObject({
      placement: "bottom",
      mirrorX: false,
    });
    expect(
      getBuiltInEdgeProfile("builtin:q-girl", "top")?.companion,
    ).toBeUndefined();
  });

  it.each(retainedAssets)(
    "keeps $path as a transparent RGBA PNG",
    ({ path, width, height }) => {
      const png = readPng(join(process.cwd(), path));

      expect(png).toEqual({
        width,
        height,
        bitDepth: 8,
        colorType: 6,
        cornerAlpha: [0, 0, 0, 0],
      });
    },
    20_000,
  );
});

function readPng(path: string) {
  const bytes = readFileSync(path);
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");

  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  let offset = 8;
  const idatChunks: Buffer[] = [];

  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const type = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const data = bytes.subarray(dataStart, dataEnd);

    if (type === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8] ?? 0;
      colorType = data[9] ?? 0;
    } else if (type === "IDAT") {
      idatChunks.push(Buffer.from(data));
    } else if (type === "IEND") {
      break;
    }

    offset = dataEnd + 4;
  }

  const inflated = inflateSync(Buffer.concat(idatChunks));
  const rowLength = width * 4;
  let sourceOffset = 0;
  let previousRow = new Uint8Array(rowLength);
  const cornerAlpha = [0, 0, 0, 0];

  for (let y = 0; y < height; y += 1) {
    const filter = inflated[sourceOffset] ?? 0;
    sourceOffset += 1;
    const sourceRow = inflated.subarray(sourceOffset, sourceOffset + rowLength);
    sourceOffset += rowLength;
    const targetRow = new Uint8Array(rowLength);

    for (let index = 0; index < rowLength; index += 1) {
      const left = index >= 4 ? targetRow[index - 4] ?? 0 : 0;
      const up = previousRow[index] ?? 0;
      const upperLeft = index >= 4 ? previousRow[index - 4] ?? 0 : 0;
      const value = sourceRow[index] ?? 0;

      if (filter === 0) {
        targetRow[index] = value;
      } else if (filter === 1) {
        targetRow[index] = (value + left) & 0xff;
      } else if (filter === 2) {
        targetRow[index] = (value + up) & 0xff;
      } else if (filter === 3) {
        targetRow[index] = (value + Math.floor((left + up) / 2)) & 0xff;
      } else if (filter === 4) {
        targetRow[index] =
          (value + paethPredictor(left, up, upperLeft)) & 0xff;
      } else {
        throw new Error(`Unsupported PNG filter ${filter}`);
      }
    }

    if (y === 0) {
      cornerAlpha[0] = targetRow[3] ?? 0;
      cornerAlpha[1] = targetRow[rowLength - 1] ?? 0;
    } else if (y === height - 1) {
      cornerAlpha[2] = targetRow[3] ?? 0;
      cornerAlpha[3] = targetRow[rowLength - 1] ?? 0;
    }

    previousRow = targetRow;
  }

  return { width, height, bitDepth, colorType, cornerAlpha };
}

function paethPredictor(left: number, up: number, upperLeft: number) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);

  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) {
    return left;
  }

  return upDistance <= upperLeftDistance ? up : upperLeft;
}
