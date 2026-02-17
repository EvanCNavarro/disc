import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { queryD1 } from "@/lib/db";
import { BillingClient } from "./BillingClient";

export default async function BillingPage() {
	const session = await auth();
	if (!session?.accessToken || !session.spotifyId) redirect("/login");

	const users = await queryD1<{ id: string }>(
		"SELECT id FROM users WHERE spotify_user_id = ?",
		[session.spotifyId],
	);
	if (users.length === 0) {
		return (
			<div className="py-[var(--space-3xl)] text-center text-[var(--color-text-muted)]">
				No account data found.
			</div>
		);
	}

	return <BillingClient />;
}
