export type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterMs: number };

interface FixedWindow {
  resetAt: number;
  consumed: number;
}

export class FixedWindowRateLimiter {
  readonly #windows = new Map<string, FixedWindow>();
  readonly #now: () => number;

  constructor(now: () => number = Date.now) {
    this.#now = now;
  }

  getRetainedEntryCount(): number {
    return this.#windows.size;
  }

  consume(key: string, limit: number, windowMs: number): RateLimitResult {
    const now = this.#now();
    this.#sweepExpired(now);
    let window = this.#windows.get(key);
    if (!window) {
      window = { resetAt: now + windowMs, consumed: 0 };
      this.#windows.set(key, window);
    }

    if (window.consumed >= limit) {
      return {
        allowed: false,
        retryAfterMs: window.resetAt - now,
      };
    }

    window.consumed += 1;
    return { allowed: true, remaining: limit - window.consumed };
  }

  #sweepExpired(now: number): void {
    for (const [key, window] of this.#windows) {
      if (now >= window.resetAt) {
        this.#windows.delete(key);
      }
    }
  }
}
