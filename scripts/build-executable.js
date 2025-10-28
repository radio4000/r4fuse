#!/usr/bin/env node

/**
 * Script to build r4fuse executable with Bun
 * Usage: node scripts/build-executable.js [output-name]
 */

import { spawnSync } from 'child_process';
import { platform } from 'process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { existsSync } from 'fs';

// Get command line arguments
const args = process.argv.slice(2);
const outputName = args[0] || getDefaultOutputName();

function getDefaultOutputName() {
  const arch = process.arch;
  switch (platform) {
    case 'linux':
      return arch === 'arm64' ? 'r4fuse-linux-arm64' : 'r4fuse-linux-x64';
    case 'win32':
      return arch === 'arm64' ? 'r4fuse-windows-arm64.exe' : 'r4fuse-windows-x64.exe';
    case 'darwin':
      return arch === 'arm64' ? 'r4fuse-macos-arm64' : 'r4fuse-macos-x64';
    default:
      return `r4fuse-${platform}-${arch}`;
  }
}

// Check if Bun is available
function checkBun() {
  const result = spawnSync('bun', ['--version'], { stdio: 'pipe' });
  if (result.error) {
    console.error('Error: Bun is not installed or not in PATH');
    console.error('Visit https://bun.sh/ to install Bun');
    process.exit(1);
  }
  console.log(`Using Bun version: ${result.stdout.toString().trim()}`);
}

// Build the executable
function buildExecutable() {
  console.log(`Building executable as: ${outputName}`);
  
  const result = spawnSync('bun', [
    'build', 
    'bin/r4fuse.js',
    '--compile',
    `--outfile=${outputName}`
  ], {
    stdio: 'inherit',
    cwd: join(dirname(fileURLToPath(import.meta.url)), '..')
  });
  
  if (result.status === 0) {
    console.log(`✓ Executable built successfully: ${outputName}`);
    
    // Make executable on Unix-like systems
    if (platform !== 'win32') {
      const chmodResult = spawnSync('chmod', ['+x', outputName], {
        cwd: join(dirname(fileURLToPath(import.meta.url)), '..')
      });
      
      if (chmodResult.status === 0) {
        console.log(`✓ Made executable: chmod +x ${outputName}`);
      } else {
        console.warn(`⚠ Could not make executable: chmod +x ${outputName}`);
      }
    }
  } else {
    console.error('✗ Build failed');
    process.exit(result.status);
  }
}

// Main execution
function main() {
  console.log('r4fuse Executable Builder');
  console.log('========================');
  
  checkBun();
  buildExecutable();
}

// Run if this file is executed directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main();
}