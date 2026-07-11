import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

const frames = 'renders/frames';
const master = 'renders/master/master-4k-120.mp4';
execFileSync('npx', ['--yes', 'hyperframes@0.7.49', 'render', '--resolution', 'portrait-4k', '--fps', '120', '--format', 'png-sequence', '--output', frames], { stdio: 'inherit' });
if (!existsSync(`${frames}/frame_000000.png`)) throw new Error('Master render did not produce the first PNG frame.');
execFileSync('ffmpeg', ['-y', '-framerate', '120', '-i', `${frames}/frame_%06d.png`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '10', '-pix_fmt', 'yuv420p', master], { stdio: 'inherit' });
