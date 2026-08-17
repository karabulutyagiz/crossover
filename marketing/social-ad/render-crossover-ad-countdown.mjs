import fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import sharp from 'sharp';
import ffmpegPath from 'ffmpeg-static';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const frameDir = path.join(__dirname, 'frames-countdown');
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

const voiceSegments = [
  { at: 1.55, text: 'İki takım.' },
  { at: 3.20, text: 'Bir ortak futbolcu.' },
  { at: 5.45, text: 'Rakibinden önce bul.' },
  { at: 8.10, text: 'İlk bilen kazanır.' },
  { at: 10.55, text: 'Her maç yeni bir düello.' },
  { at: 12.55, text: "Crossover Football'u hemen indir, oyna!" },
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
    <rect x="0" y="0" width="1080" height="1920" fill="#060b18" opacity=".82"/>
    <rect x="0" y="0" width="1080" height="1920" fill="url(#topGlow)"/>
    <circle cx="130" cy="420" r="300" fill="#37e68d" opacity=".06" filter="url(#blur)"/>
    <circle cx="950" cy="1020" r="360" fill="#f7c915" opacity=".055" filter="url(#blur)"/>`;
}

function headline(lines, y, size = 78, color = '#fff') {
  return lines.map((line, i) => `<text x="540" y="${y + i * size * 1.08}" text-anchor="middle" font-size="${size}" font-weight="1000" fill="${color}" letter-spacing="-.9">${esc(line)}</text>`).join('');
}

function countdownNumber(time) {
  if (time < 1.45) return 30;
  if (time < 3.0) return 29;
  if (time < 4.2) return 28;
  if (time < 5.2) return 27;
  if (time < 6.5) return 24;
  if (time < 7.8) return 21;
  if (time < 9.0) return 18;
  if (time < 10.3) return 16;
  return 14;
}

function timerBadge(time, x = 434, y = 270, r = 88) {
  const n = countdownNumber(time);
  const warn = n <= 18;
  const ring = 1 - ((30 - n) / 30);
  const color = warn ? '#ff5470' : '#f7c915';
  const dash = Math.max(70, Math.round(520 * ring));
  return `<g transform="translate(${x} ${y})">
    <circle cx="0" cy="0" r="${r}" fill="#10182b" stroke="#293b63" stroke-width="8"/>
    <circle cx="0" cy="0" r="${r}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round" stroke-dasharray="${dash} 560" transform="rotate(-90)"/>
    <text x="0" y="24" text-anchor="middle" font-size="82" font-weight="1000" fill="${color}">${n}</text>
    <text x="0" y="66" text-anchor="middle" font-size="24" font-weight="900" fill="#a8b1c8">SANİYE</text>
  </g>`;
}

function teamCard(x, y, title, accent = '#37e68d') {
  return `<rect x="${x}" y="${y}" width="320" height="218" rx="34" fill="#151e35" stroke="#283553" stroke-width="3"/>
    <circle cx="${x + 160}" cy="${y + 76}" r="48" fill="#fff"/>
    <circle cx="${x + 160}" cy="${y + 76}" r="32" fill="${accent}" opacity=".94"/>
    <text x="${x + 160}" y="${y + 156}" text-anchor="middle" font-size="34" font-weight="1000" fill="#fff">${esc(title)}</text>`;
}

function inputBox(text, t, y = 860) {
  const typed = text.slice(0, Math.round(text.length * ease(t)));
  const caret = Math.floor(t * 8) % 2 === 0 ? '<rect x="0" y="-44" width="5" height="58" rx="3" fill="#4d6dff"/>' : '';
  return `<rect x="86" y="${y}" width="696" height="104" rx="26" fill="#151e35" stroke="#344466" stroke-width="3"/>
    <g transform="translate(122 ${y + 68})">${caret}<text x="18" y="0" font-size="38" font-weight="800" fill="#fff">${esc(typed)}</text></g>
    <rect x="86" y="${y + 136}" width="696" height="104" rx="28" fill="#37e68d" opacity=".92"/>
    <text x="434" y="${y + 204}" text-anchor="middle" font-size="38" font-weight="1000" fill="#061021">GÖNDER</text>`;
}

function phoneShell(t, content, y = 292, scale = 0.61) {
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

function hookScene(t, time) {
  const s = pop(t);
  const pulse = 1 + Math.sin(time * Math.PI * 6) * 0.035;
  return `<g transform="translate(540 300) scale(${s})">
      <image href="${img.logo}" x="-180" y="-142" width="360" height="284" preserveAspectRatio="xMidYMid meet"/>
    </g>
    <g transform="translate(540 780) scale(${pulse}) translate(-540 -780)">
      ${headline(['30 SANİYEN', 'VAR'], 710, 112, '#fff')}
    </g>
    <text x="540" y="1000" text-anchor="middle" font-size="40" font-weight="1000" fill="#f7c915">Oyuncuyu rakibinden önce bul.</text>
    <g opacity="${ease(t)}">
      <rect x="220" y="1194" width="640" height="94" rx="34" fill="#10182b" stroke="#31415f" stroke-width="3"/>
      <text x="540" y="1255" text-anchor="middle" font-size="36" font-weight="900" fill="#aeb8cf">Tik tak. Süre başladı.</text>
    </g>`;
}

function duelScene(t, time) {
  return phoneShell(t, `<text x="434" y="186" text-anchor="middle" font-size="38" font-weight="1000" fill="#a8b1c8">İKİ TAKIM</text>
    ${timerBadge(time, 434, 328, 82)}
    <g transform="translate(0 500)">
      ${teamCard(66, 0, 'Galatasaray', '#f7c915')}
      <text x="434" y="126" text-anchor="middle" font-size="58" fill="#f7c915">+</text>
      ${teamCard(482, 0, 'Inter Milan', '#2f6dff')}
      <text x="434" y="330" text-anchor="middle" font-size="50" font-weight="1000" fill="#fff">Ortak futbolcu kim?</text>
      <text x="434" y="388" text-anchor="middle" font-size="29" font-weight="800" fill="#9aa4bd">Rakibinden önce yaz</text>
      ${inputBox('Sneijder', t, 462)}
    </g>`, 292, 0.61);
}

function correctScene(t, time) {
  const s = pop(t);
  return phoneShell(t, `${timerBadge(time, 434, 250, 78)}
    <g transform="translate(0 394) scale(${s}) translate(0 -394)">
      <circle cx="434" cy="394" r="70" fill="#37e68d"/>
      <path d="M398 392 L426 420 L480 350" fill="none" stroke="#061021" stroke-width="15" stroke-linecap="round" stroke-linejoin="round"/>
      <text x="434" y="538" text-anchor="middle" font-size="58" font-weight="1000" fill="#37e68d">DOĞRU!</text>
      <text x="434" y="624" text-anchor="middle" font-size="50" font-weight="1000" fill="#fff">Wesley Sneijder</text>
      <rect x="172" y="710" width="524" height="104" rx="38" fill="#111a2e" stroke="#2e3d5f" stroke-width="3"/>
      <text x="434" y="778" text-anchor="middle" font-size="40" font-weight="1000" fill="#f7c915">Sen 1 - 0 Rakip</text>
      <text x="434" y="910" text-anchor="middle" font-size="42" font-weight="1000" fill="#fff">İlk bilen kazanır.</text>
    </g>`, 292, 0.61);
}

function montageScene(t) {
  const rows = [
    ['Real Madrid', 'Arsenal', '24s'],
    ['Barcelona', 'PSG', '19s'],
    ['Milan', 'Chelsea', '16s'],
  ];
  const cards = rows.map((r, i) => {
    const y = 400 + i * 220;
    const p = pop((t - i * 0.12) / 0.45);
    return `<g transform="translate(540 ${y + 78}) scale(${p}) translate(-540 ${-y - 78})">
      <rect x="118" y="${y}" width="844" height="156" rx="42" fill="#121b30" stroke="#2a3a60" stroke-width="3"/>
      <text x="214" y="${y + 95}" text-anchor="middle" font-size="38" font-weight="1000" fill="#f7c915">${r[2]}</text>
      <text x="330" y="${y + 92}" font-size="36" font-weight="1000" fill="#fff">${esc(r[0])}</text>
      <text x="610" y="${y + 92}" text-anchor="middle" font-size="40" fill="#f7c915">+</text>
      <text x="696" y="${y + 92}" font-size="36" font-weight="1000" fill="#fff">${esc(r[1])}</text>
    </g>`;
  }).join('');
  return `${headline(['HER MAÇ', 'YENİ BİR DÜELLO'], 178, 74)}
    ${cards}
    <text x="540" y="1122" text-anchor="middle" font-size="36" font-weight="900" fill="#aeb8cf">30 saniye. Tek doğru cevap.</text>`;
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
    <text x="540" y="1278" text-anchor="middle" font-size="34" font-weight="900" fill="#aeb8cf">30 saniyelik futbol düellosu.</text>`;
}

function svgFrame(i) {
  const time = i / FPS;
  let body = bg();

  if (time < 1.55) body += hookScene(time / 0.6, time);
  else if (time < 8.1) body += duelScene((time - 1.55) / 0.75, time);
  else if (time < 10.55) body += correctScene((time - 8.1) / 0.55, time);
  else if (time < 12.55) body += montageScene((time - 10.55) / 0.65);
  else body += finalCta((time - 12.55) / 0.7);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="topGlow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#101a38" stop-opacity=".30"/><stop offset="1" stop-color="#020611" stop-opacity=".72"/></linearGradient>
      <linearGradient id="screenGlow" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#101a38" stop-opacity=".18"/><stop offset="1" stop-color="#020611" stop-opacity=".50"/></linearGradient>
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
  const out = path.join(__dirname, 'voiceover-countdown.m4a');
  const edge = path.join(__dirname, '.venv/bin/edge-tts');
  const segmentFiles = voiceSegments.map((_, i) => path.join(__dirname, `voiceover-countdown-${i}.mp3`));
  if (existsSync(edge)) {
    for (let i = 0; i < voiceSegments.length; i++) {
      run(edge, ['--voice', 'tr-TR-AhmetNeural', '--rate', '+13%', '--text', voiceSegments[i].text, '--write-media', segmentFiles[i]]);
    }
    const inputs = segmentFiles.flatMap((file) => ['-i', file]);
    const filters = voiceSegments.map((seg, i) => {
      const delay = Math.round(seg.at * 1000);
      return `[${i}:a]adelay=${delay}|${delay},apad,atrim=0:${DURATION}[v${i}]`;
    });
    const mixInputs = voiceSegments.map((_, i) => `[v${i}]`).join('');
    run(ffmpegPath, ['-y', ...inputs, '-filter_complex', `${filters.join(';')};${mixInputs}amix=inputs=${voiceSegments.length}:duration=longest:dropout_transition=0,atrim=0:${DURATION},aresample=44100,volume=1.08[a]`, '-map', '[a]', '-c:a', 'aac', '-b:a', '160k', out]);
    await Promise.all(segmentFiles.map((file) => fs.rm(file, { force: true })));
    return out;
  }
  const aiff = path.join(__dirname, 'voiceover-countdown.aiff');
  run('say', ['-v', 'Yelda', '-r', '188', voiceSegments.map((seg) => seg.text).join(' '), '-o', aiff]);
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

  const coverFrame = path.join(frameDir, 'frame-0032.png');
  const cover = path.join(__dirname, 'crossover-social-ad-15s-countdown-cover.jpg');
  await sharp(coverFrame).jpeg({ quality: 92 }).toFile(cover);

  const voice = await makeVoice();
  const bedWav = path.join(__dirname, 'bed-countdown.wav');
  const tickWav = path.join(__dirname, 'tick-countdown.wav');
  const videoNoAudio = path.join(__dirname, 'crossover-social-ad-15s-countdown-video.mp4');
  const finalVideo = path.join(__dirname, 'crossover-social-ad-15s-countdown.mp4');

  run(ffmpegPath, ['-y', '-f', 'lavfi', '-i', 'sine=frequency=92:duration=15', '-f', 'lavfi', '-i', 'sine=frequency=184:duration=15', '-filter_complex', '[0:a]volume=0.032[a0];[1:a]volume=0.018[a1];[a0][a1]amix=inputs=2,afade=t=in:st=0:duration=0.25,afade=t=out:st=14.35:duration=0.65', bedWav]);
  run(ffmpegPath, ['-y', '-f', 'lavfi', '-i', 'aevalsrc=if(lt(mod(t\\,1)\\,0.055)\\,0.55*sin(2*PI*1450*t)\\,0):s=44100:d=15', '-af', 'afade=t=in:st=0:duration=0.08,afade=t=out:st=14.45:duration=0.55', tickWav]);
  run(ffmpegPath, ['-y', '-framerate', String(FPS), '-i', path.join(frameDir, 'frame-%04d.png'), '-t', String(DURATION), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1', '-movflags', '+faststart', '-crf', '18', videoNoAudio]);
  run(ffmpegPath, ['-y', '-i', videoNoAudio, '-i', voice, '-i', bedWav, '-i', tickWav, '-filter_complex', '[1:a]apad,atrim=0:15,volume=1.45[v];[2:a]volume=0.17[m];[3:a]volume=0.16[t];[v][m][t]amix=inputs=3:duration=first:dropout_transition=0[a]', '-map', '0:v:0', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', finalVideo]);

  await fs.rm(frameDir, { recursive: true, force: true });
  await fs.rm(videoNoAudio, { force: true });
  await fs.rm(bedWav, { force: true });
  await fs.rm(tickWav, { force: true });
  console.log(`Wrote ${finalVideo}`);
  console.log(`Wrote ${cover}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
