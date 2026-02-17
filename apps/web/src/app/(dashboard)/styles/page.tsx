import { redirect } from "next/navigation";
import { StyleGrid } from "@/components/styles/StyleGrid";
import { auth } from "@/lib/auth";
import { queryD1 } from "@/lib/db";

interface StyleRow {
	id: string;
	name: string;
	description: string | null;
	status: string;
	is_default: number;
	thumbnail_url: string | null;
}

export default async function StylesPage() {
	const session = await auth();
	if (!session?.spotifyId) redirect("/login");

	const users = await queryD1<{ id: string }>(
		"SELECT id FROM users WHERE spotify_user_id = ?",
		[session.spotifyId],
	);
	if (users.length === 0) redirect("/login");

	const styles = await queryD1<StyleRow>(
		`SELECT id, name, description, status, is_default, thumbnail_url FROM styles
		 WHERE user_id = ? OR is_default = 1
		 ORDER BY is_default DESC, name ASC`,
		[users[0].id],
	);

	return (
		<div className="flex flex-col gap-[var(--space-lg)]">
			<div className="flex items-center justify-between">
				<h1 className="text-2xl font-bold">Styles</h1>
				<p className="text-sm text-[var(--color-text-muted)]">
					{styles.length} style{styles.length !== 1 && "s"}
				</p>
			</div>
			<StyleGrid styles={styles} />
		</div>
	);
}
