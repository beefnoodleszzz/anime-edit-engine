import { execFileSync } from 'node:child_process';

const file = process.argv[2];
const duration = Number(process.argv[3] ?? 18);
if (!file || !Number.isFinite(duration) || duration <= 0) throw new Error('Usage: npm run select-audio-excerpt -- <audio-file> [duration-seconds]');

const sampleRate = 11025;
const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=duration', '-of', 'json', file], { encoding: 'utf8' })) as { streams: Array<{ duration?: string }> };
const totalDuration = Number(probe.streams[0]?.duration ?? 0);
if (totalDuration <= duration) throw new Error(`Audio is only ${totalDuration.toFixed(3)}s; cannot select a ${duration}s excerpt.`);
const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-vn', '-ac', '1', '-ar', String(sampleRate), '-f', 'f32le', 'pipe:1'], { maxBuffer: 256 * 1024 * 1024 });
const samples = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4));
const windowSize = 1024;
const hopSize = 256;
const energy: number[] = [];
for (let start = 0; start + windowSize <= samples.length; start += hopSize) {
  let sum = 0;
  for (let index = start; index < start + windowSize; index += 1) sum += samples[index]! ** 2;
  energy.push(Math.sqrt(sum / windowSize));
}
const at = (time: number): number => Math.max(0, Math.min(energy.length - 1, Math.round(time * sampleRate / hopSize)));
const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length);
const percentile = (values: number[], p: number): number => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]!;
};

const scoreWindow = (start: number) => {
  const end = start + duration;
  const values = energy.slice(at(start), at(end));
  const first = mean(values.slice(0, Math.max(1, at(start + 1.5) - at(start))));
  const middle = mean(values.slice(Math.max(0, at(start + 5) - at(start)), Math.max(1, at(start + 10) - at(start))));
  const last = mean(values.slice(Math.max(0, at(end - 3) - at(start))));
  const p95 = percentile(values, 0.95);
  const p10 = percentile(values, 0.1);
  const dynamic = (p95 - p10) / Math.max(0.000001, p95);
  const rise = (last - first) / Math.max(0.000001, p95);
  const onsetCount = values.reduce((count, value, index) => count + (index > 0 && value > values[index - 1]! * 1.18 ? 1 : 0), 0);
  const accentDensity = Math.min(1, onsetCount / 18);
  const score = Math.max(0, Math.min(1, 0.34 * Math.max(0, rise) + 0.26 * dynamic + 0.22 * Math.min(1, last / Math.max(0.000001, p95)) + 0.18 * accentDensity));
  return { start: Number(start.toFixed(3)), end: Number(end.toFixed(3)), score: Number(score.toFixed(4)), firstEnergy: Number(first.toFixed(5)), middleEnergy: Number(middle.toFixed(5)), lastEnergy: Number(last.toFixed(5)), peakEnergy: Number(p95.toFixed(5)), accentDensity: Number(accentDensity.toFixed(4)) };
};

const candidates = [];
for (let start = 0; start <= totalDuration - duration; start += 0.25) candidates.push(scoreWindow(start));
const top = candidates.sort((a, b) => b.score - a.score).slice(0, 12);
console.log(JSON.stringify({ file, duration, totalDuration, candidates: top }, null, 2));
