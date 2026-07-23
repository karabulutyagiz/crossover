/* ═══════════════════════════════════════════════════════════════════
   Crossover — web istemcisi (yalnızca oyun akışı)
   Sunucu protokolü: server/src/protocol.ts (app/src/protocol.ts aynası)
   ═══════════════════════════════════════════════════════════════════ */
'use strict';

// ── yapılandırma ────────────────────────────────────────────────────
const SERVER_URL =
  new URLSearchParams(location.search).get('server') || 'wss://168-222-180-190.nip.io';
const HTTP_URL = SERVER_URL.replace(/^ws/, 'http');
const LS_USER = 'cw_userId';
const LS_NAME = 'cw_name';

// ── durum ───────────────────────────────────────────────────────────
const S = {
  phase: 'home',        // home searching lobby matchup countdown pick guess result
  profile: null,
  room: null,           // RoomView
  youId: null,
  isSolo: false,        // create_solo akışı — oda dolunca start'ı biz atarız
  soloStarted: false,
  fromSearch: false,    // find_match → 2. oyuncu gelince matchup göster
  teams: null,          // { teamA, teamB }
  pickedSelf: false,
  guessLockedBy: null,
  lastResult: null,     // son 'result' mesajı
  trophyUpdate: null,   // maç sonu kupa deltası
  readyEndsAt: 0,
  timer: null,          // { el, endsAt, total }
  searchReq: 0,
  sockInRoom: false,    // bu WS bağlantısı bir odaya girdi mi (bkz. ensureFreshSocket)
};

// ── DOM kısayolları ─────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const screens = ['home', 'searching', 'lobby', 'matchup', 'countdown', 'pick', 'guess', 'result'];

function show(phase) {
  S.phase = phase;
  for (const s of screens) $(`screen-${s}`).hidden = s !== phase;
}

// ── websocket ───────────────────────────────────────────────────────
let ws = null;
let wsReady = false;
const outbox = [];

function connect() {
  ws = new WebSocket(SERVER_URL);
  ws.onopen = () => {
    wsReady = true;
    const userId = localStorage.getItem(LS_USER);
    const name = localStorage.getItem(LS_NAME);
    const auth = userId && name ? { type: 'register', name, userId } : { type: 'guest' };
    ws.send(JSON.stringify(auth));
    // kuyruktaki oyun mesajları profil onayı gelince gönderilir (flushOutbox)
  };
  ws.onmessage = (ev) => {
    let msg;
    try { msg = JSON.parse(ev.data); } catch { return; }
    handle(msg);
  };
  ws.onclose = () => {
    wsReady = false;
    // maç ortasında koptuysa bir kez devam etmeyi dene
    if (S.room && !['home', 'result'].includes(S.phase)) {
      setTimeout(() => {
        connect();
        send({ type: 'resume_room', code: S.room.code, userId: S.youId });
      }, 900);
    } else {
      setTimeout(connect, 1200);
    }
  };
  ws.onerror = () => { try { ws.close(); } catch {} };
}

// Sekme geri görünür olduğunda soket kopmuşsa hemen bağlan (tıklama beklemesin)
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && (!ws || ws.readyState === WebSocket.CLOSED)) connect();
});

function send(msg) {
  if (wsReady && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  else outbox.push(msg);
}

function flushOutbox() {
  while (outbox.length && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(outbox.shift()));
}

// Sunucu, odaya girmiş bir soketin sonraki create/find/join mesajlarını ESKİ
// odaya yönlendirir (ws/server.ts: ctx.room.handle). Bu yüzden yeni bir oyun
// başlatmadan önce soket "kirliyse" sessizce tazelenir; mesaj kuyruğa alınır
// ve profil onayı gelince gönderilir.
function ensureFreshSocket() {
  // temiz + açık ya da temiz + zaten bağlanmakta olan soket yeterli
  if (!S.sockInRoom && ws && ((wsReady && ws.readyState === WebSocket.OPEN) || ws.readyState === WebSocket.CONNECTING)) return;
  S.sockInRoom = false;
  wsReady = false;
  if (ws) {
    ws.onclose = null; ws.onmessage = null; ws.onerror = null; ws.onopen = null;
    try { ws.close(); } catch {}
  }
  connect();
}

// ── sunucu mesajları ────────────────────────────────────────────────
function handle(msg) {
  switch (msg.type) {
    case 'profile':
    case 'name_changed':
      S.profile = msg.profile;
      localStorage.setItem(LS_USER, msg.profile.userId);
      localStorage.setItem(LS_NAME, msg.profile.displayName);
      renderHud();
      flushOutbox();
      break;

    case 'room_state': {
      S.sockInRoom = true; // bu soket artık bir odaya bağlandı
      S.room = msg.room;
      S.youId = msg.room.youId;
      const full = msg.room.players.length >= 2;
      if (msg.room.status === 'lobby') {
        if (S.isSolo && full && !S.soloStarted) {
          S.soloStarted = true;
          // eşleşme kartları rahatça okunsun diye start gecikmeli (online'daki
          // sunucu gecikmesi 3.5sn ile aynı his)
          setTimeout(() => send({ type: 'start' }), 2800);
          showMatchup();
        } else if (S.fromSearch && full) {
          showMatchup();
        } else if (!S.isSolo) {
          show('lobby');
          renderLobby();
        }
      } else if (S.phase === 'result') {
        renderScores();
      } else if (S.phase === 'pick' || S.phase === 'guess') {
        renderMatchBar();
      }
      break;
    }

    case 'searching':
      show('searching');
      break;

    case 'countdown':
      show('countdown');
      const el = $('count-num');
      el.textContent = msg.n > 0 ? String(msg.n) : 'BAŞLA!';
      el.style.fontSize = msg.n > 0 ? '' : '64px';
      el.style.animation = 'none';
      void el.offsetWidth; // animasyonu yeniden tetikle
      el.style.animation = '';
      break;

    case 'pick_phase':
      S.pickedSelf = false;
      S.teams = null;
      show('pick');
      renderMatchBar();
      $('pick-search').value = '';
      $('pick-results').innerHTML = '';
      $('pick-done').hidden = true;
      $('pick-form-area').hidden = false;
      startTimer($('pick-timer'), msg.endsAt);
      // mobildeki gibi: seçici açılır açılmaz popüler takımlar gelsin
      S.searchReq += 1;
      send({ type: 'search_clubs', reqId: String(S.searchReq), q: '' });
      setTimeout(() => $('pick-search').focus(), 120);
      break;

    case 'team_picked':
      if (msg.playerId === S.youId) S.pickedSelf = true;
      break;

    case 'reveal_teams':
      S.teams = { teamA: msg.teamA, teamB: msg.teamB };
      renderTeams();
      show('guess');
      renderMatchBar();
      stopTimer();
      $('guess-form').hidden = true;   // reveal aşaması — giriş henüz kapalı
      $('guess-locked').hidden = true;
      break;

    case 'guess_phase':
      S.guessLockedBy = null;
      show('guess');
      $('guess-form').hidden = false;
      $('guess-locked').hidden = true;
      $('guess-input').value = '';
      $('guess-input').disabled = false;
      $('btn-guess').disabled = false;
      startTimer($('guess-timer'), msg.endsAt);
      setTimeout(() => $('guess-input').focus(), 120);
      break;

    case 'guess_locked':
      S.guessLockedBy = msg.byId;
      if (msg.byId !== S.youId) {
        $('guess-form').hidden = true;
        $('guess-locked').hidden = false;
        $('guess-locked-text').textContent = `${msg.byName} cevaplıyor…`;
      } else {
        $('guess-input').disabled = true;
        $('btn-guess').disabled = true;
      }
      break;

    case 'pass_locked':
      if (msg.byId !== S.youId) toast(`${msg.byName} pas geçti`, false);
      else {
        $('guess-form').hidden = true;
        $('guess-locked').hidden = false;
        $('guess-locked-text').textContent = 'Pas geçtin — rakip bekleniyor…';
      }
      break;

    case 'result':
      stopTimer();
      S.lastResult = msg;
      renderResult(msg);
      show('result');
      break;

    case 'waiting_ready':
      $('result-next').hidden = false;
      break;

    case 'ready_countdown':
      S.readyEndsAt = msg.endsAt;
      $('result-next').hidden = false;
      tickReadyBadge();
      break;

    case 'player_ready':
      if (msg.playerId !== S.youId) $('ready-opp').hidden = false;
      break;

    case 'trophy_update':
      S.trophyUpdate = msg;
      if (S.profile) {
        S.profile.trophies = msg.trophies;
        if (msg.diamonds != null) S.profile.diamonds = msg.diamonds;
        S.profile.arena = msg.arena;
        renderHud();
      }
      renderTrophyDelta();
      break;

    case 'rematch_requested':
      openModal('TEKRAR OYNA?', `${msg.byName} tekrar oynamak istiyor.`, [
        { label: 'KABUL ET', kind: 'primary', fn: () => send({ type: 'rematch_response', accept: true }) },
        { label: 'REDDET', kind: 'ghost', fn: () => { send({ type: 'rematch_response', accept: false }); goHome(); } },
      ]);
      break;

    case 'rematch_waiting':
      $('btn-rematch').querySelector('.btn-label').textContent = 'BEKLENİYOR…';
      break;

    case 'rematch_declined':
      toast('Rakip tekrar oynamak istemedi');
      goHome();
      break;

    case 'opponent_left':
      closeModal();
      if (msg.forfeit) {
        openModal('RAKİP AYRILDI', 'Rakibin maçtan ayrıldı — hükmen kazandın! 🏆', [
          { label: 'ANA MENÜ', kind: 'primary', fn: goHome },
        ]);
      } else {
        toast('Rakip ayrıldı');
        goHome();
      }
      break;

    case 'club_results': {
      if (String(msg.reqId) !== String(S.searchReq)) break; // bayat sonuç
      const box = $('pick-results');
      box.innerHTML = '';
      msg.clubs.forEach((c, i) => {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'club-tile';
        b.style.animationDelay = `${Math.min(i * 0.03, 0.3)}s`;
        const img = document.createElement('img');
        img.alt = '';
        setCrest(img, c.logoUrl, c.name);
        const nm = document.createElement('span');
        nm.className = 'ct-name';
        nm.textContent = c.name;
        b.append(img, nm);
        b.onclick = () => {
          send({ type: 'pick_team', clubId: c.id });
          S.pickedSelf = true;
          $('pick-form-area').hidden = true;
          $('pick-done').hidden = false;
          setCrest($('pick-done-logo'), c.logoUrl, c.name);
          $('pick-done-name').textContent = c.name;
        };
        box.appendChild(b);
      });
      break;
    }

    case 'error':
      toast(msg.message);
      if (S.phase === 'searching') show('home');
      break;

    // oyun-dışı mesajlar (arkadaş/DM/mağaza) web'de sessizce yok sayılır
    default:
      break;
  }
}

// ── HUD ─────────────────────────────────────────────────────────────
function renderHud() {
  const p = S.profile;
  if (!p) return;
  $('hud-name').textContent = p.displayName;
  $('hud-trophies').textContent = p.trophies;
  $('hud-diamonds').textContent = p.diamonds;
  // p.avatar 'classic' gibi URL olmayan bir anahtar olabilir — asla src yapma
  const src = playerAvatarSrc({ avatar: p.avatar }) ?? avatarKeySrc(p.selectedAvatar);
  setAvatar($('hud-avatar-img'), $('hud-avatar-fallback'), src);
}

function avatarKeySrc(key) {
  return key && /^pp\d+$/.test(key) ? `assets/avatars/${key}.png` : null;
}

// Armasız / yüklenemeyen kulüpler için baş harfli rozet — hiçbir arma boş kalmaz.
function crestFallback(name) {
  const ch = ((name || '?').trim().charAt(0) || '?').toUpperCase();
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><circle cx="48" cy="48" r="44" fill="#14204A" stroke="#33437E" stroke-width="5"/><text x="48" y="63" font-family="Arial,Helvetica,sans-serif" font-size="44" font-weight="bold" text-anchor="middle" fill="#98A4CE">${ch}</text></svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

function setCrest(img, url, name) {
  img.onerror = () => { img.onerror = null; img.src = crestFallback(name); };
  img.style.visibility = '';
  img.src = url || crestFallback(name);
}

function setAvatar(imgEl, fallbackEl, src) {
  if (src) {
    imgEl.src = src;
    imgEl.hidden = false;
    if (fallbackEl) fallbackEl.style.display = 'none';
    imgEl.onerror = () => { imgEl.hidden = true; if (fallbackEl) fallbackEl.style.display = ''; };
  } else {
    imgEl.hidden = true;
    if (fallbackEl) fallbackEl.style.display = '';
  }
}

// ── lobi ────────────────────────────────────────────────────────────
function playerAvatarSrc(p) {
  if (!p?.avatar) return null;
  return /^https?:/.test(p.avatar) ? p.avatar : avatarKeySrc(p.avatar);
}

function avatarHtmlInto(holder, p) {
  holder.innerHTML = '';
  const src = playerAvatarSrc(p);
  if (src) {
    const img = document.createElement('img');
    img.src = src;
    img.onerror = () => { img.remove(); holder.textContent = '👤'; };
    holder.appendChild(img);
  } else {
    holder.textContent = p ? '👤' : '·';
  }
}

function renderLobby() {
  const room = S.room;
  // kod — 6 ayrı harf karosu
  const codeBox = $('lobby-code');
  codeBox.innerHTML = '';
  for (const ch of room.code) {
    const t = document.createElement('span');
    t.className = 'code-tile';
    t.textContent = ch;
    codeBox.appendChild(t);
  }
  // oyuncular — avatarlı satırlar
  const box = $('lobby-players');
  box.innerHTML = '';
  for (const p of room.players) {
    const d = document.createElement('div');
    d.className = 'lobby-player';
    d.innerHTML = `<span class="p-ava"></span><span class="p-name"></span>`;
    avatarHtmlInto(d.querySelector('.p-ava'), p);
    d.querySelector('.p-name').textContent = p.name;
    if (p.id === S.youId) {
      const chip = document.createElement('span');
      chip.className = 'p-you';
      chip.textContent = 'SEN';
      d.appendChild(chip);
    }
    box.appendChild(d);
  }
  if (room.players.length < 2) {
    const d = document.createElement('div');
    d.className = 'lobby-player empty';
    d.innerHTML = `<span class="p-ava">·</span><span>Rakip bekleniyor…</span>`;
    box.appendChild(d);
  }
  const you = room.players.find((p) => p.id === S.youId);
  const canStart = you?.isHost && room.players.length >= 2;
  $('btn-start').hidden = !canStart;
  $('lobby-wait').hidden = room.players.length >= 2;
}

// ── maç üst barı (mobildeki PlayerBar aynası) ───────────────────────
function renderMatchBar() {
  const ps = S.room?.players ?? [];
  const you = ps.find((p) => p.id === S.youId);
  const opp = ps.find((p) => p.id !== S.youId);
  for (const holderId of ['pick-matchbar', 'guess-matchbar']) {
    const bar = $(holderId);
    bar.innerHTML = `
      <button class="exit-btn" type="button" title="Maçtan ayrıl">✕</button>
      <div class="mb-panel">
        <div class="mb-side you"><span class="mb-ava"></span><span class="mb-name"></span></div>
        <div class="mb-score"><span class="s-you"></span><span class="s-dash">–</span><span class="s-opp"></span></div>
        <div class="mb-side opp"><span class="mb-ava"></span><span class="mb-name"></span></div>
      </div>`;
    bar.querySelector('.exit-btn').onclick = confirmLeave;
    const sideYou = bar.querySelector('.mb-side.you');
    const sideOpp = bar.querySelector('.mb-side.opp');
    avatarHtmlInto(sideYou.querySelector('.mb-ava'), you);
    avatarHtmlInto(sideOpp.querySelector('.mb-ava'), opp);
    sideYou.querySelector('.mb-name').textContent = you?.name ?? 'Sen';
    sideOpp.querySelector('.mb-name').textContent = opp?.name ?? 'Rakip';
    bar.querySelector('.s-you').textContent = you?.score ?? 0;
    bar.querySelector('.s-opp').textContent = opp?.score ?? 0;
  }
}

function confirmLeave() {
  const hasBot = S.room?.players.some((p) => p.name === 'Bot');
  if (hasBot) { goHome(); return; }
  openModal('MAÇTAN AYRIL', 'Şimdi ayrılırsan hükmen yenik sayılırsın. Emin misin?', [
    { label: 'AYRIL', kind: 'danger', fn: goHome },
    { label: 'VAZGEÇ', kind: 'ghost', fn: () => {} },
  ]);
}

// ── matchup ─────────────────────────────────────────────────────────
function showMatchup() {
  const room = S.room;
  const you = room.players.find((p) => p.id === S.youId);
  const opp = room.players.find((p) => p.id !== S.youId);
  fillDuel('you', you);
  fillDuel('opp', opp);
  show('matchup');
}

function fillDuel(side, p) {
  $(`mu-${side}-name`).textContent = p?.name ?? '—';
  $(`mu-${side}-trophy`).textContent = `🏆 ${p?.trophies ?? 0}`;
  const holder = $(`mu-${side}-avatar`);
  holder.innerHTML = '';
  const src = p?.avatar && /^https?:/.test(p.avatar) ? p.avatar : avatarKeySrc(p?.avatar);
  if (src) {
    const img = document.createElement('img');
    img.src = src;
    img.onerror = () => { img.remove(); };
    holder.appendChild(img);
  }
}

// ── takımlar + tahmin ───────────────────────────────────────────────
function renderTeams() {
  const { teamA, teamB } = S.teams;
  setCrest($('teamA-logo'), teamA.logoUrl, teamA.name);
  $('teamA-name').textContent = teamA.name;
  setCrest($('teamB-logo'), teamB.logoUrl, teamB.name);
  $('teamB-name').textContent = teamB.name;
}

// ── sonuç ───────────────────────────────────────────────────────────
function renderResult(msg) {
  const r = msg.result;
  const youWon = r.answeredById === S.youId && r.correct;
  const oppAnswered = r.answeredById && r.answeredById !== S.youId;

  const ribbon = $('result-ribbon');
  ribbon.classList.remove('win', 'lose', 'neutral');
  if (r.correct) {
    ribbon.textContent = youWon ? 'DOĞRU! ✓' : 'RAKİP BİLDİ';
    ribbon.classList.add(youWon ? 'win' : 'lose');
  } else if (['timeout', 'no_common', 'same_team', 'passed'].includes(r.reason)) {
    ribbon.textContent = { timeout: 'SÜRE DOLDU', no_common: 'ORTAK OYUNCU YOK', same_team: 'AYNI TAKIM', passed: 'İKİ TARAF DA PAS' }[r.reason];
    ribbon.classList.add('neutral');
  } else {
    ribbon.textContent = oppAnswered ? 'RAKİP YANILDI' : 'YANLIŞ ✗';
    ribbon.classList.add(oppAnswered ? 'win' : 'lose');
  }

  // özet satırı
  const sum = $('result-summary');
  if (r.guess) {
    const who = r.answeredById === S.youId ? 'Senin cevabın' : `${r.answeredByName ?? 'Rakip'} yazdı`;
    sum.innerHTML = `${who}: <b></b>${r.autocorrected ? ' <span style="color:var(--muted)">(otomatik düzeltildi)</span>' : ''}`;
    sum.querySelector('b').textContent = `“${r.guess}”`;
  } else {
    sum.textContent = `${r.teamA.name} × ${r.teamB.name}`;
  }

  // doğru cevap: oyuncu + dönemler
  const pl = $('result-player');
  if (r.correct && r.matchedPlayerName) {
    pl.hidden = false;
    const photo = $('result-player-photo');
    photo.innerHTML = '';
    const pimg = document.createElement('img');
    setCrest(pimg, r.matchedPlayerImageUrl, r.matchedPlayerName);
    photo.appendChild(pimg);
    $('result-player-name').textContent = r.matchedPlayerName;
    const spells = $('result-spells');
    spells.innerHTML = '';
    for (const sp of [...r.spellsA, ...r.spellsB]) {
      const chip = document.createElement('div');
      chip.className = 'spell-chip';
      const years = sp.startYear ? `${sp.startYear}–${sp.endYear ?? '…'}` : '';
      const cimg = document.createElement('img');
      setCrest(cimg, sp.logoUrl, sp.clubName);
      const txt = document.createElement('span');
      txt.textContent = `${sp.clubName} ${years}`;
      chip.append(cimg, txt);
      spells.appendChild(chip);
    }
  } else {
    pl.hidden = true;
  }

  // kaçırılan turda cevap anahtarı
  const common = $('result-common');
  if (!r.correct && r.commonPlayers?.length) {
    common.hidden = false;
    const list = $('result-common-list');
    list.innerHTML = '';
    for (const cp of r.commonPlayers.slice(0, 5)) {
      const d = document.createElement('div');
      d.className = 'common-p';
      d.innerHTML = `<div class="cp-photo"></div><div class="cp-name"></div>`;
      const cimg = document.createElement('img');
      setCrest(cimg, cp.imageUrl, cp.name);
      d.querySelector('.cp-photo').appendChild(cimg);
      d.querySelector('.cp-name').textContent = cp.name;
      list.appendChild(d);
    }
  } else {
    common.hidden = true;
  }

  renderScores(msg.players);

  // sıradaki adım: hazır düğmesi ya da maç sonu
  $('ready-opp').hidden = true;
  $('btn-rematch').querySelector('.btn-label').textContent = 'TEKRAR OYNA';
  if (msg.matchOver) {
    $('result-next').hidden = true;
    $('result-over').hidden = false;
    const won = msg.winnerId === S.youId;
    $('over-trophy').src = won ? 'assets/trophy-win.png' : 'assets/trophy-loss.png';
    $('over-title').textContent = won ? 'MAÇI KAZANDIN!' : 'MAÇI KAYBETTİN';
    renderTrophyDelta();
    if (won) confetti();
  } else {
    $('result-over').hidden = true;
    $('result-next').hidden = true; // waiting_ready/ready_countdown gelince açılır
    $('btn-ready').disabled = false;
    $('btn-ready').querySelector('.btn-label').textContent = 'HAZIR';
  }
}

function renderScores(players) {
  const ps = players ?? S.room?.players ?? [];
  const you = ps.find((p) => p.id === S.youId);
  const opp = ps.find((p) => p.id !== S.youId);
  $('score-you-name').textContent = you ? `${you.name} (sen)` : 'Sen';
  $('score-opp-name').textContent = opp?.name ?? 'Rakip';
  $('score-you').textContent = you?.score ?? 0;
  $('score-opp').textContent = opp?.score ?? 0;
}

function renderTrophyDelta() {
  const t = S.trophyUpdate;
  const el = $('over-delta');
  if (!t || $('result-over').hidden) { el.hidden = true; return; }
  el.hidden = false;
  el.classList.toggle('up', t.delta >= 0);
  el.classList.toggle('down', t.delta < 0);
  el.textContent = `🏆 ${t.delta >= 0 ? '+' : ''}${t.delta}  ·  ${t.arena.name}` +
    (t.arenaReward ? `  ·  +${t.arenaReward} 💎` : '');
}

function tickReadyBadge() {
  const badge = $('ready-badge');
  const step = () => {
    if (S.phase !== 'result' || !S.readyEndsAt) return;
    const left = Math.max(0, Math.ceil((S.readyEndsAt - Date.now()) / 1000));
    badge.textContent = left;
    if (left > 0) requestAnimationFrame(step);
  };
  step();
}

// ── süre çubuğu ─────────────────────────────────────────────────────
function startTimer(el, endsAt) {
  stopTimer();
  const total = endsAt - Date.now();
  S.timer = { el, endsAt, total };
  const step = () => {
    if (!S.timer || S.timer.el !== el) return;
    const left = Math.max(0, endsAt - Date.now());
    const f = total > 0 ? left / total : 0;
    el.style.transform = `scaleX(${f})`;
    el.classList.toggle('low', f < 0.25);
    if (left > 0) requestAnimationFrame(step);
  };
  step();
}

function stopTimer() { S.timer = null; }

// ── eylemler ────────────────────────────────────────────────────────
function playerName() { return S.profile?.displayName ?? 'Oyuncu'; }
function uid() { return S.profile?.userId ?? undefined; }

function resetMatchState() {
  S.room = null; S.teams = null; S.lastResult = null; S.trophyUpdate = null;
  S.isSolo = false; S.soloStarted = false; S.fromSearch = false;
  S.guessLockedBy = null; S.readyEndsAt = 0;
  stopTimer();
}

function goHome() {
  closeModal();
  resetMatchState();
  show('home');
  renderHud();
  // soketi ŞİMDİ tazele ki ana ekrandaki ilk tıklama beklemesin
  ensureFreshSocket();
}

function showSearching(title, sub) {
  $('search-title').textContent = title;
  $('search-sub').textContent = sub;
  show('searching');
}

$('btn-quick').onclick = () => {
  resetMatchState();
  showSearching('RAKİP ARANIYOR', 'Kupana yakın bir rakip eşleştiriliyor');
  ensureFreshSocket();
  S.fromSearch = true;
  send({ type: 'find_match', name: playerName(), userId: uid(), options: { mode: 'team-team' } });
};

$('btn-cancel-search').onclick = () => goHome();

let botDiff = 'medium';
$('bot-diff').addEventListener('click', (e) => {
  const b = e.target.closest('.seg-opt');
  if (!b) return;
  botDiff = b.dataset.diff;
  for (const o of $('bot-diff').children) o.classList.toggle('active', o === b);
});

$('btn-solo').onclick = () => {
  resetMatchState();
  showSearching('MAÇ HAZIRLANIYOR', 'Bot rakip sahaya çağırılıyor');
  ensureFreshSocket();
  S.isSolo = true;
  send({ type: 'create_solo', name: playerName(), userId: uid(), options: { difficulty: botDiff, mode: 'team-team' } });
};

$('btn-create').onclick = () => {
  resetMatchState();
  showSearching('ODA KURULUYOR', 'Oda kodun birazdan hazır');
  ensureFreshSocket();
  send({ type: 'create_room', name: playerName(), userId: uid(), options: { mode: 'team-team' } });
};

const joinInput = $('join-code');
joinInput.addEventListener('input', () => {
  joinInput.value = joinInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6);
  $('btn-join').disabled = joinInput.value.length !== 6;
});
joinInput.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !$('btn-join').disabled) $('btn-join').click(); });
$('btn-join').onclick = () => {
  const code = joinInput.value;
  resetMatchState();
  showSearching('ODAYA KATILINIYOR', `Oda: ${code}`);
  ensureFreshSocket();
  send({ type: 'join_room', code, name: playerName(), userId: uid() });
  joinInput.value = '';
  $('btn-join').disabled = true;
};

async function copyRoomCode() {
  try {
    await navigator.clipboard.writeText(S.room?.code ?? '');
    const label = $('copy-label');
    label.textContent = 'KOPYALANDI ✓';
    setTimeout(() => { label.textContent = 'KODU KOPYALA'; }, 1600);
  } catch {}
}
$('lobby-code').onclick = copyRoomCode;
$('btn-copy').onclick = copyRoomCode;
$('btn-start').onclick = () => send({ type: 'start' });
$('btn-leave-lobby').onclick = () => goHome();

// takım arama — mobildeki gibi her tuşta (boş dahil: boş sorgu = popüler
// takımlar), 140ms debounce + reqId ile bayat sonuç ayıklama
let searchT = null;
$('pick-search').addEventListener('input', () => {
  clearTimeout(searchT);
  const q = $('pick-search').value.trim();
  searchT = setTimeout(() => {
    S.searchReq += 1;
    send({ type: 'search_clubs', reqId: String(S.searchReq), q });
  }, 140);
});

function submitGuess() {
  const text = $('guess-input').value.trim();
  if (!text || S.guessLockedBy) return;
  send({ type: 'submit_guess', text });
  $('guess-input').disabled = true;
  $('btn-guess').disabled = true;
}
$('btn-guess').onclick = submitGuess;
$('guess-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') submitGuess(); });
$('btn-pass').onclick = () => send({ type: 'pass' });

$('btn-ready').onclick = () => {
  send({ type: 'ready' });
  $('btn-ready').disabled = true;
  $('btn-ready').querySelector('.btn-label').textContent = 'HAZIRSIN ✓';
};

$('btn-rematch').onclick = () => send({ type: 'play_again' });
$('btn-home').onclick = () => { goHome(); };

// ── toast + modal + konfeti ─────────────────────────────────────────
let toastT = null;
function toast(text) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastT);
  toastT = setTimeout(() => { el.hidden = true; }, 3400);
}

function openModal(title, text, actions) {
  $('modal-title').textContent = title;
  $('modal-text').textContent = text;
  const box = $('modal-actions');
  box.innerHTML = '';
  for (const a of actions) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn btn-${a.kind} btn-block`;
    b.innerHTML = `<span class="face"><span class="btn-label"></span></span>`;
    b.querySelector('.btn-label').textContent = a.label;
    b.onclick = () => { closeModal(); a.fn(); };
    box.appendChild(b);
  }
  $('modal-scrim').hidden = false;
}
function closeModal() { $('modal-scrim').hidden = true; }

function confetti() {
  const box = $('confetti');
  const colors = ['#FFCE3A', '#16B27A', '#37A8FF', '#9B6BFF', '#FF7A45', '#FFFFFF'];
  for (let i = 0; i < 90; i++) {
    const c = document.createElement('div');
    c.className = 'conf';
    c.style.left = `${Math.random() * 100}%`;
    c.style.background = colors[i % colors.length];
    c.style.animationDuration = `${2.2 + Math.random() * 1.8}s`;
    c.style.animationDelay = `${Math.random() * 0.7}s`;
    c.style.transform = `scale(${0.7 + Math.random() * 0.8})`;
    box.appendChild(c);
    setTimeout(() => c.remove(), 5200);
  }
}

// ── bakım kontrolü + açılış ─────────────────────────────────────────
fetch(`${HTTP_URL}/config`)
  .then((r) => r.json())
  .then((cfg) => {
    if (cfg.maintenance) {
      const b = $('home-banner');
      b.hidden = false;
      b.textContent = 'Bakım modundayız — kısa süre sonra tekrar dene.';
    }
  })
  .catch(() => {});

show('home');
connect();
