/**
 * Retry utility with exponential backoff and jitter.
 *
 * Used by OpenAI, Replicate, and Spotify API wrappers to handle
 * transient failures (429s, 5xx, timeouts) without killing the pipeline.
 */

interface RetryOptions {
	maxAttempts: number;
	baseDelayMs?: number;
	maxDelayMs?: number;
	isRetryable?: (error: unknown) => boolean;
	onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
}

const RETRYABLE_PATTERNS = [
	"timed out",
	"AbortError",
	"(429)",
	"(500)",
	"(502)",
	"(503)",
	"(504)",
];

const NON_RETRYABLE_PATTERNS = ["(400)", "(401)", "(403)", "(404)"];

function defaultIsRetryable(error: unknown): boolean {
	const message = error instanceof Error ? error.message : String(error ?? "");

	for (const pattern of NON_RETRYABLE_PATTERNS) {
		if (message.includes(pattern)) return false;
	}

	for (const pattern of RETRYABLE_PATTERNS) {
		if (message.includes(pattern)) return true;
	}

	// Network errors (fetch failures, DNS, etc.) are retryable
	if (error instanceof TypeError && message.toLowerCase().includes("fetch")) {
		return true;
	}

	return false;
}

export async function withRetry<T>(
	fn: () => Promise<T>,
	options: RetryOptions,
): Promise<T> {
	const {
		maxAttempts,
		baseDelayMs = 1000,
		maxDelayMs = 30_000,
		isRetryable = defaultIsRetryable,
		onRetry,
	} = options;

	if (maxAttempts < 1) {
		return fn();
	}

	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			return await fn();
		} catch (error) {
			if (attempt === maxAttempts || !isRetryable(error)) {
				throw error;
			}

			const delayMs = Math.min(
				baseDelayMs * 2 ** (attempt - 1) + Math.random() * 500,
				maxDelayMs,
			);

			onRetry?.(attempt, error, delayMs);

			await new Promise((resolve) => setTimeout(resolve, delayMs));
		}
	}

	// Unreachable — loop always throws on last attempt
	throw new Error("withRetry: unexpected loop exit");
}
