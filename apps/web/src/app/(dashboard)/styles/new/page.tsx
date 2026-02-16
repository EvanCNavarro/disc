import { redirect } from "next/navigation";
import { Breadcrumb } from "@/components/Breadcrumb";
import { StyleCreator } from "@/components/styles/StyleCreator";
import { auth } from "@/lib/auth";

export default async function NewStylePage() {
	const session = await auth();
	if (!session?.spotifyId) redirect("/login");

	return (
		<div className="flex flex-col gap-[var(--space-lg)]">
			<Breadcrumb
				segments={[
					{ label: "Styles", href: "/styles" },
					{ label: "New Style" },
				]}
			/>
			<h1 className="text-2xl font-bold">Create New Style</h1>
			<StyleCreator />
		</div>
	);
}
