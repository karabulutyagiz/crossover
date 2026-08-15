import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import ffmpegPath from 'ffmpeg-static';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const frameDir = path.join(__dirname, 'frames-en');
const W = 1080;
const H = 1920;
const FPS = 30;
const DURATION = 15;
const TOTAL = FPS * DURATION;

const assets = {
  bgHome: path.join(root, 'app/assets/bg-home.png'),
  logo: path.join(root, 'app/assets/cof-logo.png'),
  icon: path.join(root, 'app/assets/icon.png'),
};

const voiceLines = [
  'Do you trust your football knowledge?',
  'Pick your team. Enter the duel.',
  'Find the player before your opponent.',
  'Crossover Football is on the App Store.',
  'Download now and play!',
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

function bg() {
  return `<image href="${img.bgHome}" x="0" y="0" width="1080" height="1920" preserveAspectRatio="xMidYMid slice"/>
    <rect x="0" y="0" width="1080" height="1920" fill="#070d1c" opacity=".74"/>
    <rect x="0" y="0" width="1080" height="1920" fill="url(#topGlow)"/>`;
}

function phoneShell(t, y = 110) {
  const p = pop(t);
  const sw = 868 * p;
  const sh = 1688 * p;
  const x = (W - sw) / 2;
  return { x, y, sw, sh, p };
}

function screenWrap(t, content, y = 110) {
  const { x, sw, sh } = phoneShell(t, y);
  return `<g filter="url(#phoneShadow)">
    <rect x="${x - 16}" y="${y - 18}" width="${sw + 32}" height="${sh + 36}" rx="72" fill="#050914" stroke="#293657" stroke-width="5"/>
    <clipPath id="mockClip"><rect x="0" y="0" width="868" height="1688" rx="58"/></clipPath>
    <g clip-path="url(#mockClip)" transform="translate(${x} ${y}) scale(${sw / 868})">
      <rect x="0" y="0" width="868" height="1688" fill="#070d1c"/>
      <rect x="0" y="0" width="868" height="1688" fill="url(#screenGlow)"/>
      ${content}
    </g>
  </g>`;
}

function homeScreen(t) {
  return screenWrap(t, `<circle cx="434" cy="360" r="40" fill="#37e68d"/>
    <text x="434" y="515" text-anchor="middle" font-size="92" font-weight="1000" fill="#37e68d" letter-spacing="4">CROSSOVER</text>
    <text x="434" y="592" text-anchor="middle" font-size="30" font-weight="500" fill="#a8b1c8">First to name the shared player wins</text>
    <rect x="55" y="700" width="758" height="106" rx="26" fill="#141c31" stroke="#283553" stroke-width="3"/>
    <text x="88" y="770" font-size="38" fill="#fff">Player</text>
    <rect x="55" y="840" width="360" height="92" rx="24" fill="#151e35" stroke="#2d3959" stroke-width="3"/>
    <text x="126" y="898" font-size="32" font-weight="900" fill="#fff">All teams</text>
    <rect x="453" y="840" width="360" height="92" rx="24" fill="#151e35" stroke="#2d3959" stroke-width="3"/>
    <text x="520" y="898" font-size="32" font-weight="900" fill="#fff">Bot: Medium</text>
    <rect x="55" y="956" width="758" height="116" rx="30" fill="#37e68d"/>
    <text x="434" y="1032" text-anchor="middle" font-size="42" font-weight="1000" fill="#071123">Create Room</text>
    <rect x="55" y="1110" width="758" height="116" rx="30" fill="#f7c915"/>
    <text x="434" y="1186" text-anchor="middle" font-size="42" font-weight="1000" fill="#071123">Play vs Bot</text>`);
}

function pickScreen(t) {
  const rows = ['Real Madrid', 'Real Sociedad', 'Real Betis', 'Real Zaragoza', 'Villarreal CF'];
  const list = rows.map((name, i) => `<rect x="55" y="${380 + i * 132}" width="758" height="98" rx="24" fill="#151e35"/>
    <circle cx="115" cy="${430 + i * 132}" r="34" fill="#fff"/>
    <text x="170" y="${445 + i * 132}" font-size="34" fill="#fff">${esc(name)}</text>
    <text x="770" y="${445 + i * 132}" text-anchor="middle" font-size="48" fill="#8d98b2">›</text>`).join('');
  return screenWrap(t, `<text x="434" y="155" text-anchor="middle" font-size="50" font-weight="1000" fill="#fff">Choose a team</text>
    <rect x="55" y="230" width="758" height="98" rx="24" fill="#151e35" stroke="#2d3959" stroke-width="3"/>
    <text x="130" y="292" font-size="38" fill="#9aa4bd">Search team</text>
    ${list}` , 94);
}

function guessScreen(t) {
  return screenWrap(t, `<g transform="translate(0 390)">
    <rect x="55" y="0" width="330" height="246" rx="28" fill="#151e35"/>
    <circle cx="220" cy="78" r="54" fill="#fff"/>
    <text x="220" y="167" text-anchor="middle" font-size="36" font-weight="900" fill="#fff">Galatasaray</text>
    <rect x="483" y="20" width="330" height="206" rx="28" fill="#151e35"/>
    <circle cx="648" cy="88" r="54" fill="#fff"/>
    <text x="648" y="177" text-anchor="middle" font-size="36" font-weight="900" fill="#fff">Inter Milan</text>
    <text x="434" y="145" text-anchor="middle" font-size="54" fill="#f7c915">+</text>
    <text x="434" y="345" text-anchor="middle" font-size="58" font-weight="1000" fill="#f7c915">9s</text>
    <text x="434" y="425" text-anchor="middle" font-size="52" font-weight="1000" fill="#fff">Name the shared player!</text>
    <rect x="55" y="482" width="758" height="106" rx="24" fill="#151e35" stroke="#2d3959" stroke-width="3"/>
    <text x="88" y="552" font-size="38" fill="#9aa4bd">Player name</text>
    <rect x="55" y="624" width="758" height="116" rx="30" fill="#1f7551"/>
    <text x="434" y="700" text-anchor="middle" font-size="44" font-weight="1000" fill="#071123">Send</text>
  </g>`, 94);
}

function headline(lines, y, size = 78, color = '#fff') {
  return lines.map((line, i) => `<text x="540" y="${y + i * size * 1.12}" text-anchor="middle" font-size="${size}" font-weight="1000" fill="${color}" letter-spacing="-.9">${esc(line)}</text>`).join('');
}

function phoneMock(t) {
  const px = 136;
  const py = 372;
  const pw = 390;
  const ph = 812;
  const logoW = 250;
  const logoH = 200;
  const logoX = px + pw / 2 - logoW / 2;
  const logoY = py + 306;
  const left = -260 * (1 - easeInOut(t));
  const right = 260 * (1 - easeInOut(t));
  const impact = t > 0.64 && t < 0.78 ? 1 + Math.sin((t - 0.64) / 0.14 * Math.PI) * 0.08 : 1;
  return `<g filter="url(#phoneShadow)">
    <rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="64" fill="#050914" stroke="#dbe6ff" stroke-width="8"/>
    <rect x="${px + 22}" y="${py + 54}" width="${pw - 44}" height="${ph - 108}" rx="38" fill="#080e1f"/>
    <clipPath id="phoneScreen"><rect x="${px + 22}" y="${py + 54}" width="${pw - 44}" height="${ph - 108}" rx="38"/></clipPath>
    <g clip-path="url(#phoneScreen)">
      <image href="${img.bgHome}" x="${px + 22}" y="${py + 54}" width="${pw - 44}" height="${ph - 108}" preserveAspectRatio="xMidYMid slice" opacity=".35"/>
      <rect x="${px + 22}" y="${py + 54}" width="${pw - 44}" height="${ph - 108}" fill="#060b18" opacity=".72"/>
      <g transform="translate(${px + pw / 2} ${logoY + logoH / 2}) scale(${impact}) translate(${-px - pw / 2} ${-logoY - logoH / 2})">
        <g transform="translate(${left} 0)">
          <clipPath id="logoLeft"><rect x="${logoX}" y="${logoY}" width="${logoW / 2}" height="${logoH}"/></clipPath>
          <image href="${img.logo}" x="${logoX}" y="${logoY}" width="${logoW}" height="${logoH}" preserveAspectRatio="xMidYMid meet" clip-path="url(#logoLeft)"/>
        </g>
        <g transform="translate(${right} 0)">
          <clipPath id="logoRight"><rect x="${logoX + logoW / 2}" y="${logoY}" width="${logoW / 2}" height="${logoH}"/></clipPath>
          <image href="${img.logo}" x="${logoX}" y="${logoY}" width="${logoW}" height="${logoH}" preserveAspectRatio="xMidYMid meet" clip-path="url(#logoRight)"/>
        </g>
      </g>
      <text x="${px + pw / 2}" y="${py + 624}" text-anchor="middle" font-size="38" font-weight="1000" fill="#37e68d">CROSSOVER</text>
    </g>
    <rect x="${px + 132}" y="${py + 24}" width="126" height="22" rx="11" fill="#02040a"/>
  </g>
  <g>
    <text x="735" y="620" text-anchor="middle" font-size="70" font-weight="1000" fill="#fff">Crossover</text>
    <text x="735" y="698" text-anchor="middle" font-size="70" font-weight="1000" fill="#37e68d">Football</text>
    <text x="735" y="800" text-anchor="middle" font-size="35" font-weight="800" fill="#aeb8cf">Show your football IQ</text>
  </g>`;
}

function finalCta(t) {
  const s = pop(t);
  return `<g transform="translate(540 330) scale(${s})">
      <image href="${img.icon}" x="-170" y="-170" width="340" height="340"/>
    </g>
    ${headline(['NOW ON', 'THE APP STORE'], 720, 82)}
    <rect x="160" y="1016" width="760" height="142" rx="48" fill="#37e68d"/>
    <text x="540" y="1108" text-anchor="middle" font-size="50" font-weight="1000" fill="#061021">DOWNLOAD AND PLAY!</text>
    <text x="540" y="1285" text-anchor="middle" font-size="38" font-weight="900" fill="#f7c915">Crossover Football</text>`;
}

function svgFrame(i) {
  const time = i / FPS;
  let body = bg();
  if (time < 2.7) body += homeScreen(time / 0.7);
  else if (time < 5.6) body += pickScreen((time - 2.7) / 0.7);
  else if (time < 8.6) body += guessScreen((time - 5.6) / 0.7);
  else if (time < 12.0) body += phoneMock((time - 8.6) / 1.35);
  else body += finalCta((time - 12) / 0.7);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="topGlow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#101a38" stop-opacity=".20"/><stop offset="1" stop-color="#020611" stop-opacity=".65"/></linearGradient>
      <linearGradient id="screenGlow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#101a38" stop-opacity=".12"/><stop offset="1" stop-color="#020611" stop-opacity=".42"/></linearGradient>
      <filter id="phoneShadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="26" stdDeviation="24" flood-color="#000" flood-opacity=".55"/></filter>
      <style>text{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif}</style>
    </defs>
    ${body}
  </svg>`;
}

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: 'inherit' });
  if (r.status !== 0) throw new Error(`${cmd} failed: ${args.join(' ')}`);
}

async function makeVoice() {
  const out = path.join(__dirname, 'voiceover-en.m4a');
  const edgeMp3 = path.join(__dirname, 'voiceover-en-edge.mp3');
  const text = voiceLines.join(' ');
  const edge = path.join(__dirname, '.venv/bin/edge-tts');
  if (existsSync(edge)) {
    run(edge, ['--voice', 'en-US-GuyNeural', '--rate', '+7%', '--text', text, '--write-media', edgeMp3]);
    run(ffmpegPath, ['-y', '-i', edgeMp3, '-af', 'aresample=44100,volume=1.08', '-c:a', 'aac', '-b:a', '160k', out]);
    await fs.rm(edgeMp3, { force: true });
    return out;
  }
  run('say', ['-v', 'Alex', '-r', '184', text, '-o', path.join(__dirname, 'voiceover-en.aiff')]);
  run(ffmpegPath, ['-y', '-i', path.join(__dirname, 'voiceover-en.aiff'), '-af', 'aresample=44100,volume=1.1', '-c:a', 'aac', '-b:a', '160k', out]);
  await fs.rm(path.join(__dirname, 'voiceover-en.aiff'), { force: true });
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
  const musicWav = path.join(__dirname, 'bed-en.wav');
  const videoNoAudio = path.join(__dirname, 'crossover-social-ad-15s-en-video.mp4');
  const finalVideo = path.join(__dirname, 'crossover-social-ad-15s-en.mp4');
  run(ffmpegPath, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=98:duration=15', '-f', 'lavfi', '-i', 'sine=frequency=196:duration=15', '-filter_complex', '[0:a]volume=0.035[a0];[1:a]volume=0.018[a1];[a0][a1]amix=inputs=2,afade=t=in:st=0:duration=0.25,afade=t=out:st=14.35:duration=0.65', musicWav]);
  run(ffmpegPath, ['-y', '-framerate', String(FPS), '-i', path.join(frameDir, 'frame-%04d.png'), '-t', String(DURATION), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1', '-movflags', '+faststart', '-crf', '18', videoNoAudio]);
  run(ffmpegPath, ['-y', '-i', videoNoAudio, '-i', voice, '-i', musicWav, '-filter_complex', '[1:a]adelay=150|150,apad,atrim=0:15,volume=1.35[v];[2:a]volume=0.18[m];[v][m]amix=inputs=2:duration=first:dropout_transition=0[a]', '-map', '0:v:0', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', finalVideo]);
  await fs.rm(frameDir, { recursive: true, force: true });
  await fs.rm(videoNoAudio, { force: true });
  await fs.rm(musicWav, { force: true });
  console.log(`Wrote ${finalVideo}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
