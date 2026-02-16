import { auth } from "@/lib/auth";

const WORKER_URL = process.env.DISC_WORKER_URL;
const WORKER_TOKEN = process.env.WORKER_AUTH_TOKEN;

/** GET /api/images?key=... — proxy R2 images through the worker */
export async function GET(request: Request) {
	const session = await auth();
	if (!session?.spotifyId) {
		return Response.json({ error: "Unauthorized" }, { status: 401 });
	}

	const { searchParams } = new URL(request.url);
	const key = searchParams.get("key");
	if (!key) {
		return Response.json({ error: "Missing key parameter" }, { status: 400 });
	}

	if (!WORKER_URL || !WORKER_TOKEN) {
		return Response.json({ error: "Worker not configured" }, { status: 503 });
	}

	const workerRes = await fetch(
		`${WORKER_URL}/image?key=${encodeURIComponent(key)}`,
		{ headers: { Authorization: `Bearer ${WORKER_TOKEN}` } },
	);

	if (!workerRes.ok) {
		return Response.json(
			{ error: "Image not found" },
			{ status: workerRes.status },
		);
	}

	return new Response(workerRes.body, {
		headers: {
			"Content-Type": workerRes.headers.get("Content-Type") ?? "image/png",
			"Cache-Control": "public, max-age=31536000, immutable",
		},
	});
}
