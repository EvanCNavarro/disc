/**
 * Cloudflare D1 REST API client
 *
 * Vercel can't bind D1 natively — this uses the HTTP API.
 * Docs: https://developers.cloudflare.com/api/resources/d1/subresources/database/methods/query/
 */

const getConfig = () => {
	const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
	const apiToken = process.env.CLOUDFLARE_API_TOKEN;
	const databaseId = process.env.CLOUDFLARE_D1_DATABASE_ID;

	if (!accountId || !apiToken || !databaseId) {
		throw new Error(
			"Missing Cloudflare D1 env vars: CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN, CLOUDFLARE_D1_DATABASE_ID",
		);
	}

	return { accountId, apiToken, databaseId };
};

interface D1Response<T> {
	result: Array<{
		results: T[];
		success: boolean;
		meta: {
			changed_db: boolean;
			changes: number;
			duration: number;
			last_row_id: number;
			rows_read: number;
			rows_written: number;
			size_after: number;
		};
	}>;
	success: boolean;
	errors: Array<{ code: number; message: string }>;
	messages: string[];
}

/**
 * Execute a SQL query against Cloudflare D1 via REST API.
 * Returns typed result rows.
 */
export async function queryD1<T = Record<string, unknown>>(
	sql: string,
	params: unknown[] = [],
): Promise<T[]> {
	const { accountId, apiToken, databaseId } = getConfig();

	const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;

	const response = await fetch(url, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${apiToken}`,
			"Content-Type": "application/json",
		},
		body: JSON.stringify({ sql, params }),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`D1 query failed (${response.status}): ${text}`);
	}

	const data = (await response.json()) as D1Response<T>;

	if (!data.success) {
		const errorMsg = data.errors.map((e) => e.message).join(", ");
		throw new Error(`D1 query error: ${errorMsg}`);
	}

	return data.result[0]?.results ?? [];
}
