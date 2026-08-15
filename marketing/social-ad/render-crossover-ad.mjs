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
  bg: path.join(root, 'app/assets/bg-stadium.jpg'),
  home: path.join(root, 'app/assets/bg-home.png'),
  hero: path.join(root, 'app/assets/hero-crossover.png'),
  logo: path.join(root, 'app/assets/cof-logo.png'),
  icon: path.join(root, 'app/assets/icon.png'),
  duel: path.join(root, 'app/assets/card-duel-blue.png'),
  ball: path.join(root, 'app/assets/ball-hero-white.png'),
};

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
const pop = (x) => {
  x = clamp(x);
  return x < 0.7 ? 1.15 * ease(x / 0.7) : 1.15 - 0.15 * ease((x - 0.7) / 0.3);
};

function textBlock(lines, x, y, size, color = '#fff', anchor = 'middle', weight = 900) {
  return lines.map((line, i) => `<text x="${x}" y="${y + i * size * 1.18}" text-anchor="${anchor}" font-size="${size}" font-weight="${weight}" fill="${color}" letter-spacing="-.5">${esc(line)}</text>`).join('');
}

function pill(label, x, y, color) {
  return `<g transform="translate(${x} ${y})">
    <rect x="0" y="0" width="360" height="86" rx="28" fill="rgba(11,16,32,.72)" stroke="${color}" stroke-width="3"/>
    <text x="180" y="55" text-anchor="middle" font-size="34" font-weight="900" fill="${color}">${esc(label)}</text>
  </g>`;
}

function phone(x, y, scale, screen = 'home') {
  const sw = 360 * scale, sh = 740 * scale;
  const ix = x + 22 * scale, iy = y + 58 * scale, iw = sw - 44 * scale, ih = sh - 116 * scale;
  const screenImg = screen === 'game' ? img.bg : img.home;
  return `<g transform="translate(${x} ${y}) scale(${scale})">
    <rect x="0" y="0" width="360" height="740" rx="58" fill="#050912" stroke="#dbe7ff" stroke-width="8"/>
    <rect x="22" y="58" width="316" height="624" rx="32" fill="#0b1020"/>
    <clipPath id="screenClip"><rect x="22" y="58" width="316" height="624" rx="32"/></clipPath>
    <image href="${screenImg}" x="22" y="58" width="316" height="624" preserveAspectRatio="xMidYMid slice" clip-path="url(#screenClip)"/>
    <rect x="120" y="24" width="120" height="22" rx="11" fill="#06080d"/>
    <image href="${img.logo}" x="75" y="190" width="210" height="168" preserveAspectRatio="xMidYMid meet" opacity="${screen === 'home' ? 1 : 0}"/>
    <text x="180" y="405" text-anchor="middle" font-size="34" font-weight="900" fill="#fff">CROSSOVER</text>
    <text x="180" y="446" text-anchor="middle" font-size="28" font-weight="800" fill="#27E58B">FOOTBALL</text>
  </g>`;
}

function gameCard(title, subtitle, t, extra = '') {
  const yy = 260 + 18 * Math.sin(t * Math.PI * 2);
  return `<rect x="70" y="${yy}" width="940" height="620" rx="54" fill="rgba(9,15,33,.82)" stroke="#27E58B" stroke-width="4"/>
    <text x="540" y="${yy + 84}" text-anchor="middle" font-size="48" font-weight="900" fill="#F5C518">${esc(title)}</text>
    <text x="540" y="${yy + 140}" text-anchor="middle" font-size="30" font-weight="800" fill="#9fb5dd">${esc(subtitle)}</text>
    <g transform="translate(162 ${yy + 210})">
      <rect x="0" y="0" width="320" height="190" rx="32" fill="#10295b" stroke="#3DA5FF" stroke-width="3"/>
      <text x="160" y="86" text-anchor="middle" font-size="34" font-weight="900" fill="#fff">GALATASARAY</text>
      <text x="160" y="132" text-anchor="middle" font-size="26" font-weight="800" fill="#F5C518">Takım A</text>
    </g>
    <image href="${img.duel}" x="451" y="${yy + 250}" width="178" height="176"/>
    <g transform="translate(598 ${yy + 210})">
      <rect x="0" y="0" width="320" height="190" rx="32" fill="#172d1f" stroke="#27E58B" stroke-width="3"/>
      <text x="160" y="86" text-anchor="middle" font-size="34" font-weight="900" fill="#fff">CHELSEA</text>
      <text x="160" y="132" text-anchor="middle" font-size="26" font-weight="800" fill="#27E58B">Takım B</text>
    </g>
    ${extra}`;
}

function svgFrame(i) {
  const time = i / FPS;
  const bgShift = -160 + 24 * Math.sin(time * 0.7);
  let body = `<image href="${img.bg}" x="0" y="${bgShift}" width="1080" height="2400" preserveAspectRatio="xMidYMid slice"/>
    <rect x="0" y="0" width="1080" height="1920" fill="url(#shade)"/>
    <circle cx="120" cy="220" r="260" fill="#27E58B" opacity=".10"/>
    <circle cx="980" cy="1550" r="360" fill="#3DA5FF" opacity=".12"/>`;

  if (time < 2.5) {
    const s = pop(time / 0.8);
    body += gameCard('FUTBOL BİLGİNE', 'güveniyor musun?', time, `<g transform="translate(540 1090) scale(${s})"><text x="0" y="0" text-anchor="middle" font-size="76" font-weight="1000" fill="#fff">MEYDAN OKUMA</text></g>`);
  } else if (time < 5.5) {
    const p = ease((time - 2.5) / 0.8);
    body += gameCard('RAKİBİNDEN ÖNCE', 'doğru futbolcuyu bul', time, `<g transform="translate(150 1000)">
      <rect x="0" y="0" width="780" height="120" rx="32" fill="#081124" stroke="#F5C518" stroke-width="3"/>
      <text x="36" y="76" font-size="46" font-weight="900" fill="#fff">Cevap: </text>
      <text x="230" y="76" font-size="46" font-weight="900" fill="#27E58B">Drogba</text>
      <rect x="${230 + p * 220}" y="32" width="6" height="62" fill="#27E58B" opacity="${i % 16 < 8 ? 1 : .25}"/>
    </g>`);
  } else if (time < 8.5) {
    body += `<text x="540" y="245" text-anchor="middle" font-size="72" font-weight="1000" fill="#fff">4 FARKLI MOD</text>
      <text x="540" y="320" text-anchor="middle" font-size="34" font-weight="800" fill="#9fb5dd">Her maç başka bir futbol hafızası testi</text>
      ${pill('Takım - Takım', 150, 520, '#27E58B')}
      ${pill('Ülke - Takım', 570, 520, '#3DA5FF')}
      ${pill('Harf - Takım', 150, 660, '#F5C518')}
      ${pill('Oyuncu - Oyuncu', 570, 660, '#ff7a59')}
      ${phone(326, 900 + 16 * Math.sin(time * 4), 1.18, 'game')}`;
  } else if (time < 12) {
    const p = ease((time - 8.5) / 1.1);
    const left = -260 + p * 415;
    const right = 1080 - p * 415;
    const bump = time > 9.7 && time < 10.1 ? 1.12 : 1;
    body += `<rect x="0" y="0" width="1080" height="1920" fill="#0B1020" opacity=".78"/>
      <g transform="translate(${left} 735) scale(${bump})"><image href="${img.logo}" x="0" y="0" width="260" height="210"/></g>
      <g transform="translate(${right} 735) scale(${bump})"><image href="${img.logo}" x="0" y="0" width="260" height="210"/></g>
      ${phone(110, 520, 1.12, 'home')}
      ${textBlock(['Crossover', 'Football'], 705, 705, 72, '#fff', 'middle', 1000)}
      <text x="705" y="895" text-anchor="middle" font-size="38" font-weight="900" fill="#27E58B">Futbol zekanı konuştur</text>`;
  } else {
    const p = pop((time - 12) / 0.7);
    body += `<rect x="0" y="0" width="1080" height="1920" fill="#061021" opacity=".82"/>
      <g transform="translate(348 210) scale(${p})"><image href="${img.icon}" x="0" y="0" width="384" height="384" rx="80"/></g>
      ${textBlock(['ŞİMDİ', 'APP STORE\'DA'], 540, 760, 86, '#fff', 'middle', 1000)}
      <rect x="190" y="1030" width="700" height="138" rx="44" fill="#27E58B"/>
      <text x="540" y="1118" text-anchor="middle" font-size="52" font-weight="1000" fill="#06231a">HEMEN İNDİR, OYNA!</text>
      <text x="540" y="1335" text-anchor="middle" font-size="46" font-weight="900" fill="#F5C518">Crossover Football</text>`;
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <defs>
      <linearGradient id="shade" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#081024" stop-opacity=".20"/><stop offset="1" stop-color="#050812" stop-opacity=".84"/></linearGradient>
      <style>text{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif}</style>
    </defs>
    ${body}
  </svg>`;
}

async function main() {
  await fs.rm(frameDir, { recursive: true, force: true });
  await fs.mkdir(frameDir, { recursive: true });
  for (let i = 0; i < TOTAL; i++) {
    const svg = svgFrame(i);
    await sharp(Buffer.from(svg)).png().toFile(path.join(frameDir, `frame-${String(i).padStart(4, '0')}.png`));
    if (i % 60 === 0) process.stdout.write(`frame ${i}/${TOTAL}\n`);
  }

  const voiceTxt = path.join(outDir, 'voiceover.txt');
  const voiceAiff = path.join(outDir, 'voiceover.aiff');
  const voiceM4a = path.join(outDir, 'voiceover.m4a');
  const musicWav = path.join(outDir, 'bed.wav');
  const videoNoAudio = path.join(outDir, 'crossover-social-ad-15s-video.mp4');
  const finalVideo = path.join(outDir, 'crossover-social-ad-15s.mp4');

  const say = spawnSync('say', ['-v', 'Yelda', '-r', '188', '-f', voiceTxt, '-o', voiceAiff], { stdio: 'inherit' });
  if (say.status !== 0) throw new Error('voiceover generation failed');

  const ff = ffmpegPath;
  const run = (args) => {
    const r = spawnSync(ff, args, { stdio: 'inherit' });
    if (r.status !== 0) throw new Error(`ffmpeg failed: ${args.join(' ')}`);
  };

  run(['-y', '-f', 'lavfi', '-i', 'sine=frequency=82:duration=15', '-f', 'lavfi', '-i', 'sine=frequency=164:duration=15', '-filter_complex', '[0:a]volume=0.08[a0];[1:a]volume=0.04[a1];[a0][a1]amix=inputs=2,afade=t=in:st=0:duration=0.3,afade=t=out:st=14.4:duration=0.6', musicWav]);
  run(['-y', '-i', voiceAiff, '-af', 'aresample=44100,volume=1.55', '-c:a', 'aac', '-b:a', '128k', voiceM4a]);
  run(['-y', '-framerate', String(FPS), '-i', path.join(frameDir, 'frame-%04d.png'), '-t', String(DURATION), '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-level', '4.1', '-movflags', '+faststart', '-crf', '20', videoNoAudio]);
  run(['-y', '-i', videoNoAudio, '-i', voiceM4a, '-i', musicWav, '-filter_complex', '[1:a]adelay=200|200,apad,atrim=0:15[v];[2:a]volume=0.45[m];[v][m]amix=inputs=2:duration=first:dropout_transition=0[a]', '-map', '0:v:0', '-map', '[a]', '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k', '-shortest', finalVideo]);

  await fs.rm(frameDir, { recursive: true, force: true });
  await fs.rm(videoNoAudio, { force: true });
  await fs.rm(musicWav, { force: true });
  await fs.rm(voiceAiff, { force: true });
  console.log(`Wrote ${finalVideo}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
