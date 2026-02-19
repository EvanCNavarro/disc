import { NextResponse } from "next/server";

/**
 * Safety-net wrapper for API route handlers.
 * Catches uncaught errors and returns a 500 JSON response so the client
 * always gets structured JSON instead of an HTML error page.
 *
 * Preserves the handler's original type signature so Next.js route
 * type-checking continues to work unchanged.
 */
// biome-ignore lint/suspicious/noExplicitAny: generic wrapper must accept any handler signature
export function apiRoute<T extends (...args: any[]) => any>(handler: T): T {
	const wrapped = async (...args: unknown[]) => {
		try {
			return await handler(...args);
		} catch (error) {
			const req = args[0];
			const url =
				req instanceof Request ? new URL(req.url).pathname : "unknown";
			const method = req instanceof Request ? req.method : "UNKNOWN";
			console.error(`[API ${method} ${url}]`, error);
			return NextResponse.json(
				{ error: "Internal server error" },
				{ status: 500 },
			);
		}
	};
	return wrapped as unknown as T;
}
