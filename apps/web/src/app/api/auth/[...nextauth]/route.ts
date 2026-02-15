import { Auth, setEnvDefaults } from "@auth/core";
import { fullAuthConfig } from "@/lib/auth";

/**
 * Custom auth route handler that bypasses next-auth's reqWithEnvURL.
 *
 * Next.js 16 hardcodes `localhost` in req.url (by design). next-auth's
 * reqWithEnvURL tries to fix this via `new NextRequest(url, req)`, but
 * NextRequest's constructor ignores the URL parameter due to NextURL
 * normalization. This causes the OAuth token exchange to send
 * `redirect_uri=http://localhost:...` instead of the AUTH_URL origin.
 *
 * Fix: call @auth/core's Auth() directly with a plain Request whose URL
 * has been corrected. Plain `new Request(url, req)` respects the URL.
 */
function withAuthUrl(req: Request): Request {
	const authUrl = process.env.AUTH_URL ?? process.env.NEXTAUTH_URL;
	if (!authUrl) return req;

	const { origin: envOrigin } = new URL(authUrl);
	const { origin: reqOrigin } = new URL(req.url);
	if (reqOrigin === envOrigin) return req;

	return new Request(req.url.replace(reqOrigin, envOrigin), req);
}

async function handler(req: Request) {
	setEnvDefaults(process.env, fullAuthConfig);
	return Auth(withAuthUrl(req), fullAuthConfig);
}

export { handler as GET, handler as POST };
