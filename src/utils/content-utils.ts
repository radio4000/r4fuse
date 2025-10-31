import type { Track } from "../types.js";

/**
 * Content formatting and tag extraction utilities
 */

/**
 * Extract tags from track metadata
 * Tags can come from description field (hashtags) or from structured metadata
 */
export function extractTagsFromTrack(track: Track): string[] {
	const tags: string[] = [];

	// Check description for hashtags
	if (track.description) {
		const hashtags = track.description.match(/#[\w]+/g);
		if (hashtags) {
			tags.push(...hashtags.map((tag: string) => tag.substring(1).toLowerCase()));
		}
	}

	// Check if track has a tags field (if supported by API)
	if (track.tags && Array.isArray(track.tags)) {
		tags.push(...track.tags.map((tag: string) => tag.toLowerCase()));
	}

	// Remove duplicates
	return [...new Set(tags)];
}

/**
 * Format track content for .txt files
 */
export function formatTrackContent(track: Track): string {
	const lines = [`Title: ${track.title || "Untitled"}`, `URL: ${track.url}`];

	if (track.description) {
		lines.push(`\nDescription:\n${track.description}`);
	}

	if (track.discogs_url) {
		lines.push(`\nDiscogs: ${track.discogs_url}`);
	}

	if (track.created_at) {
		lines.push(`\nAdded: ${new Date(track.created_at).toLocaleString()}`);
	}

	if (track.updated_at) {
		lines.push(`Updated: ${new Date(track.updated_at).toLocaleString()}`);
	}

	// Show tags if any
	const tags = extractTagsFromTrack(track);
	if (tags.length > 0) {
		lines.push(`\nTags: ${tags.map((t) => `#${t}`).join(" ")}`);
	}

	return `${lines.join("\n")}\n`;
}