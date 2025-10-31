import { spawn, ChildProcess } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { createSdk } from "@radio4000/sdk";
import { createClient } from "@supabase/supabase-js";
import getArtistTitle from "get-artist-title";
import NodeID3 from "node-id3";
import { config, loadSettings } from "./config.js";
import { sanitizeFilename } from "./utils/path-utils.js";
import { extractTags } from "./utils/track-utils.js";

interface Track {
  id?: string;
  title?: string;
  url?: string;
  description?: string;
  discogs_url?: string;
  created_at?: string;
  updated_at?: string;
}

interface DownloadStatus {
  downloaded: string[];
  failed: string[];
  lastUpdated: string;
}

/**
 * Extract YouTube ID from various YouTube URL formats
 */
function extractYouTubeId(url: string | undefined): string | null {
  if (!url) return null;

  // Regular expressions for different YouTube URL formats
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/v\/|youtube\.com\/watch\?.*vi?=)([a-zA-Z0-9_-]{11})/,
    /(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

const queue: string[] = [];
let isProcessing = false;
let isShuttingDown = false;
let currentDownloadProcess: ChildProcess | null = null;

// Initialize SDK
let sdk: any = null;

function initSDK(): void {
	if (!sdk) {
		const supabase = createClient(config.supabase.url!, config.supabase.key!);
		sdk = createSdk(supabase);
	}
}

/**
 * Queue a channel for download
 */
export async function queueDownload(channelSlug: string): Promise<void> {
	if (!queue.includes(channelSlug)) {
		queue.push(channelSlug);
		console.log(`📥 Added to queue: ${channelSlug}`);
	}

	if (!isProcessing) {
		processQueue();
	}
}

/**
 * Process download queue
 */
async function processQueue(): Promise<void> {
	if (isShuttingDown || queue.length === 0) {
		isProcessing = false;
		return;
	}

	isProcessing = true;
	const channelSlug = queue.shift()!;

	console.log(`\n🎵 Starting download: ${channelSlug}`);

	try {
		await downloadChannel(channelSlug);
		console.log(`✓ Completed: ${channelSlug}`);
	} catch (err: any) {
		if (!isShuttingDown) {
			console.error(`✗ Failed to download ${channelSlug}:`, err.message);
		}
	}

	// Process next in queue
	if (!isShuttingDown) {
		setTimeout(() => processQueue(), 1000);
	}
}

/**
 * Download all tracks from a channel
 */
async function downloadChannel(channelSlug: string): Promise<void> {
	initSDK();

	// Fetch channel tracks
	let tracks: Track[], error: any;
	try {
		const response = await sdk!.channels.readChannelTracks(channelSlug);
		tracks = response.data;
		error = response.error;
	} catch (e: any) {
		console.error(`SDK Error fetching tracks for ${channelSlug}:`, e.message);
		throw new Error(`Failed to fetch tracks: ${e.message}`);
	}
	if (error) throw new Error(error.message);

	if (!tracks) {
		console.log(`  No tracks returned for ${channelSlug}`);
		return;
	}

	if (!tracks || tracks.length === 0) {
		console.log(`  No tracks found for ${channelSlug}`);
		return;
	}

	console.log(`  Found ${tracks.length} tracks`);

	// Create channel directory
	const channelDir = path.join(config.downloadDir, channelSlug);
	await fs.mkdir(channelDir, { recursive: true });

	// Create tracks subdirectory (for organizing files)
	const tracksDir = path.join(channelDir, "tracks");
	await fs.mkdir(tracksDir, { recursive: true });

	// Load or create status tracking
	let status: DownloadStatus = await loadStatus(channelDir);

	// If status is empty (new channel) or potentially corrupted, rebuild from existing files
	if (status.downloaded.length === 0) {
		const rebuiltStatus = await rebuildStatusFromFiles(channelDir, tracks);
		// Only use rebuilt status if it found some existing files
		if (rebuiltStatus.downloaded.length > 0) {
			status = rebuiltStatus;
			console.log(
				`  ♻️ Rebuilt status from ${rebuiltStatus.downloaded.length} existing files`,
			);
		}
	}

	// Get list of existing files to avoid re-downloading
	const existingFiles = new Set<string>();
	try {
		const files = await fs.readdir(tracksDir);
		files.forEach((file) => {
			existingFiles.add(file);
		});
	} catch (_err) {
		// If directory doesn't exist or can't be read, continue with empty set
	}

	const debugLog = path.join(channelDir, "debug.txt");  // This can be removed later

	// Log start of download session
	await appendDebugLog(
		`\n=== Download session started: ${new Date().toISOString()} ===`,
	);
	await appendDebugLog(`Total tracks in channel: ${tracks.length}`);
	await appendDebugLog(`Existing files: ${existingFiles.size}`);

	// Download each track
	let success = 0;
	let failed = 0;
	let skipped = 0;

	for (let i = 0; i < tracks.length; i++) {
		const track = tracks[i];
		const trackIdentifier = track.id || sanitizeFilename(track.title || "untitled");
		const _expectedFileName = `${sanitizeFilename(track.title || "untitled")}`;

		console.log(`  [${i + 1}/${tracks.length}] ${track.title || "Untitled"}`);

		// Check if already downloaded by checking for files with this name or track ID
		const expectedSanitizedTitle = sanitizeFilename(track.title || "untitled");
		const youtubeId = extractYouTubeId(track.url || '');
		let fileExists = Array.from(existingFiles).some((file) =>
			file.startsWith(`${expectedSanitizedTitle}`),
		);

		// Also check for files with the track ID in brackets
		if (track.id && !fileExists) {
			fileExists = Array.from(existingFiles).some((file) =>
				file.includes(`[${track.id}]`),
			);
		}
		
		// Also check for files with the YouTube ID in brackets
		if (youtubeId && !fileExists) {  // Check if youtubeId is not null before using
			fileExists = Array.from(existingFiles).some((file) =>
				file.includes(`[${youtubeId}]`),
			);
		}

		// Also check if it's marked in status
		const trackIdForStatus = track.id || `${i}-${sanitizeFilename(track.title || 'untitled')}`;
		const statusMarked = status.downloaded.includes(trackIdForStatus);

		if (fileExists || statusMarked) {
			console.log(`    ⊙ Already downloaded, skipping`);
			await appendDebugLog(
				`[${i + 1}] SKIP: ${track.title} (already exists or marked in status)`,
			);
			skipped++;
			continue;
		}

		try {
			const downloadedFile = await downloadTrack(track, tracksDir);

			// Verify that the file actually exists before marking as downloaded
			let fileActuallyExists = false;
			if (downloadedFile) {
				try {
					await fs.access(downloadedFile);
					fileActuallyExists = true;
				} catch (_err) {
					// File doesn't exist, wait a bit and try again (race condition)
					await new Promise((resolve) => setTimeout(resolve, 200));
					try {
						await fs.access(downloadedFile);
						fileActuallyExists = true;
					} catch (_retryErr) {
						console.log(
							`    Warning: Could not verify file exists: ${path.basename(downloadedFile)}`,
						);
						fileActuallyExists = false;
					}
				}
			}

			if (fileActuallyExists && downloadedFile) {
				// Write ID3 metadata to the downloaded file
				await writeTrackMetadata(downloadedFile, track, i + 1);

				// Set file timestamps to match track creation/update times from Radio4000
				await setFileTimestamps(downloadedFile, track);

				// Organize by tags immediately after download if enabled
				const settings = await loadSettings();
				if (settings.features?.organizeByTags) {
					await organizeTrackByTags(track, tracksDir, channelDir);
				}

				status.downloaded.push(trackIdForStatus);
				await appendDebugLog(`[${i + 1}] OK: ${track.title}`);
				success++;
			} else if (downloadedFile === null) {
				// File was reported as already existing but path wasn't returned
				// This happens when the downloader said it was already downloaded
				// Let's check if a file with the expected name exists
				const expectedFileName = sanitizeFilename(track.title || "untitled");
				const files = await fs.readdir(tracksDir);
				const matchingFile = files.find((f) => f.startsWith(expectedFileName));

				if (matchingFile) {
					const existingFile = path.join(tracksDir, matchingFile);

					// Apply metadata and timestamps to the existing file
					await writeTrackMetadata(existingFile, track, i + 1);
					await setFileTimestamps(existingFile, track);

					// Organize by tags if enabled
					const settings = await loadSettings();
					if (settings.features?.organizeByTags) {
						await organizeTrackByTags(track, tracksDir, channelDir);
					}

					status.downloaded.push(trackIdForStatus);
					await appendDebugLog(`[${i + 1}] EXISTS: ${track.title}`);
					skipped++;
				} else {
					// No file exists, so the "already downloaded" report was incorrect
					// Treat as a failed download
					status.failed.push(trackIdForStatus);
					await appendDebugLog(
						`[${i + 1}] ERROR: ${track.title} - Download reported as already complete but no file found`,
					);
					failed++;
				}
			} else {
				// downloadedFile is defined but doesn't exist on disk - this shouldn't happen
				status.failed.push(trackIdForStatus);
				await appendDebugLog(
					debugLog,
					`[${i + 1}] ERROR: ${track.title} - Download process completed but file not found`,
				);
				failed++;
			}

			// Remove from failed list if it was there
			status.failed = status.failed.filter((id) => id !== trackIdForStatus);
		} catch (err: any) {
			console.error(`    ✗ Failed: ${err.message}`);
			status.failed.push(trackIdForStatus);
			await appendDebugLog(
				debugLog,
				`[${i + 1}] ERROR: ${track.title} - ${err.message}`,
			);
			failed++;
		}

		// Save status after each track
		await saveStatus(channelDir, status);
	}

	// Create local m3u playlist
	await createLocalPlaylist(channelSlug, tracksDir, tracks);

	// Final summary
	await appendDebugLog(
		`\nSession complete: ${success} downloaded, ${skipped} skipped, ${failed} failed`,
	);
	console.log(`  ✓ Downloaded: ${success} tracks`);
	if (skipped > 0) {
		console.log(`  ⊙ Skipped: ${skipped} tracks (already downloaded)`);
	}
	if (failed > 0) {
		console.log(`  ✗ Failed: ${failed} tracks`);
	}
}

/**
 * Rebuild status from existing files in the tracks directory
 */
export async function rebuildStatusFromFiles(channelDir: string, tracks: Track[]): Promise<DownloadStatus> {
	const tracksDir = path.join(channelDir, "tracks");
	let existingFiles: string[] = [];
	try {
		existingFiles = await fs.readdir(tracksDir);
	} catch (_err) {
		// If directory doesn't exist, return empty status
		return {
			downloaded: [],
			failed: [],
			lastUpdated: new Date().toISOString(),
		};
	}

	const status: DownloadStatus = {
		downloaded: [],
		failed: [],
		lastUpdated: new Date().toISOString(),
	};

	// For each track, check if a corresponding file exists
	for (let i = 0; i < tracks.length; i++) {
		const track = tracks[i];
		const trackId = track.id || `${i}-${sanitizeFilename(track.title || "untitled")}`;
		const expectedFileName = `${sanitizeFilename(track.title || "untitled")}`;

		// Check if file exists by name
		let fileExists = existingFiles.some((file) =>
			file.startsWith(expectedFileName),
		);

		// Also check for files with the track ID in brackets
		if (track.id && !fileExists) {
			fileExists = existingFiles.some((file) =>
				file.includes(`[${track.id}]`),
			);
		}
		
		// Also check for files with YouTube ID in brackets
		const youtubeId = extractYouTubeId(track.url || '');
		if (youtubeId && !fileExists) {  // Check if youtubeId is not null before using
			fileExists = existingFiles.some((file) =>
				file.includes(`[${youtubeId}]`),
			);
		}

		if (fileExists) {
			status.downloaded.push(trackId);
		}
	}

	return status;
}

/**
 * Download a single track using yt-dlp or youtube-dl
 * Returns the path to the downloaded file if successful, or null if file already existed
 */
async function downloadTrack(track: Track, outputDir: string): Promise<string | null> {
	// Load settings
	const settings = await loadSettings();

	return new Promise((resolve, reject) => {
		const sanitizedTitle = sanitizeFilename(track.title || "untitled");
		// Use Radio4000 track ID for unique identification, fallback to YouTube ID
		const trackId = track.id || extractYouTubeId(track.url || '');
		const fileNameWithId = trackId ? `${sanitizedTitle} [${trackId}]` : sanitizedTitle;
		const outputTemplate = path.join(outputDir, `${fileNameWithId}.%(ext)s`);

		// Choose downloader (yt-dlp or youtube-dl)
		const downloader = settings.downloader || "yt-dlp";

		const args = [
			"--format",
			settings.ytdlp.format,
			"--extract-audio",
			"--audio-format",
			settings.ytdlp.audioFormat,
			"--audio-quality",
			settings.ytdlp.audioQuality,
			"--output",
			outputTemplate,
			"--no-playlist",
			"--newline", // Progress on separate lines
		];

		// Add cookie support if configured
		if (settings.ytdlp.cookiesFile) {
			args.push("--cookies", settings.ytdlp.cookiesFile);
		}
		// Add cookies-from-browser option if configured
		else if (settings.ytdlp.cookiesFromBrowser) {
			args.push("--cookies-from-browser", settings.ytdlp.cookiesFromBrowser);
		}

		// Add thumbnail embedding if enabled in settings
		if (settings.ytdlp.embedThumbnail) {
			args.push("--embed-thumbnail");
		}

		// Optionally write thumbnail as separate file if also wanted
		if (settings.ytdlp.writeThumbnail) {
			args.push("--write-thumbnail");
		}

		// Note: We don't add metadata with downloader as we'll add it ourselves with node-id3

		args.push(track.url!);

		// Spawn the process - we'll track it and kill all children if needed
		// Spawn with stdio to properly track and kill process tree
		const proc = spawn(downloader, args, {
			stdio: ["ignore", "pipe", "pipe"], // stdin: ignore, stdout: pipe, stderr: pipe
		});

		// Track the current process for cleanup
		currentDownloadProcess = proc;

		let stderr = "";
		let stdout = "";
		let downloadedFile: string | null = null;

		proc.stdout.on("data", (data) => {
			stdout += data.toString();
			// Show progress
			const lines = data.toString().trim().split("\n");
			for (const line of lines) {
				if (line.includes("[download]") || line.includes("ETA")) {
					console.log(`    ${line}`);
				}
				// Capture the destination filename
				if (line.includes("[download] Destination:")) {
					const match = line.match(/\[download\] Destination: (.+)/);
					if (match) {
						downloadedFile = match[1].trim();
					}
				}
				// Also check for "has already been downloaded" which includes filename
				if (line.includes("has already been downloaded")) {
					const match = line.match(
						/\[download\] (.+) has already been downloaded/,
					);
					if (match) {
						downloadedFile = match[1].trim();
					}
				}
			}
		});

		proc.stderr.on("data", (data) => {
			stderr += data.toString();
		});

		proc.on("close", async (code) => {
			// Clear current process tracker if this is the current process
			if (currentDownloadProcess && currentDownloadProcess === proc) {
				currentDownloadProcess = null;
			}

			// If shutting down, resolve without error
			if (isShuttingDown) {
				resolve(null);
				return;
			}

			if (code === 0) {
				// Try to find the downloaded file if we didn't capture it from output
				if (!downloadedFile) {
					const files = await fs.readdir(outputDir);
					const matchingFile = files.find((f) =>
						f.startsWith(`${sanitizedTitle}`),
					);
					if (matchingFile) {
						downloadedFile = path.join(outputDir, matchingFile);
					}
				}
				resolve(downloadedFile); // Successfully downloaded
			} else {
				// Check if file already exists by searching output for the file
				if (
					stderr.includes("has already been downloaded") ||
					stdout.includes("has already been downloaded")
				) {
					// Try to extract the filename that was reported as already downloaded
					let alreadyDownloadedFile: string | null = null;
					const alreadyDownloadedMatch = stdout.match(
						/\[download\] (.+) has already been downloaded/,
					);
					if (alreadyDownloadedMatch) {
						alreadyDownloadedFile = alreadyDownloadedMatch[1].trim();
					} else {
						// If we can't extract the filename from output, try to find the most recently created file
						// that matches our expected pattern
						const files = await fs.readdir(outputDir);
						const matchingFiles = files.filter((f) =>
							f.startsWith(sanitizedTitle),
						);
						if (matchingFiles.length > 0) {
							// Find the most recently created file
							const fileStats = await Promise.all(
								matchingFiles.map((f) => fs.stat(path.join(outputDir, f))),
							);
							const latestIndex = fileStats
								.map((stat, idx) => ({
									index: idx,
									mtime: stat.mtime,
								}))
								.sort((a, b) => b.mtime.getTime() - a.mtime.getTime())[0].index;
							alreadyDownloadedFile = matchingFiles[latestIndex];
						}
					}

					if (alreadyDownloadedFile) {
						resolve(path.join(outputDir, alreadyDownloadedFile));
					} else {
						resolve(null); // File was reported as already downloaded but we can't confirm location
					}
				} else {
					// Include stderr in error message for debugging
					const errorMsg =
						stderr.trim() ||
						stdout.trim() ||
						`${downloader} exited with code ${code}`;
					reject(new Error(errorMsg));
				}
			}
		});

		proc.on("error", (err: any) => {
			// Clear current process tracker on error
			if (currentDownloadProcess && currentDownloadProcess === proc) {
				currentDownloadProcess = null;
			}

			if (err.code === "ENOENT") {  // This is still an issue because err might not have 'code'
				reject(new Error(`${downloader} not found. Please install it.`));
			} else {
				reject(err);
			}
		});
	});
}

/**
 * Write ID3 metadata to downloaded track
 */
async function writeTrackMetadata(filePath: string, track: Track, trackNumber: number): Promise<void> {
	try {
		// Use get-artist-title package to parse artist and title from the track title
		// Returns [artist, title] array or undefined if it can't parse
		const artistTitle = getArtistTitle(track.title || "Untitled");
		let artist = "";
		let title = track.title || "Untitled";

		if (artistTitle && Array.isArray(artistTitle) && artistTitle.length >= 2) {
			[artist, title] = artistTitle;
			// Ensure both values are valid
			artist = artist || "";
			title = title || track.title || "Untitled";
		}

		const tags: any = {
			title: title,
			artist: artist || "Unknown Artist",
			comment: {
				language: "eng",
				text: track.description || "",
			},
			trackNumber: trackNumber.toString(),
			year: track.created_at
				? new Date(track.created_at).getFullYear().toString()
				: "",
			// WOAF: track.url, // Official audio file webpage - not standard, using userDefinedText instead
		};

		// Add Discogs URL if available
		if (track.discogs_url) {
			if (!tags.userDefinedText) {
				tags.userDefinedText = [];
			}
			tags.userDefinedText.push({
				description: "DISCOGS_URL",
				value: track.discogs_url,
			});
		}

		// Add track URL as a custom field
		if (track.url) {
			if (!tags.userDefinedText) {
				tags.userDefinedText = [];
			}
			tags.userDefinedText.push({
				description: "SOURCE_URL",
				value: track.url,
			});
		}

		// Write tags
		const success = NodeID3.write(tags, filePath);
		if (!success) {
			console.log(
				`    Warning: Could not write ID3 tags to ${path.basename(filePath)}`,
			);
		}
	} catch (err: any) {
		console.error(`    Warning: Error writing ID3 metadata: ${err.message}`);
	}
}

/**
 * Create a local m3u playlist referencing downloaded files
 */
async function createLocalPlaylist(channelSlug: string, channelDir: string, tracks: Track[]): Promise<void> {
	const files = await fs.readdir(channelDir);
	const audioFiles = files.filter(
		(f) =>
			f.endsWith(".mp3") ||
			f.endsWith(".opus") ||
			f.endsWith(".m4a") ||
			f.endsWith(".webm"),
	);

	let m3u = "#EXTM3U\n";
	for (const track of tracks) {
		const title = track.title || "Untitled";
		m3u += `#EXTINF:-1,${title}\n`;

		// Find the corresponding file
		const file = audioFiles.find((f) => f.includes(sanitizeFilename(title)));
		if (file) {
			m3u += `${file}\n`;
		}
	}

	const playlistPath = path.join(channelDir, "playlist.m3u");
	await fs.writeFile(playlistPath, m3u);
}

/**
 * Set file timestamps to match track creation/update times from Radio4000
 */
async function setFileTimestamps(filePath: string, track: Track): Promise<void> {
	if (!filePath || !track) return;

	try {
		// Check if file exists before attempting to set timestamps
		await fs.access(filePath);

		// Use track's created_at as modification time (for chronological sorting)
		// and updated_at as access time
		const createdTime = track.created_at
			? new Date(track.created_at)
			: new Date();
		const updatedTime = track.updated_at
			? new Date(track.updated_at)
			: new Date();

		// Set access time and modification time to match Radio4000 timestamps
		// Note: fs.utimes(path, atime, mtime) - atime first, then mtime
		// To sort tracks chronologically by when they were added to the channel,
		// we set mtime (modification time) to the track's created_at time
		await fs.utimes(filePath, updatedTime, createdTime);
	} catch (err: any) {
		if (err.code === "ENOENT") {
			// File doesn't exist - this is the race condition we're trying to handle
			console.log(
				`    Warning: File does not exist to set timestamps: ${path.basename(filePath)}`,
			);
		} else {
			console.error(
				`    Warning: Could not set timestamps for ${path.basename(filePath)}: ${err.message}`,
			);
		}
	}
}

/**
 * Load status.json from channel directory (currently disabled to avoid creating status files)
 */
async function loadStatus(channelDir: string): Promise<DownloadStatus> {
	// Return default status to avoid creating status.json files
	return {
		downloaded: [],
		failed: [],
		lastUpdated: new Date().toISOString(),
	};
}

/**
 * Save status.json to channel directory
 */
/**
 * Save status.json to channel directory (currently disabled to avoid creating status files)
 */
async function saveStatus(channelDir: string, status: DownloadStatus): Promise<void> {
	// Do nothing to avoid creating status.json files
	return;
}

/**
 * Append a line to debug.txt (currently disabled to avoid creating debug files)
 */
async function appendDebugLog(debugFileOrMessage: string, message?: string): Promise<void> {
	// Do nothing to avoid creating debug.txt files
	return;
}

/**
 * Organize a single track by tags using symlinks
 */
async function organizeTrackByTags(track: Track, tracksDir: string, channelDir: string): Promise<void> {
	const sanitizedTitle = sanitizeFilename(track.title || "untitled");

	// Find the actual downloaded file
	const files = await fs.readdir(tracksDir);
	const trackFile = files.find((f) => f.startsWith(`${sanitizedTitle}`));

	if (!trackFile) {
		console.log(
			`    Warning: Could not find downloaded file for ${track.title}`,
		);
		return;
	}

	// Parse tags from track description or title
	const tags = extractTags(track);

	if (tags.length === 0) {
		// If no tags, add to 'untagged' folder
		tags.push("untagged");
	}

	// Create tags directory
	const tagsDir = path.join(channelDir, "tags");
	await fs.mkdir(tagsDir, { recursive: true });

	// Create symlinks for each tag
	for (const tag of tags) {
		const tagDir = path.join(tagsDir, sanitizeFilename(tag));
		await fs.mkdir(tagDir, { recursive: true });

		const sourcePath = path.join(tracksDir, trackFile);
		const linkPath = path.join(tagDir, trackFile);

		try {
			// Remove existing symlink if it exists
			try {
				await fs.unlink(linkPath);
			} catch (err: any) {
				if (err.code !== "ENOENT") throw err;
			}

			// Create relative symlink
			const relativePath = path.relative(tagDir, sourcePath);
			await fs.symlink(relativePath, linkPath);
		} catch (err: any) {
			console.error(
				`    Warning: Could not create symlink for ${trackFile}: ${err.message}`,
			);
		}
	}

	if (tags.length > 0) {
		console.log(`    ✓ Organized by tags: ${tags.join(", ")}`);
	}
}

/**
 * Organize all tracks by tags using symlinks (used for initial organization)
 */
async function _organizeByTags(channelDir: string, tracksDir: string, tracks: Track[]): Promise<void> {
	console.log("  📂 Organizing tracks by tags...");

	// Create tags directory
	const tagsDir = path.join(channelDir, "tags");
	await fs.mkdir(tagsDir, { recursive: true });

	// Process each track
	for (let i = 0; i < tracks.length; i++) {
		const track = tracks[i];

		await organizeTrackByTags(track, tracksDir, channelDir);
	}

	// Count tag directories
	const tagDirs = await fs.readdir(path.join(channelDir, "tags"));
	console.log(`  ✓ Organized into ${tagDirs.length} tag folders`);
}

/**
 * Sync channel directory using rsync
 */
export async function syncChannel(channelSlug: string, destination: string): Promise<void> {
	const settings = await loadSettings();

	if (!settings.features || !settings.features.rsyncEnabled) {
		console.log("  ⊘ rsync sync is disabled in settings");
		return;
	}

	const channelDir = path.join(config.downloadDir, channelSlug);

	return new Promise((resolve, reject) => {
		console.log(`  🔄 Syncing ${channelSlug} to ${destination}...`);

		const args = [
			"-avz", // archive, verbose, compress
			"--progress", // show progress
			"--delete", // delete files that don't exist in source
			`${channelDir}/`, // source (trailing slash is important)
			destination, // destination
		];

		const proc = spawn("rsync", args);

		proc.stdout.on("data", (data) => {
			console.log(`    ${data.toString().trim()}`);
		});

		proc.stderr.on("data", (data) => {
			console.error(`    ${data.toString().trim()}`);
		});

		proc.on("close", (code) => {
			if (code === 0) {
				console.log(`  ✓ Sync completed`);
				resolve();
			} else {
				reject(new Error(`rsync exited with code ${code}`));
			}
		});

		proc.on("error", (err: any) => {
			if (err.code === "ENOENT") {
				reject(new Error("rsync not found. Please install rsync."));
			} else {
				reject(err);
			}
		});
	});
}

/**
 * Stop all downloads and cleanup
 */
export async function stopDownloads(): Promise<void> {
	console.log("\n⏹  Stopping downloads...");

	// Set shutdown flag to stop queue processing
	isShuttingDown = true;

	// Clear the queue
	const queuedCount = queue.length;
	queue.length = 0;

	if (queuedCount > 0) {
		console.log(`  Cleared ${queuedCount} queued download(s)`);
	}

	// Kill current download process if running
	if (currentDownloadProcess) {
		console.log("  Attempting to stop active download...");

		try {
			// Get the process ID before attempting to kill
			const pid = currentDownloadProcess.pid;
			if (!pid) {
				console.log("  Process has no PID, cannot kill");
				return;
			}

			console.log(`  Killing process tree for PID: ${pid}`);

			// On Unix-like systems, kill the entire process group by using negative PID
			if (process.platform !== "win32") {
				try {
					// Kill the entire process group with SIGTERM first
					process.kill(-pid, "SIGTERM");
					console.log(`  Sent SIGTERM to process group: ${-pid}`);
				} catch (groupKillErr: any) {
					// If process group kill fails, fall back to individual process kill
					console.log(`  Process group kill failed: ${groupKillErr.message}`);
					try {
						currentDownloadProcess.kill("SIGTERM");
					} catch (individualKillErr: any) {
						console.log(
							`  Individual process kill also failed: ${individualKillErr.message}`,
						);
					}
				}
			} else {
				// On Windows, try to kill the individual process
				currentDownloadProcess.kill("SIGTERM");
			}

			// Wait a bit to allow graceful shutdown
			await new Promise((resolve) => setTimeout(resolve, 500));

			// If process still exists, send SIGKILL
			if (currentDownloadProcess && !currentDownloadProcess.killed && pid) {
				if (process.platform !== "win32") {
					try {
						// Kill the process group with SIGKILL
						process.kill(-pid, "SIGKILL");
						console.log(`  Sent SIGKILL to process group: ${-pid}`);
					} catch (groupKillErr: any) {
						console.log(
							`  Process group SIGKILL failed: ${groupKillErr.message}`,
						);
						try {
							currentDownloadProcess.kill("SIGKILL");
						} catch (individualKillErr: any) {
							console.log(
								`  Individual process SIGKILL also failed: ${individualKillErr.message}`,
							);
						}
					}
				} else {
					// On Windows, send SIGKILL to individual process
					currentDownloadProcess.kill("SIGKILL");
				}
			}
		} catch (err: any) {
			console.log(`  Error stopping process: ${err.message}`);
		}

		// Always clear the reference
		currentDownloadProcess = null;
	} else {
		console.log("  No active download process to stop");
	}

	// Wait a bit for processes to clean up
	await new Promise((resolve) => setTimeout(resolve, 100));

	console.log("✓ Downloads stopped");
}

/**
 * Check if yt-dlp is installed
 */
export async function checkYtdlp(): Promise<boolean> {
	return new Promise((resolve) => {
		const proc = spawn("yt-dlp", ["--version"]);
		proc.on("close", (code) => resolve(code === 0));
		proc.on("error", () => resolve(false));
	});
}