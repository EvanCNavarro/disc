import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { queryD1 } from "@/lib/db";

interface UserRow {
	id: string;
	display_name: string;
	email: string;
	cron_enabled: number;
	cron_time: string;
}

async function getSettingsData(spotifyId: string) {
	const users = await queryD1<UserRow>(
		"SELECT id, display_name, email, cron_enabled, cron_time FROM users WHERE spotify_user_id = ? LIMIT 1",
		[spotifyId],
	);
	const user = users[0];
	if (!user) return null;

	return { user };
}

export default async function SettingsPage() {
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

	const { user } = data;

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

		revalidatePath("/settings");
		revalidatePath("/");
	};

	const signOutAction = async () => {
		"use server";
		await signOut({ redirectTo: "/login" });
	};

	return (
		<div className="flex flex-col gap-[var(--space-lg)]">
			<h1 className="text-2xl font-bold">Settings</h1>

			{/* ── Schedule ── */}
			<section className="glass rounded-[var(--radius-lg)] p-[var(--space-lg)]">
				<h2 className="mb-[var(--space-md)] text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
					Schedule
				</h2>
				<form
					action={updateSchedule}
					className="flex flex-col gap-[var(--space-md)]"
				>
					<div className="flex items-center gap-[var(--space-md)]">
						<label htmlFor="cron_time" className="text-sm font-medium">
							Daily run time (UTC)
						</label>
						<input
							type="time"
							id="cron_time"
							name="cron_time"
							defaultValue={user.cron_time}
							className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
						/>
					</div>

					<div className="flex items-center gap-[var(--space-sm)]">
						<input
							type="checkbox"
							id="cron_enabled"
							name="cron_enabled"
							defaultChecked={user.cron_enabled === 1}
							className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
						/>
						<label htmlFor="cron_enabled" className="text-sm">
							Enable daily generation
						</label>
					</div>

					<button
						type="submit"
						className="self-start rounded-[var(--radius-pill)] bg-[var(--color-accent)] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)]"
					>
						Save Schedule
					</button>
				</form>
			</section>

			{/* ── Styles ── */}
			<section className="glass rounded-[var(--radius-lg)] p-[var(--space-lg)]">
				<h2 className="mb-[var(--space-md)] text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
					Art Styles
				</h2>
				<p className="mb-[var(--space-sm)] text-sm text-[var(--color-text-muted)]">
					Browse, create, and manage your art styles.
				</p>
				<Link
					href="/styles"
					className="inline-flex items-center gap-1 text-sm font-medium text-[var(--color-accent)] transition-colors hover:text-[var(--color-accent-hover)]"
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
