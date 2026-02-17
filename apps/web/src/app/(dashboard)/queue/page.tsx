import { redirect } from "next/navigation";
import { QueueBoard } from "@/components/queue/QueueBoard";
import { auth } from "@/lib/auth";

export default async function QueuePage() {
	const session = await auth();
	if (!session?.accessToken || !session.spotifyId) redirect("/login");
	if (session.error === "RefreshTokenError") redirect("/login");

	return (
		<div
			className="flex flex-col gap-[var(--space-md)] overflow-hidden"
			style={{
				height:
					"calc(100dvh - var(--nav-height) - var(--space-md) * 2 - var(--space-xl) * 2)",
			}}
		>
			<h1 className="text-lg font-semibold shrink-0">Queue</h1>
			<QueueBoard />
		</div>
	);
}
