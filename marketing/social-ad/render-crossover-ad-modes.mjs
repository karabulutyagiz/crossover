import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import ffmpegPath from 'ffmpeg-static';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const frameDir = path.join(__dirname, 'frames-modes');
const W = 1080;
const H = 1920;
const FPS = 30;
const DURATION = 15;
const TOTAL = FPS * DURATION;

const assets = {
  bgHome: path.join(root, 'app/assets/bg-home.png'),
  logo: path.join(root, 'app/assets/cof-logo.png'),
  icon: path.join(root, 'app/assets/icon.png'),
  screenGuess: path.join(root, 'website/screens/guess.png'),
};

const voiceLines = [
  'Futbol bilgini tek modda değil.',
  'İki takımda oynayan futbolcuyu bul.',
  'Ülke ve takım modunda hafızanı zorla.',
  'Harf ve takım modunda hızını konuştur.',
  "Crossover Football'u hemen indir, oyna!",
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
    <rect x="0" y="0" width="1080" height="1920" fill="#060b18" opacity=".80"/>
    <rect x="0" y="0" width="1080" height="1920" fill="url(#topGlow)"/>
    <circle cx="130" cy="430" r="270" fill="#37e68d" opacity=".07" filter="url(#blur)"/>
    <circle cx="980" cy="1060" r="330" fill="#f7c915" opacity=".055" filter="url(#blur)"/>`;
}

function headline(lines, y, size = 78, color = '#fff') {
  return lines.map((line, i) => `<text x="540" y="${y + i * size * 1.08}" text-anchor="middle" font-size="${size}" font-weight="1000" fill="${color}" letter-spacing="-.9">${esc(line)}</text>`).join('');
}

function pill(x, y, w, text, fill = '#141c31', stroke = '#334263', color = '#fff') {
  return `<rect x="${x}" y="${y}" width="${w}" height="72" rx="26" fill="${fill}" stroke="${stroke}" stroke-width="3"/>
    <text x="${x + w / 2}" y="${y + 48}" text-anchor="middle" font-size="30" font-weight="1000" fill="${color}">${esc(text)}</text>`;
}

function phoneShell(t, content, y = 310, scale = 0.58) {
  const p = pop(t);
  const sw = 868 * scale * p;
  const sh = 1688 * scale * p;
  const x = (W - sw) / 2;
  return `<g filter="url(#phoneShadow)">
    <rect x="${x - 14}" y="${y - 16}" width="${sw + 28}" height="${sh + 32}" rx="62" fill="#050914" stroke="#dbe6ff" stroke-width="5"/>
    <clipPath id="mockClip"><rect x="0" y="0" width="868" height="1688" rx="54"/></clipPath>
    <g clip-path="url(#mockClip)" transform="translate(${x} ${y}) scale(${sw / 868})">
      <rect x="0" y="0" width="868" height="1688" fill="#070d1c"/>
      <rect x="0" y="0" width="868" height="1688" fill="url(#screenGlow)"/>
      <rect x="275" y="34" width="318" height="78" rx="39" fill="#000"/>
      ${content}
    </g>
  </g>`;
}

function topBadge(label, color = '#37e68d') {
  return `<rect x="86" y="154" width="696" height="86" rx="32" fill="#111a2e" stroke="#2e3d5f" stroke-width="3"/>
    <text x="434" y="210" text-anchor="middle" font-size="38" font-weight="1000" fill="${color}">${esc(label)}</text>`;
}

function teamCard(x, y, title, sub, accent = '#37e68d') {
  return `<rect x="${x}" y="${y}" width="320" height="230" rx="34" fill="#151e35" stroke="#283553" stroke-width="3"/>
    <circle cx="${x + 160}" cy="${y + 76}" r="48" fill="#fff"/>
    <circle cx="${x + 160}" cy="${y + 76}" r="32" fill="${accent}" opacity=".92"/>
    <text x="${x + 160}" y="${y + 153}" text-anchor="middle" font-size="33" font-weight="1000" fill="#fff">${esc(title)}</text>
    <text x="${x + 160}" y="${y + 196}" text-anchor="middle" font-size="24" font-weight="800" fill="#a8b1c8">${esc(sub)}</text>`;
}

function inputBox(text, t, y = 1018) {
  const typed = text.slice(0, Math.round(text.length * ease(t)));
  const caret = Math.floor(t * 8) % 2 === 0 ? '<rect x="0" y="-45" width="5" height="58" rx="3" fill="#4d6dff"/>' : '';
  return `<rect x="86" y="${y}" width="696" height="104" rx="26" fill="#151e35" stroke="#344466" stroke-width="3"/>
    <g transform="translate(122 ${y + 68})">${caret}<text x="18" y="0" font-size="38" font-weight="800" fill="#fff">${esc(typed)}</text></g>
    <rect x="86" y="${y + 136}" width="696" height="104" rx="28" fill="#37e68d" opacity=".92"/>
    <text x="434" y="${y + 204}" text-anchor="middle" font-size="38" font-weight="1000" fill="#061021">GÖNDER</text>`;
}

function teamTeamScreen(t) {
  return phoneShell(t, `${topBadge('TAKIM + TAKIM')}
    <g transform="translate(0 382)">
      ${teamCard(66, 0, 'Galatasaray', 'takım', '#f7c915')}
      <text x="434" y="135" text-anchor="middle" font-size="56" fill="#f7c915">+</text>
      ${teamCard(482, 0, 'Inter Milan', 'takım', '#2f6dff')}
      <text x="434" y="342" text-anchor="middle" font-size="58" font-weight="1000" fill="#f7c915">9s</text>
      <text x="434" y="418" text-anchor="middle" font-size="44" font-weight="1000" fill="#fff">İkisinde de oynayan?</text>
      ${inputBox('Sneijder', t, 500)}
    </g>`, 324, 0.57);
}

function countryTeamScreen(t) {
  return phoneShell(t, `${topBadge('ÜLKE + TAKIM', '#f7c915')}
    <g transform="translate(0 368)">
      <rect x="66" y="0" width="320" height="238" rx="34" fill="#151e35" stroke="#283553" stroke-width="3"/>
      <circle cx="226" cy="82" r="56" fill="#159447"/>
      <circle cx="226" cy="82" r="42" fill="#f7c915" opacity=".95"/>
      <text x="226" y="95" text-anchor="middle" font-size="44" font-weight="1000" fill="#12361f">BR</text>
      <text x="226" y="162" text-anchor="middle" font-size="35" font-weight="1000" fill="#fff">Brezilya</text>
      <text x="226" y="204" text-anchor="middle" font-size="24" font-weight="800" fill="#a8b1c8">ülke</text>
      <text x="434" y="135" text-anchor="middle" font-size="56" fill="#f7c915">+</text>
      ${teamCard(482, 0, 'Real Madrid', 'takım', '#fff')}
      <text x="434" y="350" text-anchor="middle" font-size="46" font-weight="1000" fill="#fff">Bu ülke + bu takım?</text>
      <text x="434" y="408" text-anchor="middle" font-size="30" font-weight="800" fill="#9aa4bd">Futbol hafızanı zorla</text>
      ${inputBox('Marcelo', t, 510)}
    </g>`, 324, 0.57);
}

function letterTeamScreen(t) {
  return phoneShell(t, `${topBadge('HARF + TAKIM', '#8ee9ff')}
    <g transform="translate(0 368)">
      <rect x="66" y="0" width="320" height="238" rx="34" fill="#151e35" stroke="#283553" stroke-width="3"/>
      <rect x="142" y="30" width="168" height="112" rx="30" fill="#37e68d"/>
      <text x="226" y="113" text-anchor="middle" font-size="82" font-weight="1000" fill="#071123">M</text>
      <text x="226" y="186" text-anchor="middle" font-size="31" font-weight="1000" fill="#fff">Harf</text>
      <text x="434" y="135" text-anchor="middle" font-size="56" fill="#f7c915">+</text>
      ${teamCard(482, 0, 'Barcelona', 'takım', '#8d3cff')}
      <text x="434" y="350" text-anchor="middle" font-size="43" font-weight="1000" fill="#fff">M ile başlayan oyuncu?</text>
      <text x="434" y="408" text-anchor="middle" font-size="30" font-weight="800" fill="#9aa4bd">Hızını konuştur</text>
      ${inputBox('Messi', t, 510)}
    </g>`, 324, 0.57);
}

function hookScene(t) {
  const s = pop(t);
  return `<g transform="translate(540 320) scale(${s})">
      <image href="${img.logo}" x="-190" y="-150" width="380" height="300" preserveAspectRatio="xMidYMid meet"/>
    </g>
    <g opacity="${ease(t)}">${headline(['FUTBOL BİLGİN', 'TEK MODLA', 'SINIRLI DEĞİL'], 650, 76)}</g>
    <rect x="168" y="1092" width="744" height="96" rx="34" fill="#10182b" stroke="#31415f" stroke-width="3"/>
    <text x="540" y="1154" text-anchor="middle" font-size="38" font-weight="900" fill="#f7c915">3 farklı düello. Tek refleks.</text>
    <g opacity="${ease(t)}">
      ${pill(112, 1310, 260, 'TAKIM + TAKIM')}
      ${pill(410, 1310, 260, 'ÜLKE + TAKIM', '#18213a', '#4b3f22', '#f7c915')}
      ${pill(708, 1310, 260, 'HARF + TAKIM', '#132239', '#26516a', '#8ee9ff')}
    </g>`;
}

function summaryScene(t) {
  const row = (i, label, title, detail, color) => {
    const y = 348 + i * 176;
    const delay = i * 0.16;
    const p = pop((t - delay) / 0.5);
    return `<g transform="translate(540 ${y + 75}) scale(${p}) translate(-540 ${-y - 75})">
      <rect x="130" y="${y}" width="820" height="150" rx="42" fill="#121b30" stroke="${color}" stroke-width="4"/>
      <rect x="168" y="${y + 38}" width="190" height="74" rx="26" fill="${color}"/>
      <text x="263" y="${y + 86}" text-anchor="middle" font-size="31" font-weight="1000" fill="#061021">${esc(label)}</text>
      <text x="402" y="${y + 64}" font-size="36" font-weight="1000" fill="#fff">${esc(title)}</text>
      <text x="402" y="${y + 110}" font-size="27" font-weight="900" fill="#a8b1c8">${esc(detail)}</text>
      <circle cx="884" cy="${y + 75}" r="38" fill="${color}"/>
      <path d="M868 ${y + 74} L881 ${y + 88} L904 ${y + 58}" fill="none" stroke="#061021" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
    </g>`;
  };
  return `${headline(['HER MAÇ', 'FARKLI BİR TEST'], 172, 76)}
    ${row(0, 'TAKIM', '2 kulüp', 'ortak oyuncuyu bul', '#37e68d')}
    ${row(1, 'ÜLKE', 'ülke + takım', 'milliyet bilgini kullan', '#f7c915')}
    ${row(2, 'HARF', 'harf + takım', 'hızını konuştur', '#8ee9ff')}
    <text x="540" y="972" text-anchor="middle" font-size="36" font-weight="900" fill="#dbe6ff">Futbol zekanı her açıdan konuştur.</text>`;
}

function finalCta(t) {
  const s = pop(t);
  return `<g transform="translate(540 300) scale(${s})">
      <image href="${img.icon}" x="-168" y="-168" width="336" height="336"/>
    </g>
    ${headline(['CROSSOVER', 'FOOTBALL'], 642, 84)}
    <text x="540" y="850" text-anchor="middle" font-size="38" font-weight="900" fill="#f7c915">ŞİMDİ APP STORE'DA</text>
    <rect x="150" y="1016" width="780" height="142" rx="48" fill="#37e68d"/>
    <text x="540" y="1108" text-anchor="middle" font-size="50" font-weight="1000" fill="#061021">HEMEN İNDİR, OYNA!</text>
    <text x="540" y="1278" text-anchor="middle" font-size="34" font-weight="900" fill="#aeb8cf">Takım. Ülke. Harf. Hepsi tek oyunda.</text>`;
}

function svgFrame(i) {
  const time = i / FPS;
  let body = bg();

  if (time < 2.6) body += hookScene(time / 0.8);
  else if (time < 5.2) body += teamTeamScreen((time - 2.6) / 1.0);
  else if (time < 7.9) body += countryTeamScreen((time - 5.2) / 1.0);
  else if (time < 10.6) body += letterTeamScreen((time - 7.9) / 1.0);
  else if (time < 12.3) body += summaryScene((time - 10.6) / 0.8);
  else body += finalCta((time - 12.3) / 0.7);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="topGlow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#101a38" stop-opacity=".28"/><stop offset="1" stop-color="#020611" stop-opacity=".70"/></linearGradient>
      <linearGradient id="screenGlow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#101a38" stop-opacity=".18"/><stop offset="1" stop-color="#020611" stop-opacity=".48"/></linearGradient>
      <filter id="phoneShadow" x="-30%" y="-30%" width="160%" height="160%"><feDropShadow dx="0" dy="24" stdDeviation="22" flood-color="#000" flood-opacity=".58"/></filter>
      <filter id="blur"><feGaussianBlur stdDeviation="56"/></filter>
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
  const out = path.join(__dirname, 'voiceover-modes.m4a');
  const edgeMp3 = path.join(__dirname, 'voiceover-modes-edge.mp3');
  const text = voiceLines.join(' ');
  const edge = path.join(__dirname, '.venv/bin/edge-tts');
  if (existsSync(edge)) {
    run(edge, ['--voice', 'tr-TR-AhmetNeural', '--rate', '+12%', '--text', text, '--write-media', edgeMp3]);
    run(ffmpegPath, ['-y', '-i', edgeMp3, '-af', 'aresample=44100,volume=1.1', '-c:a', 'aac', '-b:a', '160k', out]);
    await fs.rm(edgeMp3, { force: true });
    return out;
  }
  const aiff = path.join(__dirname, 'voiceover-modes.aiff');
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

  const coverFrame = path.join(frameDir, 'frame-0030.png');
  const cover = path.join(__dirname, 'crossover-social-ad-15s-modes-cover.jpg');
  await sharp(coverFrame).jpeg({ quality: 92 }).toFile(cover);

  const voice = await makeVoice();
  const musicWav = path.join(__dirname, 'bed-modes.wav');
  const videoNoAudio = path.join(__dirname, 'crossover-social-ad-15s-modes-video.mp4');
  const finalVideo = path.join(__dirname, 'crossover-social-ad-15s-modes.mp4');

  run(ffmpegPath, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=92:duration=15', '-f', 'lavfi', '-i', 'sine=frequency=184:duration=15', '-filter_complex', '[0:a]volume=0.032[a0];[1:a]volume=0.018[a1];[a0][a1]amix=inputs=2,afade=t=in:st=0:duration=0.25,afade=t=out:st=14.35:duration=0.65', musicWav]);
  run(ffmpegPath, ['-y', '-framerate', String(FPS), '-i', path.join(frameDir, 'frame-%04d.png'), '-t', String(DURATION), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1', '-movflags', '+faststart', '-crf', '18', videoNoAudio]);
  run(ffmpegPath, ['-y', '-i', videoNoAudio, '-i', voice, '-i', musicWav, '-filter_complex', '[1:a]adelay=120|120,apad,atrim=0:15,volume=1.45[v];[2:a]volume=0.18[m];[v][m]amix=inputs=2:duration=first:dropout_transition=0[a]', '-map', '0:v:0', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', finalVideo]);

  await fs.rm(frameDir, { recursive: true, force: true });
  await fs.rm(videoNoAudio, { force: true });
  await fs.rm(musicWav, { force: true });
  console.log(`Wrote ${finalVideo}`);
  console.log(`Wrote ${cover}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
