/**
 * Path parsing and utility functions
 */

/**
 * Parse path into components
 */
export function parsePath(path) {
	const parts = path.split("/").filter(Boolean);
	return {
		parts,
		root: parts[0],
		channel: parts[1],
		subdir: parts[2],
		file: parts[3],
		file2: parts[4], // For deeper nesting like /channels/slug/tags/tagname/file.txt
	};
}

/**
 * Sanitize filename
 */
export function sanitizeFilename(str) {
	if (!str) return "untitled";

	return (
		str
			// Replace characters that are problematic in filenames
			.replace(/[/\\:?"*<>|]/g, "-")
			// Remove dots entirely (not replace with dash)
			.replace(/\./g, "")
			// Replace multiple consecutive spaces/dashes with a single dash
			.replace(/[\s-]+/g, "-")
			// Remove leading/trailing dashes and whitespace
			.replace(/^[-\s]+|[-\s]+$/g, "")
			// Convert to lowercase for compatibility
			.toLowerCase()
			// Limit length to avoid filesystem issues
			.substring(0, 50) ||
		// Final fallback if string is still empty
		"untitled"
	);
}
