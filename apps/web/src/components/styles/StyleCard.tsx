"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
	Delete02Icon,
	PaintBrush01Icon,
} from "@hugeicons-pro/core-stroke-rounded";
import { useRouter } from "next/navigation";
import { useCallback, useState } from "react";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { useToast } from "@/components/toast";

interface StyleCardProps {
	style: {
		id: string;
		name: string;
		description: string | null;
		status: string;
		is_default: number;
		thumbnail_url: string | null;
		version: string;
	};
}

export function StyleCard({ style }: StyleCardProps) {
	const router = useRouter();
	const { addToast } = useToast();
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [deleting, setDeleting] = useState(false);

	const handleDelete = useCallback(async () => {
		setDeleteDialogOpen(false);
		setDeleting(true);
		try {
			const response = await fetch(`/api/styles/${style.id}`, {
				method: "DELETE",
			});
			if (!response.ok) {
				const data = (await response.json()) as { error?: string };
				throw new Error(data.error ?? "Delete failed");
			}
			addToast("Style deleted");
			router.refresh();
		} catch (error) {
			addToast("Failed to delete", "error");
			console.error("Delete failed:", error);
		} finally {
			setDeleting(false);
		}
	}, [style.id, router, addToast]);

	return (
		<>
			{/* biome-ignore lint/a11y/useSemanticElements: card wraps block content with nested interactive children — button element would violate nesting rules */}
			<div
				role="button"
				tabIndex={0}
				onClick={() => router.push(`/styles/${style.id}`)}
				onKeyDown={(e) => {
					if (e.key === "Enter" || e.key === " ") {
						e.preventDefault();
						router.push(`/styles/${style.id}`);
					}
				}}
				className="group cursor-pointer overflow-hidden rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-[var(--shadow-sm)] transition-all duration-[var(--duration-normal)] hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
			>
				<div className="relative aspect-square w-full overflow-hidden bg-[var(--color-surface)]">
					{style.thumbnail_url ? (
						// biome-ignore lint/performance/noImgElement: R2-proxied via /api/images with query string — next/image can't handle localPatterns with query strings
						<img
							src={
								style.thumbnail_url.startsWith("styles/")
									? `/api/images?key=${encodeURIComponent(style.thumbnail_url)}`
									: style.thumbnail_url
							}
							alt={`${style.name} thumbnail`}
							className="absolute inset-0 h-full w-full object-cover"
							loading="lazy"
						/>
					) : (
						<div className="flex h-full w-full items-center justify-center text-[var(--color-text-muted)]">
							<HugeiconsIcon
								icon={PaintBrush01Icon}
								size={48}
								strokeWidth={1}
							/>
						</div>
					)}

					{style.is_default !== 1 && (
						<button
							type="button"
							disabled={deleting}
							onClick={(e) => {
								e.stopPropagation();
								setDeleteDialogOpen(true);
							}}
							className="absolute top-2 right-2 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 hover:bg-black/80 disabled:opacity-50"
							aria-label={`Delete ${style.name}`}
						>
							<HugeiconsIcon icon={Delete02Icon} size={16} strokeWidth={2} />
						</button>
					)}
				</div>

				<div className="flex flex-col gap-1 p-[var(--space-md)]">
					<div className="flex items-center gap-2">
						<h3 className="min-w-0 flex-1 truncate text-sm font-semibold">
							{style.name}
						</h3>
						{style.version && (
							<span className="shrink-0 text-xs text-[var(--color-text-faint)]">
								v{style.version}
							</span>
						)}
						<StatusBadge status={style.status ?? "active"} />
					</div>
					{style.description && (
						<p className="truncate text-xs text-[var(--color-text-muted)]">
							{style.description}
						</p>
					)}
					{style.is_default === 1 && (
						<p className="text-xs text-[var(--color-text-muted)]">Built-in</p>
					)}
				</div>
			</div>

			<ConfirmDialog
				open={deleteDialogOpen}
				title="Delete style?"
				description={`"${style.name}" will be permanently deleted. This cannot be undone.`}
				confirmLabel="Delete"
				destructive
				onConfirm={handleDelete}
				onCancel={() => setDeleteDialogOpen(false)}
			/>
		</>
	);
}
