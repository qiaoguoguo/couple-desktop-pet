import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { getBuiltInEdgeProfile } from "./builtInEdgeInteraction";
import type { EdgePhase } from "../pet/edgeInteraction";

const sides = ["left", "right", "top", "bottom"] as const;
const phases = ["enter", "idle", "react"] as const;
const expectedCounts: Record<(typeof phases)[number], number> = {
  enter: 6,
  idle: 22,
  react: 6,
};

function frameNumber(url: string) {
  const match = url.match(/\/(\d{4})\.png(?:\?|$)/);

  if (!match) {
    throw new Error(`Frame URL has no numeric PNG name: ${url}`);
  }

  return Number(match[1]);
}

function filePathFromAssetUrl(url: string) {
  const pathPart = url.split("?")[0];
  const srcIndex = pathPart.indexOf("/src/assets/");

  if (srcIndex < 0) {
    throw new Error(`Asset URL does not point at src/assets: ${url}`);
  }

  return join(process.cwd(), pathPart.slice(srcIndex + 1));
}

function readPngInfo(filePath: string) {
  const bytes = readFileSync(filePath);
  const pngSignature = "89504e470d0a1a0a";

  expect(bytes.subarray(0, 8).toString("hex")).toBe(pngSignature);

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = 0;
  const idatChunks: Buffer[] = [];

  while (offset < bytes.length) {
    const length = bytes.readUInt32BE(offset);
    const chunkType = bytes.subarray(offset + 4, offset + 8).toString("ascii");
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    const data = bytes.subarray(dataStart, dataEnd);

    if (chunkType === "IHDR") {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data[8];
      colorType = data[9];
    } else if (chunkType === "IDAT") {
      idatChunks.push(Buffer.from(data));
    } else if (chunkType === "IEND") {
      break;
    }

    offset = dataEnd + 4;
  }

  if (width === 0 || height === 0) {
    throw new Error(`PNG missing IHDR: ${filePath}`);
  }

  const rgba = decodeRgbaScanlines(Buffer.concat(idatChunks), width, height);

  return {
    width,
    height,
    bitDepth,
    colorType,
    cornerAlpha: [
      alphaAt(rgba, width, 0, 0),
      alphaAt(rgba, width, width - 1, 0),
      alphaAt(rgba, width, 0, height - 1),
      alphaAt(rgba, width, width - 1, height - 1),
    ],
  };
}

function decodeRgbaScanlines(
  compressedData: Buffer,
  width: number,
  height: number,
) {
  const inflated = inflateSync(compressedData);
  const bytesPerPixel = 4;
  const rowLength = width * bytesPerPixel;
  const rgba = new Uint8Array(rowLength * height);
  let sourceOffset = 0;
  let previousRow = new Uint8Array(rowLength);

  for (let rowIndex = 0; rowIndex < height; rowIndex += 1) {
    const filter = inflated[sourceOffset];
    sourceOffset += 1;
    const sourceRow = inflated.subarray(sourceOffset, sourceOffset + rowLength);
    sourceOffset += rowLength;
    const targetRow = rgba.subarray(
      rowIndex * rowLength,
      (rowIndex + 1) * rowLength,
    );

    for (let index = 0; index < rowLength; index += 1) {
      const left = index >= bytesPerPixel ? targetRow[index - bytesPerPixel] : 0;
      const up = previousRow[index] ?? 0;
      const upperLeft =
        index >= bytesPerPixel ? previousRow[index - bytesPerPixel] : 0;
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

    previousRow = targetRow;
  }

  return rgba;
}

function paethPredictor(left: number, up: number, upperLeft: number) {
  const estimate = left + up - upperLeft;
  const leftDistance = Math.abs(estimate - left);
  const upDistance = Math.abs(estimate - up);
  const upperLeftDistance = Math.abs(estimate - upperLeft);

  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) {
    return left;
  }

  if (upDistance <= upperLeftDistance) {
    return up;
  }

  return upperLeft;
}

function alphaAt(
  rgba: Uint8Array,
  width: number,
  x: number,
  y: number,
) {
  return rgba[(y * width + x) * 4 + 3];
}

describe("getBuiltInEdgeProfile", () => {
  it("returns Q-girl edge interaction frames only for the built-in package", () => {
    expect(getBuiltInEdgeProfile("imported:boy", "left")).toBeNull();
    expect(getBuiltInEdgeProfile("builtin:unknown", "left")).toBeNull();
    expect(getBuiltInEdgeProfile("builtin:q-girl", "top")?.idle.frames).toHaveLength(22);
  });

  it("registers every bundled Q-girl edge PNG with continuous numbering", () => {
    const uniqueFrames = new Set<string>();

    for (const side of sides) {
      const profile = getBuiltInEdgeProfile("builtin:q-girl", side);

      expect(profile?.side).toBe(side);
      expect(profile).not.toBeNull();

      if (!profile) {
        continue;
      }

      for (const phase of phases) {
        const motion = profile[phase];
        const numbers = motion.frames.map(frameNumber);

        expect(motion.frames).toHaveLength(expectedCounts[phase]);
        expect(motion.frameAnchors).toHaveLength(expectedCounts[phase]);
        expect(numbers).toEqual(
          Array.from({ length: expectedCounts[phase] }, (_, index) => index + 1),
        );

        for (const frame of motion.frames) {
          expect(frame).toContain(`/q-girl/edge-interaction/${side}/${phase}/`);
          uniqueFrames.add(frame);
        }
      }
    }

    expect(uniqueFrames.size).toBe(136);
  });

  it("uses the specified timing and contact anchors", () => {
    const expectedContactAnchors = {
      left: { x: 0.275, y: 0.5 },
      right: { x: 0.725, y: 0.5 },
      top: { x: 0.5, y: 0.05 },
      bottom: { x: 0.5, y: 0.367 },
    } as const;

    for (const side of sides) {
      const profile = getBuiltInEdgeProfile("builtin:q-girl", side);

      expect(profile).not.toBeNull();

      if (!profile) {
        continue;
      }

      expect(profile.contactAnchor).toEqual(expectedContactAnchors[side]);
      expect(profile.enter).toMatchObject({
        fps: 8,
        loop: false,
        durationMs: 750,
      });
      expect(profile.idle).toMatchObject({
        fps: 4,
        loop: true,
        durationMs: 5500,
      });
      expect(profile.react).toMatchObject({
        fps: 6,
        loop: false,
        durationMs: 1000,
      });

      for (const phase of phases) {
        expect(
          profile[phase as Exclude<EdgePhase, "exit">].frameAnchors,
        ).toEqual(
          Array.from(
            { length: expectedCounts[phase] },
            () => expectedContactAnchors[side],
          ),
        );
      }
    }
  });

  it("bundles real transparent RGBA PNG files for every edge frame", () => {
    const filePaths = new Set<string>();

    for (const side of sides) {
      const profile = getBuiltInEdgeProfile("builtin:q-girl", side);

      if (!profile) {
        throw new Error(`Missing profile for ${side}`);
      }

      for (const phase of phases) {
        for (const frame of profile[phase].frames) {
          filePaths.add(filePathFromAssetUrl(frame));
        }
      }
    }

    expect(filePaths.size).toBe(136);

    for (const filePath of filePaths) {
      const png = readPngInfo(filePath);

      expect(png.width).toBe(640);
      expect(png.height).toBe(720);
      expect(png.bitDepth).toBe(8);
      expect(png.colorType).toBe(6);
      expect(png.cornerAlpha).toEqual([0, 0, 0, 0]);
    }
  });
});
