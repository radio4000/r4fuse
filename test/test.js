#!/usr/bin/env node
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'
import fs from 'fs/promises'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Test framework
class TestRunner {
  constructor() {
    this.tests = []
    this.passed = 0
    this.failed = 0
    this.errors = []
  }

  test(name, fn) {
    this.tests.push({ name, fn })
  }

  async run() {
    console.log('\n🧪 Running r4fuse test suite\n')
    console.log('='.repeat(60))

    for (const { name, fn } of this.tests) {
      try {
        await fn()
        this.passed++
        console.log(`✓ ${name}`)
      } catch (err) {
        this.failed++
        this.errors.push({ name, error: err })
        console.log(`✗ ${name}`)
        console.log(`  ${err.message}`)
      }
    }

    console.log('='.repeat(60))
    console.log(`\nResults: ${this.passed} passed, ${this.failed} failed\n`)

    if (this.failed > 0) {
      console.log('Failed tests:')
      for (const { name, error } of this.errors) {
        console.log(`\n  ${name}`)
        console.log(`    ${error.stack}`)
      }
      process.exit(1)
    }

    process.exit(0)
  }
}

// Load all test files
async function loadTests() {
  const testFiles = await fs.readdir(__dirname)
  const testModules = testFiles.filter(f => f.endsWith('.test.js'))

  const runner = new TestRunner()

  for (const file of testModules) {
    const modulePath = join(__dirname, file)
    const module = await import(modulePath)
    if (module.default) {
      await module.default(runner)
    }
  }

  return runner
}

// Run tests
loadTests()
  .then(runner => runner.run())
  .catch(err => {
    console.error('Failed to load tests:', err)
    process.exit(1)
  })
