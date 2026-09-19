/**
 * Retry an operation that can fail for reasons that pass.
 *
 * A dropped connection, a pool briefly exhausted, a 502 from the proxy while
 * the API restarts — these fail once and succeed a second later. Retrying them
 * turns a batch of four hundred vouchers with three spurious failures into a
 * batch with none.
 *
 * What is not retried is anything the server refused on purpose: a validation
 * error, a permission error, a unique violation. Retrying those only repeats
 * the refusal, and for a non-idempotent call could repeat a side effect.
 */

export interface RetryOptions {
  /** Total attempts, including the first. Default 3. */
  attempts?: number;
  /** Delay before the second attempt, doubled each time. Default 400ms. */
  baseDelayMs?: number;
  /** Decide whether an error is worth another attempt. */
  retryable?: (error: unknown) => boolean;
  onRetry?: (attempt: number, error: unknown) => void;
}

const TRANSIENT = [
  /network/i,
  /failed to fetch/i,
  /timeout/i,
  /timed out/i,
  /ECONNRESET/i,
  /ECONNREFUSED/i,
  /socket hang up/i,
  /connection (was )?(closed|reset|terminated)/i,
  /\b50[234]\b/,
  /\b429\b/,
  /too many requests/i,
  /pool.*(exhausted|timeout)/i,
  /could not serialize access/i,
  /deadlock detected/i,
];

/** A conservative default: only errors that look transient are retried. */
export function isTransientError(error: unknown): boolean {
  const status = (error as { status?: number; response?: { status?: number } })?.status
    ?? (error as { response?: { status?: number } })?.response?.status;
  if (typeof status === "number") {
    return status === 429 || status === 502 || status === 503 || status === 504;
  }
  const message = error instanceof Error ? error.message : String(error ?? "");
  return TRANSIENT.some((pattern) => pattern.test(message));
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export async function callWithRetry<T>(operation: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const { attempts = 3, baseDelayMs = 400, retryable = isTransientError, onRetry } = options;

  let lastError: unknown;
  for (let attempt = 1; attempt <= Math.max(1, attempts); attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt >= attempts || !retryable(error)) break;
      onRetry?.(attempt, error);
      // Jitter spreads out a class of four hundred students retrying at once.
      await sleep(baseDelayMs * 2 ** (attempt - 1) * (0.75 + Math.random() * 0.5));
    }
  }
  throw lastError;
}
