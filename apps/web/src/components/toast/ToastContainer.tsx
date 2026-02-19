"use client";

import { useToast } from "./ToastContext";

export function ToastContainer() {
	const { toasts, removeToast } = useToast();
	if (toasts.length === 0) return null;

	return (
		<div
			aria-live="polite"
			className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none"
		>
			{toasts.map((toast) => (
				<div key={toast.id} role="status">
					<button
						type="button"
						className={`pointer-events-auto px-4 py-2 rounded-lg text-sm font-medium shadow-lg backdrop-blur-md border animate-toast-in cursor-pointer ${
							toast.type === "success"
								? "bg-[var(--color-surface)] text-[var(--color-accent)] border-[var(--color-accent)]"
								: toast.type === "error"
									? "bg-[var(--color-surface)] text-[var(--color-destructive)] border-[var(--color-destructive)]"
									: "bg-[var(--color-surface)] text-[var(--color-text-secondary)] border-[var(--color-border)]"
						}`}
						onClick={() => removeToast(toast.id)}
					>
						{toast.message}
					</button>
				</div>
			))}
		</div>
	);
}
