// English pages. A smaller set than Turkish on purpose: the club-pair archive
// targets Turkish searches, so translating 200 data tables would add duplicate
// URLs without adding a reader. Every English page here has its own reason to
// exist, and each one is paired with its Turkish counterpart via hreflang.

import {
  page,
  icons,
  ldApp,
  ldWebSite,
  ldOrganization,
  ldBreadcrumb,
  ldFaq,
} from '../lib/layout.mjs';
import {
  head,
  crumbs,
  duel,
  storeButtons,
  stats,
  cards,
  steps,
  faq,
  band,
  device,
} from '../lib/ui.mjs';

const fmt = (n) => n.toLocaleString('en-US');

const MODES = [
  {
    icon: 'users',
    title: 'Club × Club',
    body: 'The core mode. Two clubs are drawn and the first player to name someone who wore both shirts takes the round. Free.',
  },
  {
    icon: 'globe',
    title: 'Country × Club',
    body: 'A nation and a club. Name a player from that country who turned out for that club.',
    tone: 'blue',
    lock: 'Social Pack',
  },
  {
    icon: 'letter',
    title: 'Letter × Club',
    body: 'A letter and a club. The answer has to start with that letter. The hardest mode in the game.',
    tone: 'purple',
    lock: 'Social Pack',
  },
  {
    icon: 'bot',
    title: 'Bot match',
    body: 'Practice with no trophies at stake. Easy, Medium and Hard opponents.',
    tone: 'gold',
  },
  {
    icon: 'trophy',
    title: 'Ranked',
    body: 'Match against a live opponent, win trophies, climb from Local Pitch to the GOAT arena.',
  },
  {
    icon: 'spark',
    title: 'Friendlies',
    body: 'Add a friend, send an invite or share a room code. No trophies — just bragging rights.',
    tone: 'blue',
  },
];

const EN_FAQ = [
  [
    'What is CrossOver Football?',
    '<p>A real-time two-player football knowledge game. Two clubs are drawn and you race your opponent to name a footballer who played for both. Three rounds wins the match.</p>',
  ],
  [
    'Is it free?',
    '<p>Yes. Downloading and playing Club × Club is free. Optional diamond packs and a Social Pack subscription that unlocks Country × Club and Letter × Club are available.</p>',
  ],
  [
    'Is there an Android version?',
    '<p>Not yet. The game is currently on iOS only; an Android build is in preparation.</p>',
  ],
  [
    'Do loan and youth spells count?',
    '<p>They do. If the player appeared for that club, the answer is accepted — loans and academy spells are credited to the parent club.</p>',
  ],
  [
    'What happens if I misspell a name?',
    '<p>Name matching is deliberately forgiving. Accents and common misspellings are normalised, so "snayder" still resolves to Wesley Sneijder.</p>',
  ],
];

// ---------------------------------------------------------------------------
export function enHome({ totals, heroPairs }) {
  const body = `
<section class="wrap hero">
<div class="hero-grid">
<div>
<span class="eyebrow reveal">Two clubs. One shared player.</span>
<h1 class="display reveal d1">How good is your <span class="gold">football memory?</span></h1>
<p class="lede reveal d2">Two clubs are drawn. Name a footballer who wore both shirts before your opponent does and the round is yours. First to three rounds takes the match.</p>
<div class="reveal d3">
${storeButtons('en', { ev: 'hero_install_click' })}
<p class="hero-note" style="margin-top:16px;justify-content:flex-start">
<span class="chip chip-live"><span class="dot"></span> Live 1v1</span>
<span class="chip">Free</span>
<span class="chip">Bot mode</span>
</p>
</div>
</div>
<div class="hero-art">
${device('/img/screens/en-guess.webp', 'CrossOver Football guess screen: two clubs and the answer field', { eager: true })}
</div>
</div>
</section>

<section class="section-tight">
<div class="wrap">
${head({
  eyebrow: 'In five seconds',
  title: 'This is the whole game',
  lede: 'Three real rounds. Every answer below is verified against the career archive.',
})}
<div class="grid g-3">
${heroPairs
  .map(
    (d, i) => `<div class="reveal${i ? ` d${i}` : ''}">${duel({ a: d.a, b: d.b, answer: d.answer, note: d.note })}</div>`,
  )
  .join('')}
</div>
</div>
</section>

<section class="section-tight">
<div class="wrap">
${stats([
  [fmt(totals.players), 'Footballers'],
  [fmt(totals.clubs), 'Clubs'],
  [fmt(totals.spells), 'Club spells'],
  ['7', 'Arenas'],
])}
<p class="small dim center" style="margin-top:14px">Real record counts from the game’s career archive.</p>
</div>
</section>

<section class="section">
<div class="wrap">
${head({ eyebrow: 'How it works', title: 'One round, three moves' })}
${steps([
  { title: 'Pick your club', body: 'When the countdown ends, search for your club. Your opponent is choosing theirs at the same time.' },
  { title: 'Both clubs open', body: 'Your pick lines up against theirs and the clock starts running.' },
  { title: 'Name the crossover', body: 'Type a player who turned out for both. The first correct answer locks the round and opens his full career.' },
])}
<div class="center" style="margin-top:32px">
<a class="btn btn-ghost" href="/en/how-to-play/">See a full round ${icons.arrow}</a>
</div>
</div>
</section>

<section class="section">
<div class="wrap">
${head({ eyebrow: 'Game modes', title: 'Same knowledge, different questions' })}
${cards(MODES.slice(0, 3).map((m) => ({ ...m, href: '/en/game-modes/' })))}
<div class="center" style="margin-top:26px">
<a class="btn btn-ghost" href="/en/game-modes/">All six modes ${icons.arrow}</a>
</div>
</div>
</section>

<section class="section">
<div class="wrap wrap-narrow">
${head({ eyebrow: 'FAQ', title: 'Common questions' })}
${faq(EN_FAQ)}
</div>
</section>

${band('en', {
  title: 'Prove your football knowledge',
  lede: 'No setup, no account required. Open it, match up, play the first round.',
})}`;

  return page({
    lang: 'en',
    path: '/en/',
    altPath: '/',
    title: 'CrossOver Football — Name the Player Who Played for Both Clubs',
    description:
      'A real-time two-player football trivia game. Two clubs are drawn — name a footballer who played for both before your opponent does. Free on iOS.',
    body,
    ogImage: '/img/og-en.png',
    jsonld: [ldOrganization(), ldWebSite('en'), ldApp('en'), ldFaq(EN_FAQ)],
  });
}

// ---------------------------------------------------------------------------
export function enHowToPlay() {
  const body = `
${crumbs([
  ['Home', '/en/'],
  ['How to play', '/en/how-to-play/'],
])}
<section class="wrap section-tight">
${head({
  eyebrow: 'How to play',
  title: 'How a CrossOver round works',
  lede: 'The rule fits in one line: name a footballer who played for both clubs, before the other player does. Here is every stage of a round, in the real game screens.',
  tag: 'h1',
})}
</section>

<section class="section-tight">
<div class="wrap">
<div class="grid g-3">
<div class="reveal">
${device('/img/screens/en-pick.webp', 'Team pick screen with search field and club cards')}
<div style="margin-top:18px"><div class="eyebrow">01 — Pick</div><h3 style="margin:8px 0">Choose your club</h3><p class="muted small">Search and select. You cannot see your opponent’s choice yet.</p></div>
</div>
<div class="reveal d1">
${device('/img/screens/en-guess.webp', 'Guess screen with both clubs revealed and a timer')}
<div style="margin-top:18px"><div class="eyebrow">02 — Reveal</div><h3 style="margin:8px 0">Both clubs open</h3><p class="muted small">The clock starts. One job: find a name that links them.</p></div>
</div>
<div class="reveal d2">
${device('/img/screens/en-result.webp', 'Result screen showing the correct answer and full career')}
<div style="margin-top:18px"><div class="eyebrow">03 — Result</div><h3 style="margin:8px 0">The career opens</h3><p class="muted small">The first correct answer locks the round and lists the player’s clubs by year.</p></div>
</div>
</div>
</div>
</section>

<section class="section">
<div class="wrap wrap-narrow">
<div class="panel pad-lg prose reveal">
<h2 style="margin-top:0">Scoring and arenas</h2>
<p>Each round is a point and <strong>the first to three rounds wins the match.</strong> Ranked wins earn trophies; your trophy count decides which arena you play in — Local Pitch, Amateur League, Pro League, Champions League, Among Legends, World Class and finally GOAT.</p>
<h2>How answers are checked</h2>
<p>Your answer is verified on the server against the player’s recorded spells at both clubs. The check is identical for both players and the round is locked server-side, so a faster connection does not win rounds. Loan and academy spells count towards the parent club: one appearance in that shirt is enough.</p>
<h2>Passing</h2>
<p>If nothing comes to mind you can pass. Passing does not end the round — it leaves the floor to your opponent. If the clock runs out, nobody scores and a new round begins.</p>
</div>
</div>
</section>

${band('en', { title: 'Play your first round', lede: 'Warm up against a bot, then face a live opponent.' })}`;

  return page({
    lang: 'en',
    path: '/en/how-to-play/',
    altPath: '/nasil-oynanir/',
    title: 'How to Play — CrossOver Football Rules Explained',
    description:
      'Pick a club, see both clubs revealed, and name a footballer who played for both. Rounds, scoring, arenas and how answers are verified.',
    body,
    ogImage: '/img/og-en.png',
    jsonld: [
      ldBreadcrumb([
        ['Home', '/en/'],
        ['How to play', '/en/how-to-play/'],
      ]),
      ldApp('en'),
    ],
  });
}

// ---------------------------------------------------------------------------
export function enGameModes() {
  const body = `
${crumbs([
  ['Home', '/en/'],
  ['Game modes', '/en/game-modes/'],
])}
<section class="wrap section-tight">
${head({
  eyebrow: 'Game modes',
  title: 'Six ways to play',
  lead: '',
  lede: 'They all test the same knowledge from different angles. Club pairs are the warm-up; the letter mode is the exam.',
  tag: 'h1',
})}
</section>
<section class="section-tight">
<div class="wrap">
${cards(MODES)}
<p class="small dim center" style="margin-top:24px">Country × Club and Letter × Club unlock with the Social Pack and must be active for both players to match.</p>
</div>
</section>

<section class="section">
<div class="wrap">
<div class="grid g-2" style="align-items:center">
<div class="reveal">${device('/img/screens/en-arenas.webp', 'Arena screen showing the seven trophy tiers')}</div>
<div class="reveal d1">
<span class="eyebrow">Ranked</span>
<h2 style="margin:12px 0 14px">Climb from Local Pitch to GOAT</h2>
<p class="lede">Every ranked win earns trophies and pushes you towards the next arena, where opponents get sharper. Knowledge is enough at the bottom; at the top you need speed too.</p>
</div>
</div>
</div>
</section>

${band('en', { title: 'Pick a mode, take the pitch', lede: 'Club × Club is free. The rest depends on how bold you are.' })}`;

  return page({
    lang: 'en',
    path: '/en/game-modes/',
    altPath: '/oyun-modlari/',
    title: 'Game Modes — Club, Country, Letter and Bot Matches',
    description:
      'Club × Club, Country × Club, Letter × Club, bot matches, ranked play and friendlies. Every CrossOver Football mode and the seven-arena trophy ladder.',
    body,
    ogImage: '/img/og-en.png',
    jsonld: [
      ldBreadcrumb([
        ['Home', '/en/'],
        ['Game modes', '/en/game-modes/'],
      ]),
      ldApp('en'),
    ],
  });
}

// ---------------------------------------------------------------------------
export function enDownload() {
  const body = `
${crumbs([
  ['Home', '/en/'],
  ['Download', '/en/download/'],
])}
<section class="wrap section-tight">
<div class="hero-grid" style="align-items:center">
<div>
<span class="eyebrow reveal">Free download</span>
<h1 class="reveal d1" style="margin:14px 0 18px">A match takes three minutes.<br /><span class="gold">The argument lasts longer.</span></h1>
<p class="lede reveal d2">CrossOver Football is free on iOS. Download, match up, play the first round — no account needed to start.</p>
<div class="reveal d3" style="margin-top:26px">${storeButtons('en', { ev: 'download_page_click' })}</div>
<p class="muted small reveal d3" style="margin-top:18px">iOS 15.1+ · 20 languages · Contains in-app purchases</p>
</div>
<div class="hero-art">${device('/img/screens/en-result.webp', 'Result screen with the correct answer and career breakdown', { eager: true })}</div>
</div>
</section>

<section class="section-tight">
<div class="wrap wrap-narrow">
<div class="panel panel-accent is-mint pad-lg reveal">
<h2 style="font-size:1.4rem;margin-bottom:12px">When is Android coming?</h2>
<p class="muted">An Android build is in preparation but is not on Google Play yet. The button here goes live the day it ships — we are not putting up a link that leads nowhere.</p>
</div>
</div>
</section>

${band('en', { title: 'The next round is waiting', lede: 'Two clubs will open. Be first to the name.' })}`;

  return page({
    lang: 'en',
    path: '/en/download/',
    altPath: '/indir/',
    title: 'Download CrossOver Football — Free Football Trivia Game (iOS)',
    description:
      'Download CrossOver Football free on the App Store. Race live opponents or a bot to name the player who turned out for both clubs. Android coming soon.',
    body,
    ogImage: '/img/og-en.png',
    jsonld: [
      ldBreadcrumb([
        ['Home', '/en/'],
        ['Download', '/en/download/'],
      ]),
      ldApp('en'),
    ],
  });
}

// ---------------------------------------------------------------------------
export function enFaq() {
  const body = `
${crumbs([
  ['Home', '/en/'],
  ['FAQ', '/en/faq/'],
])}
<section class="wrap section-tight">
${head({ eyebrow: 'FAQ', title: 'Frequently asked questions', tag: 'h1' })}
</section>
<section class="section-tight">
<div class="wrap wrap-narrow">${faq(EN_FAQ)}</div>
</section>
${band('en', { title: 'Still stuck?', lede: 'Reach us from the support page.' })}`;

  return page({
    lang: 'en',
    path: '/en/faq/',
    altPath: '/sss/',
    title: 'FAQ | CrossOver Football',
    description:
      'Answers about CrossOver Football: rules, modes, loan and youth spells, accounts, purchases and the Android version.',
    body,
    ogImage: '/img/og-en.png',
    jsonld: [
      ldBreadcrumb([
        ['Home', '/en/'],
        ['FAQ', '/en/faq/'],
      ]),
      ldFaq(EN_FAQ),
    ],
  });
}
