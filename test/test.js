#!/usr/bin/env node

import { config as loadEnv } from 'dotenv'
import { createClient } from '@supabase/supabase-js'
import { createSdk } from '@radio4000/sdk'
import { config } from '../src/config.js'
import * as fs from '../src/filesystem.js'
import { cache } from '../src/cache.js'

loadEnv()

const TEST_CHANNELS = ['oskar', 'ko002']

let testsPassed = 0
let testsFailed = 0

function assert(condition, message) {
  if (condition) {
    console.log(`  ✓ ${message}`)
    testsPassed++
  } else {
    console.error(`  ✗ ${message}`)
    testsFailed++
    throw new Error(`Assertion failed: ${message}`)
  }
}

async function testSDKConnection() {
  console.log('\n1. Testing SDK Connection')
  console.log('─────────────────────────')

  assert(config.supabase.url, 'Supabase URL is configured')
  assert(config.supabase.key, 'Supabase key is configured')

  const supabase = createClient(config.supabase.url, config.supabase.key)
  const sdk = createSdk(supabase)

  assert(sdk, 'SDK instance created')
  assert(sdk.channels, 'SDK has channels module')
  assert(sdk.tracks, 'SDK has tracks module')

  return sdk
}

async function testFetchChannels(sdk) {
  console.log('\n2. Testing Channel Fetching')
  console.log('────────────────────────────')

  const { data, error } = await sdk.channels.readChannels(10)

  assert(!error, `No error fetching channels: ${error?.message || 'OK'}`)
  assert(data, 'Channel data returned')
  assert(Array.isArray(data), 'Channel data is array')
  assert(data.length > 0, `Found ${data.length} channels`)

  console.log(`  → Found channels: ${data.slice(0, 5).map(c => c.slug).join(', ')}...`)

  return data
}

async function testSpecificChannels(sdk) {
  console.log('\n3. Testing Specific Channels')
  console.log('─────────────────────────────')

  for (const slug of TEST_CHANNELS) {
    console.log(`\n  Testing: ${slug}`)

    const { data, error } = await sdk.channels.readChannel(slug)

    assert(!error, `  No error fetching ${slug}: ${error?.message || 'OK'}`)
    assert(data, `  Channel ${slug} exists`)
    assert(data.slug === slug, `  Slug matches: ${data.slug}`)

    if (data.name) {
      console.log(`    Name: ${data.name}`)
    }
    if (data.created_at) {
      console.log(`    Created: ${data.created_at}`)
    }
  }
}

async function testChannelTracks(sdk) {
  console.log('\n4. Testing Channel Tracks')
  console.log('──────────────────────────')

  for (const slug of TEST_CHANNELS) {
    console.log(`\n  Testing tracks for: ${slug}`)

    const { data, error } = await sdk.channels.readChannelTracks(slug)

    assert(!error, `  No error fetching tracks: ${error?.message || 'OK'}`)
    assert(data, `  Track data returned`)
    assert(Array.isArray(data), `  Track data is array`)

    console.log(`    Found ${data.length} tracks`)

    if (data.length > 0) {
      const track = data[0]
      assert(track.url, `  First track has URL: ${track.url}`)
      assert(track.title || track.url, `  First track has title or URL`)
      console.log(`    First track: ${track.title || 'Untitled'}`)
    }
  }
}

async function testFilesystemOperations() {
  console.log('\n5. Testing Filesystem Operations')
  console.log('─────────────────────────────────')

  // Initialize SDK in filesystem module
  fs.initSDK()

  // Test root directory
  console.log('\n  Testing root directory')
  const rootStat = await fs.getattr('/')
  assert(rootStat.mode === 0o755, 'Root is directory')

  const rootDirs = await fs.readdir('/')
  assert(rootDirs.includes('channels'), 'Root contains channels/')
  assert(rootDirs.includes('.ctrl'), 'Root contains .ctrl/')
  console.log(`    Root contains: ${rootDirs.filter(d => !d.startsWith('.')).join(', ')}`)

  // Test /channels
  console.log('\n  Testing /channels directory')
  const channelsStat = await fs.getattr('/channels')
  assert(channelsStat.mode === 0o755, '/channels is directory')

  const channelsList = await fs.readdir('/channels')
  assert(channelsList.length > 2, `Found ${channelsList.length - 2} channels`)
  console.log(`    Found ${channelsList.length - 2} channels`)

  // Test specific channel
  for (const slug of TEST_CHANNELS.slice(0, 1)) { // Test just one to save time
    console.log(`\n  Testing /channels/${slug}`)

    try {
      const channelStat = await fs.getattr(`/channels/${slug}`)
      assert(channelStat.mode === 0o755, `${slug} is directory`)

      const channelContents = await fs.readdir(`/channels/${slug}`)
      assert(channelContents.includes('info.txt'), 'Contains info.txt')
      assert(channelContents.includes('tracks.m3u'), 'Contains tracks.m3u')
      assert(channelContents.includes('tracks'), 'Contains tracks/')
      console.log(`    Contents: ${channelContents.filter(f => !f.startsWith('.')).join(', ')}`)

      // Test info.txt
      console.log(`\n  Testing /channels/${slug}/info.txt`)
      const infoStat = await fs.getattr(`/channels/${slug}/info.txt`)
      assert(infoStat.size > 0, 'info.txt has content')

      const buffer = Buffer.alloc(infoStat.size)
      const bytesRead = await fs.read(`/channels/${slug}/info.txt`, 0, buffer, infoStat.size, 0)
      const content = buffer.toString('utf-8', 0, bytesRead)
      assert(content.includes('Name:'), 'info.txt contains Name')
      assert(content.includes('Slug:'), 'info.txt contains Slug')
      console.log(`    Content preview:\n${content.split('\n').slice(0, 3).map(l => '      ' + l).join('\n')}`)

      // Test tracks.m3u
      console.log(`\n  Testing /channels/${slug}/tracks.m3u`)
      const m3uStat = await fs.getattr(`/channels/${slug}/tracks.m3u`)
      assert(m3uStat.size > 0, 'tracks.m3u has content')

      const m3uBuffer = Buffer.alloc(Math.min(m3uStat.size, 1000))
      const m3uBytesRead = await fs.read(`/channels/${slug}/tracks.m3u`, 0, m3uBuffer, m3uBuffer.length, 0)
      const m3uContent = m3uBuffer.toString('utf-8', 0, m3uBytesRead)
      assert(m3uContent.startsWith('#EXTM3U'), 'tracks.m3u is valid m3u')
      console.log(`    Content preview:\n${m3uContent.split('\n').slice(0, 4).map(l => '      ' + l).join('\n')}`)

      // Test tracks directory
      console.log(`\n  Testing /channels/${slug}/tracks/`)
      const tracksStat = await fs.getattr(`/channels/${slug}/tracks`)
      assert(tracksStat.mode === 0o755, 'tracks/ is directory')

      const tracksList = await fs.readdir(`/channels/${slug}/tracks`)
      const urlFiles = tracksList.filter(f => f.endsWith('.url'))
      assert(urlFiles.length > 0, `Found ${urlFiles.length} track files`)
      console.log(`    Found ${urlFiles.length} tracks`)

      // Test first track file
      if (urlFiles.length > 0) {
        const trackFile = urlFiles[0]
        console.log(`\n  Testing /channels/${slug}/tracks/${trackFile}`)

        const trackStat = await fs.getattr(`/channels/${slug}/tracks/${trackFile}`)
        assert(trackStat.size > 0, 'Track file has content')

        const trackBuffer = Buffer.alloc(trackStat.size)
        const trackBytesRead = await fs.read(`/channels/${slug}/tracks/${trackFile}`, 0, trackBuffer, trackStat.size, 0)
        const trackUrl = trackBuffer.toString('utf-8', 0, trackBytesRead)
        assert(trackUrl.startsWith('http'), 'Track file contains URL')
        console.log(`    URL: ${trackUrl.substring(0, 60)}...`)
      }

    } catch (err) {
      console.error(`    Error testing ${slug}: ${err.message}`)
      throw err
    }
  }
}

async function testControlFiles() {
  console.log('\n6. Testing Control Files')
  console.log('────────────────────────')

  // Test cache control
  console.log('\n  Testing cache control')
  const cacheFile = await fs.getattr('/.ctrl/cache')
  assert(cacheFile.mode === 0o666, 'Cache control is writable')

  // Write to cache control
  const clearBuffer = Buffer.from('clear')
  const written = await fs.write('/.ctrl/cache', 0, clearBuffer, clearBuffer.length, 0)
  assert(written === clearBuffer.length, 'Cache control accepts writes')
  console.log('    ✓ Cache cleared via control file')

  // Test download control
  console.log('\n  Testing download control')
  const downloadFile = await fs.getattr('/.ctrl/download')
  assert(downloadFile.mode === 0o666, 'Download control is writable')
  console.log('    ✓ Download control is accessible')
}

async function testCaching() {
  console.log('\n7. Testing Cache System')
  console.log('───────────────────────')

  cache.clear()
  cache.set('test-key', 'test-value')
  const value = cache.get('test-key')
  assert(value === 'test-value', 'Cache stores and retrieves values')

  cache.set('ttl-test', 'will-expire', 100)
  await new Promise(resolve => setTimeout(resolve, 150))
  const expired = cache.get('ttl-test')
  assert(expired === null, 'Cache expires old values')

  console.log('  ✓ Cache TTL works correctly')
}

async function runTests() {
  console.log('╔═══════════════════════════════════════╗')
  console.log('║     r4fuse Test Suite                 ║')
  console.log('╚═══════════════════════════════════════╝')

  try {
    const sdk = await testSDKConnection()
    await testFetchChannels(sdk)
    await testSpecificChannels(sdk)
    await testChannelTracks(sdk)
    await testFilesystemOperations()
    await testControlFiles()
    await testCaching()

    console.log('\n╔═══════════════════════════════════════╗')
    console.log('║     Test Results                      ║')
    console.log('╚═══════════════════════════════════════╝')
    console.log(`✓ Passed: ${testsPassed}`)
    console.log(`✗ Failed: ${testsFailed}`)

    if (testsFailed === 0) {
      console.log('\n🎉 All tests passed! r4fuse is ready to use.\n')
      process.exit(0)
    } else {
      console.log('\n❌ Some tests failed. Please review the errors above.\n')
      process.exit(1)
    }

  } catch (err) {
    console.error('\n💥 Test suite crashed:', err.message)
    console.error(err.stack)
    console.log(`\n✓ Passed: ${testsPassed}`)
    console.log(`✗ Failed: ${testsFailed + 1}`)
    process.exit(1)
  }
}

runTests()
