"use client";

import { useState } from "react";
import { ImageUpload } from "./ImageUpload";

const toBase64 = (file: File): Promise<string> =>
	new Promise((resolve, reject) => {
		const reader = new FileReader();
		reader.onload = () => {
			const result = reader.result as string;
			resolve(result.split(",")[1]); // Strip data:image/...;base64, prefix
		};
		reader.onerror = reject;
		reader.readAsDataURL(file);
	});

export function StyleCreator() {
	const [name, setName] = useState("");
	const [images, setImages] = useState<File[]>([]);
	const [notes, setNotes] = useState("");
	const [status, setStatus] = useState<"idle" | "analyzing">("idle");

	const canSubmit =
		name.trim().length > 0 && images.length > 0 && status !== "analyzing";

	const handleAnalyze = async () => {
		if (!canSubmit) return;
		setStatus("analyzing");

		try {
			const imageData = await Promise.all(
				images.map(async (file) => ({
					base64: await toBase64(file),
					type: file.type,
				})),
			);

			const response = await fetch("/api/styles/analyze", {
				method: "POST",
				headers: { "Content-Type": "application/json" },
				body: JSON.stringify({ name, images: imageData, notes }),
			});

			if (!response.ok) {
				setStatus("idle");
				return;
			}

			const { styleId } = (await response.json()) as { styleId: string };
			window.location.href = `/styles/${styleId}`;
		} catch {
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
							Reference Images
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
				</div>
			</div>
		</div>
	);
}
