import { execFileSync } from 'node:child_process';

const file = process.argv[2];
if (!file) throw new Error('Usage: npm run inspect:source -- <video-file>');
const output = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration:stream=codec_name,codec_type,width,height,avg_frame_rate', '-of', 'json', file], { encoding: 'utf8' });
console.log(JSON.stringify(JSON.parse(output), null, 2));
