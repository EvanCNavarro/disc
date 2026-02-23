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
	snapshot_id: string;
	public: boolean | null;
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
	watcher_enabled: number;
	watcher_interval_minutes: number;
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
	snapshot_id: string | null;
	is_public: number | null;
	contributor_count: number;
	contributors_json: string | null;
	has_local_tracks: number;
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
	r2_key: string | null;
	status: GenerationStatus;
	errorMessage: string | null;
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
	convergenceResult: ConvergenceResult | null;
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

// ──────────────────────────────────────────────
// Queue status types (cron visibility)
// ──────────────────────────────────────────────

export interface QueuePlaylistStatus {
	id: string;
	name: string;
	spotifyPlaylistId: string;
	status: "pending" | "processing" | "completed" | "failed";
	thumbnailR2Key: string | null;
	currentStep: string | null;
	stepSummary: string | null;
	durationMs: number | null;
	costUsd: number | null;
	errorMessage: string | null;
}

export interface QueueActiveJob {
	id: string;
	type: "cron" | "manual" | "auto";
	startedAt: string;
	style: { id: string; name: string };
	playlists: QueuePlaylistStatus[];
	totalCost: number;
	completedCount: number;
	failedCount: number;
	pendingCount: number;
}

export interface QueueNextCron {
	utcTime: string;
	style: { id: string; name: string };
}

export interface QueueCompletedJob {
	id: string;
	type: "cron" | "manual" | "auto";
	startedAt: string;
	completedAt: string;
	totalPlaylists: number;
	completedPlaylists: number;
	failedPlaylists: number;
	durationMs: number;
	totalCostUsd: number | null;
	style: { id: string; name: string };
}

export interface WatcherSettings {
	enabled: boolean;
	intervalMinutes: 5 | 10 | 15;
}

export interface PlaylistContributor {
	id: string;
	trackCount: number;
	firstAddedAt: string | null;
	lastAddedAt: string | null;
}

export interface QueueStatus {
	activeJob: QueueActiveJob | null;
	lastCompletedJob: QueueCompletedJob | null;
	nextCron: QueueNextCron | null;
	watcherSettings: WatcherSettings;
}

export interface DbPlaylistAnalysis {
	id: string;
	user_id: string;
	playlist_id: string;
	track_snapshot: string;
	track_extractions: string;
	convergence_result: string | null;
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
	| "failed"
	| "cancelled";

export type GenerationTrigger = "manual" | "cron" | "auto";

export type JobType = "manual" | "cron" | "bulk" | "auto";

export type JobStatus =
	| "pending"
	| "processing"
	| "completed"
	| "failed"
	| "cancelled";

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
	REPLICATE_RETRY_ATTEMPTS: 2,
	REPLICATE_POLL_INTERVAL_MS: 1_000,
	REPLICATE_TIMEOUT_MS: 120_000,
	/** Minimum outlier fraction to trigger full re-analysis (for 4+ tracks) */
	REGEN_THRESHOLD_DEFAULT: 0.25,
} as const;

// ──────────────────────────────────────────────
// APLOTOCA pipeline constants
// ──────────────────────────────────────────────

export const APLOTOCA = {
	acronym: "APLOTOCA",
	fullForm:
		"Analysis \u2192 Playlist \u2192 Lyrics \u2192 Objects \u2192 Themes \u2192 Object \u2192 Cover \u2192 Art",
	description:
		"The full DISC pipeline: fetches playlist tracks, retrieves lyrics, extracts visual objects with AI, converges on a symbolic theme, generates cover art in your chosen style, and uploads it to Spotify.",
	modes: {
		full: {
			value: "with" as const,
			label: "APLOTOCA \u2014 Full Analysis",
			description: "Lyrics + AI theme extraction + collision avoidance",
		},
		custom: {
			value: "without" as const,
			label: "Custom Subject \u2014 Skip Analysis",
			description: "Provide your own subject, bypasses lyrics analysis",
		},
	},
} as const;

// ──────────────────────────────────────────────
// Usage event types (billing/cost tracking)
// ──────────────────────────────────────────────

/** Row shape for the usage_events D1 table */
export interface DbUsageEvent {
	id: string;
	user_id: string;
	action_type: string;
	model: string;
	generation_id: string | null;
	playlist_id: string | null;
	style_id: string | null;
	job_id: string | null;
	tokens_in: number | null;
	tokens_out: number | null;
	duration_ms: number | null;
	model_unit_cost: number | null;
	cost_usd: number;
	trigger_source: string;
	status: string;
	error_message: string | null;
	created_at: string;
}

/** Valid action_type values for usage_events */
export type UsageActionType =
	| "llm_extraction"
	| "llm_convergence"
	| "llm_light_extraction"
	| "image_generation"
	| "style_preview"
	| "style_thumbnail";

/** Valid trigger_source values for usage_events */
export type UsageTriggerSource = "user" | "cron" | "auto_detect";

// ──────────────────────────────────────────────
// Worker tick tracking
// ──────────────────────────────────────────────

export type TickType = "watcher" | "cron" | "heartbeat" | "manual" | "auto";
export type TickStatus = "success" | "failure" | "skipped" | "no_work";

export interface DbWorkerTick {
	id: string;
	user_id: string | null;
	tick_type: TickType;
	status: TickStatus;
	duration_ms: number | null;
	playlists_checked: number | null;
	playlists_processed: number | null;
	token_refreshed: number;
	error_message: string | null;
	started_at: string;
	completed_at: string | null;
	created_at: string;
}
