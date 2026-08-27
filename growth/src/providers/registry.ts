import type { Platform } from '../core/types.ts';
import type { SocialProvider } from './types.ts';
import { xProvider } from './x.ts';
import { telegramProvider } from './telegram.ts';
import { instagramProvider } from './instagram.ts';
import { makeManualProvider } from './manual.ts';

// Provider kayıt defteri. Phase 1: X + Telegram + Instagram programatik;
// kalanlar manuel-görev provider'ı (Phase 2'de Reddit/Discord resmi API ile
// buraya eklenir — çağıran kod değişmez).

const providers: Record<Platform, SocialProvider> = {
  x: xProvider,
  telegram: telegramProvider,
  instagram: instagramProvider,
  reddit: makeManualProvider('reddit', 'Subreddit kurallarını (self-promo, flair, gün) kontrol etmeden paylaşma.'),
  discord: makeManualProvider('discord', 'Sunucu kurallarına ve kanal amacına uygunluğu kontrol et.'),
  facebook: makeManualProvider('facebook', 'Grup kurallarını kontrol et; izinsiz tanıtım yapma.'),
  youtube: makeManualProvider('youtube', 'Shorts/Community post olarak elle paylaş.'),
  tiktok: makeManualProvider('tiktok', 'Media brief\'e göre video üret ve elle paylaş.'),
  threads: makeManualProvider('threads', 'Threads hesabından elle paylaş.'),
  eksisozluk: makeManualProvider('eksisozluk', 'Bu bir ENTRY TASLAĞIDIR. Ekşi\'de otomasyon yok; başlık bağlamına uygunsa kendi hesabınla, doğal dille yaz.'),
};

export function getProvider(platform: Platform): SocialProvider {
  return providers[platform];
}

export function allProviders(): SocialProvider[] {
  return Object.values(providers);
}
