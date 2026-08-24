export type SoundEffectCategory =
  | 'intro'
  | 'football'
  | 'ui'
  | 'reward'
  | 'purchase'
  | 'matchmaking'
  | 'victory'
  | 'defeat'
  | 'other';

export interface EnhancedSoundPrompt {
  category: SoundEffectCategory;
  folder: string;
  fileStem: string;
  prompt: string;
  suggestedDurationSeconds: number;
  promptInfluence: number;
}

const ELEVENLABS_TEXT_LIMIT = 450;

const CATEGORY_ALIASES: Record<string, SoundEffectCategory> = {
  intro: 'intro',
  logo: 'intro',
  splash: 'intro',
  opening: 'intro',
  football: 'football',
  soccer: 'football',
  referee: 'football',
  whistle: 'football',
  ui: 'ui',
  interface: 'ui',
  button: 'ui',
  reward: 'reward',
  progression: 'reward',
  trophy: 'victory',
  purchase: 'purchase',
  shop: 'purchase',
  matchmaking: 'matchmaking',
  matchfound: 'matchmaking',
  queue: 'matchmaking',
  victory: 'victory',
  win: 'victory',
  defeat: 'defeat',
  loss: 'defeat',
  lose: 'defeat',
  other: 'other',
};

function textHas(text: string, pattern: RegExp): boolean {
  return pattern.test(text);
}

function normalizedText(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ');
}

export function normalizeSoundCategory(category: string | undefined, description: string): SoundEffectCategory {
  const explicit = normalizedText(category ?? '').replace(/\s+/g, '');
  if (explicit && CATEGORY_ALIASES[explicit]) return CATEGORY_ALIASES[explicit];

  const text = normalizedText(description);
  if (textHas(text, /\b(matchmaking|match found|opponent found|queue pop|found match)\b/)) return 'matchmaking';
  if (textHas(text, /\b(intro|logo|splash|opening|electric impact|stinger)\b/)) return 'intro';
  if (textHas(text, /\b(whistle|referee|kickoff|kick off|football|soccer)\b/)) return 'football';
  if (textHas(text, /\b(purchase|buy|checkout|diamond purchase|store purchase)\b/)) return 'purchase';
  if (textHas(text, /\b(defeat|loss|lose|failed|failure)\b/)) return 'defeat';
  if (textHas(text, /\b(victory|win|winner|trophy win|trophy gain)\b/)) return 'victory';
  if (textHas(text, /\b(reward|diamond|collect|level up|achievement|unlock)\b/)) return 'reward';
  if (textHas(text, /\b(ui|button|tap|click|toggle|menu|notification|select)\b/)) return 'ui';
  return 'other';
}

function categoryFolder(category: SoundEffectCategory, description: string): string {
  const text = normalizedText(description);
  if (category === 'football' && textHas(text, /\b(whistle|referee)\b/)) return 'whistle';
  return category;
}

function slugify(value: string): string {
  const slug = normalizedText(value).split(/\s+/).filter(Boolean).slice(0, 6).join('_');
  return slug || 'sound_effect';
}

function fileStemFor(category: SoundEffectCategory, description: string): string {
  const text = normalizedText(description);
  if (textHas(text, /\b(whistle|referee)\b/)) return 'referee_whistle';
  if (category === 'intro' && textHas(text, /\b(electric|electricity|shock|impact|logo|stinger)\b/)) return 'intro_electric_impact';
  if (category === 'intro') return 'intro_logo_impact';
  if (category === 'purchase' && textHas(text, /\bdiamond\b/)) return 'diamond_purchase';
  if (category === 'purchase') return 'purchase_success';
  if (category === 'matchmaking') return 'matchmaking_found';
  if (textHas(text, /\b(trophy|cup)\b/) && textHas(text, /\b(win|gain|won|victory)\b/)) return 'trophy_win';
  if (textHas(text, /\b(trophy|cup)\b/) && textHas(text, /\b(loss|lose|lost|defeat)\b/)) return 'trophy_loss';
  if (category === 'victory') return 'victory_stinger';
  if (category === 'defeat') return 'defeat_stinger';
  if (category === 'reward' && textHas(text, /\bdiamond\b/)) return 'diamond_reward';
  if (category === 'reward') return 'reward_unlock';
  if (category === 'ui' && textHas(text, /\b(button|tap|click)\b/)) return 'ui_button_click';
  if (category === 'ui') return 'ui_tap';
  return slugify(description);
}

function categoryTechnicalBrief(category: SoundEffectCategory, description: string): string {
  const text = normalizedText(description);
  if (category === 'football' && textHas(text, /\b(whistle|referee)\b/)) {
    return [
      'Professional association football referee whistle, one short authoritative match-start blast produced by a real referee whistle with natural human breath pressure.',
      'Attack: immediate razor-sharp initial transient.',
      'Transient: crisp high-frequency bite without clipping.',
      'Body: realistic whistle chamber resonance, focused air pressure, natural pitch instability from a human breath.',
      'Decay: clean short tail with no second blast.',
      'Texture: close-recorded physical whistle, dry and realistic.',
      'Intensity: assertive and official, not aggressive or comedic.',
      'Realism: documentary-real football broadcast quality.',
      'Ambience: clean close recording with no stadium bed.',
    ].join(' ');
  }

  if (category === 'football') {
    return [
      'Realistic football match sound effect for a polished competitive mobile football game.',
      'Attack: clear and immediate.',
      'Transient: physically believable contact detail.',
      'Body: natural sports-field material resonance.',
      'Decay: short and clean for gameplay responsiveness.',
      'Texture: realistic Foley, not synthetic.',
      'Intensity: competitive but controlled.',
      'Realism: real-world football broadcast quality.',
      'Ambience: minimal unless explicitly requested.',
    ].join(' ');
  }

  if (category === 'intro') {
    return [
      'Premium cinematic mobile game logo impact with modern electric sports energy.',
      'Attack: fast electric charge-up into a precise logo collision.',
      'Transient: clean impactful snap with expensive high-frequency spark detail.',
      'Body: tight sub-weight and polished metallic-tech resonance.',
      'Decay: short shimmering electric tail that resolves quickly for a mobile splash screen.',
      'Texture: sleek electricity, glassy particles, controlled air movement.',
      'Intensity: confident major-game-company stinger, not oversized trailer noise.',
      'Realism: stylized but premium and physically grounded.',
      'Ambience: dry studio sound design with only subtle cinematic space.',
    ].join(' ');
  }

  if (category === 'ui') {
    return [
      'Premium responsive mobile game UI one-shot.',
      'Attack: instant tactile click in the first frames.',
      'Transient: clean soft snap that reads immediately on phone speakers.',
      'Body: tiny polished glass, rubber, or soft digital material layer.',
      'Decay: extremely short, no lingering tail.',
      'Texture: modern and satisfying, lightweight but expensive.',
      'Intensity: low-to-medium, never distracting.',
      'Realism: tactile interface Foley blended with subtle digital polish.',
      'Ambience: completely dry.',
    ].join(' ');
  }

  if (category === 'purchase') {
    return [
      'Satisfying premium diamond purchase confirmation for a polished mobile football game economy.',
      'Attack: immediate confident confirmation tick.',
      'Transient: bright crystalline detail without harshness.',
      'Body: refined gem-like shimmer plus subtle tactile cash-register-free confirmation weight.',
      'Decay: short elegant sparkle that ends cleanly.',
      'Texture: premium glass, crystal, and soft metallic polish.',
      'Intensity: rewarding but restrained.',
      'Realism: stylized premium UI reward, not casino-like.',
      'Ambience: dry close studio sound design.',
    ].join(' ');
  }

  if (category === 'matchmaking') {
    return [
      'Competitive matchmaking found alert pulse for a modern football game, suitable for repeating as a short loop of separate pulses.',
      'Attack: instant attention-grabbing beep/tick onset.',
      'Transient: sharp but rounded digital pulse that feels FACEIT-like and competitive.',
      'Body: compact electronic tone with subtle mechanical snap.',
      'Decay: very short, leaving space before the next repeated pulse.',
      'Texture: modern esports queue confirmation, premium and serious.',
      'Intensity: urgent but not alarming.',
      'Realism: clean UI sound design, no toy-like character.',
      'Ambience: dry, no reverb tail.',
    ].join(' ');
  }

  if (category === 'victory') {
    return [
      'Premium competitive mobile game trophy win sound, short celebratory one-shot.',
      'Attack: bright confident success transient.',
      'Transient: polished medal or cup glint with satisfying snap.',
      'Body: warm trophy resonance and controlled sparkle.',
      'Decay: concise uplifting tail, no long fanfare.',
      'Texture: premium metal, crystal, and subtle sports broadcast shine.',
      'Intensity: rewarding and victorious but not childish.',
      'Realism: stylized game reward with physically believable metallic detail.',
      'Ambience: subtle studio space only.',
    ].join(' ');
  }

  if (category === 'defeat') {
    return [
      'Short polished mobile game defeat or trophy loss sound.',
      'Attack: clear low-key negative transient.',
      'Transient: soft downward tick, not harsh.',
      'Body: restrained low metallic or felted digital tone.',
      'Decay: brief controlled falloff.',
      'Texture: premium and respectful, not humiliating.',
      'Intensity: low-to-medium.',
      'Realism: tactile interface Foley with subtle tonal design.',
      'Ambience: dry and minimal.',
    ].join(' ');
  }

  return [
    'Premium modern competitive mobile football game sound effect.',
    'Attack: clear and responsive.',
    'Transient: polished and readable on phone speakers.',
    'Body: focused sound-design character matching the user request.',
    'Decay: concise and gameplay-friendly.',
    'Texture: modern, satisfying, and high quality.',
    'Intensity: controlled and professional.',
    'Realism: realistic where appropriate, stylized only when useful.',
    'Ambience: minimal unless explicitly requested.',
  ].join(' ');
}

function defaultDuration(category: SoundEffectCategory, description: string): number {
  const text = normalizedText(description);
  if (category === 'football' && textHas(text, /\b(whistle|referee)\b/)) return 0.7;
  if (category === 'ui') return 0.5;
  if (category === 'matchmaking') return 0.5;
  if (category === 'purchase') return 0.9;
  if (category === 'victory' || category === 'reward') return 1.1;
  if (category === 'defeat') return 0.8;
  if (category === 'intro') return 1.4;
  return 1.0;
}

function defaultPromptInfluence(category: SoundEffectCategory): number {
  if (category === 'football') return 0.65;
  if (category === 'ui' || category === 'matchmaking') return 0.6;
  if (category === 'purchase' || category === 'reward' || category === 'victory' || category === 'defeat') return 0.5;
  if (category === 'intro') return 0.45;
  return 0.5;
}

function commonNegativeInstructions(category: SoundEffectCategory, description: string): string {
  const base = [
    'No voices.',
    'No speech.',
    'No lyrics.',
    'No copyrighted melody.',
    'No crowd unless explicitly requested.',
    'No childish cartoon boings.',
    'No cheap toy sounds.',
    'No excessive reverb.',
    'No distortion or clipping.',
    'No low-quality phone recording.',
    'No background hiss.',
    'No long music bed.',
  ];

  if (category === 'football' && textHas(normalizedText(description), /\b(whistle|referee)\b/)) {
    base.push('No second whistle.', 'No synthetic sine tone.', 'No stadium chant.', 'No drums.');
  }
  if (category === 'ui' || category === 'matchmaking') {
    base.push('No ringtone melody.', 'No long whoosh.', 'No ambience.', 'No tail longer than necessary.');
  }
  if (category === 'purchase' || category === 'reward' || category === 'victory') {
    base.push('No casino slot-machine sequence.', 'No coin shower spam.', 'No obnoxious jackpot fanfare.');
  }
  if (category === 'intro') {
    base.push('No huge trailer braam.', 'No long cinematic buildup.', 'No horror sting.', 'No muddy sub-bass.');
  }
  return base.join(' ');
}

function compactCategoryTechnicalBrief(category: SoundEffectCategory, description: string): string {
  const text = normalizedText(description);
  if (category === 'football' && textHas(text, /\b(whistle|referee)\b/)) {
    return 'Pro football referee whistle: one short real blast. Attack instant; transient sharp; body real resonance/breath; decay clean; texture dry close mic; intensity authoritative; realism broadcast; ambience none.';
  }
  if (category === 'football') {
    return 'Realistic football gameplay SFX. Attack clear; transient physical; body natural Foley; decay short; texture real; intensity competitive; realism high; ambience minimal.';
  }
  if (category === 'intro') {
    return 'Premium electric logo impact. Attack fast charge; transient crisp hit; body tight sub/metal; decay short shimmer; texture sparks/glass; intensity controlled cinematic; realism polished; ambience subtle.';
  }
  if (category === 'ui') {
    return 'Premium mobile UI one-shot. Attack instant; transient soft snap; body tiny tactile touch; decay very short; texture polished; intensity low; realism tactile; ambience dry.';
  }
  if (category === 'purchase') {
    return 'Premium diamond purchase. Attack instant tick; transient bright crystal; body gem shimmer/weight; decay short sparkle; texture glass/metal; intensity restrained; realism stylized; ambience dry.';
  }
  if (category === 'matchmaking') {
    return 'Competitive matchmaking-found pulse. Attack instant; transient rounded beep; body compact electronic snap; decay very short; texture esports; intensity urgent not alarming; realism clean UI; ambience dry.';
  }
  if (category === 'victory') {
    return 'Premium trophy win one-shot. Attack bright; transient medal glint; body warm cup resonance; decay short uplift; texture metal/crystal; intensity rewarding; realism polished; ambience subtle.';
  }
  if (category === 'defeat') {
    return 'Premium defeat/loss one-shot. Attack low tick; transient soft down snap; body restrained metal/digital tone; decay brief; texture respectful; intensity mild; realism tactile; ambience dry.';
  }
  return 'Premium mobile football SFX. Attack clear; transient polished; body focused; decay concise; texture modern; intensity controlled; realism appropriate; ambience minimal.';
}

function compactNegativeInstructions(category: SoundEffectCategory, description: string): string {
  const text = normalizedText(description);
  const negatives = ['no voices', 'no music', 'no crowd', 'no cartoon', 'no toy sound', 'no clipping', 'no reverb'];
  if (category === 'football' && textHas(text, /\b(whistle|referee)\b/)) negatives.push('no second whistle', 'no synth tone');
  if (category === 'purchase' || category === 'reward' || category === 'victory') negatives.push('no casino jackpot');
  if (category === 'intro') negatives.push('no trailer braam', 'no long buildup');
  if (category === 'ui' || category === 'matchmaking') negatives.push('no ringtone', 'no long tail');
  return negatives.join(', ');
}

function truncateText(value: string, maxChars: number): string {
  const compact = value.trim().replace(/\s+/g, ' ');
  if (compact.length <= maxChars) return compact;
  return compact.slice(0, Math.max(0, maxChars - 3)).trimEnd() + '...';
}

function punctuate(value: string): string {
  return /[.!?]$/.test(value) ? value : `${value}.`;
}

function fitElevenLabsText(prompt: string, args: {
  description: string;
  category: SoundEffectCategory;
  durationSeconds: number;
}): string {
  const compactPrompt = prompt.trim().replace(/\s+/g, ' ');
  if (compactPrompt.length <= ELEVENLABS_TEXT_LIMIT) return compactPrompt;

  const request = truncateText(args.description, 70);
  const shortPrompt = [
    `Request: ${punctuate(request)}`,
    compactCategoryTechnicalBrief(args.category, args.description),
    `Duration ${args.durationSeconds.toFixed(2)}s. Premium, modern, responsive, competitive mobile quality.`,
    `Avoid: ${compactNegativeInstructions(args.category, args.description)}.`,
  ].join(' ').replace(/\s+/g, ' ').trim();

  if (shortPrompt.length <= ELEVENLABS_TEXT_LIMIT) return shortPrompt;
  const minimalPrompt = [
    `Request: ${punctuate(truncateText(args.description, 50))}`,
    compactCategoryTechnicalBrief(args.category, args.description),
    `Duration ${args.durationSeconds.toFixed(2)}s. Premium mobile game quality.`,
    `Avoid: ${compactNegativeInstructions(args.category, args.description).split(', ').slice(0, 8).join(', ')}.`,
  ].join(' ').replace(/\s+/g, ' ').trim();
  return minimalPrompt.length <= ELEVENLABS_TEXT_LIMIT ? minimalPrompt : truncateText(minimalPrompt, ELEVENLABS_TEXT_LIMIT);
}

export function enhanceSoundPrompt(args: {
  description: string;
  category?: string;
  durationSeconds?: number;
  promptInfluence?: number;
}): EnhancedSoundPrompt {
  const description = args.description.trim();
  if (!description) throw new Error('Sound description is required.');

  const category = normalizeSoundCategory(args.category, description);
  const suggestedDurationSeconds = defaultDuration(category, description);
  const durationSeconds = args.durationSeconds ?? suggestedDurationSeconds;
  const durationPhrase = args.durationSeconds
    ? `Target duration: approximately ${durationSeconds.toFixed(2)} seconds.`
    : `Target duration: choose the optimal concise one-shot length, approximately ${durationSeconds.toFixed(2)} seconds.`;
  const prompt = [
    `User request: ${punctuate(description)}`,
    categoryTechnicalBrief(category, description),
    durationPhrase,
    'Overall brand feel: premium, modern, responsive, satisfying, competitive, polished mobile game quality, not childish, not cheap, not cartoonish unless explicitly requested.',
    `Negative instructions: ${commonNegativeInstructions(category, description)}`,
  ].join(' ');

  return {
    category,
    folder: categoryFolder(category, description),
    fileStem: fileStemFor(category, description),
    prompt: fitElevenLabsText(prompt, { description, category, durationSeconds }),
    suggestedDurationSeconds,
    promptInfluence: args.promptInfluence ?? defaultPromptInfluence(category),
  };
}
