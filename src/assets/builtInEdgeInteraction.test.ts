import { readFileSync } from "node:fs";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { getBuiltInEdgeProfile } from "./builtInEdgeInteraction";
import { getEdgePhaseMotion, type EdgePhase } from "../pet/edgeInteraction";

const sides = ["left", "right", "top", "bottom"] as const;
const phases = ["enter", "idle", "react"] as const;
const expectedCounts: Record<(typeof phases)[number], number> = {
  enter: 6,
  idle: 22,
  react: 6,
};
const expectedAssetSide = {
  left: "right",
  right: "left",
  top: "top",
  bottom: "bottom",
} as const;
const expectedContactAnchors = {
  left: { x: 0.2203125, y: 0.5 },
  right: { x: 0.778125, y: 0.5 },
  top: { x: 0.5, y: 0.05 },
  bottom: { x: 0.5, y: 0.367 },
} as const;
const expectedPhaseContactAnchors = {
  left: {
    enter: [null, 0.475, 0.4625, 0.4625, null, null],
    idle: [
      0.3, 0.2203125, 0.3125, 0.3140625, 0.321875, 0.3265625,
      0.25, 0.315625, 0.31875, 0.3078125, 0.3125, 0.3125,
      0.3125, 0.3078125, 0.31875, 0.315625, 0.25, 0.3265625,
      0.321875, 0.3140625, 0.3125, 0.2203125,
    ],
    react: [0.403125, 0.36875, 0.39375, 0.3703125, 0.3640625, 0.40625],
  },
  right: {
    enter: [null, 0.5234375, 0.5359375, 0.5359375, null, null],
    idle: [
      0.6984375, 0.778125, 0.6875, 0.684375, 0.6765625, 0.671875,
      0.75, 0.6828125, 0.6796875, 0.690625, 0.6859375, 0.6859375,
      0.6859375, 0.690625, 0.6796875, 0.6828125, 0.75, 0.671875,
      0.6765625, 0.684375, 0.6875, 0.778125,
    ],
    react: [0.5953125, 0.6296875, 0.6046875, 0.628125, 0.634375, 0.5921875],
  },
  top: null,
  bottom: null,
} as const;

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
    foreground: findForegroundGeometry(rgba, width, height),
    interiorTransparentHoles: findInteriorTransparentHoles(rgba, width, height),
    suspiciousForegroundArtifacts: findSuspiciousForegroundArtifacts(
      rgba,
      width,
      height,
    ),
    suspiciousChromaResidues: findSuspiciousChromaResidues(rgba, width, height),
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

function readFramePngInfo(frameUrl: string) {
  return readPngInfo(filePathFromAssetUrl(frameUrl));
}

function findForegroundGeometry(
  rgba: Uint8Array,
  width: number,
  height: number,
) {
  const foregroundAlphaThreshold = 16;
  let area = 0;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (alphaAt(rgba, width, x, y) <= foregroundAlphaThreshold) {
        continue;
      }

      area += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return {
    area,
    bounds:
      area > 0
        ? {
            minX,
            minY,
            maxX,
            maxY,
            width: maxX - minX + 1,
            height: maxY - minY + 1,
          }
        : null,
  };
}

function findSuspiciousChromaResidues(
  rgba: Uint8Array,
  width: number,
  height: number,
) {
  const residues: Array<{ x: number; y: number; rgba: [number, number, number, number] }> =
    [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      const red = rgba[offset] ?? 0;
      const green = rgba[offset + 1] ?? 0;
      const blue = rgba[offset + 2] ?? 0;
      const alpha = rgba[offset + 3] ?? 0;

      if (alpha < 16) {
        continue;
      }

      const magentaKey = Math.min(red, blue) - green;
      const brightness = (red + green + blue) / 3;
      const greenResidue =
        green > 130 && green > red + 45 && green > blue + 45;
      const darkBoundaryMagentaResidue =
        brightness < 145 &&
        green < 96 &&
        magentaKey > 12 &&
        red > green + 8 &&
        blue > green + 8 &&
        hasNearbyTransparentPixel(rgba, width, height, x, y, 10);
      const magentaResidue =
        (red > 205 &&
          blue > 185 &&
          green < 180 &&
          magentaKey > 42 &&
          red > green + 32 &&
          blue > green + 32) ||
        (magentaKey > 78 && red > green + 52 && blue > green + 52);

      if (greenResidue || magentaResidue || darkBoundaryMagentaResidue) {
        residues.push({ x, y, rgba: [red, green, blue, alpha] });
      }
    }
  }

  return residues;
}

function hasNearbyTransparentPixel(
  rgba: Uint8Array,
  width: number,
  height: number,
  x: number,
  y: number,
  radius: number,
) {
  for (let offsetY = -radius; offsetY <= radius; offsetY += 1) {
    for (let offsetX = -radius; offsetX <= radius; offsetX += 1) {
      if (offsetX === 0 && offsetY === 0) {
        continue;
      }

      const nextX = x + offsetX;
      const nextY = y + offsetY;

      if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
        continue;
      }

      if (alphaAt(rgba, width, nextX, nextY) <= 8) {
        return true;
      }
    }
  }

  return false;
}

function findSuspiciousForegroundArtifacts(
  rgba: Uint8Array,
  width: number,
  height: number,
) {
  const foregroundAlphaThreshold = 16;
  const minimumDetachedArea = 4;
  const pixelCount = width * height;
  const visited = new Uint8Array(pixelCount);
  const components: Array<{
    area: number;
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
  }> = [];

  function indexOf(x: number, y: number) {
    return y * width + x;
  }

  function isForeground(x: number, y: number) {
    return alphaAt(rgba, width, x, y) > foregroundAlphaThreshold;
  }

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const startIndex = indexOf(x, y);

      if (visited[startIndex] || !isForeground(x, y)) {
        continue;
      }

      let area = 0;
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;
      const componentQueue = [startIndex];
      visited[startIndex] = 1;

      for (
        let queueIndex = 0;
        queueIndex < componentQueue.length;
        queueIndex += 1
      ) {
        const index = componentQueue[queueIndex] ?? 0;
        const currentX = index % width;
        const currentY = Math.floor(index / width);
        area += 1;
        minX = Math.min(minX, currentX);
        minY = Math.min(minY, currentY);
        maxX = Math.max(maxX, currentX);
        maxY = Math.max(maxY, currentY);

        for (const [nextX, nextY] of [
          [currentX + 1, currentY],
          [currentX - 1, currentY],
          [currentX, currentY + 1],
          [currentX, currentY - 1],
        ] as const) {
          if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
            continue;
          }

          const nextIndex = indexOf(nextX, nextY);

          if (visited[nextIndex] || !isForeground(nextX, nextY)) {
            continue;
          }

          visited[nextIndex] = 1;
          componentQueue.push(nextIndex);
        }
      }

      components.push({ area, bounds: { minX, minY, maxX, maxY } });
    }
  }

  components.sort((left, right) => right.area - left.area);

  const largestArea = components[0]?.area ?? 0;
  const largeAreaThreshold = Math.max(600, largestArea * 0.015);

  return components
    .slice(1)
    .filter(component => {
      if (component.area < minimumDetachedArea) {
        return false;
      }

      const componentWidth = component.bounds.maxX - component.bounds.minX + 1;
      const componentHeight = component.bounds.maxY - component.bounds.minY + 1;
      const longSide = Math.max(componentWidth, componentHeight);
      const shortSide = Math.min(componentWidth, componentHeight);
      const aspectRatio = longSide / Math.max(1, shortSide);
      const fillRatio = component.area / Math.max(1, componentWidth * componentHeight);
      const lineLike =
        (shortSide <= 2 && longSide >= 8) ||
        (shortSide <= 3 && longSide >= 18) ||
        (component.area <= 220 && aspectRatio >= 7 && fillRatio <= 0.45) ||
        (component.area <= 80 && aspectRatio >= 5);
      const tinySpeck = component.area <= 18 && longSide <= 8;
      const substantialComponent = component.area >= largeAreaThreshold;

      return (lineLike || tinySpeck) && !substantialComponent;
    });
}

function findInteriorTransparentHoles(
  rgba: Uint8Array,
  width: number,
  height: number,
) {
  const transparentAlphaThreshold = 8;
  // Hair strands and arm gaps can create valid enclosed negative space.
  // This gate only catches large alpha damage that would read as a broken body.
  const minimumHoleArea = 1500;
  const pixelCount = width * height;
  const outsideTransparent = new Uint8Array(pixelCount);
  const visited = new Uint8Array(pixelCount);
  const queue: number[] = [];

  function indexOf(x: number, y: number) {
    return y * width + x;
  }

  function isTransparent(x: number, y: number) {
    return alphaAt(rgba, width, x, y) <= transparentAlphaThreshold;
  }

  function enqueueOutside(x: number, y: number) {
    if (x < 0 || y < 0 || x >= width || y >= height) {
      return;
    }

    const index = indexOf(x, y);

    if (outsideTransparent[index] || !isTransparent(x, y)) {
      return;
    }

    outsideTransparent[index] = 1;
    queue.push(index);
  }

  for (let x = 0; x < width; x += 1) {
    enqueueOutside(x, 0);
    enqueueOutside(x, height - 1);
  }

  for (let y = 0; y < height; y += 1) {
    enqueueOutside(0, y);
    enqueueOutside(width - 1, y);
  }

  for (let queueIndex = 0; queueIndex < queue.length; queueIndex += 1) {
    const index = queue[queueIndex] ?? 0;
    const x = index % width;
    const y = Math.floor(index / width);

    enqueueOutside(x + 1, y);
    enqueueOutside(x - 1, y);
    enqueueOutside(x, y + 1);
    enqueueOutside(x, y - 1);
  }

  const holes: Array<{
    area: number;
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
  }> = [];

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const startIndex = indexOf(x, y);

      if (
        visited[startIndex] ||
        outsideTransparent[startIndex] ||
        !isTransparent(x, y)
      ) {
        continue;
      }

      let area = 0;
      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;
      const componentQueue = [startIndex];
      visited[startIndex] = 1;

      for (
        let queueIndex = 0;
        queueIndex < componentQueue.length;
        queueIndex += 1
      ) {
        const index = componentQueue[queueIndex] ?? 0;
        const currentX = index % width;
        const currentY = Math.floor(index / width);
        area += 1;
        minX = Math.min(minX, currentX);
        minY = Math.min(minY, currentY);
        maxX = Math.max(maxX, currentX);
        maxY = Math.max(maxY, currentY);

        for (const [nextX, nextY] of [
          [currentX + 1, currentY],
          [currentX - 1, currentY],
          [currentX, currentY + 1],
          [currentX, currentY - 1],
        ] as const) {
          if (nextX < 0 || nextY < 0 || nextX >= width || nextY >= height) {
            continue;
          }

          const nextIndex = indexOf(nextX, nextY);

          if (
            visited[nextIndex] ||
            outsideTransparent[nextIndex] ||
            !isTransparent(nextX, nextY)
          ) {
            continue;
          }

          visited[nextIndex] = 1;
          componentQueue.push(nextIndex);
        }
      }

      if (area >= minimumHoleArea) {
        holes.push({ area, bounds: { minX, minY, maxX, maxY } });
      }
    }
  }

  return holes;
}

describe("getBuiltInEdgeProfile", () => {
  it("returns Q-girl edge interaction frames only for the built-in package", () => {
    expect(getBuiltInEdgeProfile("imported:boy", "left")).toBeNull();
    expect(getBuiltInEdgeProfile("builtin:unknown", "left")).toBeNull();
    expect(getBuiltInEdgeProfile("builtin:q-girl", "top")?.idle.frames).toHaveLength(22);
  });

  it("attaches micro companion visuals only to built-in side and bottom profiles", () => {
    expect(
      getBuiltInEdgeProfile("builtin:q-girl", "left")?.companion,
    ).toMatchObject({
      placement: "side",
      mirrorX: true,
      baseVisibleHeightPx: 34,
    });
    expect(
      getBuiltInEdgeProfile("builtin:q-girl", "right")?.companion,
    ).toMatchObject({
      placement: "side",
      mirrorX: false,
      baseVisibleHeightPx: 34,
    });
    expect(
      getBuiltInEdgeProfile("builtin:q-girl", "bottom")?.companion,
    ).toMatchObject({
      placement: "bottom",
      mirrorX: false,
      baseVisibleHeightPx: 34,
    });
    expect(
      getBuiltInEdgeProfile("builtin:q-girl", "top")?.companion,
    ).toBeUndefined();
    expect(getBuiltInEdgeProfile("imported:any", "right")).toBeNull();
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
        const expectedNumbers =
          phase === "enter" && (side === "left" || side === "right")
            ? Array.from(
                { length: expectedCounts[phase] },
                (_, index) => expectedCounts[phase] - index,
              )
            : Array.from(
                { length: expectedCounts[phase] },
                (_, index) => index + 1,
              );

        expect(motion.frames).toHaveLength(expectedCounts[phase]);
        expect(motion.frameAnchors).toHaveLength(expectedCounts[phase]);
        expect(numbers).toEqual(expectedNumbers);

        for (const frame of motion.frames) {
          expect(frame).toContain(
            `/q-girl/edge-interaction/${expectedAssetSide[side]}/${phase}/`,
          );
          uniqueFrames.add(frame);
        }
      }
    }

    expect(uniqueFrames.size).toBe(136);
  });

  it("uses the specified timing and contact anchors", () => {
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
          Array.from({ length: expectedCounts[phase] }, (_, index) => {
            const phaseAnchors = expectedPhaseContactAnchors[side]?.[phase];
            const x = phaseAnchors?.[index] ?? expectedContactAnchors[side].x;

            return { x, y: expectedContactAnchors[side].y };
          }),
        );
      }
    }
  });

  it("keeps enter frames geometrically usable and plays side enter from hidden to visible", () => {
    const topProfile = getBuiltInEdgeProfile("builtin:q-girl", "top");

    expect(topProfile).not.toBeNull();

    if (!topProfile) {
      throw new Error("Missing top profile");
    }

    for (const frame of topProfile.enter.frames) {
      const frameInfo = readFramePngInfo(frame);

      expect(frameInfo.foreground.area).toBeGreaterThan(25_000);
      expect(frameInfo.foreground.bounds?.width).toBeGreaterThan(160);
      expect(frameInfo.foreground.bounds?.height).toBeGreaterThan(260);
    }

    for (const side of ["left", "right"] as const) {
      const profile = getBuiltInEdgeProfile("builtin:q-girl", side);

      expect(profile).not.toBeNull();

      if (!profile) {
        continue;
      }

      const enterAreas = profile.enter.frames.map(
        (frame) => readFramePngInfo(frame).foreground.area,
      );
      const exitMotion = getEdgePhaseMotion(profile, "exit");

      expect(enterAreas[0]).toBeLessThan(enterAreas.at(-1) ?? 0);
      expect(exitMotion.frames.map(frameNumber)).toEqual(
        Array.from({ length: expectedCounts.enter }, (_, index) => index + 1),
      );
      expect(exitMotion.frameAnchors).toEqual(
        [...profile.enter.frameAnchors].reverse(),
      );
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
      expect(png.interiorTransparentHoles).toEqual([]);
      expect(png.suspiciousForegroundArtifacts).toEqual([]);
      expect(png.suspiciousChromaResidues).toEqual([]);
    }
  }, 60_000);
});
