export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterMs: number };

interface FixedWindow {
  windowStartedAt: number;
  consumed: number;
}

export class FixedWindowRateLimiter {
  readonly #windows = new Map<string, FixedWindow>();
  readonly #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  consume(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = this.#now();
    let window = this.#windows.get(key);
    if (!window || now >= window.windowStartedAt + windowMs) {
      window = { windowStartedAt: now, consumed: 0 };
      this.#windows.set(key, window);
    }

    if (window.consumed >= limit) {
      return {
        allowed: false,
        retryAfterMs: window.windowStartedAt + windowMs - now,
      };
    }

    window.consumed += 1;
    return { allowed: true, remaining: limit - window.consumed };
  }
}
