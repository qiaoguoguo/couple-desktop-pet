export interface E2ePoint {
  x: number;
  y: number;
}

export interface E2eSize {
  width: number;
  height: number;
}

export interface E2eRect extends E2ePoint, E2eSize {}

export interface E2eWindowPlacement {
  position: E2ePoint;
  size: E2eSize;
  work_area: E2eRect | null;
}

const SAFE_WINDOW_MARGIN_PX = 24;

export function chooseSafeDistinctWindowPosition(state: E2eWindowPlacement): E2ePoint {
  const workArea = state.work_area ?? fallbackWorkArea(state);
  const { min: minX, max: maxX } = safeAxisBounds(
    workArea.x,
    workArea.width,
    state.size.width,
  );
  const { min: minY, max: maxY } = safeAxisBounds(
    workArea.y,
    workArea.height,
    state.size.height,
  );
  const midX = Math.round((minX + maxX) / 2);
  const midY = Math.round((minY + maxY) / 2);

  const candidates = [
    {
      x: state.position.x <= midX ? maxX : minX,
      y: state.position.y <= midY ? maxY : minY,
    },
    { x: minX, y: minY },
    { x: maxX, y: maxY },
    { x: midX, y: midY },
    { x: minX, y: maxY },
    { x: maxX, y: minY },
    { x: state.position.x, y: state.position.y <= midY ? maxY : minY },
    { x: state.position.x <= midX ? maxX : minX, y: state.position.y },
  ].map((point) => ({
    x: clamp(Math.round(point.x), minX, maxX),
    y: clamp(Math.round(point.y), minY, maxY),
  }));

  const target = uniquePoints(candidates).find(
    (point) => point.x !== state.position.x || point.y !== state.position.y,
  );
  if (!target) {
    throw new Error("Unable to choose a distinct safe window position for E2E");
  }
  return target;
}

function fallbackWorkArea(state: E2eWindowPlacement): E2eRect {
  return {
    x: state.position.x - state.size.width,
    y: state.position.y - state.size.height,
    width: state.size.width * 3,
    height: state.size.height * 3,
  };
}

function safeAxisBounds(
  areaStart: number,
  areaSize: number,
  windowSize: number,
): { min: number; max: number } {
  const min = areaStart + SAFE_WINDOW_MARGIN_PX;
  const max = areaStart + areaSize - windowSize - SAFE_WINDOW_MARGIN_PX;

  if (max < min) {
    const centered = centeredAxis(areaStart, areaSize, windowSize);
    return { min: centered, max: centered };
  }

  return { min, max };
}

function centeredAxis(areaStart: number, areaSize: number, windowSize: number): number {
  return areaStart + Math.max(Math.trunc((areaSize - windowSize) / 2), 0);
}

function uniquePoints(points: E2ePoint[]): E2ePoint[] {
  const seen = new Set<string>();
  return points.filter((point) => {
    const key = `${point.x}:${point.y}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
