export const whatsAppRetryPolicy = {
  maxAttempts: 5,
  baseDelayMs: 30_000,
  maxDelayMs: 3_600_000,
  minDelayMs: 1_000,
} as const;

export type RetryDelayOptions = {
  retryAfterSeconds?: number | null;
  random?: () => number;
};

/**
 * Exponential backoff with full jitter. `random` is injectable so the bounds
 * stay deterministically testable.
 */
export function computeRetryDelayMs(
  attemptNumber: number,
  options: RetryDelayOptions = {}
): number {
  const random = options.random ?? Math.random;
  const bounded = Math.min(Math.max(Math.trunc(attemptNumber), 1), whatsAppRetryPolicy.maxAttempts);
  const ceiling = Math.min(
    whatsAppRetryPolicy.maxDelayMs,
    whatsAppRetryPolicy.baseDelayMs * 2 ** (bounded - 1)
  );
  const jittered = Math.max(whatsAppRetryPolicy.minDelayMs, Math.floor(random() * ceiling));

  const retryAfterSeconds = options.retryAfterSeconds;
  const retryAfterMs =
    typeof retryAfterSeconds === "number" && Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
      ? retryAfterSeconds * 1000
      : 0;

  return Math.min(whatsAppRetryPolicy.maxDelayMs, Math.max(jittered, retryAfterMs));
}

export function computeNextAttemptAt(
  attemptNumber: number,
  options: RetryDelayOptions & { now?: number } = {}
): string {
  const now = options.now ?? Date.now();
  return new Date(now + computeRetryDelayMs(attemptNumber, options)).toISOString();
}

export function hasRemainingAttempts(attemptCount: number, maxAttempts: number): boolean {
  return attemptCount < maxAttempts;
}
