"use client";

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
	return (
		<select
			value={value}
			onChange={(e) => onChange(e.target.value)}
			className="rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] px-4 py-2.5 text-sm text-[var(--color-text)] transition-colors hover:border-[var(--color-accent)] focus:border-[var(--color-accent)] focus:outline-none"
		>
			<option value="">Default Style</option>
			{styles.map((style) => (
				<option key={style.id} value={style.id}>
					{style.name}
				</option>
			))}
		</select>
	);
}
