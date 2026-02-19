import type { PipelineStepName } from "@disc/shared";

/** Labels shown during active pipeline progress (present tense) */
export const PIPELINE_STEP_LABELS: Record<PipelineStepName, string> = {
	fetch_tracks: "Fetching tracks",
	fetch_lyrics: "Fetching lyrics",
	extract_themes: "Extracting themes",
	select_theme: "Selecting theme",
	generate_image: "Generating image",
	upload: "Uploading to Spotify",
};

/** Canonical pipeline step execution order */
export const PIPELINE_STEP_ORDER: PipelineStepName[] = [
	"fetch_tracks",
	"fetch_lyrics",
	"extract_themes",
	"select_theme",
	"generate_image",
	"upload",
];

/** Labels for cost breakdown steps (past tense, used in history table) */
export const COST_STEP_LABELS: Record<string, string> = {
	extract_themes: "Extract Themes",
	convergence: "Convergence",
	image_generation: "Image Gen",
};

/** Display labels for trigger types */
export const TRIGGER_LABELS: Record<string, string> = {
	manual: "Manual",
	cron: "Scheduled",
	auto: "Auto-detect",
};
