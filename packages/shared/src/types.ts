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
}

// ──────────────────────────────────────────────
// Theme extraction types
// ──────────────────────────────────────────────

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
	created_at: string;
	updated_at: string;
}

export interface DbGeneration {
	id: string;
	playlist_id: string;
	user_id: string;
	style_id: string;
	symbolic_object: string;
	dall_e_prompt: string;
	image_url: string | null;
	status: GenerationStatus;
	error_message: string | null;
	duration_ms: number | null;
	cost_usd: number | null;
	trigger: GenerationTrigger;
	created_at: string;
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
	PLAYLIST_TIMEOUT_MS: 5 * 60 * 1_000,
	OPENAI_RETRY_ATTEMPTS: 3,
	SPOTIFY_RETRY_ATTEMPTS: 3,
	MAX_TRACKS_PER_PLAYLIST: 20,
	SPOTIFY_IMAGE_MAX_BYTES: 256 * 1_024,
	JPEG_QUALITY: 40,
} as const;
