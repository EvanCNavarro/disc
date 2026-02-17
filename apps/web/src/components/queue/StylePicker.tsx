"use client";

import { useMemo } from "react";
import { Dropdown, type DropdownOption } from "@/components/Dropdown";

interface Style {
	id: string;
	name: string;
	description: string | null;
}

interface StylePickerProps {
	styles: Style[];
	value: string;
	onChange: (styleId: string) => void;
}

export function StylePicker({ styles, value, onChange }: StylePickerProps) {
	const options: DropdownOption[] = useMemo(
		() => [
			{ value: "", label: "Default Style" },
			...styles.map((s) => ({
				value: s.id,
				label: s.name,
				description: s.description ?? undefined,
			})),
		],
		[styles],
	);

	return (
		<Dropdown
			options={options}
			value={value}
			onChange={onChange}
			placeholder="Default Style"
			label="Style"
		/>
	);
}
