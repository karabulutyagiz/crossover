import 'dotenv/config';
import { generateSoundEffect, previewSoundEffectPrompt, SoundGenerationError, type ElevenLabsOutputFormat } from '../sounds/elevenLabsSoundEffects.ts';

interface CliOptions {
  description: string;
  category?: string;
  duration?: number | 'auto';
  variations?: number;
  outputFormat?: ElevenLabsOutputFormat;
  outputRoot?: string;
  promptInfluence?: number;
  timeoutMs?: number;
  loop?: boolean;
  dryRun: boolean;
}

const OUTPUT_FORMATS = new Set<ElevenLabsOutputFormat>([
  'mp3_22050_32',
  'mp3_24000_48',
  'mp3_44100_32',
  'mp3_44100_64',
  'mp3_44100_96',
  'mp3_44100_128',
  'mp3_44100_192',
  'pcm_8000',
  'pcm_16000',
  'pcm_22050',
  'pcm_24000',
  'pcm_32000',
  'pcm_44100',
  'pcm_48000',
  'ulaw_8000',
  'alaw_8000',
  'opus_48000_32',
  'opus_48000_64',
  'opus_48000_96',
  'opus_48000_128',
  'opus_48000_192',
]);

function usage(): string {
  return [
    'Usage:',
    '  npm run sound -- [options] "sound description"',
    '',
    'Options:',
    '  --category <name>          intro | football | ui | reward | purchase | matchmaking | victory | defeat | other',
    '  --duration <seconds|auto>  ElevenLabs API duration. auto omits duration_seconds. Minimum sent value is 0.5 seconds.',
    '  --variations <number>      Number of variations to generate. Default: 4. Max: 10.',
    '  --output-format <format>   Default: mp3_44100_128.',
    '  --out <path>               Output root. Default: ../assets/sounds/generated from the repo root.',
    '  --prompt-influence <0..1>  Higher follows prompt more closely.',
    '  --timeout <seconds>        Request timeout per variation. Default: 90.',
    '  --loop                     Ask ElevenLabs for a loopable result.',
    '  --dry-run                  Print enhanced prompt without calling ElevenLabs.',
    '  --help                    Show this message.',
    '',
    'Examples:',
    '  npm run sound -- --category football --duration 0.7 --variations 4 "football whistle"',
    '  npm run sound -- --category intro --duration 1.4 "premium electric logo impact"',
  ].join('\n');
}

function takeValue(argv: string[], index: number, flag: string): { value: string; nextIndex: number } {
  const current = argv[index] ?? '';
  const equals = current.indexOf('=');
  if (equals >= 0) return { value: current.slice(equals + 1), nextIndex: index + 1 };
  const value = argv[index + 1];
  if (!value || value.startsWith('--')) throw new Error(`${flag} requires a value.`);
  return { value, nextIndex: index + 2 };
}

function numberOption(value: string, flag: string): number {
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${flag} must be a number.`);
  return number;
}

function parseDuration(value: string): number | 'auto' {
  if (value.toLowerCase() === 'auto') return 'auto';
  return numberOption(value, '--duration');
}

function parseOutputFormat(value: string): ElevenLabsOutputFormat {
  if (!OUTPUT_FORMATS.has(value as ElevenLabsOutputFormat)) {
    throw new Error(`Unsupported output format: ${value}`);
  }
  return value as ElevenLabsOutputFormat;
}

function parseArgs(argv: string[]): CliOptions {
  const descriptionParts: string[] = [];
  const opts: CliOptions = { description: '', dryRun: false };

  for (let i = 0; i < argv.length;) {
    const arg = argv[i] ?? '';
    if (!arg.startsWith('--')) {
      descriptionParts.push(arg);
      i += 1;
      continue;
    }

    if (arg === '--help') {
      console.log(usage());
      process.exit(0);
    }
    if (arg === '--dry-run') {
      opts.dryRun = true;
      i += 1;
      continue;
    }
    if (arg === '--loop') {
      opts.loop = true;
      i += 1;
      continue;
    }

    if (arg.startsWith('--category')) {
      const { value, nextIndex } = takeValue(argv, i, '--category');
      opts.category = value;
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--duration')) {
      const { value, nextIndex } = takeValue(argv, i, '--duration');
      opts.duration = parseDuration(value);
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--variations')) {
      const { value, nextIndex } = takeValue(argv, i, '--variations');
      opts.variations = numberOption(value, '--variations');
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--output-format')) {
      const { value, nextIndex } = takeValue(argv, i, '--output-format');
      opts.outputFormat = parseOutputFormat(value);
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--out')) {
      const { value, nextIndex } = takeValue(argv, i, '--out');
      opts.outputRoot = value;
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--prompt-influence')) {
      const { value, nextIndex } = takeValue(argv, i, '--prompt-influence');
      opts.promptInfluence = numberOption(value, '--prompt-influence');
      i = nextIndex;
      continue;
    }
    if (arg.startsWith('--timeout')) {
      const { value, nextIndex } = takeValue(argv, i, '--timeout');
      opts.timeoutMs = Math.round(numberOption(value, '--timeout') * 1000);
      i = nextIndex;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  opts.description = descriptionParts.join(' ').trim();
  if (!opts.description) throw new Error('Sound description is required.');
  return opts;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  if (opts.dryRun) {
    const preview = previewSoundEffectPrompt(opts);
    console.log('Enhanced sound prompt preview');
    console.log(`Category: ${preview.category}`);
    console.log(`Folder: ${preview.folder}`);
    console.log(`File stem: ${preview.fileStem}`);
    console.log(`Output dir: ${preview.outputDir}`);
    console.log(`Duration: ${preview.durationSeconds == null ? 'auto' : `${preview.durationSeconds}s`}`);
    console.log(`Prompt influence: ${preview.promptInfluence}`);
    console.log('Prompt:');
    console.log(preview.prompt);
    return;
  }

  const result = await generateSoundEffect(opts);
  console.log(`Generated ${result.files.length} sound variation(s).`);
  console.log(`Category: ${result.category}`);
  console.log(`Output dir: ${result.outputDir}`);
  console.log(`Duration: ${result.durationSeconds == null ? 'auto' : `${result.durationSeconds}s`}`);
  console.log(`Prompt influence: ${result.promptInfluence}`);
  for (const file of result.files) {
    console.log(`${file.variation}. ${file.fileName} (${file.sizeBytes} bytes)`);
    console.log(`   Audio: ${file.filePath}`);
    console.log(`   Metadata: ${file.metadataPath}`);
  }
}

main().catch((err) => {
  if (err instanceof SoundGenerationError) {
    console.error(`Sound generation failed [${err.code}${err.status ? `:${err.status}` : ''}]: ${err.message}`);
    process.exit(1);
  }
  console.error(`Sound generation failed: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
