"use client";

import { useEffect, useState } from "react";
import {
	getTimezoneAbbr,
	getTimezoneLong,
	localToUtc,
	utcToLocal,
} from "@/lib/timezone";

interface ScheduleFormProps {
	utcTime: string;
	cronEnabled: boolean;
	saveAction: (formData: FormData) => Promise<void>;
}

export function ScheduleForm({
	utcTime,
	cronEnabled,
	saveAction,
}: ScheduleFormProps) {
	const [localTime, setLocalTime] = useState(utcTime);
	const [tzLabel, setTzLabel] = useState("");
	const [tzAbbr, setTzAbbr] = useState("");

	useEffect(() => {
		setLocalTime(utcToLocal(utcTime));
		setTzLabel(getTimezoneLong());
		setTzAbbr(getTimezoneAbbr());
	}, [utcTime]);

	const handleSubmit = async (formData: FormData) => {
		const localValue = formData.get("cron_time") as string;
		const utcValue = localToUtc(localValue);
		const converted = new FormData();
		converted.set("cron_time", utcValue);
		if (formData.get("cron_enabled")) {
			converted.set("cron_enabled", "on");
		}
		await saveAction(converted);
	};

	return (
		<form action={handleSubmit} className="flex flex-col gap-[var(--space-md)]">
			<div className="flex flex-col gap-[var(--space-xs)]">
				<div className="flex items-center gap-[var(--space-md)]">
					<label htmlFor="cron_time" className="text-sm font-medium">
						Daily run time
					</label>
					<input
						type="time"
						id="cron_time"
						name="cron_time"
						value={localTime}
						onChange={(e) => setLocalTime(e.target.value)}
						className="rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm"
					/>
				</div>
				{tzLabel && (
					<p className="text-xs text-[var(--color-text-muted)]">
						{tzLabel} ({tzAbbr})
					</p>
				)}
			</div>

			<div className="flex items-center gap-[var(--space-sm)]">
				<input
					type="checkbox"
					id="cron_enabled"
					name="cron_enabled"
					defaultChecked={cronEnabled}
					className="h-4 w-4 rounded border-[var(--color-border)] accent-[var(--color-accent)]"
				/>
				<label htmlFor="cron_enabled" className="text-sm">
					Enable daily generation
				</label>
			</div>

			<button
				type="submit"
				className="self-start rounded-[var(--radius-pill)] bg-[var(--color-accent)] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)]"
			>
				Save Schedule
			</button>
		</form>
	);
}
