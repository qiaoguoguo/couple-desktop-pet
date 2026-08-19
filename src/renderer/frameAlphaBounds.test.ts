import { describe, expect, it, vi } from "vitest";
import {
  calculateAlphaBoundsFromImageData,
  createFrameAlphaBoundsResolver,
  mapAlphaBoundsToCssRect,
} from "./frameAlphaBounds";

function alphaImage(width: number, height: number, opaquePixels: Array<[number, number]>) {
  const pixels = new Uint8ClampedArray(width * height * 4);

  for (const [x, y] of opaquePixels) {
    pixels[(y * width + x) * 4 + 3] = 255;
  }

  return pixels;
}

describe("frameAlphaBounds", () => {
  it("calculates the tight foreground bounding box from PNG alpha pixels", () => {
    const pixels = alphaImage(5, 4, [
      [2, 1],
      [3, 1],
      [2, 2],
      [3, 2],
    ]);

    expect(calculateAlphaBoundsFromImageData(pixels, 5, 4)).toEqual({
      x: 2,
      y: 1,
      width: 2,
      height: 2,
    });
  });

  it("does not treat transparent padding as foreground", () => {
    const pixels = alphaImage(6, 6, [[4, 3]]);

    expect(calculateAlphaBoundsFromImageData(pixels, 6, 6)).toEqual({
      x: 4,
      y: 3,
      width: 1,
      height: 1,
    });
  });

  it("maps image alpha bounds through contain-fit display coordinates", () => {
    expect(
      mapAlphaBoundsToCssRect(
        { x: 1, y: 0, width: 2, height: 2, imageWidth: 4, imageHeight: 2 },
        80,
        80,
      ),
    ).toEqual({
      left: 20,
      top: 20,
      width: 40,
      height: 40,
    });
  });

  it("caches alpha scans per frame URL", async () => {
    const loadFrameAlphaBounds = vi.fn().mockResolvedValue({
      x: 2,
      y: 1,
      width: 2,
      height: 2,
      imageWidth: 5,
      imageHeight: 4,
    });
    const resolveFrameAlphaBounds = createFrameAlphaBoundsResolver(
      loadFrameAlphaBounds,
    );

    await Promise.all([
      resolveFrameAlphaBounds("asset://pet/0001.png"),
      resolveFrameAlphaBounds("asset://pet/0001.png"),
    ]);
    await resolveFrameAlphaBounds("asset://pet/0002.png");

    expect(loadFrameAlphaBounds).toHaveBeenCalledTimes(2);
    expect(loadFrameAlphaBounds).toHaveBeenNthCalledWith(1, "asset://pet/0001.png");
    expect(loadFrameAlphaBounds).toHaveBeenNthCalledWith(2, "asset://pet/0002.png");
  });
});
