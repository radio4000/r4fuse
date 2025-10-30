/**
 * Timestamp utilities for filesystem operations
 */

// File type constants (from stat.h)
export const S_IFDIR = 0o040000; // directory
export const S_IFREG = 0o100000; // regular file

/**
 * Helper to safely get timestamp from date object
 */
export function getTimestamp(dateObj) {
	if (dateObj && dateObj instanceof Date && !Number.isNaN(dateObj.getTime())) {
		return dateObj.getTime() / 1000;
	}
	return Date.now() / 1000; // fallback to current time if invalid
}

/**
 * Helper to create proper stat objects for FUSE
 */
export function createStat(options = {}) {
	const _now = Date.now() / 1000;
	let mode = options.mode || 0;

	// Add file type bits if not present
	if ((mode & S_IFDIR) === 0 && (mode & S_IFREG) === 0) {
		// If it's a directory mode (0o755, 0o777, etc.) add directory bit
		// If it's a file mode, add regular file bit
		if (options.isDir || (mode & 0o111) === 0o111) {
			mode |= S_IFDIR;
		} else {
			mode |= S_IFREG;
		}
	}

	return {
		mtime: getTimestamp(options.mtime),
		atime: getTimestamp(options.atime),
		ctime: getTimestamp(options.ctime),
		nlink: 1,
		size: options.size || 0,
		mode,
		uid: options.uid || process.getuid(),
		gid: options.gid || process.getgid(),
	};
}

/**
 * Helper to create safe Date objects from strings
 */
export function createSafeDate(dateString) {
	if (dateString && typeof dateString === "string" && dateString.length > 0) {
		const date = new Date(dateString);
		if (!Number.isNaN(date.getTime())) {
			return date;
		}
	}
	return undefined;
}
