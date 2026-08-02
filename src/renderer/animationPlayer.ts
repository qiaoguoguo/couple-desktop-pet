export function getFrameIndex(
  elapsedMs: number,
  frameCount: number,
  fps: number,
  loop: boolean,
): number {
  if (
    elapsedMs <= 0 ||
    frameCount <= 0 ||
    fps <= 0 ||
    !Number.isFinite(elapsedMs) ||
    !Number.isFinite(frameCount) ||
    !Number.isFinite(fps)
  ) {
    return 0;
  }

  const frameIndex = Math.floor(elapsedMs / (1000 / fps));

  if (!loop) {
    return Math.min(frameCount - 1, frameIndex);
  }

  return frameIndex % frameCount;
}
