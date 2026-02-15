import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { auth, signOut } from "@/lib/auth";
import { queryD1 } from "@/lib/db";

interface UserRow {
	id: string;
	display_name: string;
	email: string;
	style_preference: string;
	cron_enabled: number;
	cron_time: string;
}

interface StyleRow {
	id: string;
	name: string;
	description: string | null;
}

async function getSettingsData(spotifyId: string) {
	const users = await queryD1<UserRow>(
		"SELECT id, display_name, email, style_preference, cron_enabled, cron_time FROM users WHERE spotify_user_id = ? LIMIT 1",
		[spotifyId],
	);
	const user = users[0];
	if (!user) return null;

	const styles = await queryD1<StyleRow>(
		"SELECT id, name, description FROM styles WHERE user_id = ? ORDER BY name",
		[user.id],
	);

	return { user, styles };
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

		revalidatePath("/settings");
		revalidatePath("/");
	};

	const updateStyle = async (formData: FormData) => {
		"use server";
		const session = await auth();
		if (!session?.spotifyId) return;

		const styleId = formData.get("style_id");
		if (typeof styleId !== "string") return;

		const users = await queryD1<{ id: string }>(
			"SELECT id FROM users WHERE spotify_user_id = ? LIMIT 1",
			[session.spotifyId],
		);
		if (!users[0]) return;

		await queryD1(
			"UPDATE users SET style_preference = ?, updated_at = datetime('now') WHERE id = ?",
			[styleId, users[0].id],
		);

		revalidatePath("/settings");
		revalidatePath("/");
	};

	const signOutAction = async () => {
		"use server";
		await signOut({ redirectTo: "/login" });
	};

	return (
		<div className="flex flex-col gap-[var(--space-xl)]">
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

			{/* ── Style ── */}
			<section className="glass rounded-[var(--radius-lg)] p-[var(--space-lg)]">
				<h2 className="mb-[var(--space-md)] text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
					Art Style
				</h2>

				{styles.length === 0 ? (
					<p className="text-sm text-[var(--color-text-muted)]">
						No styles configured. The default style will be used.
					</p>
				) : (
					<form
						action={updateStyle}
						className="flex flex-col gap-[var(--space-md)]"
					>
						<div className="flex flex-col gap-[var(--space-sm)]">
							{styles.map((s) => (
								<label
									key={s.id}
									className={`flex cursor-pointer items-start gap-3 rounded-[var(--radius-md)] border p-[var(--space-md)] transition-colors ${
										s.id === user.style_preference
											? "border-[var(--color-accent)] bg-[var(--color-accent-glow)]"
											: "border-[var(--color-border)] hover:bg-[var(--color-surface)]"
									}`}
								>
									<input
										type="radio"
										name="style_id"
										value={s.id}
										defaultChecked={s.id === user.style_preference}
										className="mt-0.5 accent-[var(--color-accent)]"
									/>
									<div>
										<span className="text-sm font-medium">{s.name}</span>
										{s.description && (
											<p className="mt-0.5 text-xs text-[var(--color-text-muted)]">
												{s.description}
											</p>
										)}
									</div>
								</label>
							))}
						</div>

						<button
							type="submit"
							className="self-start rounded-[var(--radius-pill)] bg-[var(--color-accent)] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)]"
						>
							Update Style
						</button>
					</form>
				)}
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
