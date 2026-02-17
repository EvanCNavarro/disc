import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DefaultStylePicker } from "@/components/settings/DefaultStylePicker";
import { ScheduleForm } from "@/components/settings/ScheduleForm";
import { auth, signOut } from "@/lib/auth";
import { queryD1 } from "@/lib/db";

interface UserRow {
	id: string;
	display_name: string;
	email: string;
	cron_enabled: number;
	cron_time: string;
	style_preference: string;
}

interface StyleOption {
	id: string;
	name: string;
}

async function getSettingsData(spotifyId: string) {
	const users = await queryD1<UserRow>(
		"SELECT id, display_name, email, cron_enabled, cron_time, style_preference FROM users WHERE spotify_user_id = ? LIMIT 1",
		[spotifyId],
	);
	const user = users[0];
	if (!user) return null;

	const styles = await queryD1<StyleOption>(
		"SELECT id, name FROM styles WHERE user_id = ? OR is_default = 1 ORDER BY is_default DESC, name ASC",
		[user.id],
	);

	return { user, styles };
}

export default async function GeneralSettingsPage() {
	const session = await auth();
	if (!session?.accessToken || !session.spotifyId) redirect("/login");
	if (session.error === "RefreshTokenError") redirect("/login");

	const data = await getSettingsData(session.spotifyId);

	if (!data) {
		return (
			<div className="py-[var(--space-3xl)] text-center text-[var(--color-text-muted)]">
				No account data found.
			</div>
		);
	}

	const { user, styles } = data;

	const updateSchedule = async (formData: FormData) => {
		"use server";
		const session = await auth();
		if (!session?.spotifyId) return;

		const cronTime = formData.get("cron_time");
		if (typeof cronTime !== "string") return;
		const cronEnabled = formData.get("cron_enabled") === "on" ? 1 : 0;

		const users = await queryD1<{ id: string }>(
			"SELECT id FROM users WHERE spotify_user_id = ? LIMIT 1",
			[session.spotifyId],
		);
		if (!users[0]) return;

		await queryD1(
			"UPDATE users SET cron_time = ?, cron_enabled = ?, updated_at = datetime('now') WHERE id = ?",
			[cronTime, cronEnabled, users[0].id],
		);

		revalidatePath("/settings/general");
		revalidatePath("/");
	};

	const signOutAction = async () => {
		"use server";
		await signOut({ redirectTo: "/login" });
	};

	return (
		<div className="flex flex-col gap-[var(--space-lg)]">
			{/* ── Schedule ── */}
			<section className="glass rounded-[var(--radius-lg)] p-[var(--space-lg)]">
				<h2 className="mb-[var(--space-md)] text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
					Schedule
				</h2>
				<ScheduleForm
					utcTime={user.cron_time}
					cronEnabled={user.cron_enabled === 1}
					saveAction={updateSchedule}
				/>
			</section>

			{/* ── Default Style ── */}
			<section className="glass rounded-[var(--radius-lg)] p-[var(--space-lg)]">
				<h2 className="mb-[var(--space-md)] text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
					Default Style
				</h2>
				<p className="mb-[var(--space-md)] text-sm text-[var(--color-text-muted)]">
					The style used for all new cover art generations.
				</p>
				<DefaultStylePicker
					styles={styles}
					currentValue={user.style_preference}
				/>
				<Link
					href="/styles"
					className="mt-[var(--space-md)] inline-flex text-sm font-medium text-[var(--color-accent)] transition-colors hover:text-[var(--color-accent-hover)]"
				>
					Manage styles &rarr;
				</Link>
			</section>

			{/* ── Account ── */}
			<section className="glass rounded-[var(--radius-lg)] p-[var(--space-lg)]">
				<h2 className="mb-[var(--space-md)] text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
					Account
				</h2>

				<div className="flex flex-col gap-[var(--space-sm)]">
					<div className="flex items-center gap-2">
						<span className="text-sm text-[var(--color-text-muted)]">
							Name:
						</span>
						<span className="text-sm font-medium">{user.display_name}</span>
					</div>
					<div className="flex items-center gap-2">
						<span className="text-sm text-[var(--color-text-muted)]">
							Email:
						</span>
						<span className="text-sm font-medium">{user.email}</span>
					</div>
					<div className="flex items-center gap-2">
						<span className="text-sm text-[var(--color-text-muted)]">
							Status:
						</span>
						<span className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-accent)]">
							<span className="h-2 w-2 rounded-full bg-[var(--color-accent)]" />
							Connected to Spotify
						</span>
					</div>
				</div>

				<form action={signOutAction} className="mt-[var(--space-md)]">
					<button
						type="submit"
						className="rounded-[var(--radius-pill)] border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface)]"
					>
						Sign Out
					</button>
				</form>
			</section>
		</div>
	);
}
