import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Locates a headless-Chromium executable already available on this machine, for the real
 * browser first-frame integration test. This project already depends on a working headless
 * Chromium for `npx hyperframes render`, so reusing whatever is already installed avoids a
 * second multi-hundred-MB download in an environment that already has one.
 */
export function findChromiumExecutable(): string | undefined {
  const override = process.env['CHROME_PATH'] ?? process.env['PUPPETEER_EXECUTABLE_PATH'];
  if (override && existsSync(override)) return override;

  const home = homedir();
  const candidates: string[] = [
    ...globChromeForTesting(join(home, '.cache/puppeteer/chrome')),
    ...globHeadlessShell(join(home, '.cache/hyperframes/chrome/chrome-headless-shell')),
    ...globPlaywrightChromium(join(home, 'Library/Caches/ms-playwright')),
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
  ];
  return candidates.find((candidate) => existsSync(candidate));
}

function listDirs(root: string): string[] {
  if (!existsSync(root)) return [];
  try { return readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name); } catch { return []; }
}

function globChromeForTesting(root: string): string[] {
  return listDirs(root).sort().reverse().map((build) => join(root, build, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'));
}

function globHeadlessShell(root: string): string[] {
  return listDirs(root).sort().reverse().map((build) => join(root, build, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell'));
}

function globPlaywrightChromium(root: string): string[] {
  return listDirs(root).filter((name) => name.startsWith('chromium-')).sort().reverse()
    .map((build) => join(root, build, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'));
}
