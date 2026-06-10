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
  'tab.game': 'Oyun',
  'tab.friends': 'Arkadaşlar',

  // home
  'home.tagline': 'İki takımda da oynamış futbolcuyu ilk bilen kazanır',
  'home.register': 'Kayıt Ol',
  'home.quickMatch': 'Hemen Oyna',
  'home.createRoom': 'Oda Kur',
  'home.joinRoom': 'Odaya Katıl',
  'home.solo': "Bot'a Karşı Oyna",
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
  'guess.locked': '{name} cevaplıyor…',
  'guess.youAnswered': 'Cevabın gönderildi',
  'guess.waiting': 'Rakip cevaplıyor…',

  // result
  'result.correct': 'DOĞRU',
  'result.wrong': 'YANLIŞ',
  'result.timeUp': 'Süre doldu',
  'result.roundSkipped': 'EL GEÇİLDİ',
  'result.noCommon': 'Bu iki takımda ortak oynamış oyuncu yok — kimseye puan yok',
  'result.sameTeam': 'İki taraf da aynı takımı seçtiği için bu tur pas geçildi',
  'result.autocorrected': 'otomatik düzeltildi',
  'result.youWon': 'MAÇI KAZANDIN!',
  'result.youLost': 'MAÇI KAYBETTİN',
  'result.winnerTook': '{name} kazandı',
  'result.career': 'KARİYER',
  'result.commonPlayers': 'İKİ TAKIMDA DA OYNAMIŞ OYUNCULAR',
  'result.otherCommon': 'DİĞER ORTAK OYUNCULAR',
  'result.noCommonFound': 'Bu iki takımda ortak oynamış oyuncu bulunamadı',
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
  'searching.title': 'Çevrim içi bir rakip bekleniyor…',
  'searching.cancel': 'Vazgeç',
  'ready.label': 'Hazır',
  'ready.labelSecs': 'Hazır ({secs})',
  'store.changeNameConfirm': 'Değiştir',

  // leaderboard
  'leaderboard.title': 'Lider Tablosu',
  'leaderboard.back': 'Geri',
  'leaderboard.empty': 'Henüz sıralama yok',

  // store
  'store.title': 'Elmas Mağazası',
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

  // emote picker
  'emote.send': 'İfade Gönder',
  'emote.moreInStore': "Daha fazla ifade için Mağaza'ya göz at",

  // emote phrases (free)
  'emote.congrats': 'Tebrikler!',
  'emote.luck': 'Bol şanslar!',
  'emote.gg': 'İyi oyundu!',
  'emote.bringIt': 'Hadi bakalım!',
  'emote.gotcha': 'Yakaladım!',
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
  'guess.locked': '{name} is answering…',
  'guess.youAnswered': 'Your answer was sent',
  'guess.waiting': 'Opponent is answering…',

  'result.correct': 'CORRECT',
  'result.wrong': 'WRONG',
  'result.timeUp': "Time's up",
  'result.roundSkipped': 'ROUND SKIPPED',
  'result.noCommon': 'No player has played for both clubs — no points awarded',
  'result.sameTeam': 'Same team picked — round skipped, no points',
  'result.autocorrected': 'auto-corrected',
  'result.youWon': 'YOU WON!',
  'result.youLost': 'YOU LOST',
  'result.winnerTook': '{name} won',
  'result.career': 'CAREER',
  'result.commonPlayers': 'PLAYED FOR BOTH CLUBS',
  'result.otherCommon': 'OTHER SHARED PLAYERS',
  'result.noCommonFound': 'No shared player found for these two clubs',
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

  'searching.title': 'Waiting for an online opponent…',
  'searching.cancel': 'Cancel',
  'ready.label': 'Ready',
  'ready.labelSecs': 'Ready ({secs})',
  'store.changeNameConfirm': 'Change',

  'leaderboard.title': 'Leaderboard',
  'leaderboard.back': 'Back',
  'leaderboard.empty': 'No rankings yet',

  'store.title': 'Diamond Store',
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

  'emote.send': 'Send Emote',
  'emote.moreInStore': 'Check the Store for more emotes',

  'emote.congrats': 'Congrats!',
  'emote.luck': 'Good luck!',
  'emote.gg': 'Good game!',
  'emote.bringIt': 'Bring it on!',
  'emote.gotcha': 'Gotcha!',
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

// Resolve the active language once at startup from the device locale.
function resolveLang(): keyof typeof DICTS {
  try {
    const code = getLocales()[0]?.languageCode?.toLowerCase();
    if (code && DICTS[code]) return code;
  } catch {
    /* fall through to default */
  }
  return 'en';
}

const LANG = resolveLang();

// Translate a key, optionally interpolating {placeholders}. Falls back to
// English, then to the key itself, so a missing translation never crashes.
export function t(key: MessageKey, params?: Params): string {
  const dict = DICTS[LANG] ?? en;
  let str = dict[key] ?? en[key] ?? tr[key] ?? key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      str = str.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
    }
  }
  return str;
}

export const currentLang = LANG;
