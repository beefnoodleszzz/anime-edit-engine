import { createHash } from 'node:crypto';
import { copyFile, link, mkdir, readdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { ProjectLoader } from '../engine/core/ProjectLoader';
import { createRenderContext } from '../engine/core/RenderContext';
import { PreparedSourcePlanner, type PreparedSourceManifest } from '../engine/source/PreparedSource';
import { planDecodeJobs } from '../engine/source/DecodePlan';
import { psnrBetweenPngs } from '../engine/core/PngPixels';
import { blendPngBuffers } from '../engine/source/TemporalBlend';
import { resolveProjectId, loadProjectConfig } from './project-io';

/**
 * Color precision: raw sources here are already yuv420p (verified via ffprobe — see
 * docs/color-fidelity.md), so encoding the decoded PNG sequence back to yuv420p is a second
 * 4:2:0 subsampling pass, not a first one; the chroma detail that survives it is bounded by
 * what the original encode already kept. H.264 4:4:4/libx264rgb, FFV1 and ProRes 4444 would all
 * avoid that second pass, but none of them decode in a plain Chrome `<video>` element, which
 * this pipeline requires — 8-bit 4:2:0 H.264 is the one broadly Chrome-decodable choice. Given
 * that constraint, CRF 0 (lossless DCT, no additional compression loss) would maximize fidelity
 * margin, but for native-4K sources the resulting per-shot file (200-500MB, GOP=1) is large enough
 * to overwhelm the render pipeline's Chrome capture / Node heap (observed: JS heap OOM around
 * frame 600/960 rendering a 9-shot 4K project). CRF 14 stays far above the color-fidelity floor
 * below (~50dB measured vs. a 20dB floor, on both 1080p and 4K sources) while cutting file size
 * roughly 5x, and every shot's first frame is still round-tripped through the encoded output and
 * compared by PSNR against the lossless source PNG, recorded in `<shot>.color-fidelity.json`,
 * instead of assuming yuv420p is "good enough".
 */
const COLOR_FIDELITY_MIN_PSNR_DB = 20;
const INTERMEDIATE_CRF = 14;

const { project, timeline } = await loadProjectConfig(resolveProjectId());
const config = ProjectLoader.validate({ project, timeline });
const context = createRenderContext(config.project, 'master');
const root = `cache/prepared/${config.project.id}`;
const planner = new PreparedSourcePlanner();
const force = process.argv.includes('--force');
const fingerprint = async (file: string): Promise<string> => createHash('sha256').update(await readFile(file)).digest('hex');
const probe = (file: string): { width: number; height: number; fps: string; frames: number; duration: number } => {
  const payload = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-count_frames', '-show_entries', 'stream=width,height,r_frame_rate,avg_frame_rate,nb_read_frames,duration', '-of', 'json', file], { encoding: 'utf8' })) as { streams: Array<{ width: number; height: number; r_frame_rate: string; avg_frame_rate: string; nb_read_frames: string; duration: string }> };
  const stream = payload.streams[0]; if (!stream) throw new Error(`No video stream in ${file}`);
  return { width: stream.width, height: stream.height, fps: stream.r_frame_rate, frames: Number(stream.nb_read_frames), duration: Number(stream.duration) };
};
const assertPrepared = (file: string, manifest: PreparedSourceManifest): void => {
  const actual = probe(file);
  if (actual.width !== manifest.width || actual.height !== manifest.height || actual.fps !== `${manifest.fps}/1` || actual.frames !== manifest.frameCount || Math.abs(actual.duration - manifest.duration) > 1 / manifest.fps) throw new Error(`Prepared source validation failed for ${manifest.shotId}: ${JSON.stringify(actual)}`);
};

/** Reads the real decode-order presentation timestamp of every frame straight from the source container. */
const probeFramePts = (file: string): readonly number[] => {
  const payload = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'frame=best_effort_timestamp_time', '-of', 'json', file], { encoding: 'utf8' })) as { frames: Array<{ best_effort_timestamp_time?: string }> };
  if (payload.frames.length === 0) throw new Error(`ffprobe returned no frames for ${file}`);
  const pts = payload.frames.map((frame) => {
    const value = Number(frame.best_effort_timestamp_time);
    if (!Number.isFinite(value)) throw new Error(`ffprobe frame is missing best_effort_timestamp_time in ${file}`);
    return value;
  });
  for (let index = 1; index < pts.length; index += 1) {
    if (pts[index]! < pts[index - 1]!) throw new Error(`Non-monotonic PTS in ${file}: frame ${index} (${pts[index]}) precedes frame ${index - 1} (${pts[index - 1]}).`);
  }
  return pts;
};

interface SourceVideoMetadata {
  codecName?: string; profile?: string; pixelFormat?: string; colorSpace?: string; colorTransfer?: string;
  colorPrimaries?: string; colorRange?: string; bitsPerRawSample?: number; width: number; height: number;
  rFrameRate: string; avgFrameRate: string;
}
/** One real ffprobe pass per unique physical source file — never hardcoded, never guessed. */
const probeSourceVideoMetadata = (file: string): SourceVideoMetadata => {
  const payload = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=codec_name,profile,pix_fmt,color_space,color_transfer,color_primaries,color_range,bits_per_raw_sample,width,height,r_frame_rate,avg_frame_rate', '-of', 'json', file], { encoding: 'utf8' })) as { streams: Array<Record<string, string | number | undefined>> };
  const stream = payload.streams[0]; if (!stream) throw new Error(`No video stream in ${file}`);
  const string = (key: string): string | undefined => (typeof stream[key] === 'string' && stream[key] !== 'unknown' && stream[key] !== 'N/A' ? stream[key] as string : undefined);
  const optional = <K extends string, V>(key: K, value: V | undefined): { [P in K]?: V } => (value === undefined ? {} : ({ [key]: value } as { [P in K]?: V }));
  return {
    ...optional('codecName', string('codec_name')), ...optional('profile', string('profile')), ...optional('pixelFormat', string('pix_fmt')),
    ...optional('colorSpace', string('color_space')), ...optional('colorTransfer', string('color_transfer')), ...optional('colorPrimaries', string('color_primaries')), ...optional('colorRange', string('color_range')),
    ...optional('bitsPerRawSample', stream.bits_per_raw_sample !== undefined ? Number(stream.bits_per_raw_sample) : undefined),
    width: Number(stream.width), height: Number(stream.height), rFrameRate: String(stream.r_frame_rate), avgFrameRate: String(stream.avg_frame_rate),
  };
};

const linkOrCopy = async (source: string, destination: string): Promise<void> => {
  try { await link(source, destination); } catch { await copyFile(source, destination); }
};

/**
 * One decode pass per physical file (keyed by content fingerprint, not sourceId) creates a
 * lossless, PTS-indexed source of truth. No seek, GOP, concat demuxer, or PTS rewrite
 * participates in selecting prepared frames.
 */
const decodeOnce = async (sourceFile: string, sourceFingerprint: string): Promise<{ directory: string; framePts: readonly number[] }> => {
  const directory = join(root, '_decoded', sourceFingerprint);
  const framesJson = join(directory, 'frames.json');
  if (!force && existsSync(framesJson) && existsSync(join(directory, 'frame_000001.png'))) {
    const framePts = JSON.parse(await readFile(framesJson, 'utf8')) as number[];
    return { directory, framePts };
  }
  const staging = `${directory}.tmp`; await rm(staging, { recursive: true, force: true }); await mkdir(staging, { recursive: true });
  execFileSync('ffmpeg', ['-y', '-i', sourceFile, '-map', '0:v:0', '-vsync', '0', join(staging, 'frame_%06d.png')], { stdio: 'inherit' });
  const framePts = probeFramePts(sourceFile);
  const decodedCount = (await readdir(staging)).filter((file) => /^frame_\d{6}\.png$/.test(file)).length;
  if (framePts.length !== decodedCount) throw new Error(`ffprobe frame count (${framePts.length}) does not match decoded PNG count (${decodedCount}) for ${sourceFile}.`);
  await writeFile(join(staging, 'frames.json'), JSON.stringify(framePts));
  await rm(directory, { recursive: true, force: true }); await rename(staging, directory);
  return { directory, framePts };
};

await mkdir(root, { recursive: true });
const sourceFingerprints = new Map(await Promise.all(config.project.sources.map(async (source) => [source.id, await fingerprint(source.file)] as const)));
const decodeJobs = planDecodeJobs(config.project.sources.map((source) => source.id), (sourceId) => sourceFingerprints.get(sourceId)!);
console.log(`${config.project.sources.length} sources map to ${decodeJobs.size} unique physical file(s) to decode.`);
const decodedByFingerprint = new Map<string, { directory: string; framePts: readonly number[]; metadata: SourceVideoMetadata }>();
for (const [sourceFingerprint, sourceIds] of decodeJobs) {
  const sourceFile = config.project.sources.find((candidate) => candidate.id === sourceIds[0])!.file;
  const decoded = await decodeOnce(sourceFile, sourceFingerprint);
  decodedByFingerprint.set(sourceFingerprint, { ...decoded, metadata: probeSourceVideoMetadata(sourceFile) });
}

for (const shot of config.timeline.shots) {
  const source = config.project.sources.find((candidate) => candidate.id === shot.source)!;
  const sourceFingerprint = sourceFingerprints.get(source.id)!;
  const { directory: decoded, framePts, metadata: sourceMetadata } = decodedByFingerprint.get(sourceFingerprint)!;
  if (sourceMetadata.pixelFormat && sourceMetadata.pixelFormat !== 'yuv420p') console.warn(`${shot.id}: source pixel format is ${sourceMetadata.pixelFormat}, not yuv420p — the prepared intermediate re-encodes to yuv420p for Chrome <video> decodability, which is an additional chroma-subsampling pass for this source. Real PSNR is still measured and enforced below.`);
  const manifest = planner.planShot(config.project, config.timeline, context, shot.id, sourceFingerprint, framePts);
  const directory = join(root, shot.id); const video = join(directory, `${shot.id}.mp4`); const manifestPath = join(directory, `${shot.id}.manifest.json`); const colorFidelityPath = join(directory, `${shot.id}.color-fidelity.json`);
  let valid = false;
  if (!force && existsSync(video) && existsSync(manifestPath) && existsSync(colorFidelityPath)) {
    try { planner.assertValid(JSON.parse(await readFile(manifestPath, 'utf8')), config.project, config.timeline, context, sourceFingerprint, framePts); assertPrepared(video, manifest); valid = true; } catch { valid = false; }
  }
  if (valid) continue;
  const staging = `${directory}.tmp`; const frames = join(staging, 'frames'); await rm(staging, { recursive: true, force: true }); await mkdir(frames, { recursive: true });
  for (const frame of manifest.sourceFrameMap) {
    const destination = join(frames, `frame_${String(frame.outputFrame).padStart(6, '0')}.png`);
    const frameA = frame.sourceFrameA ?? frame.sourceFrame;
    const frameB = frame.sourceFrameB ?? frame.sourceFrame;
    const sourceA = join(decoded, `frame_${String(frameA + 1).padStart(6, '0')}.png`);
    if (manifest.interpolationMode === 'blend' && frameB !== frameA && (frame.blendWeight ?? 0) > 0) {
      const sourceB = join(decoded, `frame_${String(frameB + 1).padStart(6, '0')}.png`);
      await writeFile(destination, blendPngBuffers(await readFile(sourceA), await readFile(sourceB), frame.blendWeight ?? 0, frame.blendStrength ?? manifest.maxInterpolationWeight));
    } else await linkOrCopy(sourceA, destination);
  }
  const stagedVideo = join(staging, `${shot.id}.mp4`);
  execFileSync('ffmpeg', ['-y', '-framerate', String(context.fps), '-start_number', '0', '-i', join(frames, 'frame_%06d.png'), '-frames:v', String(manifest.frameCount), '-c:v', 'libx264', '-crf', String(INTERMEDIATE_CRF), '-preset', 'medium', '-g', '1', '-pix_fmt', 'yuv420p', stagedVideo], { stdio: 'inherit' });
  assertPrepared(stagedVideo, manifest);
  const roundtripFrame = join(staging, 'roundtrip_000000.png');
  execFileSync('ffmpeg', ['-y', '-i', stagedVideo, '-vframes', '1', roundtripFrame], { stdio: 'ignore' });
  const firstFramePsnrDb = psnrBetweenPngs(await readFile(join(frames, 'frame_000000.png')), await readFile(roundtripFrame));
  console.log(`${shot.id}: yuv420p round-trip PSNR (frame 0) = ${firstFramePsnrDb.toFixed(2)} dB`);
  if (firstFramePsnrDb < COLOR_FIDELITY_MIN_PSNR_DB) throw new Error(`${shot.id}: color fidelity check failed — round-trip PSNR ${firstFramePsnrDb.toFixed(2)} dB is below the ${COLOR_FIDELITY_MIN_PSNR_DB} dB floor (possible frame misalignment, not just chroma subsampling).`);
  await writeFile(join(staging, `${shot.id}.manifest.json`), `${JSON.stringify(manifest, null, 2)}\n`);
  await writeFile(join(staging, `${shot.id}.color-fidelity.json`), `${JSON.stringify({
    shotId: shot.id, sourceFingerprint,
    sourceCodec: sourceMetadata.codecName, sourceProfile: sourceMetadata.profile, sourcePixFmt: sourceMetadata.pixelFormat,
    sourceColorSpace: sourceMetadata.colorSpace, sourceColorTransfer: sourceMetadata.colorTransfer, sourceColorPrimaries: sourceMetadata.colorPrimaries, sourceColorRange: sourceMetadata.colorRange,
    intermediateCodec: 'h264', intermediatePixFmt: 'yuv420p', crf: INTERMEDIATE_CRF, gop: 1,
    firstFramePsnrDb, minAcceptablePsnrDb: COLOR_FIDELITY_MIN_PSNR_DB, passed: firstFramePsnrDb >= COLOR_FIDELITY_MIN_PSNR_DB,
  }, null, 2)}\n`);
  // Only the encoded shot, its manifest, and the fidelity report are kept; the staged PNG
  // sequence is disposable once the encode is validated (raw decoded PNGs remain cached under
  // _decoded/<fingerprint>).
  await rm(frames, { recursive: true, force: true });
  await rm(roundtripFrame, { force: true });
  await rm(directory, { recursive: true, force: true }); await rename(staging, directory);
}
console.log(`Prepared ${config.timeline.shots.length} frame-accurate CFR shot sources in ${root}`);
