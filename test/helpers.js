import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import assert from 'assert'

/**
 * Create a temporary test directory
 */
export async function createTempDir(prefix = 'r4fuse-test-') {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), prefix))
  return tmpDir
}

/**
 * Clean up a directory recursively
 */
export async function cleanupDir(dirPath) {
  try {
    await fs.rm(dirPath, { recursive: true, force: true })
  } catch (err) {
    // Ignore errors during cleanup
  }
}

/**
 * Assert that a file exists
 */
export async function assertFileExists(filePath) {
  try {
    await fs.access(filePath)
  } catch (err) {
    throw new Error(`File does not exist: ${filePath}`)
  }
}

/**
 * Assert that a file does not exist
 */
export async function assertFileNotExists(filePath) {
  try {
    await fs.access(filePath)
    throw new Error(`File should not exist: ${filePath}`)
  } catch (err) {
    if (err.code !== 'ENOENT') {
      throw err
    }
  }
}

/**
 * Read a JSON file
 */
export async function readJSON(filePath) {
  const data = await fs.readFile(filePath, 'utf-8')
  return JSON.parse(data)
}

/**
 * Write a JSON file
 */
export async function writeJSON(filePath, data) {
  await fs.mkdir(path.dirname(filePath), { recursive: true })
  await fs.writeFile(filePath, JSON.stringify(data, null, 2))
}

/**
 * Assert deep equality
 */
export function assertEquals(actual, expected, message) {
  assert.deepStrictEqual(actual, expected, message)
}

/**
 * Assert array contains
 */
export function assertContains(array, value, message) {
  if (!array.includes(value)) {
    throw new Error(message || `Array does not contain ${value}`)
  }
}

/**
 * Assert array does not contain
 */
export function assertNotContains(array, value, message) {
  if (array.includes(value)) {
    throw new Error(message || `Array should not contain ${value}`)
  }
}

/**
 * Assert throws
 */
export async function assertThrows(fn, message) {
  let threw = false
  try {
    await fn()
  } catch (err) {
    threw = true
  }
  if (!threw) {
    throw new Error(message || 'Expected function to throw')
  }
}
