import { mkdir, readdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { enhanceSoundPrompt, type SoundEffectCategory } from './promptEnhancer.ts';

export const ELEVENLABS_SOUND_GENERATION_ENDPOINT = 'https://api.elevenlabs.io/v1/sound-generation';
export const ELEVENLABS_SOUND_MODEL_ID = 'eleven_text_to_sound_v2';

export type ElevenLabsOutputFormat =
  | 'mp3_22050_32'
  | 'mp3_24000_48'
  | 'mp3_44100_32'
  | 'mp3_44100_64'
  | 'mp3_44100_96'
  | 'mp3_44100_128'
  | 'mp3_44100_192'
  | 'pcm_8000'
  | 'pcm_16000'
  | 'pcm_22050'
  | 'pcm_24000'
  | 'pcm_32000'
  | 'pcm_44100'
  | 'pcm_48000'
  | 'ulaw_8000'
  | 'alaw_8000'
  | 'opus_48000_32'
  | 'opus_48000_64'
  | 'opus_48000_96'
  | 'opus_48000_128'
  | 'opus_48000_192';

export interface GenerateSoundEffectArgs {
  description: string;
  duration?: number | 'auto';
  variations?: number;
  category?: string;
  outputRoot?: string;
  outputFormat?: ElevenLabsOutputFormat;
  promptInfluence?: number;
  timeoutMs?: number;
  loop?: boolean;
}

export interface GeneratedSoundEffectFile {
  variation: number;
  fileName: string;
  filePath: string;
  metadataPath: string;
  category: SoundEffectCategory;
  folder: string;
  prompt: string;
  sizeBytes: number;
  durationSeconds?: number;
  outputFormat: ElevenLabsOutputFormat;
}

export interface GenerateSoundEffectResult {
  category: SoundEffectCategory;
  folder: string;
  fileStem: string;
  outputDir: string;
  prompt: string;
  durationSeconds?: number;
  promptInfluence: number;
  files: GeneratedSoundEffectFile[];
}

export class SoundGenerationError extends Error {
  readonly code: string;
  readonly status?: number;

  constructor(message: string, code: string, status?: number) {
    super(message);
    this.name = 'SoundGenerationError';
    this.code = code;
    this.status = status;
  }
}

const DEFAULT_OUTPUT_FORMAT: ElevenLabsOutputFormat = 'mp3_44100_128';
const DEFAULT_TIMEOUT_MS = 90_000;
const MAX_VARIATIONS = 10;
const VARIATION_DIRECTIONS = [
  'Keep the same brief with the cleanest and most realistic interpretation.',
  'Keep the same brief with a slightly brighter transient and tighter decay.',
  'Keep the same brief with a subtly heavier body and more premium weight.',
  'Keep the same brief with a sleeker high-frequency texture and extra polish.',
  'Keep the same brief with a drier close-recorded feel and minimal ambience.',
] as const;

function repoRoot(): string {
  const here = path.dirname(fileURLToPath(import.meta.url));
  return path.resolve(here, '../../..');
}

function defaultOutputRoot(): string {
  return path.join(repoRoot(), 'assets/sounds/generated');
}

function extensionFor(format: ElevenLabsOutputFormat): string {
  if (format.startsWith('mp3_')) return 'mp3';
  if (format.startsWith('pcm_')) return 'pcm';
  if (format.startsWith('opus_')) return 'opus';
  if (format.startsWith('ulaw_')) return 'ulaw';
  if (format.startsWith('alaw_')) return 'alaw';
  return 'audio';
}

function padIndex(value: number): string {
  return String(value).padStart(2, '0');
}

function normalizeVariations(value: number | undefined): number {
  if (value == null) return 4;
  if (!Number.isFinite(value) || value < 1) throw new SoundGenerationError('Variations must be a positive number.', 'invalid_variations');
  return Math.min(MAX_VARIATIONS, Math.floor(value));
}

function normalizePromptInfluence(value: number): number {
  if (!Number.isFinite(value)) return 0.5;
  return Math.max(0, Math.min(1, value));
}

function normalizeDurationForApi(duration: number | 'auto' | undefined): number | undefined {
  if (duration == null || duration === 'auto') return undefined;
  if (!Number.isFinite(duration) || duration <= 0) {
    throw new SoundGenerationError('Duration must be a positive number of seconds, or auto.', 'invalid_duration');
  }
  if (duration > 30) {
    throw new SoundGenerationError('ElevenLabs sound generation duration must be at most 30 seconds.', 'invalid_duration');
  }
  return Math.max(0.5, duration);
}

async function nextAvailableIndex(dir: string, stem: string, extension: string): Promise<number> {
  let entries: string[] = [];
  try {
    entries = await readdir(dir);
  } catch (err) {
    if ((err as { code?: string }).code !== 'ENOENT') throw err;
  }
  const escapedStem = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const escapedExt = extension.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`^${escapedStem}_(\\d+)\\.${escapedExt}$`);
  let max = 0;
  for (const entry of entries) {
    const match = pattern.exec(entry);
    if (!match?.[1]) continue;
    max = Math.max(max, Number(match[1]) || 0);
  }
  return max + 1;
}

function apiKey(): string {
  const key = process.env.ELEVENLABS_API_KEY?.trim();
  if (!key) {
    throw new SoundGenerationError(
      'Missing ELEVENLABS_API_KEY. Put it in server/.env or export it in your shell before running npm run sound.',
      'missing_api_key',
    );
  }
  return key;
}

function variationPrompt(prompt: string, variation: number, total: number): string {
  if (total <= 1) return prompt;
  const direction = VARIATION_DIRECTIONS[(variation - 1) % VARIATION_DIRECTIONS.length];
  return `${prompt} Variation ${variation} of ${total}: ${direction}`;
}

function extractApiError(raw: string): string {
  const trimmed = raw.trim();
  if (!trimmed) return 'No error body returned.';
  try {
    const parsed = JSON.parse(trimmed) as { detail?: unknown; message?: unknown; error?: unknown };
    const detail = parsed.detail;
    if (typeof detail === 'string') return detail;
    if (detail && typeof detail === 'object') {
      const maybeMessage = (detail as { message?: unknown; status?: unknown }).message ?? (detail as { message?: unknown; status?: unknown }).status;
      if (typeof maybeMessage === 'string') return maybeMessage;
    }
    if (typeof parsed.message === 'string') return parsed.message;
    if (typeof parsed.error === 'string') return parsed.error;
  } catch {
    // Fall through to the raw text below.
  }
  return trimmed.slice(0, 600);
}

function errorForStatus(status: number, body: string): SoundGenerationError {
  const detail = extractApiError(body);
  if (status === 401 || status === 403) {
    return new SoundGenerationError(`ElevenLabs rejected the API key or permissions: ${detail}`, 'invalid_api_key', status);
  }
  if (status === 429) {
    return new SoundGenerationError(`ElevenLabs quota or rate limit reached: ${detail}`, 'quota_or_rate_limit', status);
  }
  if (status >= 500) {
    return new SoundGenerationError(`ElevenLabs server error (${status}): ${detail}`, 'elevenlabs_server_error', status);
  }
  return new SoundGenerationError(`ElevenLabs request failed (${status}): ${detail}`, 'elevenlabs_http_error', status);
}

async function requestSoundEffect(args: {
  key: string;
  prompt: string;
  durationSeconds?: number;
  promptInfluence: number;
  outputFormat: ElevenLabsOutputFormat;
  timeoutMs: number;
  loop?: boolean;
}): Promise<Buffer> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), args.timeoutMs);
  const url = new URL(ELEVENLABS_SOUND_GENERATION_ENDPOINT);
  url.searchParams.set('output_format', args.outputFormat);

  const body: Record<string, unknown> = {
    text: args.prompt,
    model_id: ELEVENLABS_SOUND_MODEL_ID,
    prompt_influence: args.promptInfluence,
  };
  if (args.durationSeconds != null) body.duration_seconds = args.durationSeconds;
  if (args.loop != null) body.loop = args.loop;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'xi-api-key': args.key,
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw errorForStatus(response.status, await response.text());
    }

    const contentType = response.headers.get('content-type') ?? '';
    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.length === 0) {
      throw new SoundGenerationError('ElevenLabs returned an empty audio file.', 'malformed_response', response.status);
    }
    if (!contentType.includes('audio') && !contentType.includes('octet-stream')) {
      const bodyText = buffer.toString('utf8');
      throw new SoundGenerationError(`ElevenLabs returned a non-audio response: ${extractApiError(bodyText)}`, 'malformed_response', response.status);
    }
    return buffer;
  } catch (err) {
    if (err instanceof SoundGenerationError) throw err;
    if ((err as { name?: string }).name === 'AbortError') {
      throw new SoundGenerationError(`ElevenLabs sound generation timed out after ${Math.round(args.timeoutMs / 1000)} seconds.`, 'timeout');
    }
    throw new SoundGenerationError(err instanceof Error ? err.message : String(err), 'network_or_file_error');
  } finally {
    clearTimeout(timeout);
  }
}

export function previewSoundEffectPrompt(args: Omit<GenerateSoundEffectArgs, 'variations'>): GenerateSoundEffectResult {
  const durationSeconds = normalizeDurationForApi(args.duration);
  const enhanced = enhanceSoundPrompt({
    description: args.description,
    category: args.category,
    durationSeconds,
    promptInfluence: args.promptInfluence,
  });
  const promptInfluence = normalizePromptInfluence(enhanced.promptInfluence);
  const outputRoot = args.outputRoot ? path.resolve(args.outputRoot) : defaultOutputRoot();
  const outputDir = path.join(outputRoot, enhanced.folder);
  return {
    category: enhanced.category,
    folder: enhanced.folder,
    fileStem: enhanced.fileStem,
    outputDir,
    prompt: enhanced.prompt,
    durationSeconds,
    promptInfluence,
    files: [],
  };
}

export async function generateSoundEffect(args: GenerateSoundEffectArgs): Promise<GenerateSoundEffectResult> {
  const variations = normalizeVariations(args.variations);
  const durationSeconds = normalizeDurationForApi(args.duration);
  const enhanced = enhanceSoundPrompt({
    description: args.description,
    category: args.category,
    durationSeconds,
    promptInfluence: args.promptInfluence,
  });
  const promptInfluence = normalizePromptInfluence(enhanced.promptInfluence);
  const outputFormat = args.outputFormat ?? DEFAULT_OUTPUT_FORMAT;
  const extension = extensionFor(outputFormat);
  const outputRoot = args.outputRoot ? path.resolve(args.outputRoot) : defaultOutputRoot();
  const outputDir = path.join(outputRoot, enhanced.folder);
  const key = apiKey();
  const timeoutMs = args.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  await mkdir(outputDir, { recursive: true });
  const firstIndex = await nextAvailableIndex(outputDir, enhanced.fileStem, extension);
  const files: GeneratedSoundEffectFile[] = [];

  for (let i = 0; i < variations; i += 1) {
    const variation = i + 1;
    const index = firstIndex + i;
    const fileName = `${enhanced.fileStem}_${padIndex(index)}.${extension}`;
    const metadataName = `${enhanced.fileStem}_${padIndex(index)}.json`;
    const filePath = path.join(outputDir, fileName);
    const metadataPath = path.join(outputDir, metadataName);
    const prompt = variationPrompt(enhanced.prompt, variation, variations);

    const audio = await requestSoundEffect({
      key,
      prompt,
      durationSeconds,
      promptInfluence,
      outputFormat,
      timeoutMs,
      loop: args.loop,
    });

    try {
      await writeFile(filePath, audio, { flag: 'wx' });
      await writeFile(metadataPath, JSON.stringify({
        description: args.description,
        category: enhanced.category,
        folder: enhanced.folder,
        fileName,
        modelId: ELEVENLABS_SOUND_MODEL_ID,
        endpoint: ELEVENLABS_SOUND_GENERATION_ENDPOINT,
        outputFormat,
        durationSeconds: durationSeconds ?? null,
        requestedDuration: args.duration ?? 'auto',
        promptInfluence,
        loop: args.loop ?? false,
        variation,
        variations,
        prompt,
        generatedAt: new Date().toISOString(),
      }, null, 2), { flag: 'wx' });
    } catch (err) {
      throw new SoundGenerationError(
        `Could not save generated sound file: ${err instanceof Error ? err.message : String(err)}`,
        'file_write_error',
      );
    }

    files.push({
      variation,
      fileName,
      filePath,
      metadataPath,
      category: enhanced.category,
      folder: enhanced.folder,
      prompt,
      sizeBytes: audio.length,
      durationSeconds,
      outputFormat,
    });
  }

  return {
    category: enhanced.category,
    folder: enhanced.folder,
    fileStem: enhanced.fileStem,
    outputDir,
    prompt: enhanced.prompt,
    durationSeconds,
    promptInfluence,
    files,
  };
}
