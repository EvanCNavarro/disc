import { APP_VERSION } from "@disc/shared";

export function GET() {
	return Response.json(
		{ version: APP_VERSION },
		{
			headers: {
				"Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
				Pragma: "no-cache",
				Expires: "0",
			},
		},
	);
}
