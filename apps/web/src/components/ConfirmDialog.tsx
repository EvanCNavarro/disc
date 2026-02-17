"use client";

import { useCallback, useEffect, useRef } from "react";

interface ConfirmDialogProps {
	open: boolean;
	title: string;
	description: string;
	confirmLabel?: string;
	cancelLabel?: string;
	destructive?: boolean;
	onConfirm: () => void;
	onCancel: () => void;
}

export function ConfirmDialog({
	open,
	title,
	description,
	confirmLabel = "Confirm",
	cancelLabel = "Cancel",
	destructive = false,
	onConfirm,
	onCancel,
}: ConfirmDialogProps) {
	const dialogRef = useRef<HTMLDialogElement>(null);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;

		if (open && !dialog.open) {
			dialog.showModal();
		} else if (!open && dialog.open) {
			dialog.close();
		}
	}, [open]);

	const handleClose = useCallback(() => {
		onCancel();
	}, [onCancel]);

	return (
		<dialog
			ref={dialogRef}
			onClose={handleClose}
			className="m-auto w-full max-w-sm rounded-[var(--radius-lg)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-0 shadow-lg backdrop:bg-black/50"
		>
			<div className="flex flex-col gap-[var(--space-md)] p-[var(--space-lg)]">
				<h2 className="text-base font-semibold">{title}</h2>
				<p className="text-sm text-[var(--color-text-muted)]">{description}</p>
				<div className="flex justify-end gap-[var(--space-sm)]">
					<button
						type="button"
						onClick={onCancel}
						className="rounded-[var(--radius-pill)] border border-[var(--color-border)] px-4 py-2 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface)]"
					>
						{cancelLabel}
					</button>
					<button
						type="button"
						onClick={onConfirm}
						className={
							destructive
								? "rounded-[var(--radius-pill)] bg-red-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-700"
								: "rounded-[var(--radius-pill)] bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)]"
						}
					>
						{confirmLabel}
					</button>
				</div>
			</div>
		</dialog>
	);
}
