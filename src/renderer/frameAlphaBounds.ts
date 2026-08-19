export interface FrameAlphaBounds {
  x: number;
  y: number;
  width: number;
  height: number;
  imageWidth: number;
  imageHeight: number;
}

export interface CssAlphaBounds {
  left: number;
  top: number;
  width: number;
  height: number;
}

export type FrameAlphaBoundsLoader = (
  frameUrl: string,
) => Promise<FrameAlphaBounds | null>;

const alphaThreshold = 0;

export function calculateAlphaBoundsFromImageData(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
): Omit<FrameAlphaBounds, "imageWidth" | "imageHeight"> | null {
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const alpha = pixels[(y * width + x) * 4 + 3] ?? 0;

      if (alpha <= alphaThreshold) {
        continue;
      }

      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX + 1,
    height: maxY - minY + 1,
  };
}

export function mapAlphaBoundsToCssRect(
  bounds: FrameAlphaBounds,
  displayWidth: number,
  displayHeight: number,
): CssAlphaBounds {
  const scale = Math.min(
    displayWidth / bounds.imageWidth,
    displayHeight / bounds.imageHeight,
  );
  const renderedWidth = bounds.imageWidth * scale;
  const renderedHeight = bounds.imageHeight * scale;
  const offsetX = (displayWidth - renderedWidth) / 2;
  const offsetY = (displayHeight - renderedHeight) / 2;

  return {
    left: normalizeCssNumber(offsetX + bounds.x * scale),
    top: normalizeCssNumber(offsetY + bounds.y * scale),
    width: normalizeCssNumber(bounds.width * scale),
    height: normalizeCssNumber(bounds.height * scale),
  };
}

export function createFallbackCssAlphaBounds(
  displayWidth: number,
  displayHeight: number,
): CssAlphaBounds {
  const width = displayWidth * 0.64;
  const height = displayHeight * 0.9;

  return {
    left: normalizeCssNumber((displayWidth - width) / 2),
    top: normalizeCssNumber(displayHeight - height),
    width: normalizeCssNumber(width),
    height: normalizeCssNumber(height),
  };
}

export function createFrameAlphaBoundsResolver(
  loadFrameAlphaBounds: FrameAlphaBoundsLoader = readFrameAlphaBounds,
) {
  const cache = new Map<string, Promise<FrameAlphaBounds | null>>();

  return (frameUrl: string): Promise<FrameAlphaBounds | null> => {
    const cached = cache.get(frameUrl);

    if (cached) {
      return cached;
    }

    const pending = loadFrameAlphaBounds(frameUrl).catch(() => null);
    cache.set(frameUrl, pending);
    return pending;
  };
}

export const resolveFrameAlphaBounds = createFrameAlphaBoundsResolver();

async function readFrameAlphaBounds(
  frameUrl: string,
): Promise<FrameAlphaBounds | null> {
  if (typeof document === "undefined") {
    return null;
  }

  const image = await loadImage(frameUrl);
  const imageWidth = image.naturalWidth || image.width;
  const imageHeight = image.naturalHeight || image.height;

  if (imageWidth <= 0 || imageHeight <= 0) {
    return null;
  }

  const canvas = document.createElement("canvas");
  canvas.width = imageWidth;
  canvas.height = imageHeight;
  const context = canvas.getContext("2d", { willReadFrequently: true });

  if (!context) {
    return null;
  }

  context.drawImage(image, 0, 0, imageWidth, imageHeight);
  const imageData = context.getImageData(0, 0, imageWidth, imageHeight);
  const bounds = calculateAlphaBoundsFromImageData(
    imageData.data,
    imageWidth,
    imageHeight,
  );

  return bounds ? { ...bounds, imageWidth, imageHeight } : null;
}

function loadImage(frameUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`failed to load frame ${frameUrl}`));
    image.src = frameUrl;
  });
}

function normalizeCssNumber(value: number) {
  const rounded = Math.round(value * 1000) / 1000;

  return Object.is(rounded, -0) ? 0 : rounded;
}
