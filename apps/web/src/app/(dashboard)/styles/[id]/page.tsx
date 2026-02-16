import type { DbStyle } from "@disc/shared";
import { notFound, redirect } from "next/navigation";
import { StyleEditor } from "@/components/styles/StyleEditor";
import { auth } from "@/lib/auth";
import { queryD1 } from "@/lib/db";

export default async function StyleEditorPage({
	params,
}: {
	params: Promise<{ id: string }>;
}) {
	const session = await auth();
	if (!session?.spotifyId) redirect("/login");

	const { id } = await params;

	const users = await queryD1<{ id: string }>(
		"SELECT id FROM users WHERE spotify_user_id = ?",
		[session.spotifyId],
	);
	if (users.length === 0) redirect("/login");

	const styles = await queryD1<DbStyle>(
		"SELECT * FROM styles WHERE id = ? AND (user_id = ? OR is_default = 1) LIMIT 1",
		[id, users[0].id],
	);

	if (styles.length === 0) notFound();

	return <StyleEditor style={styles[0]} />;
}
