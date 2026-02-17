import { APP_VERSION } from "@disc/shared";

export function GET() {
	return Response.json({ version: APP_VERSION });
}
