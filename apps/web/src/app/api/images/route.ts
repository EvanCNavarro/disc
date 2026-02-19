import { NextResponse } from "next/server";
import { apiRoute } from "@/lib/api-route";
import { auth } from "@/lib/auth";

const WORKER_URL = process.env.DISC_WORKER_URL;
const WORKER_TOKEN = process.env.WORKER_AUTH_TOKEN;

/** GET /api/images?key=... — proxy R2 images through the worker */
export const GET = apiRoute(async function GET(request) {
	const session = await auth();
	if (!session?.spotifyId) {
		return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { searchParams } = new URL(request.url);
	const key = searchParams.get("key");
	if (!key) {
		return NextResponse.json(
			{ error: "Missing key parameter" },
			{ status: 400 },
		);
	}

	// Validate key prefix and prevent path traversal
	const validPrefix =
		key.startsWith("generations/") || key.startsWith("styles/");
	if (!validPrefix || key.includes("..") || !key.endsWith(".png")) {
		return NextResponse.json({ error: "Invalid key" }, { status: 400 });
	}

	if (!WORKER_URL || !WORKER_TOKEN) {
		return NextResponse.json(
			{ error: "Worker not configured" },
			{ status: 503 },
		);
	}

	const workerRes = await fetch(
		`${WORKER_URL}/image?key=${encodeURIComponent(key)}`,
		{ headers: { Authorization: `Bearer ${WORKER_TOKEN}` } },
	);

	if (!workerRes.ok) {
		return NextResponse.json(
			{ error: "Image not found" },
			{ status: workerRes.status },
		);
	}

	return new NextResponse(workerRes.body, {
		headers: {
			"Content-Type": workerRes.headers.get("Content-Type") ?? "image/png",
			"Cache-Control": "public, max-age=31536000, immutable",
		},
	});
});
