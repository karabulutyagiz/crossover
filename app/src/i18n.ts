// Lightweight i18n for the app UI.
//
// Detects the device language via expo-localization (already a dependency — no
// new native module) and looks up strings from per-language dictionaries.
// Turkish is the base; English is the fallback for any unsupported device
// language. Adding a language = add one dictionary object to `DICTS` with the
// same keys as `tr`.
//
// Server-originated text (error messages, arena names) stays as the server
// sends it for now; that needs message codes from the server to localize.
import { getLocales } from 'expo-localization';

type Params = Record<string, string | number>;

// ---- Turkish (base) ----
const tr = {
  // username
  'username.title': 'Kullanıcı Adı Oluştur',
  'username.subtitle': 'Bu ad herkese görünür ve yalnızca bir kez seçilir.',
  'username.placeholder': 'Kullanıcı adın',
  'username.create': 'Oluştur',
  'username.rules': '3-16 karakter • harf, rakam ve _',

  // login
  'login.google': 'Google ile devam et',
  'login.facebook': 'Facebook ile devam et',
  'login.hint': 'Oynamak için giriş yapmalısın. Devam ederek bir hesap oluşturulur.',
  'login.failed': 'Giriş başarısız. Tekrar dene.',

  // tabs
  'tab.store': 'Mağaza',
  'tab.collection': 'Koleksiyon',
  'tab.game': 'Oyun',
  'tab.friends': 'Arkadaşlar',

  // home
  'home.tagline': 'İki takımda da oynamış futbolcuyu ilk bilen kazanır',
  'home.register': 'Kayıt Ol',
  'home.quickMatch': 'Hemen Oyna',
  'home.createRoom': 'Oda Kur',
  'home.joinRoom': 'Odaya Katıl',
  'home.solo': 'Bot Maçı',
  'home.leaderboard': 'Lider Tablosu',
  'home.arenas': 'Arenalar',
  'home.namePlaceholder': 'Adın',
  'home.codePlaceholder': 'ODA KODU',

  // common / scope picker
  'common.noResults': 'Sonuç bulunamadı',
  'common.loading': 'Yükleniyor…',
  'common.back': 'Geri',
  'getReadyWait': 'Hazır ol…',
  'scope.all': 'Tüm takımlar',
  'scope.pickLeagueRow': 'Lig seç ›',
  'scope.pickCountryRow': 'Ülke seç ›',
  'scope.pickLeague': 'Lig seç',
  'scope.pickCountry': 'Ülke seç',
  'scope.searchLeague': 'Lig ara...',
  'scope.searchCountry': 'Ülke ara...',
  'friends.add': 'Arkadaş Ekle',
  'career.played': 'oynadı',
  'career.notPlayed': 'oynamadı',

  // lobby
  'lobby.title': 'Lobi',
  'lobby.code': 'ODA KODU',
  'lobby.shareCode': 'Arkadaşına bu kodu gönder',
  'lobby.waiting': 'Rakip bekleniyor…',
  'lobby.start': 'Başlat',
  'lobby.youSuffix': ' (sen)',
  'lobby.host': 'Kurucu',
  'lobby.botMatch': 'Bot Maçı',
  'lobby.waitHost': 'Oda sahibinin başlatması bekleniyor…',

  // game modes
  'mode.teamTeam': 'Takım-Takım',
  'mode.countryTeam': 'Ülke-Takım',
  'mode.letterTeam': 'Harf-Takım',
  'mode.select': 'Mod Seç',

  // countdown / pick
  'pick.title': 'Bir takım seç',
  'pick.titleCountry': 'Bir ülke seç',
  'pick.titleLetter': 'Bir harf seç',
  'pick.search': 'Takım ara (ör. Galatasaray)',
  'pick.searchCountry': 'Ülke ara...',
  'pick.picked': 'Seçimin yapıldı. Rakip bekleniyor…',
  'getReady': 'Hazır ol!',

  // guess
  'guess.title': 'Ortak oyuncu kim?',
  'guess.titleCountry': '{country} ülkesinden {team} takımında oynamış oyuncu kim?',
  'guess.titleLetter': '{letter} harfiyle başlayan {team} takımında oynamış oyuncu kim?',
  'guess.placeholder': 'Futbolcu adı',
  'guess.send': 'Gönder',
  'guess.pass': 'Pas',
  'guess.youPassed': 'Pas geçtin — rakip bekleniyor…',
  'guess.oppPassed': 'Rakip pas geçti — sen de pas geçersen el atlanır',
  'guess.locked': '{name} cevaplıyor…',
  'guess.youAnswered': 'Cevabın gönderildi',
  'guess.waiting': 'Rakip cevaplıyor…',

  // result
  'result.correct': 'DOĞRU',
  'result.wrong': 'YANLIŞ',
  'result.timeUp': 'Süre doldu',
  'result.roundSkipped': 'TUR ATLANDI',
  'result.noCommon': 'Her iki takımda da oynamış oyuncu yok — kimseye puan yok',
  'result.sameTeam': 'İki taraf da aynı takımı seçtiği için bu tur pas geçildi',
  'result.passed': 'İki taraf da pas geçti — kimseye puan yok',
  'result.autocorrected': 'otomatik düzeltildi',
  'result.youWon': 'MAÇI KAZANDIN!',
  'result.youLost': 'MAÇI KAYBETTİN',
  'result.winnerTook': '{name} kazandı',
  'result.career': 'KARİYER',
  'result.commonPlayers': 'HER İKİ TAKIMDA DA OYNAMIŞ OYUNCULAR',
  'result.commonPlayersCountry': '{country} ÜLKESİNDEN {team} TAKIMINDA OYNAMIŞ OYUNCULAR',
  'result.commonPlayersLetter': '{letter} HARFİYLE BAŞLAYAN {team} TAKIMINDA OYNAMIŞ OYUNCULAR',
  'result.otherCommon': 'DİĞER ORTAK OYUNCULAR',
  'result.otherCommonCountry': 'DİĞER {country} ÜLKELİ OYUNCULAR',
  'result.otherCommonLetter': 'DİĞER {letter} HARFLİ OYUNCULAR',
  'result.noCommonFound': 'Her iki takımda da oynamış oyuncu bulunamadı',
  'result.noCommonFoundCountry': 'Bu ülkeden bu takımda oynamış oyuncu bulunamadı',
  'result.noCommonFoundLetter': 'Bu harfle başlayan bu takımda oynamış oyuncu bulunamadı',
  'result.noCommonCountry': 'Bu ülkeden bu takımda oynamış oyuncu yok — kimseye puan yok',
  'result.noCommonLetter': 'Bu harfle başlayan bu takımda oynamış oyuncu yok — kimseye puan yok',
  'copied': 'Kopyalandı',
  'result.nextRound': 'Sıradaki tur başlıyor…',
  'result.ready': 'Hazır',
  'result.readyWaiting': 'Hazırsın! Rakip bekleniyor…',
  'result.playAgain': 'Tekrar Oyna',
  'result.rematchWaiting': 'İstek gönderildi, kabul bekleniyor…',
  'result.rematchIncoming': '{name} tekrar oynamak istiyor',
  'result.accept': 'Kabul Et',
  'result.decline': 'Reddet',
  'result.rematchDeclined': 'Tekrar oynama isteğin reddedildi',
  'result.tryAgain': 'Tekrar Dene',
  'result.leave': 'Çık',

  // searching
  'searching.title': 'Çevrimiçi rakip aranıyor…',
  'searching.cancel': 'Vazgeç',
  'ready.label': 'Hazır',
  'ready.labelSecs': 'Hazır ({secs})',
  'store.changeNameConfirm': 'Değiştir',

  // menu
  'menu.title': 'Menü',
  'menu.matchHistory': 'Müsabaka Geçmişi',
  'menu.leaderboard': 'Lider Tablosu',

  // settings
  'settings.title': 'Ayarlar',
  'settings.language': 'Dil',
  'settings.changeLangConfirm': 'Dil ayarlarını değiştirmek istediğine emin misin?',
  'settings.cancel': 'İptal',
  'settings.confirm': 'Tamam',

  // match history
  'matchHistory.title': 'Müsabaka Geçmişi',
  'matchHistory.empty': 'Henüz müsabaka yok',
  'matchHistory.won': 'GALİBİYET',
  'matchHistory.lost': 'MAĞLUBİYET',

  // leaderboard
  'leaderboard.title': 'Lider Tablosu',
  'leaderboard.back': 'Geri',
  'leaderboard.empty': 'Henüz sıralama yok',

  // store
  'store.title': 'Mağaza',
  'store.freeDiamonds': 'ÜCRETSİZ ELMAS',
  'store.watchAd': 'Video İzle, Elmas Kazan',
  'store.adsDaily': 'Her gün 2 video hakkı',
  'store.watch': 'İzle',
  'store.done': 'Tamamlandı',
  'store.packs': 'ELMAS PAKETLERİ',
  'store.popular': 'EN POPÜLER',
  'store.diamonds': '{n} Elmas',
  'store.emotes': 'İFADELER',
  'store.owned': 'Sahipsin',
  'store.other': 'DİĞER',
  'store.changeName': 'İsim Değiştir',
  'store.changeNameDesc': '100 elmas karşılığında ismini değiştir',
  'store.changeNameInsufficient': 'Yetersiz elmas! Mağazadan elmas satın alabilirsin.',
  'store.cost': 'Maliyet:',
  'store.balance': 'Bakiye:',
  'store.adReward': '+25 💎',
  'store.cancel': 'Vazgeç',
  'store.confirm': 'Onayla',
  'store.newName': 'Yeni isim',

  // arenas
  'arenas.title': 'Arenalar',
  'arenas.back': 'Geri',
  'arenas.current': 'ŞU AN',

  // friends
  'friends.title': 'Arkadaşlar',
  'friends.addSection': 'ARKADAŞ EKLE',
  'friends.yourCode': 'Senin Kodun',
  'friends.friendCode': 'Arkadaş Kodu',
  'friends.enterCode': 'Kodu gir',
  'friends.myFriends': 'ARKADAŞLARIM',
  'friends.empty': 'Henüz arkadaşın yok',
  'friends.shareHint': 'Kodunu paylaşarak arkadaş ekle',
  'friends.inviteDeclined': 'Davetin reddedildi',
  'friends.added': 'Arkadaş eklendi! ✓',
  'friends.loginFirst': 'Önce giriş yap',
  'friends.remove': 'Çıkar',

  // emote picker
  'emote.send': 'İfade Gönder',
  'emote.moreInStore': "Daha fazla ifade için Mağaza'ya göz at",

  // emote phrases (free)
  'emote.congrats': 'Tebrikler!',
  'emote.luck': 'Bol şanslar!',
  'emote.gg': 'İyi oyundu!',
  'emote.bringIt': 'Hadi bakalım!',
  'emote.gotcha': 'Yakaladım!',
  'emote.thanks': 'Teşekkürler!',
  'emote.quickChat': 'Hızlı Mesaj',
  'emote.faces': 'İfadeler',
  'emote.face.smile': 'Keyifli!',
  'emote.face.cry': 'Çok yazık...',
  'emote.face.angry': 'Hadi ama!',
  'emote.face.ok': 'Tamamdır!',
  // emote phrases (premium)
  'emote.jersey10.phrase': 'Şampiyonluk!',
  'emote.goal.phrase': 'Süper Gol!',
  'emote.champion.phrase': 'Şampiyon!',
  // emote store names/descriptions
  'emote.jersey10.name': 'Forma Kaldırma',
  'emote.jersey10.desc': 'Mavili-kırmızılı formayı gururla havaya kaldır',
  'emote.goal.name': 'Gol Sevinci',
  'emote.goal.desc': 'Topu fileye gönder, coş!',
  'emote.champion.name': 'Kupa Şenliği',
  'emote.champion.desc': 'Kupayı kaldır, zaferi kutla',

  // connection errors (client-side)
  'error.connect': 'Sunucuya bağlanılamadı',
  'error.disconnected': 'Bağlantı koptu',
  'error.opponentLeft': 'Rakip ayrıldı',
};

// ---- English (fallback) ----
const en: typeof tr = {
  'username.title': 'Create Username',
  'username.subtitle': 'This name is public and chosen only once.',
  'username.placeholder': 'Your username',
  'username.create': 'Create',
  'username.rules': '3-16 chars • letters, digits and _',

  'login.google': 'Continue with Google',
  'login.facebook': 'Continue with Facebook',
  'login.hint': 'You must sign in to play. By continuing, an account is created.',
  'login.failed': 'Sign-in failed. Please try again.',

  'tab.store': 'Store',
  'tab.collection': 'Collection',
  'tab.game': 'Play',
  'tab.friends': 'Friends',

  'home.tagline': 'First to name a player who played for both clubs wins',
  'home.register': 'Register',
  'home.quickMatch': 'Play Now',
  'home.createRoom': 'Create Room',
  'home.joinRoom': 'Join Room',
  'home.solo': 'Play vs Bot',
  'home.leaderboard': 'Leaderboard',
  'home.arenas': 'Arenas',
  'home.namePlaceholder': 'Your name',
  'home.codePlaceholder': 'ROOM CODE',

  'common.noResults': 'No results found',
  'common.loading': 'Loading…',
  'common.back': 'Back',
  'getReadyWait': 'Get ready…',
  'scope.all': 'All teams',
  'scope.pickLeagueRow': 'Pick a league ›',
  'scope.pickCountryRow': 'Pick a country ›',
  'scope.pickLeague': 'Pick a league',
  'scope.pickCountry': 'Pick a country',
  'scope.searchLeague': 'Search league...',
  'scope.searchCountry': 'Search country...',
  'friends.add': 'Add Friend',
  'career.played': 'played',
  'career.notPlayed': 'did not play',

  'lobby.title': 'Lobby',
  'lobby.code': 'ROOM CODE',
  'lobby.shareCode': 'Send this code to your friend',
  'lobby.waiting': 'Waiting for opponent…',
  'lobby.start': 'Start',
  'lobby.youSuffix': ' (you)',
  'lobby.host': 'Host',
  'lobby.botMatch': 'Bot Match',
  'lobby.waitHost': 'Waiting for the host to start…',

  'mode.teamTeam': 'Team-Team',
  'mode.countryTeam': 'Country-Team',
  'mode.letterTeam': 'Letter-Team',
  'mode.select': 'Select Mode',

  'pick.title': 'Pick a team',
  'pick.titleCountry': 'Pick a country',
  'pick.titleLetter': 'Pick a letter',
  'pick.search': 'Search team (e.g. Galatasaray)',
  'pick.searchCountry': 'Search country...',
  'pick.picked': 'Your pick is in. Waiting for opponent…',
  'getReady': 'Get ready!',

  'guess.title': 'Who is the shared player?',
  'guess.titleCountry': 'Name a {country} player who played for {team}',
  'guess.titleLetter': 'Name a player starting with {letter} who played for {team}',
  'guess.placeholder': 'Type a player name',
  'guess.send': 'Send',
  'guess.pass': 'Pass',
  'guess.youPassed': 'You passed — waiting for opponent…',
  'guess.oppPassed': 'Opponent passed — pass too to skip this round',
  'guess.locked': '{name} is answering…',
  'guess.youAnswered': 'Your answer was sent',
  'guess.waiting': 'Opponent is answering…',

  'result.correct': 'CORRECT',
  'result.wrong': 'WRONG',
  'result.timeUp': "Time's up",
  'result.roundSkipped': 'ROUND SKIPPED',
  'result.noCommon': 'No player found who played for both clubs — no points awarded',
  'result.sameTeam': 'Same team picked — round skipped, no points',
  'result.passed': 'Both players passed — no points awarded',
  'result.autocorrected': 'auto-corrected',
  'result.youWon': 'YOU WON!',
  'result.youLost': 'YOU LOST',
  'result.winnerTook': '{name} won',
  'result.career': 'CAREER',
  'result.commonPlayers': 'PLAYERS WHO PLAYED FOR BOTH CLUBS',
  'result.commonPlayersCountry': '{country} PLAYERS WHO PLAYED FOR {team}',
  'result.commonPlayersLetter': 'PLAYERS STARTING WITH {letter} AT {team}',
  'result.otherCommon': 'OTHER SHARED PLAYERS',
  'result.otherCommonCountry': 'OTHER {country} PLAYERS',
  'result.otherCommonLetter': 'OTHER {letter} PLAYERS',
  'result.noCommonFound': 'No shared player found for these two clubs',
  'result.noCommonFoundCountry': 'No player from this country found at this club',
  'result.noCommonFoundLetter': 'No player starting with this letter found at this club',
  'result.noCommonCountry': 'No player from this country at this club — no points',
  'result.noCommonLetter': 'No player starting with this letter at this club — no points',
  'copied': 'Copied',
  'result.nextRound': 'Next round starting…',
  'result.ready': 'Ready',
  'result.readyWaiting': "You're ready! Waiting for opponent…",
  'result.playAgain': 'Play Again',
  'result.rematchWaiting': 'Waiting for accept…',
  'result.rematchIncoming': '{name} wants a rematch',
  'result.accept': 'Accept',
  'result.decline': 'Decline',
  'result.rematchDeclined': 'Rematch request declined',
  'result.tryAgain': 'Try Again',
  'result.leave': 'Leave',

  'searching.title': 'Looking for an online opponent…',
  'searching.cancel': 'Cancel',
  'ready.label': 'Ready',
  'ready.labelSecs': 'Ready ({secs})',
  'store.changeNameConfirm': 'Change',

  'menu.title': 'Menu',
  'menu.matchHistory': 'Match History',
  'menu.leaderboard': 'Leaderboard',

  'settings.title': 'Settings',
  'settings.language': 'Language',
  'settings.changeLangConfirm': 'Are you sure you want to change the language?',
  'settings.cancel': 'Cancel',
  'settings.confirm': 'OK',

  'matchHistory.title': 'Match History',
  'matchHistory.empty': 'No matches yet',
  'matchHistory.won': 'WON',
  'matchHistory.lost': 'LOST',

  'leaderboard.title': 'Leaderboard',
  'leaderboard.back': 'Back',
  'leaderboard.empty': 'No rankings yet',

  'store.title': 'Store',
  'store.freeDiamonds': 'FREE DIAMONDS',
  'store.watchAd': 'Watch a video, earn diamonds',
  'store.adsDaily': '2 videos per day',
  'store.watch': 'Watch',
  'store.done': 'Done',
  'store.packs': 'DIAMOND PACKS',
  'store.popular': 'MOST POPULAR',
  'store.diamonds': '{n} Diamonds',
  'store.emotes': 'EMOTES',
  'store.owned': 'Owned',
  'store.other': 'OTHER',
  'store.changeName': 'Change Name',
  'store.changeNameDesc': 'Change your name for 100 diamonds',
  'store.changeNameInsufficient': 'Not enough diamonds! Buy some from the store.',
  'store.cost': 'Cost:',
  'store.balance': 'Balance:',
  'store.adReward': '+25 💎',
  'store.cancel': 'Cancel',
  'store.confirm': 'Confirm',
  'store.newName': 'New name',

  'arenas.title': 'Arenas',
  'arenas.back': 'Back',
  'arenas.current': 'CURRENT',

  'friends.title': 'Friends',
  'friends.addSection': 'ADD FRIEND',
  'friends.yourCode': 'Your Code',
  'friends.friendCode': 'Friend Code',
  'friends.enterCode': 'Enter code',
  'friends.myFriends': 'MY FRIENDS',
  'friends.empty': 'No friends yet',
  'friends.shareHint': 'Share your code to add friends',
  'friends.inviteDeclined': 'Your invite was declined',
  'friends.added': 'Friend added! ✓',
  'friends.loginFirst': 'Sign in first',
  'friends.remove': 'Remove',

  'emote.send': 'Send Emote',
  'emote.moreInStore': 'Check the Store for more emotes',

  'emote.congrats': 'Congrats!',
  'emote.luck': 'Good luck!',
  'emote.gg': 'Good game!',
  'emote.bringIt': 'Bring it on!',
  'emote.gotcha': 'Gotcha!',
  'emote.thanks': 'Thanks!',
  'emote.quickChat': 'Quick Chat',
  'emote.faces': 'Emotes',
  'emote.face.smile': 'Nice!',
  'emote.face.cry': 'So sad...',
  'emote.face.angry': 'Come on!',
  'emote.face.ok': 'All good!',
  'emote.jersey10.phrase': 'Champion!',
  'emote.goal.phrase': 'What a goal!',
  'emote.champion.phrase': 'Champion!',
  'emote.jersey10.name': 'Jersey Lift',
  'emote.jersey10.desc': 'Proudly lift the blue-and-red jersey',
  'emote.goal.name': 'Goal Celebration',
  'emote.goal.desc': 'Send it into the net and celebrate!',
  'emote.champion.name': 'Trophy Party',
  'emote.champion.desc': 'Lift the trophy, celebrate the win',

  'error.connect': 'Could not connect to the server',
  'error.disconnected': 'Connection lost',
  'error.opponentLeft': 'Opponent left',
};

export type MessageKey = keyof typeof tr;

const DICTS: Record<string, Partial<typeof tr>> = { tr, en };

/** Available languages with their native display names.
 *  Only tr/en have full dictionaries today; the rest fall back to English
 *  via t() until their translations land. */
export const LANGUAGES: { code: string; name: string }[] = [
  { code: 'en', name: 'English' },
  { code: 'tr', name: 'Türkçe' },
  { code: 'pt', name: 'Português' },
  { code: 'es', name: 'Español' },
  { code: 'fr', name: 'Français' },
  { code: 'de', name: 'Deutsch' },
  { code: 'it', name: 'Italiano' },
  { code: 'nl', name: 'Nederlands' },
  { code: 'no', name: 'Norsk' },
  { code: 'fi', name: 'Suomi' },
  { code: 'ru', name: 'Русский' },
  { code: 'zh-Hans', name: '简体中文' },
  { code: 'zh-Hant', name: '繁體中文' },
  { code: 'ko', name: '한국어' },
  { code: 'ja', name: '日本語' },
  { code: 'ar', name: 'العربية' },
  { code: 'fa', name: 'فارسی' },
  { code: 'ms', name: 'Bahasa Melayu' },
  { code: 'id', name: 'Bahasa Indonesia' },
  { code: 'th', name: 'ไทย' },
  { code: 'vi', name: 'Tiếng Việt' },
];

// Resolve the active language once at startup from the device locale.
function resolveLang(): string {
  try {
    const code = getLocales()[0]?.languageCode?.toLowerCase();
    if (code && DICTS[code]) return code;
  } catch {
    /* fall through to default */
  }
  return 'en';
}

let currentLanguage = resolveLang();

/** Get the current language code. */
export function currentLang(): string {
  return currentLanguage;
}

/**
 * Set the active language. Call this after reading from AsyncStorage at startup,
 * or when the user picks a new language in settings. The caller is responsible
 * for forcing a re-render (e.g. by navigating to the loading screen).
 */
export function setLanguage(code: string): void {
  // Accept any listed language; t() falls back to English for codes without a
  // dictionary yet, so the choice still persists and shows as selected.
  if (LANGUAGES.some((l) => l.code === code)) currentLanguage = code;
}

// Translate a key, optionally interpolating {placeholders}. Falls back to
// English, then to the key itself, so a missing translation never crashes.
export function t(key: MessageKey, params?: Params): string {
  const dict = DICTS[currentLanguage] ?? en;
  let str = dict[key] ?? en[key] ?? tr[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return str;
}
