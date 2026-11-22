/**
 * Lightweight in-memory sliding-window rate limiter with bounded memory pruning.
 */
export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSec: number;
}

export class SlidingWindowRateLimiter {
  private readonly buckets = new Map<string, number[]>();
  private readonly maxRequests: number;
  private readonly windowMs: number;
  private readonly maxKeys: number;
  private lastPruneAt = 0;

  constructor(params: { maxRequests: number; windowMs: number; maxKeys?: number }) {
    this.maxRequests = Math.max(1, params.maxRequests);
    this.windowMs = Math.max(100, params.windowMs);
    this.maxKeys = Math.max(100, params.maxKeys ?? 10_000);
  }

  public consume(key: string, now: number = Date.now()): RateLimitResult {
    this.maybePrune(now);
    const cutoff = now - this.windowMs;
    const prev = this.buckets.get(key) ?? [];
    const active = prev.filter((ts) => ts > cutoff);

    if (active.length >= this.maxRequests) {
      this.buckets.set(key, active);
      const oldest = active[0] ?? now;
      const retryAfterSec = Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000));
      return {
        allowed: false,
        remaining: 0,
        retryAfterSec,
      };
    }

    active.push(now);
    this.buckets.set(key, active);
    return {
      allowed: true,
      remaining: Math.max(0, this.maxRequests - active.length),
      retryAfterSec: 0,
    };
  }

  private maybePrune(now: number): void {
    if (now - this.lastPruneAt < this.windowMs && this.buckets.size < this.maxKeys) {
      return;
    }
    this.lastPruneAt = now;
    const cutoff = now - this.windowMs;
    for (const [k, timestamps] of this.buckets.entries()) {
      const active = timestamps.filter((ts) => ts > cutoff);
      if (active.length === 0) {
        this.buckets.delete(k);
      } else {
        this.buckets.set(k, active);
      }
    }
    if (this.buckets.size > this.maxKeys) {
      const overflow = this.buckets.size - this.maxKeys;
      let removed = 0;
      for (const k of this.buckets.keys()) {
        this.buckets.delete(k);
        removed++;
        if (removed >= overflow) break;
      }
    }
  }

  public size(): number {
    return this.buckets.size;
  }
}
