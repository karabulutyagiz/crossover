import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import ffmpegPath from 'ffmpeg-static';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const outDir = __dirname;
const frameDir = path.join(outDir, 'frames');
const W = 1080;
const H = 1920;
const FPS = 30;
const DURATION = 15;
const TOTAL = FPS * DURATION;

const assets = {
  screenHome: path.join(root, 'website/screens/home.png'),
  screenPick: path.join(root, 'website/screens/pick.png'),
  screenGuess: path.join(root, 'website/screens/guess.png'),
  screenCorrect: path.join(root, 'website/screens/correct.png'),
  screenLobby: path.join(root, 'website/screens/lobby.png'),
  bgHome: path.join(root, 'app/assets/bg-home.png'),
  logo: path.join(root, 'app/assets/cof-logo.png'),
  mark: path.join(root, 'app/assets/logo-mark.png'),
  icon: path.join(root, 'app/assets/icon.png'),
};

const voiceLines = [
  'Futbol bilgine güveniyor musun?',
  'Takımını seç, düelloya gir.',
  'Rakibinden önce futbolcuyu bul.',
  'Crossover Football App Store’da.',
  'Hemen indir, oyna!',
];

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function dataUri(file) {
  const ext = path.extname(file).slice(1).replace('jpg', 'jpeg');
  const b = await fs.readFile(file);
  return `data:image/${ext};base64,${b.toString('base64')}`;
}

const img = Object.fromEntries(await Promise.all(Object.entries(assets).map(async ([k, v]) => [k, await dataUri(v)])));

const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
const ease = (x) => 1 - Math.pow(1 - clamp(x), 3);
const easeInOut = (x) => {
  x = clamp(x);
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
};
const pop = (x) => {
  x = clamp(x);
  return x < 0.66 ? 1.08 * ease(x / 0.66) : 1.08 - 0.08 * ease((x - 0.66) / 0.34);
};

function darkHomeBg() {
  return `<image href="${img.bgHome}" x="0" y="0" width="1080" height="1920" preserveAspectRatio="xMidYMid slice"/>
    <rect x="0" y="0" width="1080" height="1920" fill="#070d1c" opacity=".74"/>
    <rect x="0" y="0" width="1080" height="1920" fill="url(#topGlow)"/>`;
}

function screenshotFrame(href, t, scale = 0.84, y = 112) {
  const p = pop(t);
  const sw = 1206 * scale * p;
  const sh = 2622 * scale * p;
  const x = (W - sw) / 2;
  return `<g filter="url(#phoneShadow)">
    <rect x="${x - 16}" y="${y - 18}" width="${sw + 32}" height="${sh + 36}" rx="72" fill="#050914" stroke="#293657" stroke-width="5"/>
    <clipPath id="clipShot"><rect x="${x}" y="${y}" width="${sw}" height="${Math.min(sh, 1688)}" rx="58"/></clipPath>
    <image href="${href}" x="${x}" y="${y}" width="${sw}" height="${sh}" preserveAspectRatio="xMidYMin slice" clip-path="url(#clipShot)"/>
  </g>`;
}

function headline(lines, y, size = 66, color = '#fff') {
  return lines.map((line, i) => `<text x="540" y="${y + i * size * 1.12}" text-anchor="middle" font-size="${size}" font-weight="1000" fill="${color}" letter-spacing="-.9">${esc(line)}</text>`).join('');
}

function caption(text, y) {
  return `<rect x="76" y="${y - 78}" width="928" height="132" rx="36" fill="rgba(7,13,28,.78)" stroke="#273656" stroke-width="3"/>
    <text x="540" y="${y + 4}" text-anchor="middle" font-size="44" font-weight="900" fill="#fff">${esc(text)}</text>`;
}

function phoneMock(t) {
  const px = 136;
  const py = 372;
  const pw = 390;
  const ph = 812;
  const left = -250 + easeInOut(t) * 410;
  const right = 1080 - easeInOut(t) * 420;
  const impact = t > 0.64 && t < 0.78 ? 1 + Math.sin((t - 0.64) / 0.14 * Math.PI) * 0.08 : 1;
  return `<g filter="url(#phoneShadow)">
    <rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="64" fill="#050914" stroke="#dbe6ff" stroke-width="8"/>
    <rect x="${px + 22}" y="${py + 54}" width="${pw - 44}" height="${ph - 108}" rx="38" fill="#080e1f"/>
    <clipPath id="phoneScreen"><rect x="${px + 22}" y="${py + 54}" width="${pw - 44}" height="${ph - 108}" rx="38"/></clipPath>
    <g clip-path="url(#phoneScreen)">
      <image href="${img.bgHome}" x="${px + 22}" y="${py + 54}" width="${pw - 44}" height="${ph - 108}" preserveAspectRatio="xMidYMid slice" opacity=".35"/>
      <rect x="${px + 22}" y="${py + 54}" width="${pw - 44}" height="${ph - 108}" fill="#060b18" opacity=".72"/>
      <g transform="translate(${left} ${py + 260}) scale(${impact})">
        <clipPath id="logoLeft"><rect x="0" y="0" width="350" height="330"/></clipPath>
        <image href="${img.logo}" x="0" y="0" width="690" height="552" preserveAspectRatio="xMidYMid meet" clip-path="url(#logoLeft)"/>
      </g>
      <g transform="translate(${right} ${py + 260}) scale(${impact})">
        <clipPath id="logoRight"><rect x="350" y="0" width="350" height="330"/></clipPath>
        <image href="${img.logo}" x="0" y="0" width="690" height="552" preserveAspectRatio="xMidYMid meet" clip-path="url(#logoRight)"/>
      </g>
      <text x="${px + pw / 2}" y="${py + 620}" text-anchor="middle" font-size="38" font-weight="1000" fill="#37e68d">CROSSOVER</text>
    </g>
    <rect x="${px + 132}" y="${py + 24}" width="126" height="22" rx="11" fill="#02040a"/>
  </g>
  <g>
    <text x="735" y="620" text-anchor="middle" font-size="70" font-weight="1000" fill="#fff">Crossover</text>
    <text x="735" y="698" text-anchor="middle" font-size="70" font-weight="1000" fill="#37e68d">Football</text>
    <text x="735" y="800" text-anchor="middle" font-size="35" font-weight="800" fill="#aeb8cf">Futbol zekanı konuştur</text>
  </g>`;
}

function finalCta(t) {
  const s = pop(t);
  return `<g transform="translate(540 330) scale(${s})">
      <image href="${img.icon}" x="-170" y="-170" width="340" height="340"/>
    </g>
    ${headline(['ŞİMDİ', 'APP STORE’DA'], 720, 86)}
    <rect x="160" y="1016" width="760" height="142" rx="48" fill="#37e68d"/>
    <text x="540" y="1108" text-anchor="middle" font-size="54" font-weight="1000" fill="#061021">HEMEN İNDİR, OYNA!</text>
    <text x="540" y="1285" text-anchor="middle" font-size="38" font-weight="900" fill="#f7c915">Crossover Football</text>`;
}

function svgFrame(i) {
  const time = i / FPS;
  let body = darkHomeBg();

  if (time < 2.7) {
    body += screenshotFrame(img.screenHome, time / 0.7, 0.72, 110);
    body += caption('Futbol bilgine güveniyor musun?', 1660);
  } else if (time < 5.6) {
    body += screenshotFrame(img.screenPick, (time - 2.7) / 0.7, 0.72, 94);
    body += caption('Takımını seç, düelloya gir', 1660);
  } else if (time < 8.6) {
    body += screenshotFrame(img.screenGuess, (time - 5.6) / 0.7, 0.72, 94);
    body += caption('Rakibinden önce doğru futbolcuyu bul', 1660);
  } else if (time < 12.0) {
    body += phoneMock((time - 8.6) / 1.35);
  } else {
    body += finalCta((time - 12) / 0.7);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="topGlow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#101a38" stop-opacity=".20"/><stop offset="1" stop-color="#020611" stop-opacity=".65"/></linearGradient>
      <filter id="phoneShadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="26" stdDeviation="24" flood-color="#000" flood-opacity=".55"/></filter>
      <style>text{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif}</style>
    </defs>
    ${body}
  </svg>`;
}

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { stdio: 'inherit', ...opts });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${args.join(' ')}`);
}

async function makeVoice() {
  const out = path.join(outDir, 'voiceover.m4a');
  const edgeMp3 = path.join(outDir, 'voiceover-edge.mp3');
  const text = voiceLines.join(' ');
  const edge = path.join(outDir, '.venv/bin/edge-tts');
  if (existsSync(edge)) {
    run(edge, ['--voice', 'tr-TR-AhmetNeural', '--rate', '+14%', '--text', text, '--write-media', edgeMp3]);
    run(ffmpegPath, ['-y', '-i', edgeMp3, '-af', 'aresample=44100,volume=1.1', '-c:a', 'aac', '-b:a', '160k', out]);
    await fs.rm(edgeMp3, { force: true });
    return out;
  }
  const aiff = path.join(outDir, 'voiceover.aiff');
  run('say', ['-v', 'Yelda', '-r', '188', text, '-o', aiff]);
  run(ffmpegPath, ['-y', '-i', aiff, '-af', 'aresample=44100,volume=1.25', '-c:a', 'aac', '-b:a', '160k', out]);
  await fs.rm(aiff, { force: true });
  return out;
}

async function main() {
  await fs.rm(frameDir, { recursive: true, force: true });
  await fs.mkdir(frameDir, { recursive: true });
  for (let i = 0; i < TOTAL; i++) {
    await sharp(Buffer.from(svgFrame(i))).png().toFile(path.join(frameDir, `frame-${String(i).padStart(4, '0')}.png`));
    if (i % 60 === 0) process.stdout.write(`frame ${i}/${TOTAL}\n`);
  }

  const voice = await makeVoice();
  const musicWav = path.join(outDir, 'bed.wav');
  const videoNoAudio = path.join(outDir, 'crossover-social-ad-15s-video.mp4');
  const finalVideo = path.join(outDir, 'crossover-social-ad-15s.mp4');

  run(ffmpegPath, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=98:duration=15', '-f', 'lavfi', '-i', 'sine=frequency=196:duration=15', '-filter_complex', '[0:a]volume=0.035[a0];[1:a]volume=0.018[a1];[a0][a1]amix=inputs=2,afade=t=in:st=0:duration=0.25,afade=t=out:st=14.35:duration=0.65', musicWav]);
  run(ffmpegPath, ['-y', '-framerate', String(FPS), '-i', path.join(frameDir, 'frame-%04d.png'), '-t', String(DURATION), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1', '-movflags', '+faststart', '-crf', '18', videoNoAudio]);
  run(ffmpegPath, ['-y', '-i', videoNoAudio, '-i', voice, '-i', musicWav, '-filter_complex', '[1:a]adelay=150|150,apad,atrim=0:15,volume=1.45[v];[2:a]volume=0.18[m];[v][m]amix=inputs=2:duration=first:dropout_transition=0[a]', '-map', '0:v:0', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', finalVideo]);

  await fs.rm(frameDir, { recursive: true, force: true });
  await fs.rm(videoNoAudio, { force: true });
  await fs.rm(musicWav, { force: true });
  console.log(`Wrote ${finalVideo}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
