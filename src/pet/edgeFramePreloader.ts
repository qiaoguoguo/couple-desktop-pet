export function preloadEdgeFrames(frames: readonly string[]): Promise<void> {
  if (typeof Image === "undefined") {
    return Promise.resolve();
  }

  return Promise.all(
    frames.map(
      (frame) =>
        new Promise<void>((resolve, reject) => {
          const image = new Image();

          image.onload = () => resolve();
          image.onerror = () => reject(new Error(`Failed to preload ${frame}`));
          image.src = frame;
        }),
    ),
  ).then(() => undefined);
}
