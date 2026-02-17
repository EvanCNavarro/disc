/**
 * Shared types for DISC — Daily Image Spotify Covers
 *
 * Feb 2026 Spotify API compliance:
 * - playlist.tracks → playlist.items
 * - playlist.tracks.items[].track → playlist.items.items[].item
 */

// ──────────────────────────────────────────────
// Spotify API types (Feb 2026 field names)
// ──────────────────────────────────────────────

export interface SpotifyTrack {
	id: string;
	name: string;
	artists: Array<{ name: string }>;
	album: {
		name: string;
		images: Array<{ url: string; width: number; height: number }>;
	};
	duration_ms: number;
}

export interface SpotifyPlaylistItem {
	added_at: string;
	item: SpotifyTrack;
}

export interface SpotifyPlaylist {
	id: string;
	name: string;
	description: string | null;
	images: Array<{ url: string; width: number; height: number }>;
	items: {
		total: number;
		items: SpotifyPlaylistItem[];
	};
	owner: {
		id: string;
		display_name: string;
	};
	collaborative: boolean;
}

// ──────────────────────────────────────────────
// Theme extraction types
// ──────────────────────────────────────────────

export interface TieredObject {
	object: string;
	tier: "high" | "medium" | "low";
	reasoning: string;
}

export interface TrackExtraction {
	trackName: string;
	artist: string;
	lyricsFound: boolean;
	objects: TieredObject[];
}

export interface ConvergenceCandidate {
	object: string;
	aestheticContext: string;
	reasoning: string;
	rank: number;
}

export interface ConvergenceResult {
	candidates: ConvergenceCandidate[];
	selectedIndex: number;
	collisionNotes: string;
}

export interface ExtractedObject {
	object: string;
	reasoning: string;
	confidence: "high" | "medium" | "low";
	source: "lyrics" | "metadata";
}

export interface SelectedTheme {
	object: string;
	reasoning: string;
	styleId: string;
	prompt: string;
}

// ──────────────────────────────────────────────
// Database row types
// ──────────────────────────────────────────────

export interface DbUser {
	id: string;
	spotify_user_id: string;
	display_name: string;
	email: string;
	avatar_url: string | null;
	encrypted_refresh_token: string;
	style_preference: string;
	cron_enabled: boolean;
	cron_time: string;
	created_at: string;
	updated_at: string;
	last_login_at: string;
	deleted_at: string | null;
}

// ──────────────────────────────────────────────
// Pipeline progress types
// ──────────────────────────────────────────────

export type PipelineStepName =
	| "fetch_tracks"
	| "fetch_lyrics"
	| "extract_themes"
	| "select_theme"
	| "generate_image"
	| "upload";

/** Per-step summary data written by the worker after each step completes */
export interface StepData {
	fetch_tracks?: { trackCount: number; trackNames: string[] };
	fetch_lyrics?: {
		found: number;
		total: number;
		tracks: Array<{
			name: string;
			artist: string;
			found: boolean;
			snippet: string | null;
		}>;
	};
	extract_themes?: {
		completed: number;
		total: number;
		objectCount: number;
		topObjects: string[];
		tokensUsed: number;
		perTrack: Array<{
			trackName: string;
			artist: string;
			objects: Array<{ object: string; tier: string; reasoning: string }>;
		}>;
	};
	select_theme?: {
		chosenObject: string;
		aestheticContext: string;
		collisionNotes: string;
		candidates: Array<{
			object: string;
			aestheticContext: string;
			reasoning: string;
			rank: number;
		}>;
	};
	generate_image?: {
		prompt: string;
		styleName: string;
		predictionId: string;
		subject: string;
		styleTemplate: string;
	};
	upload?: { r2Key: string };
}

export interface PipelineProgress {
	currentStep: PipelineStepName;
	generationId: string;
	startedAt: string;
	steps: StepData;
}

/** @deprecated Use PipelineProgress instead */
export type PlaylistProgress = {
	step: PipelineStepName;
	started_at: string;
	generation_id: string;
};

export interface DbPlaylist {
	id: string;
	user_id: string;
	spotify_playlist_id: string;
	name: string;
	description: string | null;
	track_count: number;
	spotify_cover_url: string | null;
	status: PlaylistStatus;
	last_generated_at: string | null;
	generation_count: number;
	style_override: string | null;
	cron_enabled: boolean;
	is_collaborative: number;
	owner_spotify_id: string | null;
	progress_data: string | null;
	created_at: string;
	updated_at: string;
}

export interface DbGeneration {
	id: string;
	playlist_id: string;
	user_id: string;
	style_id: string;
	symbolic_object: string;
	prompt: string;
	image_url: string | null;
	replicate_prediction_id: string | null;
	r2_key: string | null;
	analysis_id: string | null;
	claimed_object_id: string | null;
	status: GenerationStatus;
	error_message: string | null;
	duration_ms: number | null;
	cost_usd: number | null;
	trigger_type: GenerationTrigger;
	created_at: string;
}

export interface GenerationVersion {
	id: string;
	r2_key: string;
	style_name: string;
	symbolic_object: string;
	prompt: string;
	trigger_type: string;
	created_at: string;
	duration_ms: number | null;
	analysis_id: string | null;
}

export interface AnalysisDetail {
	id: string;
	trackSnapshot: Array<{ name: string; artist: string; album: string }>;
	trackExtractions: TrackExtraction[];
	convergenceResult: ConvergenceResult;
	chosenObject: string;
	aestheticContext: string;
	styleName: string;
	tracksAdded: string[] | null;
	tracksRemoved: string[] | null;
	outlierCount: number;
	status: "completed" | "partial";
	triggerType: string;
	createdAt: string;
}

export interface DbStyle {
	id: string;
	user_id: string;
	name: string;
	description: string | null;
	replicate_model: string;
	lora_url: string | null;
	lora_scale: number;
	prompt_template: string;
	negative_prompt: string | null;
	guidance_scale: number;
	num_inference_steps: number;
	seed: number | null;
	thumbnail_url: string | null;
	is_default: number;
	status: "active" | "draft" | "archived";
	heuristics: string | null;
	version: string;
	created_at: string;
	updated_at: string;
}

export interface DbJob {
	id: string;
	user_id: string;
	type: JobType;
	status: JobStatus;
	total_playlists: number;
	completed_playlists: number;
	failed_playlists: number;
	total_cost_usd: number | null;
	started_at: string;
	completed_at: string | null;
	created_at: string;
}

export interface DbPlaylistAnalysis {
	id: string;
	user_id: string;
	playlist_id: string;
	track_snapshot: string;
	track_extractions: string;
	convergence_result: string;
	chosen_object: string;
	aesthetic_context: string;
	style_id: string;
	tracks_added: string | null;
	tracks_removed: string | null;
	outlier_count: number;
	outlier_threshold: number;
	regeneration_triggered: number;
	status: "completed" | "partial";
	trigger_type: GenerationTrigger;
	created_at: string;
}

export interface DbClaimedObject {
	id: string;
	user_id: string;
	playlist_id: string;
	object_name: string;
	aesthetic_context: string | null;
	source_generation_id: string | null;
	superseded_at: string | null;
	created_at: string;
}

export interface GenerationResult {
	success: boolean;
	generationId?: string;
	error?: string;
	cost?: string;
}

// ──────────────────────────────────────────────
// Enums
// ──────────────────────────────────────────────

export type PlaylistStatus =
	| "idle"
	| "queued"
	| "processing"
	| "generated"
	| "failed";

export type GenerationStatus =
	| "pending"
	| "processing"
	| "completed"
	| "failed";

export type GenerationTrigger = "manual" | "cron";

export type JobType = "manual" | "cron" | "bulk";

export type JobStatus = "pending" | "processing" | "completed" | "failed";

// ──────────────────────────────────────────────
// Config
// ──────────────────────────────────────────────

export const CONFIG = {
	LYRICS_TIMEOUT_MS: 5_000,
	LYRICS_CONCURRENCY: 5,
	LYRICS_TRUNCATE_CHARS: 800,
	PLAYLIST_TIMEOUT_MS: 5 * 60 * 1_000,
	OPENAI_RETRY_ATTEMPTS: 3,
	SPOTIFY_RETRY_ATTEMPTS: 3,
	MAX_TRACKS_PER_PLAYLIST: 15,
	SPOTIFY_IMAGE_MAX_BYTES: 256 * 1_024,
	JPEG_QUALITY: 40,
	IMAGE_MAX_BYTES: 192 * 1_024,
	IMAGE_DIMENSIONS: 640,
	REPLICATE_POLL_INTERVAL_MS: 1_000,
	REPLICATE_TIMEOUT_MS: 120_000,
	/** Minimum outlier fraction to trigger full re-analysis (for 4+ tracks) */
	REGEN_THRESHOLD_DEFAULT: 0.25,
} as const;
