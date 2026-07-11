import { execFileSync } from 'node:child_process';

const [input, output] = process.argv.slice(2);
if (!input || !output) throw new Error('Usage: npm run normalize-source -- <input-video> <output.mp4>');
/** V1 browser-safe Source Intermediate: H.264 high profile, 4:2:0, faststart, no audio. */
execFileSync('ffmpeg', ['-y', '-i', input, '-map', '0:v:0', '-an', '-c:v', 'libx264', '-preset', 'slow', '-crf', '14', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', output], { stdio: 'inherit' });
