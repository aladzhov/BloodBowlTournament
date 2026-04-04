import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const frontendDir = path.join(rootDir, 'frontend');

const isWindows = process.platform === 'win32';
const gradleCommand = isWindows ? 'gradlew.bat' : './gradlew';
const npmCommand = isWindows ? 'npm.cmd' : 'npm';

const runningChildren = new Set();
let shuttingDown = false;

function run(command, args, cwd, label) {
  const child = spawn(command, args, {
    cwd,
    stdio: 'inherit',
    shell: false,
    env: process.env
  });

  runningChildren.add(child);

  child.on('exit', (code, signal) => {
    runningChildren.delete(child);

    if (shuttingDown) {
      if (runningChildren.size === 0) {
        process.exit(code ?? 0);
      }
      return;
    }

    if (signal) {
      console.log(`[${label}] stopped by signal ${signal}`);
    } else if (code !== 0) {
      console.error(`[${label}] exited with code ${code}`);
      shutdown(code ?? 1);
      return;
    }

    if (runningChildren.size === 0) {
      process.exit(code ?? 0);
    }
  });

  child.on('error', (error) => {
    console.error(`[${label}] failed to start:`, error.message);
    shutdown(1);
  });

  return child;
}

function shutdown(exitCode = 0) {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;

  for (const child of runningChildren) {
    if (!child.killed) {
      child.kill('SIGTERM');
    }
  }

  setTimeout(() => {
    for (const child of runningChildren) {
      if (!child.killed) {
        child.kill('SIGKILL');
      }
    }
    process.exit(exitCode);
  }, 1500).unref();
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

if (!existsSync(path.join(rootDir, isWindows ? 'gradlew.bat' : 'gradlew'))) {
  console.error('Gradle wrapper is missing. Restore it before running the workspace.');
  process.exit(1);
}

if (!existsSync(path.join(frontendDir, 'node_modules'))) {
  console.log('Installing frontend dependencies...');
  const install = spawn(npmCommand, ['install'], {
    cwd: frontendDir,
    stdio: 'inherit',
    shell: false,
    env: process.env
  });

  install.on('exit', (code) => {
    if (code !== 0) {
      process.exit(code ?? 1);
      return;
    }

    startServices();
  });

  install.on('error', (error) => {
    console.error('Failed to install frontend dependencies:', error.message);
    process.exit(1);
  });
} else {
  startServices();
}

function startServices() {
  console.log('Starting backend on http://localhost:8080 and frontend on http://localhost:4200 ...');
  run(gradleCommand, [':backend:bootRun'], rootDir, 'backend');
  run(npmCommand, ['start'], frontendDir, 'frontend');
}

