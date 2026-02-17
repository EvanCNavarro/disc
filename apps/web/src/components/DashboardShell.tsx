"use client";

import type { ReactNode } from "react";
import { QueueProvider } from "@/context/QueueContext";

export function DashboardShell({ children }: { children: ReactNode }) {
	return <QueueProvider>{children}</QueueProvider>;
}
