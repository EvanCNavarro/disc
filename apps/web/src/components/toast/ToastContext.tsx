"use client";

import {
	createContext,
	useCallback,
	useContext,
	useRef,
	useState,
} from "react";

type ToastType = "success" | "error" | "info";

interface Toast {
	id: string;
	message: string;
	type: ToastType;
}

interface ToastContextValue {
	toasts: Toast[];
	addToast: (message: string, type?: ToastType) => void;
	removeToast: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast() {
	const ctx = useContext(ToastContext);
	if (!ctx) throw new Error("useToast must be used within ToastProvider");
	return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
	const [toasts, setToasts] = useState<Toast[]>([]);
	const counterRef = useRef(0);

	const addToast = useCallback(
		(message: string, type: ToastType = "success") => {
			const id = String(++counterRef.current);
			setToasts((prev) => [...prev, { id, message, type }]);
			setTimeout(() => {
				setToasts((prev) => prev.filter((t) => t.id !== id));
			}, 3000);
		},
		[],
	);

	const removeToast = useCallback((id: string) => {
		setToasts((prev) => prev.filter((t) => t.id !== id));
	}, []);

	return (
		<ToastContext value={{ toasts, addToast, removeToast }}>
			{children}
		</ToastContext>
	);
}
