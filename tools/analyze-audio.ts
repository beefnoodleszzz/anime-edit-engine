import { execFileSync } from 'node:child_process';

const file = process.argv[2];
if (!file) throw new Error('Usage: npm run analyze-audio -- <audio-or-video-file>');
const output = execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=codec_name,sample_rate,channels,duration', '-of', 'json', file], { encoding: 'utf8' });
console.log(JSON.stringify(JSON.parse(output), null, 2));
