import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolveProjectId, loadAudioManifest, loadProjectConfig, listAudioTracks } from './project-io';

const valueAfter = (flag: string): string | undefined => {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
};

const inputVideo = valueAfter('--input');
const outputVideo = valueAfter('--output');
if (!inputVideo || !outputVideo) throw new Error('Usage: npm run mix-audio -- --input silent.mp4 --output final.mp4');

const { project, timeline } = await loadProjectConfig(resolveProjectId());
const audioManifest = await loadAudioManifest(project);
const tracks = listAudioTracks(audioManifest);
if (tracks.length === 0) {
  console.log('No project audio tracks configured; leaving the silent master unchanged.');
  process.exit(0);
}

for (const track of tracks) if (!existsSync(track!.file)) throw new Error(`Audio file not found: ${track!.file}`);

const ffmpegArgs = ['-y', '-i', inputVideo];
for (const track of tracks) ffmpegArgs.push('-i', track!.file);

const filterInputs = tracks.map((track, index) => {
  const eventTime = track.syncEventRef ? timeline.audioEvents?.find((event) => event.id === track.syncEventRef)?.time : undefined;
  if (track.syncEventRef && eventTime === undefined) throw new Error(`Audio track ${track.id ?? index} references unknown event ${track.syncEventRef}.`);
  const delayMs = Math.max(0, Math.round((eventTime ?? track.start ?? 0) * 1000));
  const volume = track.volume ?? 1;
  const gainDb = track.gainDb ?? 0;
  const trimStart = track.trimStart ?? 0;
  const trimDuration = track.duration ? `:duration=${track.duration}` : '';
  const fadeIn = track.fadeIn ? `,afade=t=in:st=0:d=${track.fadeIn}` : '';
  const fadeOut = track.fadeOut ? `,afade=t=out:st=${Math.max(0, (track.duration ?? project.duration) - track.fadeOut)}:d=${track.fadeOut}` : '';
  return `[${index + 1}:a]atrim=start=${trimStart}${trimDuration},asetpts=PTS-STARTPTS${fadeIn}${fadeOut},adelay=${delayMs}|${delayMs},volume=${volume},volume=${gainDb}dB[a${index}]`;
});
const labels = tracks.map((_, index) => `[a${index}]`).join('');
const masterGainDb = audioManifest?.masterGainDb ?? 0;
const filter = `${filterInputs.join(';')};${labels}amix=inputs=${tracks.length}:duration=longest:dropout_transition=0,apad,atrim=duration=${project.duration},volume=${masterGainDb}dB,alimiter=limit=0.89[mix]`;

ffmpegArgs.push(
  '-filter_complex', filter,
  '-map', '0:v:0', '-map', '[mix]',
  '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '2',
  '-t', String(project.duration), '-map_metadata', '0', '-movflags', '+faststart', outputVideo,
);
execFileSync('ffmpeg', ffmpegArgs, { stdio: 'inherit' });
console.log(`Mixed ${tracks.length} audio track(s) into ${outputVideo}.`);
