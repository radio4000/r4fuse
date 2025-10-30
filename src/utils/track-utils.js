/**
 * Download-specific utilities for track organization and metadata
 */

/**
 * Extract tags from track metadata
 * Tags can come from description field (hashtags) or from structured metadata
 */
export function extractTags(track) {
	const tags = [];

	// Check description for hashtags
	if (track.description) {
		const hashtags = track.description.match(/#[\w]+/g);
		if (hashtags) {
			tags.push(...hashtags.map((tag) => tag.substring(1).toLowerCase()));
		}
	}

	// Check if track has a tags field (if supported by API)
	if (track.tags && Array.isArray(track.tags)) {
		tags.push(...track.tags.map((tag) => tag.toLowerCase()));
	}

	// Remove duplicates
	return [...new Set(tags)];
}
