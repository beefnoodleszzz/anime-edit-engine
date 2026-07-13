import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { execFileSync } from 'node:child_process';

const positional = process.argv.slice(2).filter((arg) => !arg.startsWith('--'));
const file = positional[0];
if (!file) throw new Error('Usage: npm run analyze-audio -- <audio-or-video-file> [--out audio-analysis.json] [--start 0] [--duration 18] [--bpm 100]');

const flag = (name: string): string | undefined => {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
};
const numberFlag = (name: string): number | undefined => {
  const value = flag(name);
  return value === undefined ? undefined : Number(value);
};

const output = flag('--out');
const excerptStart = Math.max(0, numberFlag('--start') ?? 0);
const requestedDuration = numberFlag('--duration');
const probe = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'a:0', '-show_entries', 'stream=sample_rate,duration', '-of', 'json', file], { encoding: 'utf8' })) as { streams: Array<{ sample_rate?: string; duration?: string }> };
const stream = probe.streams[0];
if (!stream) throw new Error(`No audio stream found in ${file}.`);
const streamDuration = Number(stream.duration ?? 0);
const excerptDuration = Math.min(requestedDuration ?? Math.max(0, streamDuration - excerptStart), Math.max(0, streamDuration - excerptStart));
if (!Number.isFinite(excerptDuration) || excerptDuration <= 0) throw new Error(`Audio excerpt has no duration: start=${excerptStart}, duration=${excerptDuration}.`);

const sampleRate = 11025;
const raw = execFileSync('ffmpeg', [
  '-v', 'error', '-ss', String(excerptStart), '-i', file, '-t', String(excerptDuration),
  '-vn', '-ac', '1', '-ar', String(sampleRate), '-f', 'f32le', 'pipe:1',
], { maxBuffer: 64 * 1024 * 1024 });
const samples = new Float32Array(raw.buffer, raw.byteOffset, Math.floor(raw.byteLength / 4));
const windowSize = 1024;
const hopSize = 256;
const energy: number[] = [];
for (let start = 0; start + windowSize <= samples.length; start += hopSize) {
  let sum = 0;
  for (let index = start; index < start + windowSize; index += 1) sum += samples[index]! ** 2;
  energy.push(Math.sqrt(sum / windowSize));
}
if (energy.length < 4) throw new Error('Audio excerpt is too short for beat analysis.');

const onset = energy.map((value, index) => Math.max(0, value - (energy[index - 1] ?? value)));
const scoreAtLag = (lag: number): number => {
  let score = 0;
  for (let index = lag; index < onset.length; index += 1) score += onset[index]! * onset[index - lag]!;
  return score / Math.max(1, onset.reduce((sum, value) => sum + value, 0));
};
const overrideBpm = numberFlag('--bpm');
let bpm = overrideBpm ?? 100;
if (!overrideBpm) {
  let bestScore = -Infinity;
  for (let candidate = 60; candidate <= 180; candidate += 0.5) {
    const lag = Math.max(1, Math.round((60 / candidate) * sampleRate / hopSize));
    const score = scoreAtLag(lag);
    if (score > bestScore) { bestScore = score; bpm = candidate; }
  }
}

const beatFrames = Math.max(1, Math.round((60 / bpm) * sampleRate / hopSize));
let phase = 0;
let phaseScore = -Infinity;
for (let candidate = 0; candidate < beatFrames; candidate += 1) {
  let score = 0;
  for (let index = candidate; index < onset.length; index += beatFrames) score += onset[index]!;
  if (score > phaseScore) { phaseScore = score; phase = candidate; }
}
const beatInterval = 60 / bpm;
const beats: number[] = [];
for (let time = (phase * hopSize) / sampleRate; time < excerptDuration; time += beatInterval) beats.push(Number(time.toFixed(6)));
const downbeats = beats.filter((_, index) => index % 4 === 0);

const sortedOnsets = [...onset].sort((a, b) => a - b);
const percentile = (p: number): number => sortedOnsets[Math.min(sortedOnsets.length - 1, Math.floor(sortedOnsets.length * p))]!;
const peakFloor = percentile(0.72);
const peakCeiling = Math.max(peakFloor, percentile(0.995));
const accents = onset.flatMap((value, index) => {
  if (index < 2 || index > onset.length - 3 || value < peakFloor || value < onset[index - 1]! || value < onset[index + 1]!) return [];
  const strength = Math.max(0, Math.min(1, (value - peakFloor) / Math.max(0.000001, peakCeiling - peakFloor)));
  return [{ time: Number(((index * hopSize) / sampleRate).toFixed(6)), strength: Number(strength.toFixed(3)), type: strength > 0.78 ? 'drop' : 'impact', confidence: Number(Math.min(1, 0.5 + strength * 0.5).toFixed(3)) }];
}).sort((a, b) => b.strength - a.strength).slice(0, 16).sort((a, b) => a.time - b.time);

const phraseLength = Math.max(1, Math.round(beatFrames * 4));
const sections: Array<{ start: number; end: number; type: string; confidence: number }> = [];
const phraseEnergy = [];
for (let start = 0; start < energy.length; start += phraseLength) {
  const values = energy.slice(start, Math.min(energy.length, start + phraseLength));
  phraseEnergy.push({ start, end: Math.min(energy.length, start + phraseLength), value: values.reduce((sum, item) => sum + item, 0) / Math.max(1, values.length) });
}
const maxPhraseEnergy = Math.max(...phraseEnergy.map((item) => item.value), 0.000001);
for (let index = 0; index < phraseEnergy.length; index += 1) {
  const current = phraseEnergy[index]!;
  const previous = phraseEnergy[index - 1]?.value ?? current.value;
  const ratio = current.value / maxPhraseEnergy;
  const type = ratio < 0.42 ? 'break' : ratio > 0.78 && previous / maxPhraseEnergy < 0.65 ? 'drop' : current.value > previous * 1.08 ? 'build' : 'hold';
  sections.push({ start: Number(((current.start * hopSize) / sampleRate).toFixed(6)), end: Number(((current.end * hopSize) / sampleRate).toFixed(6)), type, confidence: Number(Math.min(1, 0.55 + Math.abs(ratio - 0.5)).toFixed(3)) });
}

const analysis = {
  analysisVersion: 1,
  source: file,
  excerpt: { start: excerptStart, duration: Number(excerptDuration.toFixed(6)) },
  bpm,
  timeSignature: [4, 4],
  beats,
  downbeats,
  accents,
  sections,
  note: 'Automatic analysis is a draft. Human-reviewed accent times are authoritative.',
};
const serialized = `${JSON.stringify(analysis, null, 2)}\n`;
if (output) { await mkdir(dirname(output), { recursive: true }); await writeFile(output, serialized); console.log(`Wrote ${output}`); }
else console.log(serialized);
