"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import {
	ArrowDown01Icon,
	Search01Icon,
	Tick01Icon,
} from "@hugeicons-pro/core-stroke-rounded";
import {
	useCallback,
	useEffect,
	useId,
	useMemo,
	useRef,
	useState,
} from "react";

export interface DropdownOption {
	value: string;
	label: string;
	description?: string;
}

interface DropdownProps {
	options: DropdownOption[];
	value: string;
	onChange: (value: string) => void;
	placeholder?: string;
	/** Label shown above the trigger (sr-only by default) */
	label?: string;
}

const SEARCH_THRESHOLD = 5;

export function Dropdown({
	options,
	value,
	onChange,
	placeholder = "Select…",
	label,
}: DropdownProps) {
	const [open, setOpen] = useState(false);
	const [search, setSearch] = useState("");
	const [highlightIndex, setHighlightIndex] = useState(-1);

	const containerRef = useRef<HTMLDivElement>(null);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const searchRef = useRef<HTMLInputElement>(null);
	const listRef = useRef<HTMLDivElement>(null);
	const listboxId = useId();
	const labelId = useId();

	const showSearch = options.length > SEARCH_THRESHOLD;

	const selectedOption = options.find((o) => o.value === value);
	const displayLabel = selectedOption?.label ?? placeholder;

	const filtered = useMemo(() => {
		if (!search) return options;
		const q = search.toLowerCase();
		return options.filter(
			(o) =>
				o.label.toLowerCase().includes(q) ||
				o.description?.toLowerCase().includes(q),
		);
	}, [options, search]);

	const close = useCallback(() => {
		setOpen(false);
		setSearch("");
		setHighlightIndex(-1);
		triggerRef.current?.focus();
	}, []);

	const select = useCallback(
		(val: string) => {
			onChange(val);
			close();
		},
		[onChange, close],
	);

	// Close on outside click
	useEffect(() => {
		if (!open) return;
		function handleClick(e: MouseEvent) {
			if (
				containerRef.current &&
				!containerRef.current.contains(e.target as Node)
			) {
				close();
			}
		}
		document.addEventListener("mousedown", handleClick);
		return () => document.removeEventListener("mousedown", handleClick);
	}, [open, close]);

	// Keyboard navigation
	useEffect(() => {
		if (!open) return;
		function handleKey(e: KeyboardEvent) {
			switch (e.key) {
				case "Escape":
					e.preventDefault();
					close();
					break;
				case "ArrowDown":
					e.preventDefault();
					setHighlightIndex((prev) =>
						prev < filtered.length - 1 ? prev + 1 : 0,
					);
					break;
				case "ArrowUp":
					e.preventDefault();
					setHighlightIndex((prev) =>
						prev > 0 ? prev - 1 : filtered.length - 1,
					);
					break;
				case "Enter": {
					e.preventDefault();
					const target = filtered[highlightIndex];
					if (target) select(target.value);
					break;
				}
				case "Home":
					e.preventDefault();
					setHighlightIndex(0);
					break;
				case "End":
					e.preventDefault();
					setHighlightIndex(filtered.length - 1);
					break;
			}
		}
		document.addEventListener("keydown", handleKey);
		return () => document.removeEventListener("keydown", handleKey);
	}, [open, close, filtered, highlightIndex, select]);

	// Focus search input when opening (if present), else focus list
	useEffect(() => {
		if (!open) return;
		requestAnimationFrame(() => {
			if (showSearch && searchRef.current) {
				searchRef.current.focus();
			} else {
				listRef.current?.focus();
			}
		});
	}, [open, showSearch]);

	// Scroll highlighted item into view
	useEffect(() => {
		if (highlightIndex < 0 || !listRef.current) return;
		const items = listRef.current.querySelectorAll("[role='option']");
		items[highlightIndex]?.scrollIntoView({ block: "nearest" });
	}, [highlightIndex]);

	// Reset highlight when search changes
	useEffect(() => {
		setHighlightIndex(filtered.length > 0 ? 0 : -1);
	}, [filtered.length]);

	return (
		<div ref={containerRef} className="relative">
			{label && (
				<span id={labelId} className="sr-only">
					{label}
				</span>
			)}

			{/* Trigger */}
			<button
				ref={triggerRef}
				type="button"
				role="combobox"
				aria-expanded={open}
				aria-haspopup="listbox"
				aria-controls={open ? listboxId : undefined}
				aria-labelledby={label ? labelId : undefined}
				onClick={() => setOpen((prev) => !prev)}
				className={`flex items-center gap-2 rounded-[var(--radius-md)] border px-3 py-1.5 text-sm font-medium transition-colors ${
					open
						? "border-[var(--color-accent)] text-[var(--color-text)]"
						: "border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-text)]"
				}`}
			>
				<span className="truncate">{displayLabel}</span>
				<HugeiconsIcon
					icon={ArrowDown01Icon}
					size={14}
					strokeWidth={1.5}
					className={`shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}
				/>
			</button>

			{/* Popover */}
			{open && (
				<div
					className="absolute left-0 top-full z-50 mt-1.5 min-w-[200px] overflow-hidden rounded-[var(--radius-md)] border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-1 shadow-[var(--shadow-md)]"
					style={{ maxWidth: "min(320px, calc(100vw - 32px))" }}
				>
					{/* Search */}
					{showSearch && (
						<div className="px-1 pb-1">
							<div className="flex items-center gap-2 rounded-[var(--radius-sm)] bg-[var(--color-surface)] px-2.5 py-1.5">
								<HugeiconsIcon
									icon={Search01Icon}
									size={14}
									strokeWidth={1.5}
									className="shrink-0 text-[var(--color-text-muted)]"
								/>
								<input
									ref={searchRef}
									type="text"
									value={search}
									onChange={(e) => setSearch(e.target.value)}
									placeholder="Search…"
									className="w-full bg-transparent text-xs text-[var(--color-text)] placeholder:text-[var(--color-text-muted)] focus:outline-none"
									aria-label="Search options"
								/>
							</div>
						</div>
					)}

					{/* Option list */}
					<div
						ref={listRef}
						role="listbox"
						id={listboxId}
						aria-labelledby={label ? labelId : undefined}
						tabIndex={showSearch ? -1 : 0}
						className="max-h-[240px] overflow-y-auto focus:outline-none"
					>
						{filtered.length === 0 ? (
							<p className="px-2.5 py-3 text-center text-xs text-[var(--color-text-muted)]">
								No matches
							</p>
						) : (
							filtered.map((option, i) => {
								const isSelected = option.value === value;
								const isHighlighted = i === highlightIndex;

								return (
									<button
										key={option.value}
										type="button"
										role="option"
										aria-selected={isSelected}
										onClick={() => select(option.value)}
										onMouseEnter={() => setHighlightIndex(i)}
										className={`flex w-full items-center gap-2 rounded-[var(--radius-sm)] px-2.5 py-2 text-left text-xs transition-colors duration-[var(--duration-fast)] ${
											isHighlighted
												? "bg-[var(--color-surface)] text-[var(--color-text)]"
												: "text-[var(--color-text-muted)] hover:text-[var(--color-text)]"
										}`}
									>
										{/* Checkmark column */}
										<span className="flex w-4 shrink-0 items-center justify-center">
											{isSelected && (
												<HugeiconsIcon
													icon={Tick01Icon}
													size={14}
													strokeWidth={2}
													className="text-[var(--color-accent)]"
												/>
											)}
										</span>

										{/* Label + description */}
										<span className="flex min-w-0 flex-1 flex-col">
											<span
												className={`truncate ${isSelected ? "font-medium text-[var(--color-text)]" : ""}`}
											>
												{option.label}
											</span>
											{option.description && (
												<span className="truncate text-[10px] text-[var(--color-text-faint)]">
													{option.description}
												</span>
											)}
										</span>
									</button>
								);
							})
						)}
					</div>
				</div>
			)}
		</div>
	);
}
