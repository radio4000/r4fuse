/**
 * Download utilities
 */

/**
 * Check if a file exists and is accessible
 */
export async function fileExists(filePath) {
	const fs = await import("node:fs/promises");
	try {
		await fs.access(filePath);
		return true;
	} catch {
		return false;
	}
}

/**
 * Wait for a specified number of milliseconds
 */
export async function delay(ms) {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
