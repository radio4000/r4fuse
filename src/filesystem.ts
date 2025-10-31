import { createSdk } from "@radio4000/sdk";
import { createClient } from "@supabase/supabase-js";
import {
	config,
	loadDownloads,
	loadFavorites,
	loadSettings,
} from "./config.js";
import {
	extractTagsFromTrack,
	formatTrackContent,
} from "./utils/content-utils.js";
import { parsePath, sanitizeFilename } from "./utils/path-utils.js";
import { createSafeDate, createStat } from "./utils/timestamps.js";
import type { Stat } from "./utils/timestamps.js";

// Define types for our track and channel data
interface Track {
	id?: string;
	title?: string;
	url?: string;
	description?: string;
	discogs_url?: string;
	created_at?: string;
	updated_at?: string;
	tags?: string[];
}

interface Channel {
	slug: string;
	name?: string;
	description?: string;
	image?: string;
	url?: string;
	created_at?: string;
	updated_at?: string;
}

interface ParsedPath {
	parts: string[];
	root?: string;
	channel?: string;
	subdir?: string;
	file?: string;
	file2?: string;
}

// Simple request cache to prevent duplicate concurrent API calls
// This stores promises for active requests and reuses them
const activeRequests = new Map<string, Promise<unknown>>();



// Removed request caching - using direct API calls for fresh data

// Initialize SDK
let sdk: any = null;

export async function initSDK(): Promise<void> {
	if (!config.supabase.url || !config.supabase.key) {
		throw new Error(
			"Missing Supabase credentials. Set SUPABASE_URL and SUPABASE_KEY environment variables.",
		);
	}

	const supabase = createClient(config.supabase.url, config.supabase.key);
	sdk = createSdk(supabase);
	console.log("✓ Connected to Radio4000 API");

	// Load user config files
	await loadSettings();
	const favorites = await loadFavorites();
	const downloads = await loadDownloads();
	console.log(
		`✓ Loaded config (${favorites.length} favorites, ${downloads.length} downloads)`,
	);
}

/**
 * Virtual filesystem structure
 */
const structure: Record<string, { type: "dir" | "file"; mode: number; content?: string }> = {
	"/": { type: "dir", mode: 0o755 },
	"/HELP.txt": { type: "file", mode: 0o444, content: "" },
	"/channels": { type: "dir", mode: 0o755 },
	"/favorites": { type: "dir", mode: 0o755 },
	"/downloads": { type: "dir", mode: 0o755 },
};

/**
 * Get filesystem stats for a path
 */
export async function getattr(path: string): Promise<Stat> {
	const parsed: ParsedPath = parsePath(path);

	// Handle root entries from structure
	if (structure[path]) {
		const entry = structure[path];
		if (entry.type === "dir") {
			return createStat({
				mode: entry.mode,
				size: 0,
				isDir: true,
			});
		}
		if (entry.type === "file") {
			// For HELP.txt files, get the actual content to calculate proper size
			const content =
				path === "/HELP.txt" || path === "/.ctrl/HELP.txt"
					? await getFileContent(path)
					: entry.content || "";

			return createStat({
				mode: entry.mode,
				size: Buffer.byteLength(content),
				isDir: false,
			});
		}
	}

	// /channels/<slug>
	if (parsed.root === "channels" && parsed.channel && !parsed.subdir) {
		// Get channel info to use proper timestamps
		if (!sdk) {
			throw new Error("SDK not initialized");
		}
		
		const data = await sdk.channels.readChannel(parsed.channel);
		if (data.error) throw new Error(data.error.message);
		const channel: Channel = data.data;

		const created_at_date = createSafeDate(channel.created_at);
		const updated_at_date = createSafeDate(channel.updated_at);

		return createStat({
			mode: 0o755,
			size: 0,
			isDir: true,
			mtime: updated_at_date,
			ctime: created_at_date,
			atime: updated_at_date,
		});
	}

	// /channels/<slug>/tracks
	if (
		parsed.root === "channels" &&
		parsed.channel &&
		parsed.subdir === "tracks" &&
		!parsed.file
	) {
		if (!sdk) {
			throw new Error("SDK not initialized");
		}
		
		// Get channel tracks to determine the directory timestamps (based on earliest track)
		const data = await sdk.channels.readChannelTracks(parsed.channel);
		if (data.error) throw new Error(data.error.message);
		const tracks: Track[] = data.data;

		// Use the earliest track creation date or channel creation if no tracks
		let dirCreated: Date | undefined = undefined;
		let dirUpdated: Date | undefined = undefined;

		if (tracks.length > 0) {
			// Find earliest created track and latest updated track (filter out invalid dates)
			const validTracks = tracks.filter(
				(track) =>
					track.created_at &&
					!Number.isNaN(Date.parse(track.created_at)) &&
					track.updated_at &&
					!Number.isNaN(Date.parse(track.updated_at)),
			);

			if (validTracks.length > 0) {
				const sortedByCreated = [...validTracks].sort(
					(a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime(),
				);
				const sortedByUpdated = [...validTracks].sort(
					(a, b) => new Date(b.updated_at!).getTime() - new Date(a.updated_at!).getTime(),
				);

				dirCreated = createSafeDate(sortedByCreated[0].created_at);
				dirUpdated = createSafeDate(sortedByUpdated[0].updated_at);
			}
		} else {
			// Fallback to channel timestamps if no tracks (fresh from API)
			const channelData = await sdk.channels.readChannel(parsed.channel);
			if (channelData.error) throw new Error(channelData.error.message);
			const channel: Channel = channelData.data;
			dirCreated = createSafeDate(channel.created_at);
			dirUpdated = createSafeDate(channel.updated_at);
		}

		return createStat({
			mode: 0o755,
			size: 0,
			isDir: true,
			mtime: dirUpdated,
			ctime: dirCreated,
			atime: dirUpdated,
		});
	}

	// /channels/<slug>/tags
	if (
		parsed.root === "channels" &&
		parsed.channel &&
		parsed.subdir === "tags" &&
		!parsed.file
	) {
		if (!sdk) {
			throw new Error("SDK not initialized");
		}
		
		// Get channel tracks to determine the directory timestamps (based on earliest track with tags)
		const data = await sdk.channels.readChannelTracks(parsed.channel);
		if (data.error) throw new Error(data.error.message);
		const tracks: Track[] = data.data;

		// Use the earliest track creation date or channel creation if no tracks
		let dirCreated: Date | undefined = undefined;
		let dirUpdated: Date | undefined = undefined;

		if (tracks.length > 0) {
			// Find earliest created track and latest updated track (filter out invalid dates)
			const validTracks = tracks.filter(
				(track) =>
					track.created_at &&
					!Number.isNaN(Date.parse(track.created_at)) &&
					track.updated_at &&
					!Number.isNaN(Date.parse(track.updated_at)),
			);

			if (validTracks.length > 0) {
				const sortedByCreated = [...validTracks].sort(
					(a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime(),
				);
				const sortedByUpdated = [...validTracks].sort(
					(a, b) => new Date(b.updated_at!).getTime() - new Date(a.updated_at!).getTime(),
				);

				dirCreated = createSafeDate(sortedByCreated[0].created_at);
				dirUpdated = createSafeDate(sortedByUpdated[0].updated_at);
			}
		} else {
			// Fallback to channel timestamps if no tracks (fresh from API)
			const channelData = await sdk.channels.readChannel(parsed.channel);
			if (channelData.error) throw new Error(channelData.error.message);
			const channel: Channel = channelData.data;
			dirCreated = createSafeDate(channel.created_at);
			dirUpdated = createSafeDate(channel.updated_at);
		}

		return createStat({
			mode: 0o755,
			size: 0,
			isDir: true,
			mtime: dirUpdated,
			ctime: dirCreated,
			atime: dirUpdated,
		});
	}

	// /channels/<slug>/tags/<tagname>
	if (
		parsed.root === "channels" &&
		parsed.channel &&
		parsed.subdir === "tags" &&
		parsed.file &&
		!parsed.file2
	) {
		if (!sdk) {
			throw new Error("SDK not initialized");
		}
		
		// Get the tag's earliest track creation date and latest updated date
		const data = await sdk.channels.readChannelTracks(parsed.channel);
		if (data.error) throw new Error(data.error.message);
		const tracks: Track[] = data.data;

		const tagName = parsed.file;
		const tagTracks = tracks.filter((track) => {
			const tags = extractTagsFromTrack(track);
			const trackTags = tags.length > 0 ? tags : ["untitled"];
			return trackTags.includes(tagName);
		});

		let dirCreated: Date | undefined = undefined;
		let dirUpdated: Date | undefined = undefined;

		if (tagTracks.length > 0) {
			// Filter tracks with valid timestamps before sorting
			const validTracks = tagTracks.filter(
				(track) =>
					track.created_at &&
					!Number.isNaN(Date.parse(track.created_at)) &&
					track.updated_at &&
					!Number.isNaN(Date.parse(track.updated_at)),
			);

			if (validTracks.length > 0) {
				const sortedByCreated = [...validTracks].sort(
					(a, b) => new Date(a.created_at!).getTime() - new Date(b.created_at!).getTime(),
				);
				const sortedByUpdated = [...validTracks].sort(
					(a, b) => new Date(b.updated_at!).getTime() - new Date(a.updated_at!).getTime(),
				);

				dirCreated = createSafeDate(sortedByCreated[0].created_at);
				dirUpdated = createSafeDate(sortedByUpdated[0].updated_at);
			}
		}

		return createStat({
			mode: 0o755,
			size: 0,
			isDir: true,
			mtime: dirUpdated,
			ctime: dirCreated,
			atime: dirUpdated,
		});
	}

	// Files in channel root
	if (
		parsed.root === "channels" &&
		parsed.channel &&
		parsed.subdir &&
		!parsed.file
	) {
		const validFiles = ["ABOUT.txt", "image.url", "tracks.m3u"];
		if (validFiles.includes(parsed.subdir)) {
			const content = await getFileContent(path);

			// Get channel info to use proper timestamps for these files
			if (!sdk) {
				throw new Error("SDK not initialized");
			}
			
			const data = await sdk.channels.readChannel(parsed.channel);
			if (data.error) throw new Error(data.error.message);
			const channel: Channel = data.data;

			const created_at_date = createSafeDate(channel.created_at);
			const updated_at_date = createSafeDate(channel.updated_at);

			return createStat({
				mode: 0o444,
				size: Buffer.byteLength(content),
				isDir: false,
				mtime: updated_at_date,
				ctime: created_at_date,
				atime: updated_at_date,
			});
		}
	}

	// Track files: /channels/<slug>/tracks/<file>
	if (
		parsed.root === "channels" &&
		parsed.channel &&
		parsed.subdir === "tracks" &&
		parsed.file &&
		!parsed.file2
	) {
		if (parsed.file === "tracks.json") {
			const content = await getFileContent(path);
			return createStat({
				mode: 0o444,
				size: Buffer.byteLength(content),
				isDir: false,
			});
		}
		if (parsed.file.endsWith(".txt")) {
			if (!sdk) {
				throw new Error("SDK not initialized");
			}
			
			// Find the track by matching the sanitized filename
			const data = await sdk.channels.readChannelTracks(parsed.channel);
			if (data.error) throw new Error(data.error.message);
			const tracks: Track[] = data.data;

			const orderedTracks = [...tracks].reverse();
			const filename = parsed.file.replace(/\.txt$/, "");
			const track = orderedTracks.find(
				(t) => sanitizeFilename(t.title || "untitled") === filename,
			);

			if (track) {
				const content = await getFileContent(path);
				const created_at_date = createSafeDate(track.created_at);
				const updated_at_date = createSafeDate(track.updated_at);

				return createStat({
					mode: 0o444,
					size: Buffer.byteLength(content),
					isDir: false,
					mtime: created_at_date,
					ctime: updated_at_date,
					atime: updated_at_date,
				});
			}
		}
	}

	// Track files in tags: /channels/<slug>/tags/<tagname>/<file>
	if (
		parsed.root === "channels" &&
		parsed.channel &&
		parsed.subdir === "tags" &&
		parsed.file &&
		parsed.file2
	) {
		if (parsed.file2.endsWith(".txt")) {
			if (!sdk) {
				throw new Error("SDK not initialized");
			}
			
			// Find the track by matching the sanitized filename
			const data = await sdk.channels.readChannelTracks(parsed.channel);
			if (data.error) throw new Error(data.error.message);
			const tracks: Track[] = data.data;

			const orderedTracks = [...tracks].reverse();
			const filename = parsed.file2.replace(/\.txt$/, "");
			const track = orderedTracks.find(
				(t) => sanitizeFilename(t.title || "untitled") === filename,
			);

			if (track) {
				// Verify this track has the tag
				const tags = extractTagsFromTrack(track);
				const trackTags = tags.length > 0 ? tags : ["untagged"];
				if (trackTags.includes(parsed.file)) {
					const content = await getFileContent(path);
					const created_at_date = createSafeDate(track.created_at);
					const updated_at_date = createSafeDate(track.updated_at);

					return createStat({
						mode: 0o444,
						size: Buffer.byteLength(content),
						isDir: false,
						mtime: created_at_date,
						ctime: updated_at_date,
						atime: updated_at_date,
					});
				}
			}
		}
	}

	// /favorites/<slug> - symlinks to channels
	if (parsed.root === "favorites" && parsed.channel && !parsed.subdir) {
		return createStat({ mode: 0o755, size: 0, isDir: true });
	}

	// /downloads/<slug> - symlinks to channels
	if (parsed.root === "downloads" && parsed.channel && !parsed.subdir) {
		return createStat({ mode: 0o755, size: 0, isDir: true });
	}

	// Files in favorites/<slug>/ or downloads/<slug>/
	if (
		(parsed.root === "favorites" || parsed.root === "downloads") &&
		parsed.channel &&
		parsed.subdir
	) {
		// Redirect to channels path
		const channelsPath = `/channels/${parsed.channel}/${parsed.subdir}${parsed.file ? `/${parsed.file}` : ""}`;
		return getattr(channelsPath);
	}

	throw new Error("ENOENT");
}

/**
 * Read directory contents
 */
export async function readdir(path: string): Promise<string[]> {
	const parsed: ParsedPath = parsePath(path);

	// Root directory
	if (path === "/") {
		return [".", "..", "HELP.txt", "channels", "favorites", "downloads"];
	}

	// /channels - list all channels (no caching, fresh from API)
	if (path === "/channels") {
		console.log("  📡 Fetching channels list (fresh from API)...");
		if (!sdk) {
			throw new Error("SDK not initialized");
		}
		
		// Fetch channels directly from API without caching
		const startTime = Date.now();
		const data = await sdk.channels.readChannels(100);
		const elapsed = Date.now() - startTime;
		console.log(`  ✅ Fetched ${data.data?.length || 0} channels in ${elapsed}ms`);
		if (data.error) throw new Error(data.error.message);
		return [".", "..", ...(data.data?.map((c: any) => c.slug) || [])];
	}

	// /channels/<slug> - show channel contents
	if (parsed.root === "channels" && parsed.channel && !parsed.subdir) {
		return [
			".",
			"..",
			"ABOUT.txt",
			"image.url",
			"tracks.m3u",
			"tracks",
			"tags",
		];
	}

	// /channels/<slug>/tracks - list track files
	if (
		parsed.root === "channels" &&
		parsed.channel &&
		parsed.subdir === "tracks" &&
		!parsed.file
	) {
		if (!sdk) {
			throw new Error("SDK not initialized");
		}
		
		const data = await sdk.channels.readChannelTracks(parsed.channel);
		if (data.error) throw new Error(data.error.message);
		const tracks: Track[] = data.data;
		// Reverse tracks so oldest (first added) is #1
		const orderedTracks = [...tracks].reverse();
		const files = ["tracks.json"];
		for (let i = 0; i < orderedTracks.length; i++) {
			const name = sanitizeFilename(orderedTracks[i].title || "untitled");
			// No numeric prefix - users can sort by timestamp
			files.push(`${name}.txt`);
		}
		return [".", "..", ...files];
	}

	// /channels/<slug>/tags - list tag directories
	if (
		parsed.root === "channels" &&
		parsed.channel &&
		parsed.subdir === "tags" &&
		!parsed.file
	) {
		if (!sdk) {
			throw new Error("SDK not initialized");
		}
		
		const data = await sdk.channels.readChannelTracks(parsed.channel);
		if (data.error) throw new Error(data.error.message);
		const tracks: Track[] = data.data;

		// Collect all unique tags
		const tagSet = new Set<string>();
		for (const track of tracks) {
			const tags = extractTagsFromTrack(track);
			if (tags.length === 0) {
				tagSet.add("untagged");
			} else {
				tags.forEach((tag) => {
					tagSet.add(tag);
				});
			}
		}

		return [".", "..", ...Array.from(tagSet).sort()];
	}

	// /channels/<slug>/tags/<tag> - list tracks with this tag
	if (
		parsed.root === "channels" &&
		parsed.channel &&
		parsed.subdir === "tags" &&
		parsed.file &&
		!path.split("/")[5]
	) {
		const tagName = parsed.file;
		if (!sdk) {
			throw new Error("SDK not initialized");
		}
		
		const data = await sdk.channels.readChannelTracks(parsed.channel);
		if (data.error) throw new Error(data.error.message);
		const tracks: Track[] = data.data;

		// Reverse tracks so oldest (first added) is #1
		const orderedTracks = [...tracks].reverse();
		const files: string[] = [];

		for (let i = 0; i < orderedTracks.length; i++) {
			const track = orderedTracks[i];
			const tags = extractTagsFromTrack(track);
			const trackTags = tags.length > 0 ? tags : ["untagged"];

			if (trackTags.includes(tagName)) {
				const name = sanitizeFilename(track.title || "untitled");
				// No numeric prefix - users can sort by timestamp
				files.push(`${name}.txt`);
			}
		}

		return [".", "..", ...files];
	}

	// /favorites - list favorite channels
	if (path === "/favorites") {
		const favorites = await loadFavorites();
		return [".", "..", ...favorites];
	}

	// /downloads - list channels marked for download
	if (path === "/downloads") {
		const downloads = await loadDownloads();
		return [".", "..", ...downloads];
	}

	// Files in favorites/<slug>/ or downloads/<slug>/
	if (
		(parsed.root === "favorites" || parsed.root === "downloads") &&
		parsed.channel
	) {
		// Redirect to channels path
		const channelsPath = `/channels/${parsed.channel}${parsed.subdir ? `/${parsed.subdir}` : ""}`;
		return readdir(channelsPath);
	}

	throw new Error("ENOENT");
}

/**
 * Read file contents
 */
export async function read(path: string, fd: number, buffer: Buffer, length: number, position: number): Promise<number> {
	const parsed: ParsedPath = parsePath(path);

	// Redirect favorites/<slug>/* and downloads/<slug>/* to channels/<slug>/*
	if (
		(parsed.root === "favorites" || parsed.root === "downloads") &&
		parsed.channel
	) {
		const channelsPath = `/channels/${parsed.channel}${parsed.subdir ? `/${parsed.subdir}` : ""}${parsed.file ? `/${parsed.file}` : ""}`;
		return read(channelsPath, fd, buffer, length, position);
	}

	const content = await getFileContent(path);
	const data = Buffer.from(content);

	// Read from position
	const chunk = data.slice(position, position + length);
	chunk.copy(buffer);

	return chunk.length;
}

/**
 * Write to files
 */
export async function write(_path: string, _fd: number, _buffer: Buffer, _length: number, _position: number): Promise<number> {
	throw new Error("EROFS");
}

/**
 * Get file content for various file types
 */
async function getFileContent(path: string): Promise<string> {
	const parsed: ParsedPath = parsePath(path);

	// Root HELP.txt
	if (path === "/HELP.txt") {
		return `r4fuse - Radio4000 FUSE Filesystem
=====================================

Quick Start:
  ls channels/                     # Browse all channels
  cat channels/oskar/ABOUT.txt     # Read about a channel
  ls channels/oskar/tracks/        # View track metadata files
  ls -lt channels/oskar/tracks/    # Sort by timestamp (oldest first)
  ls channels/oskar/tags/          # View tracks organized by tags

  # Files use track creation/update timestamps - sort by date naturally!

  # View favorites and downloads
  ls favorites/                    # View favorite channels
  ls downloads/                    # View channels marked for download

Configuration:
  All settings are stored in: ~/.config/radio4000/r4fuse/

  settings.json   # All settings (see below)
  favorites.txt   # Favorite channels (one per line)
  downloads.txt   # Channels to auto-download (one per line)

Settings.json options:
  downloader: "yt-dlp" or "youtube-dl"
  features.organizeByTags: true/false (organize downloads by tags)
  features.rsyncEnabled: true/false (enable rsync sync)
  paths.mountPoint: custom mount point path
  paths.downloadDir: custom download directory path

Tag Organization:
  Both mounted and downloaded channels organize tracks as:
    tracks/              # All track files
    tags/<tagname>/      # Tracks grouped by tag (symlinks)

  Tags are extracted from hashtags in track descriptions.

See README.md in the project directory for complete documentation.
`;
	}

	// Channel ABOUT.txt
	if (
		parsed.root === "channels" &&
		parsed.channel &&
		parsed.subdir === "ABOUT.txt"
	) {
		if (!sdk) {
			throw new Error("SDK not initialized");
		}
		
		const channelPromise = sdk.channels.readChannel(parsed.channel);
		const tracksPromise = sdk.channels.readChannelTracks(parsed.channel);

		const [channelResult, tracksResult] = await Promise.all([
			channelPromise,
			tracksPromise,
		]);

		const channel = await channelResult;
		if (channel.error) throw new Error(channel.error.message);
		const channelData: Channel = channel.data;

		const tracks = await tracksResult;
		if (tracks.error) throw new Error(tracks.error.message);
		const tracksData: Track[] = tracks.data;

		return `${channelData.name || "Untitled Channel"}
${"=".repeat((channelData.name || "Untitled Channel").length)}

${channelData.description || "No description available."}

Stats:
  Tracks: ${tracksData.length}
  Created: ${channelData.created_at ? new Date(channelData.created_at).toLocaleDateString() : "Unknown"}
  ${channelData.url ? `Website: ${channelData.url}` : ""}

Quick Access:
  info.txt      # Machine-readable metadata
  tracks.m3u    # Playlist for streaming
  tracks/       # Individual track files

Configuration:
  Add channels to favorites in ~/.config/radio4000/r4fuse/favorites.txt
  Mark for auto-download in ~/.config/radio4000/r4fuse/downloads.txt
`;
	}

	// image.url - Cloudinary CDN URL
	if (
		parsed.root === "channels" &&
		parsed.channel &&
		parsed.subdir === "image.url"
	) {
		if (!sdk) {
			throw new Error("SDK not initialized");
		}
		
		const data = await sdk.channels.readChannel(parsed.channel);
		if (data.error) throw new Error(data.error.message);
		const channel: Channel = data.data;
		
		if (channel.image) {
			// Check if it's already a full URL (Cloudinary)
			if (channel.image.startsWith("http")) {
				return `${channel.image}\n`;
			}
			// Otherwise construct Supabase storage URL
			const storageUrl = config.supabase.url!.replace(/\/$/, "");
			return `${storageUrl}/storage/v1/object/public/channels/${channel.image}\n`;
		}
		return "";
	}

	// tracks.m3u - playlist
	if (
		parsed.root === "channels" &&
		parsed.channel &&
		parsed.subdir === "tracks.m3u"
	) {
		if (!sdk) {
			throw new Error("SDK not initialized");
		}
		
		const data = await sdk.channels.readChannelTracks(parsed.channel);
		if (data.error) throw new Error(data.error.message);
		const tracks: Track[] = data.data;

		let m3u = "#EXTM3U\n";
		for (const track of tracks) {
			m3u += `#EXTINF:-1,${track.title || "Untitled"}\n`;
			m3u += `${track.url}\n`;
		}
		return m3u;
	}

	// Track files: .txt and tracks.json
	if (
		parsed.root === "channels" &&
		parsed.channel &&
		parsed.subdir === "tracks" &&
		parsed.file
	) {
		if (!sdk) {
			throw new Error("SDK not initialized");
		}
		
		const data = await sdk.channels.readChannelTracks(parsed.channel);
		if (data.error) throw new Error(data.error.message);
		const tracks: Track[] = data.data;

		// Reverse tracks so oldest (first added) is #1
		const orderedTracks = [...tracks].reverse();

		// tracks.json - all tracks metadata in correct order
		if (parsed.file === "tracks.json") {
			return JSON.stringify(orderedTracks, null, 2);
		}

		// Match track by sanitized filename (no numeric prefix)
		if (parsed.file.endsWith(".txt")) {
			const filename = parsed.file.replace(/\.txt$/, "");
			const track = orderedTracks.find(
				(t) => sanitizeFilename(t.title || "untitled") === filename,
			);
			if (track) {
				return formatTrackContent(track);
			}
		}
	}

	throw new Error("ENOENT");
}

/**
 * Open file
 */
export async function open(_path: string, _flags: number): Promise<number> {
	// Return a fake file descriptor for all files
	return 0;
}

/**
 * Release file
 */
export async function release(_path: string, _fd: number): Promise<number> {
	return 0;
}