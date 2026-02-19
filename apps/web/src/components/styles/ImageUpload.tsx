"use client";

import { HugeiconsIcon } from "@hugeicons/react";
import { CloudUploadIcon } from "@hugeicons-pro/core-stroke-rounded";
import { useCallback, useRef, useState } from "react";

const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

interface ImageUploadProps {
	images: File[];
	onChange: (images: File[]) => void;
	maxImages?: number;
}

export function ImageUpload({
	images,
	onChange,
	maxImages = 5,
}: ImageUploadProps) {
	const inputRef = useRef<HTMLInputElement>(null);
	const [isDragOver, setIsDragOver] = useState(false);

	const isMaxReached = images.length >= maxImages;

	const addFiles = useCallback(
		(incoming: FileList | File[]) => {
			const accepted = Array.from(incoming).filter((f) =>
				ACCEPTED_TYPES.has(f.type),
			);
			const remaining = maxImages - images.length;
			if (remaining <= 0) return;
			onChange([...images, ...accepted.slice(0, remaining)]);
		},
		[images, maxImages, onChange],
	);

	const removeImage = useCallback(
		(index: number) => {
			onChange(images.filter((_, i) => i !== index));
		},
		[images, onChange],
	);

	const handleDrop = useCallback(
		(e: React.DragEvent) => {
			e.preventDefault();
			setIsDragOver(false);
			if (e.dataTransfer.files.length > 0) {
				addFiles(e.dataTransfer.files);
			}
		},
		[addFiles],
	);

	const handleDragOver = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragOver(true);
	}, []);

	const handleDragLeave = useCallback((e: React.DragEvent) => {
		e.preventDefault();
		setIsDragOver(false);
	}, []);

	const handleClick = useCallback(() => {
		inputRef.current?.click();
	}, []);

	const handleFileChange = useCallback(
		(e: React.ChangeEvent<HTMLInputElement>) => {
			if (e.target.files && e.target.files.length > 0) {
				addFiles(e.target.files);
			}
			// Reset so re-selecting the same file triggers onChange
			e.target.value = "";
		},
		[addFiles],
	);

	return (
		<div className="flex flex-col gap-[var(--space-sm)]">
			{/* Drop zone */}
			{isMaxReached ? (
				<div className="flex items-center justify-center rounded-[var(--radius-lg)] border-2 border-dashed border-[var(--color-border)] px-4 py-6">
					<p className="text-sm text-[var(--color-text-muted)]">
						Maximum {maxImages} images reached
					</p>
				</div>
			) : (
				<button
					type="button"
					onClick={handleClick}
					onDrop={handleDrop}
					onDragOver={handleDragOver}
					onDragLeave={handleDragLeave}
					className={`flex cursor-pointer flex-col items-center justify-center gap-[var(--space-xs)] rounded-[var(--radius-lg)] border-2 border-dashed px-4 py-8 transition-colors ${
						isDragOver
							? "border-[var(--color-accent)] bg-[var(--color-surface)]"
							: "border-[var(--color-border)] hover:border-[var(--color-accent)] hover:bg-[var(--color-surface)]"
					}`}
				>
					<HugeiconsIcon
						icon={CloudUploadIcon}
						size={32}
						strokeWidth={1.5}
						className="text-[var(--color-text-muted)]"
					/>
					<p className="text-sm text-[var(--color-text-muted)]">
						Drop reference images here
					</p>
					<p className="text-xs text-[var(--color-text-faint)]">
						or click to browse
					</p>
				</button>
			)}

			<input
				ref={inputRef}
				type="file"
				multiple
				accept="image/png,image/jpeg,image/webp"
				onChange={handleFileChange}
				className="hidden"
			/>

			{/* Thumbnails + empty slot placeholders */}
			<div className="grid grid-cols-5 gap-[var(--space-sm)]">
				{images.map((file, i) => (
					<div key={`${file.name}-${file.size}`} className="relative">
						{/* biome-ignore lint/performance/noImgElement: File blob URLs incompatible with next/image */}
						<img
							src={URL.createObjectURL(file)}
							alt={file.name}
							className="aspect-square w-full rounded-[var(--radius-sm)] object-cover"
						/>
						<button
							type="button"
							onClick={() => removeImage(i)}
							className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-xs text-white hover:bg-black/80"
							aria-label={`Remove ${file.name}`}
						>
							&times;
						</button>
					</div>
				))}
				{Array.from({ length: maxImages - images.length }, (_, i) => (
					<div
						key={`slot-${images.length + i}`}
						className="aspect-square w-full rounded-[var(--radius-sm)] border-2 border-dashed border-[var(--color-border)]/40"
					/>
				))}
			</div>
		</div>
	);
}
