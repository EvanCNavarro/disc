import { redirect } from "next/navigation";
import { QueueBoard } from "@/components/queue/QueueBoard";
import { auth } from "@/lib/auth";

export default async function QueuePage() {
	const session = await auth();
	if (!session?.accessToken || !session.spotifyId) redirect("/login");
	if (session.error === "RefreshTokenError") redirect("/login");

	return (
		<div className="flex flex-col gap-[var(--space-md)]">
			<h1 className="text-lg font-semibold">Queue</h1>
			<QueueBoard />
		</div>
	);
}
