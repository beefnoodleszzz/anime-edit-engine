import { execFileSync } from 'node:child_process';

const [file, output = 'renders/preview/contact-sheet.jpg'] = process.argv.slice(2);
if (!file) throw new Error('Usage: npm run contact-sheet -- <video-file> [output.jpg]');
execFileSync('ffmpeg', ['-y', '-i', file, '-vf', 'fps=10,scale=180:-1,tile=10x5:padding=4:margin=4', '-frames:v', '1', '-update', '1', output], { stdio: 'inherit' });
