import { redirect } from "next/navigation";
import { Footer } from "@/components/Footer";
import { auth } from "@/lib/auth";

export default async function DashboardLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const session = await auth();
	if (!session) redirect("/login");

	return (
		<>
			<main className="mx-auto max-w-6xl px-[var(--space-lg)] py-[var(--space-xl)]">
				{children}
			</main>
			<Footer />
		</>
	);
}
