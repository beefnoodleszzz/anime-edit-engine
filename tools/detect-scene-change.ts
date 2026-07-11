import { execFileSync } from 'node:child_process';

const file = process.argv[2];
if (!file) throw new Error('Usage: npm run detect-cuts -- <video-file>');
const output = execFileSync('ffprobe', ['-f', 'lavfi', '-i', `movie=${file},select=gt(scene\\,0.35)`, '-show_entries', 'frame=pts_time', '-of', 'csv=p=0'], { encoding: 'utf8' });
console.log(output.trim() || 'No scene change above threshold 0.35.');
