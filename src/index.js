import Fuse from "fuse-native";
import {
	config,
	ensureDirectories,
	loadDownloads,
	loadUserConfig,
} from "./config.js";
import { queueDownload, stopDownloads } from "./download.js";
import * as fs from "./filesystem.js";

let fuse = null;

/**
 * Mount the filesystem
 */
export async function mount() {
	// Load config and ensure directories exist
	await loadUserConfig();
	await ensureDirectories();

	// Initialize SDK connection
	await fs.initSDK();

	console.log("\n🎵 r4fuse - Radio4000 FUSE Filesystem");
	console.log("=====================================");
	console.log(`Mount point: ${config.mountPoint}`);
	console.log(`Downloads:   ${config.downloadDir}`);
	console.log(`Cache:       ${config.cacheDir}`);
	console.log("");

	// Load downloads for auto-download
	const downloads = await loadDownloads();

	// Create FUSE filesystem
	fuse = new Fuse(
		config.mountPoint,
		{
			readdir: (path, cb) => {
				fs.readdir(path)
					.then((entries) => cb(0, entries))
					.catch((err) => cb(Fuse[err.message] || Fuse.EIO));
			},

			getattr: (path, cb) => {
				fs.getattr(path)
					.then((attrs) => cb(0, attrs))
					.catch((err) => cb(Fuse[err.message] || Fuse.EIO));
			},

			open: (path, flags, cb) => {
				fs.open(path, flags)
					.then((fd) => cb(0, fd))
					.catch((err) => cb(Fuse[err.message] || Fuse.EIO));
			},

			release: (path, fd, cb) => {
				fs.release(path, fd)
					.then(() => cb(0))
					.catch((err) => cb(Fuse[err.message] || Fuse.EIO));
			},

			read: (path, fd, buffer, length, position, cb) => {
				fs.read(path, fd, buffer, length, position)
					.then((bytesRead) => cb(bytesRead))
					.catch((err) => cb(Fuse[err.message] || Fuse.EIO));
			},

			write: (path, fd, buffer, length, position, cb) => {
				fs.write(path, fd, buffer, length, position)
					.then((bytesWritten) => cb(bytesWritten))
					.catch((err) => cb(Fuse[err.message] || Fuse.EIO));
			},

			truncate: (_path, _size, cb) => {
				cb(Fuse.EROFS);
			},

			chmod: (_path, _mode, cb) => {
				cb(Fuse.EROFS);
			},

			chown: (_path, _uid, _gid, cb) => {
				cb(Fuse.EROFS);
			},
		},
		{ debug: false },
	);

	// Mount the filesystem
	fuse.mount((err) => {
		if (err) {
			console.error("✗ Failed to mount filesystem:", err.message);
			process.exit(1);
		}

		console.log(`✓ Mounted at ${config.mountPoint}`);
		console.log("\nUsage examples:");
		console.log(`  ls ${config.mountPoint}/channels/`);
		console.log(`  cat ${config.mountPoint}/channels/tonitonirock/ABOUT.txt`);
		console.log(`  ls ${config.mountPoint}/channels/tonitonirock/tags/`);
		console.log(
			`  mpv --playlist=${config.mountPoint}/channels/tonitonirock/tracks.m3u`,
		);
		console.log("\nPress Ctrl+C to unmount\n");

		// Auto-download: download channels marked for auto-download
		if (downloads.length > 0) {
			console.log(
				`🔄 Auto-download enabled for ${downloads.length} channel(s): ${downloads.join(", ")}`,
			);
			console.log("   Starting downloads in background...\n");

			// Queue downloads for all channels in downloads.txt
			for (const channelSlug of downloads) {
				queueDownload(channelSlug);
			}
		}
	});

	// Handle shutdown
	process.once("SIGINT", async () => {
		await shutdown();
	});

	process.once("SIGTERM", async () => {
		await shutdown();
	});
}

/**
 * Shutdown gracefully: stop downloads, then unmount
 */
async function shutdown() {
	console.log("\n🛑 Received shutdown signal, stopping downloads...");

	// Stop any running downloads
	await stopDownloads();

	console.log("✅ Downloads stopped, now unmounting...");

	// Unmount the filesystem
	await unmount();

	// Exit the process after unmounting
	process.exit(0);
}

/**
 * Unmount the filesystem
 */
export async function unmount() {
	if (!fuse) {
		console.log("Not mounted");
		return;
	}

	console.log("\n\n📤 Unmounting...");

	return new Promise((resolve, reject) => {
		fuse.unmount((err) => {
			if (err) {
				console.error("✗ Failed to unmount:", err.message);
				reject(err);
			} else {
				console.log("✓ Unmounted successfully");
				fuse = null;
				resolve();
			}
		});
	});
}

/**
 * Get filesystem status
 */
export function status() {
	return {
		mounted: fuse !== null,
		mountPoint: config.mountPoint,
		downloadDir: config.downloadDir,
	};
}
