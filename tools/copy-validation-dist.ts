import { copyFile, mkdir } from 'node:fs/promises';

/**
 * Vite's `emptyOutDir: true` wipes dist/ on every `npm run build`, so this must run AFTER build,
 * not before — see build:validation in package.json.
 */
await mkdir('dist/validation', { recursive: true });
await copyFile('validation/index.html', 'dist/validation/index.html');
await copyFile('renders/validation/anime-edit-validation.mp4', 'dist/validation/anime-edit-validation.mp4');
await copyFile('renders/validation/validation-report.json', 'dist/validation/validation-report.json');
await copyFile('renders/validation/first-frame.png', 'dist/validation/first-frame.png');
console.log('Copied validation preview + render artifacts into dist/validation/.');
