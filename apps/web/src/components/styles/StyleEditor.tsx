"use client";

import type { DbStyle, StyleHeuristics } from "@disc/shared";
import {
	getDefaultHeuristics,
	getRandomSubjects,
	reconstructPrompt,
} from "@disc/shared";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Breadcrumb } from "@/components/Breadcrumb";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/toast";
import { HeuristicControls } from "./HeuristicControls";
import { PreviewGrid, type PreviewImage } from "./PreviewGrid";
import { type VersionEntry, VersionHistory } from "./VersionHistory";

type EditorStatus =
	| "idle"
	| "generating"
	| "saving"
	| "publishing"
	| "deleting";

export function StyleEditor({ style }: { style: DbStyle }) {
	const router = useRouter();
	const { addToast } = useToast();
	const initialHeuristics = useMemo<StyleHeuristics>(() => {
		if (style.heuristics) {
			try {
				return JSON.parse(style.heuristics) as StyleHeuristics;
			} catch {
				// fall through to defaults
			}
		}
		return getDefaultHeuristics();
	}, [style.heuristics]);

	const [heuristics, setHeuristics] =
		useState<StyleHeuristics>(initialHeuristics);
	const [status, setStatus] = useState<EditorStatus>("idle");
	const [subjects, setSubjects] = useState<string[]>(() =>
		getRandomSubjects(4),
	);
	const [previewImages, setPreviewImages] = useState<PreviewImage[]>(() =>
		subjects.map((s) => ({ url: null, subject: s, loading: false })),
	);
	const [versions, setVersions] = useState<VersionEntry[]>([]);
	const [versionCounter, setVersionCounter] = useState<number>(() => {
		const parsed = parseFloat(style.version);
		return Number.isFinite(parsed) ? parsed : 0;
	});
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

	// Regenerate -- calls the generate API
	const handleRegenerate = useCallback(async () => {
		setStatus("generating");
		const promptTemplate = reconstructPrompt(heuristics);

		// Set all images to loading
		setPreviewImages((prev) =>
			prev.map((img) => ({ ...img, loading: true, url: null })),
		);

		try {
			const response = await fetch(`/api/styles/${style.id}/generate`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ prompt: promptTemplate, subjects }),
			});

			if (!response.ok) {
				const errBody = await response.text().catch(() => "no body");
				console.error(
					"[StyleEditor] generate failed:",
					response.status,
					errBody,
				);
				throw new Error(`Generation failed (${response.status}): ${errBody}`);
			}

			const data = (await response.json()) as {
				images: Array<{ subject: string; url: string | null; error?: string }>;
			};

			// Log any per-image failures
			for (const img of data.images) {
				if (!img.url)
					console.error("[StyleEditor] image failed:", img.subject, img.error);
			}

			setPreviewImages(
				data.images.map((img) => ({
					url: img.url,
					subject: img.subject,
					loading: false,
				})),
			);
		} catch (error) {
			setPreviewImages((prev) =>
				prev.map((img) => ({ ...img, loading: false })),
			);
			const msg = error instanceof Error ? error.message : "Unknown error";
			addToast(`Preview failed: ${msg}`, "error");
			console.error("[StyleEditor] generation error:", error);
		} finally {
			setStatus("idle");
		}
	}, [heuristics, subjects, style.id, addToast]);

	// Auto-generate previews on mount
	// biome-ignore lint/correctness/useExhaustiveDependencies: intentional — fire once on mount, handleRegenerate is stable via useCallback
	useEffect(() => {
		handleRegenerate();
	}, []);

	// New Subjects -- picks 4 new random objects and clears images
	const handleNewSubjects = useCallback(() => {
		const newSubjects = getRandomSubjects(4);
		setSubjects(newSubjects);
		setPreviewImages(
			newSubjects.map((s) => ({ url: null, subject: s, loading: false })),
		);
	}, []);

	// Save version
	const handleSaveVersion = useCallback(async () => {
		setStatus("saving");
		const nextVersion = (versionCounter + 0.1).toFixed(1);
		const notes = window.prompt("Version notes (optional):");

		try {
			const response = await fetch(`/api/styles/${style.id}/versions`, {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					version: nextVersion,
					heuristics,
					promptTemplate: reconstructPrompt(heuristics),
					previewUrls: previewImages.filter((p) => p.url).map((p) => p.url),
					notes: notes || null,
				}),
			});

			if (!response.ok) throw new Error("Save failed");

			const data = (await response.json()) as { versionId: string };
			setVersionCounter(parseFloat(nextVersion));
			setVersions((prev) => [
				{
					id: data.versionId,
					version: `v${nextVersion}`,
					notes: notes || null,
					createdAt: new Date().toISOString(),
					isCurrent: true,
				},
				...prev.map((v) => ({ ...v, isCurrent: false })),
			]);
			addToast("Version saved");

			// Regenerate canonical thumbnail in the background
			fetch(`/api/styles/${style.id}/thumbnail`, { method: "POST" }).catch(
				(err) => {
					addToast("Failed to regenerate thumbnail", "error");
					console.error("Thumbnail regeneration failed:", err);
				},
			);
		} catch (error) {
			addToast("Failed to save version", "error");
			console.error("Save failed:", error);
		} finally {
			setStatus("idle");
		}
	}, [heuristics, previewImages, style.id, versionCounter, addToast]);

	// Publish style
	const handlePublish = useCallback(async () => {
		setStatus("publishing");
		try {
			const response = await fetch(`/api/styles/${style.id}`, {
				method: "PATCH",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({
					status: "active",
					heuristics,
					promptTemplate: reconstructPrompt(heuristics),
				}),
			});

			if (!response.ok) throw new Error("Publish failed");
			addToast("Style published");
		} catch (error) {
			addToast("Failed to publish", "error");
			console.error("Publish failed:", error);
		} finally {
			setStatus("idle");
		}
	}, [heuristics, style.id, addToast]);

	// Delete style
	const handleDeleteConfirm = useCallback(async () => {
		setDeleteDialogOpen(false);
		setStatus("deleting");
		try {
			const response = await fetch(`/api/styles/${style.id}`, {
				method: "DELETE",
			});
			if (!response.ok) {
				const data = (await response.json()) as { error?: string };
				throw new Error(data.error ?? "Delete failed");
			}
			addToast("Style deleted");
			// Invalidate RSC cache then navigate — ensures /styles shows fresh data
			router.refresh();
			router.push("/styles");
		} catch (error) {
			addToast("Failed to delete", "error");
			console.error("Delete failed:", error);
			setStatus("idle");
		}
	}, [style.id, router, addToast]);

	// Load version (placeholder for full implementation)
	const handleLoadVersion = useCallback(
		(versionId: string) => {
			const version = versions.find((v) => v.id === versionId);
			// In a full implementation, this would fetch the version's heuristics
			// from the API and apply them. For now, versions stored in local state
			// don't carry full heuristics.
			console.log("Load version:", versionId, version);
		},
		[versions],
	);

	return (
		<div className="flex flex-col gap-[var(--space-lg)]">
			{/* Breadcrumb */}
			<Breadcrumb
				segments={[{ label: "Styles", href: "/styles" }, { label: style.name }]}
			/>

			{/* Split panels */}
			<div className="flex flex-col gap-[var(--space-lg)] lg:flex-row">
				{/* Left panel -- Controls (40%) */}
				<div className="w-full lg:w-[40%]">
					<div className="flex flex-col gap-[var(--space-lg)]">
						<div className="glass rounded-[var(--radius-lg)] p-[var(--space-lg)]">
							<h2 className="mb-[var(--space-md)] text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
								Style Controls
							</h2>
							<HeuristicControls
								heuristics={heuristics}
								onChange={setHeuristics}
							/>
						</div>

						{/* Action buttons */}
						<div className="flex gap-[var(--space-sm)]">
							<button
								type="button"
								onClick={handleSaveVersion}
								disabled={status !== "idle"}
								className="flex-1 rounded-[var(--radius-pill)] border border-[var(--color-border)] px-3 py-2 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface)] disabled:opacity-50"
							>
								{status === "saving"
									? "Saving..."
									: `Save v${(versionCounter + 0.1).toFixed(1)}`}
							</button>
							<button
								type="button"
								onClick={handlePublish}
								disabled={status !== "idle"}
								className="flex-1 rounded-[var(--radius-pill)] bg-[var(--color-accent)] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
							>
								{status === "publishing" ? "Publishing..." : "Publish Style"}
							</button>
						</div>

						{/* Delete */}
						<button
							type="button"
							onClick={() => setDeleteDialogOpen(true)}
							disabled={status !== "idle"}
							className="rounded-[var(--radius-pill)] border border-red-300 px-3 py-2 text-xs font-medium text-red-500 transition-colors hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950"
						>
							{status === "deleting" ? "Deleting..." : "Delete Style"}
						</button>
					</div>
				</div>

				{/* Right panel -- Preview (60%) */}
				<div className="w-full lg:w-[60%] lg:sticky lg:top-[calc(var(--nav-height)+var(--space-md)*2)] lg:self-start">
					<div className="flex flex-col gap-[var(--space-lg)]">
						<div className="glass rounded-[var(--radius-lg)] p-[var(--space-lg)]">
							<h2 className="mb-[var(--space-md)] text-sm font-medium text-[var(--color-text-muted)] uppercase tracking-wide">
								Preview
							</h2>
							<PreviewGrid
								images={previewImages}
								onRegenerate={handleRegenerate}
								onNewSubjects={handleNewSubjects}
								regenerating={status === "generating"}
							/>
						</div>

						<div className="glass rounded-[var(--radius-lg)] p-[var(--space-lg)]">
							<VersionHistory
								versions={versions}
								onLoadVersion={handleLoadVersion}
							/>
						</div>
					</div>
				</div>
			</div>

			<ConfirmDialog
				open={deleteDialogOpen}
				title="Delete Style"
				description={`Permanently delete "${style.name}"? This removes all version history and cannot be undone.`}
				confirmLabel="Delete"
				destructive
				onConfirm={handleDeleteConfirm}
				onCancel={() => setDeleteDialogOpen(false)}
			/>
		</div>
	);
}
