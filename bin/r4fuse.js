#!/usr/bin/env node

import { mount, unmount, status } from '../src/index.js'
import { checkYtdlp } from '../src/download.js'
import fs from 'fs'
import path from 'path'

// Get package info for version and repository info
const packageInfo = JSON.parse(
  fs.readFileSync(path.resolve(path.dirname('.'), 'package.json'), 'utf8')
)

const command = process.argv[2]

async function main() {
  switch (command) {
    case 'mount':
    case 'start':
      // Check if yt-dlp is available
      const hasYtdlp = await checkYtdlp()
      if (!hasYtdlp) {
        console.warn('⚠️  Warning: yt-dlp not found. Download functionality will not work.')
        console.warn('   Install it from: https://github.com/yt-dlp/yt-dlp#installation\n')
      }
      await mount()
      break

    case 'unmount':
    case 'stop':
      await unmount()
      process.exit(0)
      break

    case 'status':
      const s = status()
      console.log('Status:', s.mounted ? 'mounted' : 'not mounted')
      if (s.mounted) {
        console.log('Mount point:', s.mountPoint)
        console.log('Download dir:', s.downloadDir)
      }
      process.exit(0)
      break

    case 'version':
    case '--version':
    case '-v':
      console.log(`r4fuse v${packageInfo.version}`)
      process.exit(0)
      break

    case 'help':
    case '--help':
    case '-h':
      printHelp()
      process.exit(0)
      break

    default:
      console.error(`Unknown command: ${command}\n`)
      printHelp()
      process.exit(1)
  }
}

function printHelp() {
  console.log(`
r4fuse v${packageInfo.version} - FUSE filesystem for Radio4000
Repository: ${getRepositoryUrl()}

Usage:
  r4fuse mount          Mount the filesystem
  r4fuse unmount        Unmount the filesystem
  r4fuse status         Check if mounted
  r4fuse version        Show version
  r4fuse help           Show this help

Environment variables:
  SUPABASE_URL          Radio4000 Supabase URL
  SUPABASE_KEY          Radio4000 Supabase key
  R4_MOUNT_POINT        Mount point (default: ~/mnt/radio4000)
  R4_DOWNLOAD_DIR       Download directory (default: ~/Music/radio4000)

Examples:
  # Mount the filesystem
  r4fuse mount

  # Browse channels
  ls ~/mnt/radio4000/channels/

  # Read channel info
  cat ~/mnt/radio4000/channels/tonitonirock/info.txt

  # Play a channel with mpv
  mpv --playlist=~/mnt/radio4000/channels/tonitonirock/tracks.m3u

  # Download a channel
  Add channel slug to ~/.config/r4fuse/downloads.txt to auto-download

  # Download multiple channels
  Add multiple channel slugs to ~/.config/r4fuse/downloads.txt
`)
}

function getRepositoryUrl() {
  if (packageInfo.repository) {
    if (typeof packageInfo.repository === 'string') {
      return packageInfo.repository
    } else if (packageInfo.repository.url) {
      return packageInfo.repository.url
    }
  }
  return 'https://github.com/radio4000/r4fuse'
}

main().catch((err) => {
  console.error('Error:', err.message)
  process.exit(1)
})
