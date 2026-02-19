"use client";

import { useCallback, useState, useTransition } from "react";
import { Dropdown, type DropdownOption } from "@/components/Dropdown";
import { useToast } from "@/components/toast";

interface DefaultStylePickerProps {
	styles: Array<{ id: string; name: string }>;
	currentValue: string;
}

export function DefaultStylePicker({
	styles,
	currentValue,
}: DefaultStylePickerProps) {
	const [value, setValue] = useState(currentValue);
	const [isPending, startTransition] = useTransition();
	const { addToast } = useToast();

	const options: DropdownOption[] = styles.map((s) => ({
		value: s.id,
		label: s.name,
	}));

	const handleSave = useCallback(() => {
		startTransition(async () => {
			const response = await fetch("/api/settings/default-style", {
				method: "PUT",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ styleId: value }),
			});
			if (response.ok) {
				addToast("Default style saved");
			} else {
				addToast("Failed to save default style", "error");
			}
		});
	}, [value, addToast]);

	return (
		<div className="flex flex-col gap-[var(--space-md)]">
			<Dropdown
				options={options}
				value={value}
				onChange={setValue}
				label="Default style"
			/>
			<button
				type="button"
				onClick={handleSave}
				disabled={isPending || value === currentValue}
				className="self-start rounded-[var(--radius-pill)] bg-[var(--color-accent)] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
			>
				{isPending ? "Saving..." : "Save Default Style"}
			</button>
		</div>
	);
}
