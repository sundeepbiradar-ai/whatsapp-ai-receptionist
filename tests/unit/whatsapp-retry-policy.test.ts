import { describe, expect, it } from "vitest";

import {
  computeNextAttemptAt,
  computeRetryDelayMs,
  hasRemainingAttempts,
  whatsAppRetryPolicy,
} from "@/lib/whatsapp/retry-policy";

describe("WhatsApp retry backoff policy", () => {
  it("uses the approved parameters", () => {
    expect(whatsAppRetryPolicy.maxAttempts).toBe(5);
    expect(whatsAppRetryPolicy.baseDelayMs).toBe(30_000);
    expect(whatsAppRetryPolicy.maxDelayMs).toBe(3_600_000);
  });

  it("grows the ceiling exponentially per attempt", () => {
    const ceilings = [1, 2, 3, 4, 5].map((attempt) =>
      computeRetryDelayMs(attempt, { random: () => 0.999999 })
    );
    expect(ceilings[0]).toBeLessThanOrEqual(30_000);
    expect(ceilings[1]).toBeLessThanOrEqual(60_000);
    expect(ceilings[2]).toBeLessThanOrEqual(120_000);
    expect(ceilings[3]).toBeLessThanOrEqual(240_000);
    expect(ceilings[4]).toBeLessThanOrEqual(480_000);
    for (let index = 1; index < ceilings.length; index += 1) {
      expect(ceilings[index]).toBeGreaterThan(ceilings[index - 1]!);
    }
  });

  it("applies full jitter between the floor and the attempt ceiling", () => {
    expect(computeRetryDelayMs(3, { random: () => 0 })).toBe(whatsAppRetryPolicy.minDelayMs);
    expect(computeRetryDelayMs(3, { random: () => 0.5 })).toBe(60_000);
    expect(computeRetryDelayMs(3, { random: () => 0.999999 })).toBeLessThanOrEqual(120_000);
  });

  it("never exceeds the maximum delay and never returns a hot loop", () => {
    for (const attempt of [1, 2, 3, 4, 5, 50]) {
      for (const random of [() => 0, () => 0.5, () => 0.999999]) {
        const delay = computeRetryDelayMs(attempt, { random });
        expect(delay).toBeGreaterThanOrEqual(whatsAppRetryPolicy.minDelayMs);
        expect(delay).toBeLessThanOrEqual(whatsAppRetryPolicy.maxDelayMs);
      }
    }
  });

  it("uses the greater of Retry-After and computed backoff", () => {
    expect(computeRetryDelayMs(1, { random: () => 0, retryAfterSeconds: 120 })).toBe(120_000);
    expect(computeRetryDelayMs(5, { random: () => 0.999999, retryAfterSeconds: 1 })).toBeGreaterThan(
      1_000
    );
  });

  it("caps Retry-After at the maximum delay", () => {
    expect(computeRetryDelayMs(1, { random: () => 0, retryAfterSeconds: 86_400 })).toBe(
      whatsAppRetryPolicy.maxDelayMs
    );
  });

  it("ignores invalid Retry-After values", () => {
    expect(computeRetryDelayMs(1, { random: () => 0, retryAfterSeconds: null })).toBe(1_000);
    expect(computeRetryDelayMs(1, { random: () => 0, retryAfterSeconds: -5 })).toBe(1_000);
    expect(computeRetryDelayMs(1, { random: () => 0, retryAfterSeconds: Number.NaN })).toBe(1_000);
  });

  it("computes an absolute next attempt timestamp", () => {
    const next = computeNextAttemptAt(1, { random: () => 0.5, now: 1_000_000 });
    expect(next).toBe(new Date(1_000_000 + 15_000).toISOString());
  });

  it("reports remaining attempts against the job maximum", () => {
    expect(hasRemainingAttempts(1, 5)).toBe(true);
    expect(hasRemainingAttempts(4, 5)).toBe(true);
    expect(hasRemainingAttempts(5, 5)).toBe(false);
    expect(hasRemainingAttempts(6, 5)).toBe(false);
  });
});
