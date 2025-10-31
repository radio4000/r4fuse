import Fuse from "fuse-native";
import {
	config,
	ensureDirectories,
	loadDownloads,
	loadUserConfig,
} from "./config.js";
import { queueDownload, stopDownloads } from "./download.js";
import * as fs from "./filesystem.js";

let fuse: any = null;

/**
 * Mount the filesystem
 */
export async function mount(): Promise<void> {
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
			readdir: (path: string, cb: (err: number, result?: string[]) => void) => {
				fs.readdir(path)
					.then((entries) => cb(0, entries))
					.catch((err: any) => cb(err.message === 'ENOENT' ? -2 : -5)); // EIO
			},

			getattr: (path: string, cb: (err: number, result?: any) => void) => {
				fs.getattr(path)
					.then((attrs) => cb(0, attrs))
					.catch((err: any) => cb(err.message === 'ENOENT' ? -2 : -5)); // EIO
			},

			open: (path: string, flags: number, cb: (err: number, result?: number) => void) => {
				fs.open(path, flags)
					.then((fd) => cb(0, fd))
					.catch((err: any) => cb(err.message === 'ENOENT' ? -2 : -5)); // EIO
			},

			release: (path: string, fd: number, cb: (err: number) => void) => {
				fs.release(path, fd)
					.then(() => cb(0))
					.catch((err: any) => cb(err.message === 'ENOENT' ? -2 : -5)); // EIO
			},

			read: (
				path: string,
				fd: number,
				buffer: Buffer,
				length: number,
				position: number,
				cb: (err: number, bytesRead?: number) => void
			) => {
				fs.read(path, fd, buffer, length, position)
					.then((bytesRead: number) => cb(0, bytesRead))
					.catch((err: any) => cb(err.message === 'ENOENT' ? -2 : -5)); // EIO
			},

			write: (
				path: string,
				fd: number,
				buffer: Buffer,
				length: number,
				position: number,
				cb: (err: number, bytesWritten?: number) => void
			) => {
				fs.write(path, fd, buffer, length, position)
					.then((bytesWritten: number) => cb(0, bytesWritten))
					.catch((err: any) => cb(err.message === 'ENOENT' ? -2 : -5)); // EIO
			},

			truncate: (_path: string, _size: number, cb: (err: number) => void) => {
				cb(-30); // EROFS (Read-only file system)
			},

			chmod: (_path: string, _mode: number, cb: (err: number) => void) => {
				cb(-30); // EROFS (Read-only file system)
			},

			chown: (_path: string, _uid: number, _gid: number, cb: (err: number) => void) => {
				cb(-30); // EROFS (Read-only file system)
			},
		},
		{ debug: false },
	);

	// Mount the filesystem
	fuse.mount((err: Error | null) => {
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
async function shutdown(): Promise<void> {
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
export async function unmount(): Promise<void> {
	if (!fuse) {
		console.log("Not mounted");
		return;
	}

	console.log("\n\n📤 Unmounting...");

	return new Promise((resolve, reject) => {
		fuse.unmount((err: Error | null) => {
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
export function status(): { mounted: boolean; mountPoint: string; downloadDir: string } {
	return {
		mounted: fuse !== null,
		mountPoint: config.mountPoint,
		downloadDir: config.downloadDir,
	};
}