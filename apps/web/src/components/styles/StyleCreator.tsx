"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ImageUpload } from "./ImageUpload";

/** Max dimension for resized images — keeps total payload under Vercel's 4.5MB body limit */
const MAX_DIMENSION = 1024;
const JPEG_QUALITY = 0.8;

/** Resize image to fit within MAX_DIMENSION and return as base64 JPEG */
const toBase64 = (file: File): Promise<{ base64: string; type: string }> =>
	new Promise((resolve, reject) => {
		const img = new Image();
		img.onload = () => {
			let { width, height } = img;
			if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
				const scale = MAX_DIMENSION / Math.max(width, height);
				width = Math.round(width * scale);
				height = Math.round(height * scale);
			}
			const canvas = document.createElement("canvas");
			canvas.width = width;
			canvas.height = height;
			const ctx = canvas.getContext("2d");
			if (!ctx) {
				reject(new Error("Canvas context unavailable"));
				return;
			}
			ctx.drawImage(img, 0, 0, width, height);
			const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
			resolve({
				base64: dataUrl.split(",")[1],
				type: "image/jpeg",
			});
			URL.revokeObjectURL(img.src);
		};
		img.onerror = reject;
		img.src = URL.createObjectURL(file);
	});

export function StyleCreator() {
	const router = useRouter();
	const [name, setName] = useState("");
	const [images, setImages] = useState<File[]>([]);
	const [notes, setNotes] = useState("");
	const [status, setStatus] = useState<"idle" | "analyzing">("idle");
	const [error, setError] = useState<string | null>(null);

	const canSubmit =
		name.trim().length > 0 && images.length > 0 && status !== "analyzing";

	const handleAnalyze = async () => {
		if (!canSubmit) return;
		setError(null);
		setStatus("analyzing");

		try {
			const imageData = await Promise.all(images.map(toBase64));

			const response = await fetch("/api/styles/analyze", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name, images: imageData, notes }),
			});

			if (!response.ok) {
				let message = `Analysis failed (${response.status}). Please try again.`;
				try {
					const body = (await response.json()) as { error?: string };
					if (body.error) message = body.error;
				} catch {
					// Non-JSON response (e.g., Vercel body size limit)
					if (response.status === 413) {
						message =
							"Images are too large. Try removing some or using smaller files.";
					}
				}
				setError(message);
				setStatus("idle");
				return;
			}

			const { styleId } = (await response.json()) as { styleId: string };
			router.push(`/styles/${styleId}`);
		} catch {
			setError("Network error. Please check your connection and try again.");
			setStatus("idle");
		}
	};

	return (
		<div className="mx-auto max-w-2xl">
			<div className="glass rounded-[var(--radius-lg)] p-[var(--space-lg)]">
				<div className="flex flex-col gap-[var(--space-lg)]">
					{/* Style Name */}
					<div>
						<label
							htmlFor="style-name"
							className="mb-[var(--space-xs)] block text-sm font-medium"
						>
							Style Name
						</label>
						<input
							id="style-name"
							type="text"
							value={name}
							onChange={(e) => setName(e.target.value)}
							placeholder="e.g., Autumn Clay, Neon Wireframe..."
							className="w-full rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm placeholder:text-[var(--color-text-faint)]"
						/>
					</div>

					{/* Reference Images */}
					<div>
						<p className="mb-[var(--space-xs)] text-sm font-medium">
							Reference Images{" "}
							<span className="font-normal text-[var(--color-text-muted)]">
								{images.length} / 5
							</span>
						</p>
						<ImageUpload images={images} onChange={setImages} maxImages={5} />
					</div>

					{/* Notes */}
					<div>
						<label
							htmlFor="style-notes"
							className="mb-[var(--space-xs)] block text-sm font-medium"
						>
							Describe the aesthetic
						</label>
						<textarea
							id="style-notes"
							value={notes}
							onChange={(e) => setNotes(e.target.value)}
							placeholder="Describe the look and feel you want — materials, lighting, mood, colors..."
							rows={4}
							className="w-full resize-none rounded-[var(--radius-sm)] border border-[var(--color-border)] bg-[var(--color-bg)] px-3 py-2 text-sm placeholder:text-[var(--color-text-faint)]"
						/>
					</div>

					{/* Analyze Button */}
					<button
						type="button"
						onClick={handleAnalyze}
						disabled={!canSubmit}
						className="w-full rounded-[var(--radius-pill)] bg-[var(--color-accent)] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
					>
						{status === "analyzing" ? "Analyzing style..." : "Analyze & Create"}
					</button>
					{error && (
						<p className="text-center text-sm text-[var(--color-destructive)]">
							{error}
						</p>
					)}
				</div>
			</div>
		</div>
	);
}
