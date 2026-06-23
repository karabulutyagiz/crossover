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
// Per-language dictionaries (translated from the English base). One JSON per language.
import pt from './i18n-locales/pt.json';
import es from './i18n-locales/es.json';
import fr from './i18n-locales/fr.json';
import de from './i18n-locales/de.json';
import it from './i18n-locales/it.json';
import nl from './i18n-locales/nl.json';
import no from './i18n-locales/no.json';
import fi from './i18n-locales/fi.json';
import ru from './i18n-locales/ru.json';
import zhHans from './i18n-locales/zh-Hans.json';
import zhHant from './i18n-locales/zh-Hant.json';
import ko from './i18n-locales/ko.json';
import ja from './i18n-locales/ja.json';
import ar from './i18n-locales/ar.json';
import fa from './i18n-locales/fa.json';
import ms from './i18n-locales/ms.json';
import id from './i18n-locales/id.json';
import th from './i18n-locales/th.json';
import vi from './i18n-locales/vi.json';

type Params = Record<string, string | number>;

const LOCALE_MAP: Record<string, string> = {
  en: 'en-US',
  tr: 'tr-TR',
  pt: 'pt-BR',
  es: 'es-ES',
  fr: 'fr-FR',
  de: 'de-DE',
  it: 'it-IT',
  nl: 'nl-NL',
  no: 'nb-NO',
  fi: 'fi-FI',
  ru: 'ru-RU',
  'zh-Hans': 'zh-CN',
  'zh-Hant': 'zh-TW',
  ko: 'ko-KR',
  ja: 'ja-JP',
  ar: 'ar',
  fa: 'fa-IR',
  ms: 'ms-MY',
  id: 'id-ID',
  th: 'th-TH',
  vi: 'vi-VN',
};

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
  'login.guest': 'Misafir Girişi',

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
  'mode.playerPlayer': 'Oyuncu-Oyuncu',
  'mode.select': 'Mod Seç',

  // countdown / pick
  'pick.title': 'Bir takım seç',
  'pick.titleCountry': 'Bir ülke seç',
  'pick.titleLetter': 'Bir harf seç',
  'pick.titlePlayer': 'Bir futbolcu seç',
  'pick.search': 'Takım ara (ör. Galatasaray)',
  'pick.searchCountry': 'Ülke ara...',
  'pick.searchPlayer': 'Futbolcu ara (ör. Sneijder)',
  'pick.picked': 'Seçimin yapıldı. Rakip bekleniyor…',
  'getReady': 'Hazır ol!',
  'matchup.vs': 'VS',
  'matchup.title': 'MÜSABAKA',

  // guess
  'guess.title': 'Ortak oyuncu kim?',
  'guess.titleCountry': '{country} ülkesinden {team} takımında oynamış oyuncu kim?',
  'guess.titleLetter': '{letter} harfiyle başlayan {team} takımında oynamış oyuncu kim?',
  'guess.titlePlayerPlayer': 'Bu iki futbolcu hangi takımda birlikte oynadı?',
  'guess.placeholder': 'Futbolcu adı',
  'guess.placeholderClub': 'Takım adı',
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
  'result.youLost3Wrong': '3 yanlış cevap vererek maçı kaybettin',
  'result.youWon3Wrong': 'Rakibin 3 yanlış cevap verdiği için maçı kazandın!',
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
  'store.adReward': '+5 💎',
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
  'friends.inviteMsg': 'seni dostluk maçına davet etti',
  'friends.inviteMsgScope': 'seni {scope} dostluk maçına davet etti',

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

  // leave confirmation
  'leave.confirmTitle': 'Çıkış yapmak istediğinize emin misiniz?',
  'leave.confirmBody': 'Çıkış yaptığınız halde kupa kaybedeceksiniz.',
  'leave.confirm': 'Evet, Çık',
  'leave.cancel': 'Vazgeç',

  // opponent left popup
  'opponent.leftTitle': 'Rakibiniz maçtan ayrıldı',
  'opponent.findNew': 'Yeni Rakip Bul',
  'opponent.goHome': 'Ana Sayfaya Dön',

  // connection errors (client-side)
  'error.connect': 'Sunucuya bağlanılamadı',
  'error.disconnected': 'Bağlantı koptu',
  'error.opponentLeft': 'Rakip ayrıldı',

  // tabs (extra) + common
  'tab.tournaments': 'Turnuvalar',
  'common.comingSoon': 'Çok Yakında',
  'common.online': 'Çevrimiçi',
  'common.offline': 'Çevrimdışı',
  'profile.title': 'Profil',
  'profile.choosePicture': 'Profil Fotoğrafı',
  'profile.applyPicture': 'Profili Değiştir',
  'notif.friendRequest': 'sana arkadaşlık isteği gönderdi',
  'notif.newMessage': 'sana mesaj gönderdi',
  'chat.placeholder': 'Mesaj yaz...',
  'chat.typing': 'yazıyor...',
  'lastSeen.prefix': 'Son görülme',
  'lastSeen.justNow': 'az önce',
  'lastSeen.min': '{n} dk önce',
  'lastSeen.hour': '{n} sa önce',
  'lastSeen.day': '{n} gün önce',
  'lastSeen.long': 'uzun süre önce',

  // arena names
  'arena.mahalle': 'Mahalle Sahası',
  'arena.amator': 'Amatör Lig',
  'arena.profesyonel': 'Profesyonel Lig',
  'arena.sampiyonlar': 'Şampiyonlar Ligi',
  'arena.efsaneler': 'Efsaneler Arası',
  'arena.dunya': 'Dünya Klasmanı',
  'arena.goat': 'GOAT',
  // arena descriptions
  'arena.mahalle.desc': 'Herkesin başladığı yer. Kolay tırmanış.',
  'arena.amator.desc': 'İlk adımları attın. Yükselmeye devam!',
  'arena.profesyonel.desc': 'Profesyonel seviye. Artık gerçek bir rakipsin.',
  'arena.sampiyonlar.desc': 'Avrupa\'nın en prestijli arenası. Dengeli mücadele.',
  'arena.efsaneler.desc': 'Efsaneler burada. Kayıplar acıtıyor.',
  'arena.dunya.desc': 'Dünya sahnesinde mücadele. Her hata çok ağır.',
  'arena.goat.desc': 'Efsanelerin zirvesi. Sadece en iyiler ayakta kalır.',

  // stats labels
  'stats.wins': 'Galibiyet',
  'stats.losses': 'Mağlubiyet',
  'stats.winRate': 'Kazanma %',
  'stats.winRateShort': 'Kazanma',
  'stats.trophies': 'Kupa',
  'stats.diamonds': 'Elmas',

  // collection (loadout)
  'collection.loadout': 'KUŞANILANLAR',
  'collection.loadoutHint': '{n}/{max} slot — istediğin ifadeleri ekle',
  'collection.yourEmotes': 'İFADELERİN',
  'collection.equip': 'Kuşan',
  'collection.equipped': 'Kuşanıldı',

  // store — purchase popup
  'store.purchaseSuccess': 'Satın Alma Başarılı!',
  'store.gotIt': 'Harika!',

  // extra UI / locale formatting
  'common.skip': 'Atla ›',
  'common.yes': 'Evet',
  'common.no': 'Hayır',
  'common.cancel': 'İptal',
  'common.search': 'Ara',
  'common.continue': 'Devam Et',
  'common.none': '—',
  'common.player': 'Oyuncu',
  'common.friend': 'Arkadaş',
  'common.today': 'Bugün',
  'common.go': 'Başla!',
  'common.activeUntil': 'Aktif — bitiş {date}',
  'tutorial.coachStep': 'KOÇ · ADIM {step}/{total}',
  'difficulty.easy': 'Kolay',
  'difficulty.medium': 'Orta',
  'difficulty.hard': 'Zor',
  'settings.name': 'Ad',
  'settings.changeName': 'Ad Değiştir',
  'settings.help': 'Yardım ve Bilgiler',
  'settings.privacy': 'Gizlilik',
  'settings.parents': 'Ebeveyn Kılavuzu',
  'settings.terms': 'Hizmet Koşulları',
  'settings.founders': 'Kurucular',
  'leaderboard.viewProfile': 'Profili Görüntüle',
  'leaderboard.sendFriendRequest': 'Arkadaşlık İsteği Gönder',
  'friends.byCode': 'Kod ile',
  'friends.byName': 'İsim ile',
  'friends.usernamePlaceholder': 'Kullanıcı adı yaz',
  'friends.sendRequest': 'Arkadaşlık İsteği Gönder',
  'friends.tabFriends': 'Arkadaşlar',
  'friends.tabRequests': 'İstekler',
  'friends.tabMessages': 'Mesajlar',
  'friends.noPendingRequests': 'Bekleyen istek yok',
  'friends.wantsToBeFriend': 'Seninle arkadaş olmak istiyor',
  'friends.searchFriends': 'Arkadaş ara...',
  'friends.sendMessage': 'Mesaj Gönder',
  'friends.noChats': 'Henüz sohbet yok',
  'friends.searchToMessage': 'Yukarıdan bir arkadaşını arayarak mesaj gönder',
  'friends.friendlyMatch': 'Dostluk Savaşı',
  'friends.removeFriend': 'Arkadaşlıktan Kaldır',
  'friends.removeConfirmTitle': 'Kaldırılsın mı?',
  'friends.removeConfirmBody': '{name} adlı kişiyi arkadaşlarından çıkarmak istediğine emin misin?',
  'friends.matchModeTitle': 'Dostluk Maçı - Mod Seç',
  'friends.scopeTitle': 'Kapsam Seç',
  'friends.socialPackRequired': 'Sosyal Paket Gerekli',
  'friends.socialPackRequiredBody': 'Ülke-Takım ve Harf-Takım modlarını dostluk maçlarında kullanmak için Sosyal Paket satın almalısın.',
  'friends.goToStore': 'Mağazaya Git',
  'friends.waitingAccept': 'Kabul etmesi bekleniyor…',
  'chat.noMessages': 'Henüz mesaj yok',
  'store.adErrorTitle': 'Reklam Hatası',
  'store.adErrorBody': 'Kod: {code}{details}',
  'store.adRewardTitle': 'Reklam Ödülü',
  'store.adRewardFailed': 'Ödül şu an verilemedi, birazdan tekrar dene.',
  'store.purchasePendingTitle': 'Satın alma',
  'store.purchasePendingBody': 'Birazdan hesabına işlenecek. Sorun sürerse uygulamayı yeniden aç.',
  'store.purchaseFailedTitle': 'Satın alma başarısız',
  'store.purchaseFailedBody': 'Ödeme tamamlanamadı, tekrar dene.',
  'store.comingSoonBody': 'Satın alma yakında aktifleşecek.',
  'store.socialPack': 'SOSYAL PAKET',
  'store.socialPackName': 'Sosyal Paket',
  'store.socialPackDesc': 'Arkadaşlarınla Ülke-Takım ve Harf-Takım modlarında dostluk maçı oyna.',
  'store.badgeActive': 'AKTİF',
  'store.badgeNew': 'YENİ',
  'store.freeDiamondsDesc': 'Sınırsız izle, her seferinde +5 elmas',
  'store.loading': 'Yükleniyor...',
  'store.watchedToday': 'Bugün {count} izledin',
  'store.countdownDaysHours': '{days} g {hours} sa',
  'store.countdownHMS': '{hours}sa {minutes}dk {seconds}sn',
  'store.thisWeek': 'BU HAFTA',
  'store.weeklyEmotes': '{week}. HAFTA İFADELERİ',
  'profile.logout': 'Hesaptan Çıkış Yap',
  'profile.logoutTitle': 'Çıkış Yap',
  'profile.logoutConfirm': 'Hesaptan çıkış yapmak istediğinize emin misiniz?',
  'profile.logoutBody': 'Çıkış yaptıktan sonra ana giriş ekranına döneceksiniz.',
  'profile.pictures': 'Profil Fotoğrafları',
  'profile.ready': 'Hazır',
  'profile.inUse': 'Kullanılıyor',
  'profile.buyTitle': 'Satın Al',
  'profile.buyConfirm': '{price} elmas karşılığında bu profil fotoğrafını satın almak istiyor musunuz?',
  'profile.notEnoughTitle': 'Yetersiz Elmas',
  'profile.notEnoughBody': 'Mağazaya gidip elmas satın almak ister misin?',
  'profile.changeTitle': 'Değiştir',
  'profile.changeConfirm': 'Bu profil fotoğrafını kullanmak istiyor musun?',
  'searching.header': 'Rakip Aranıyor',
  'countdown.go': 'BAŞLA!',
  'arenas.open': 'ARENALAR ›',
  'arenas.here': 'BURADASIN',
  'tutorial.step1.gate': 'Hoş geldin! 👋 Hızlı bir alıştırma yapalım. İki takımda da oynamış futbolcuyu bulacaksın.\n\nDevam Et\'e bas, sonra Galatasaray\'a dokun.',
  'tutorial.step1.hint': '👇 Galatasaray\'a dokun',
  'tutorial.step2.gateWrong': 'Olmadı 🙈 Doğru cevap: Wesley Sneijder.\n\nDevam Et\'e bas ve aynen yaz.',
  'tutorial.step2.gateRight': 'Sıra sende! Galatasaray ve Real Madrid\'in ikisinde de oynayan futbolcu: Wesley Sneijder.\n\nDevam Et\'e bas, yaz ve Gönder\'e bas.',
  'tutorial.step2.hint': '⌨️ “Wesley Sneijder” yaz ve Gönder’e bas',
  'tutorial.step3.gate': 'Doğru! 🎉 Sneijder hem Galatasaray hem Real Madrid forması giydi.\n\nRakipten önce bilen turu kazanır; ilk 3 turu alan kupayı kazanır!',
  'tutorial.stepCta': 'Devam Et',
  'tutorial.start': 'BAŞLA',
  'store.pack1': 'Elmas Kesesi',
  'store.pack2': 'Elmas Çuvalı',
  'store.pack3': 'Büyük Elmas Çuvalı',
  'store.pack4': 'Elmas Sandığı',
  'store.pack5': 'Kraliyet Sandığı',
  'store.pack6': 'Elmas Dağı',
  'store.socialWeekly': 'Haftalık',
  'store.socialMonthly': 'Aylık',
  'fact.1': 'Pele, kariyeri boyunca 1.281 gol attı ve bu rekor hâlâ tartışılıyor.',
  'fact.2': 'Camp Nou, Avrupa\'nın en büyük stadyumu olarak 99.354 kişi kapasitesine sahiptir.',
  'fact.3': 'Messi, tek bir takvim yılında 91 gol atarak Gerd Müller\'in rekorunu kırdı (2012).',
  'fact.4': 'Galatasaray, 2000 yılında UEFA Kupası\'nı kazanan ilk Türk takımı oldu.',
  'fact.5': 'Real Madrid, 15 Şampiyonlar Ligi kupasıyla en çok kazanan takımdır.',
  'fact.6': 'Paolo Maldini, 25 yıl boyunca yalnızca AC Milan forması giydi.',
  'fact.7': 'İlk FIFA Dünya Kupası 1930\'da Uruguay\'da düzenlendi ve ev sahibi Uruguay şampiyon oldu.',
  'fact.8': 'Zinedine Zidane, 2006 Dünya Kupası finalinde kafa attığı anla tarihe geçti.',
  'fact.9': 'Bundesliga\'da ayakta seyirci bölümleri sayesinde bilet fiyatları Avrupa\'nın en düşüğüdür.',
  'fact.10': 'Johan Cruyff, "toplam futbol" felsefesinin mimarı olarak kabul edilir.',
  'fact.11': 'Cristiano Ronaldo, uluslararası arenada en çok gol atan futbolcudur.',
  'fact.12': 'Barcelona, 2008-2012 arasında tiki-taka stiliyle futbol tarihini değiştirdi.',
  'fact.13': 'Premier Lig, dünyanın en çok izlenen futbol ligidir; 212 ülkede yayınlanır.',
  'fact.14': 'Luka Modric, 2018\'de Ballon d\'Or\'u kazanarak Messi-Ronaldo hegemonyasını kırdı.',
  'fact.15': 'Hakan Şükür, 2002 Dünya Kupası\'nda tarihin en erken golünü 11. saniyede attı.',
  'fact.16': 'Gianluigi Buffon, 40 yaşını geçtikten sonra bile üst düzey kaleciliğe devam etti.',
  'fact.17': 'Azteca Stadyumu, iki Dünya Kupası finaline ev sahipliği yapan tek stadyumdur.',
  'fact.18': 'Mohamed Salah, Premier Lig\'de tek sezonda 32 gol atarak rekoru kırdı (2017-18).',
  'fact.19': 'Alex Ferguson, Manchester United\'da 26 yıl teknik direktörlük yaptı ve 38 kupa kazandı.',
  'fact.20': 'Japonya, 2002\'de Güney Kore ile birlikte Dünya Kupası\'na ev sahipliği yapan ilk Asya ülkesiydi.',

  // server error messages
  'server.error.invalidJson': 'Geçersiz JSON',
  'server.error.authFailed': 'Giriş doğrulanamadı',
  'server.error.guestFailed': 'Misafir girişi başarısız',
  'server.error.registerFirst': 'Önce kayıt ol',
  'server.error.loginFirst': 'Önce giriş yap',
  'server.error.userNotFound': 'Kullanıcı bulunamadı',
  'server.error.roomNotFound': 'Oda bulunamadı',
  'server.error.createOrJoinFirst': 'Önce oda kur veya bir odaya katıl',
  'server.error.roomFull': 'Oda dolu',
  'server.error.usernameTaken': 'Bu kullanıcı adı alınmış',
  'server.error.usernameNotAllowed': 'Bu kullanıcı adı uygun değil',
  'server.error.invalidUsername': 'Geçersiz kullanıcı adı',
  'server.error.invalidAvatar': 'Geçersiz profil fotoğrafı',
  'server.error.invalidEmote': 'Geçersiz ifade',
  'server.error.emoteAlreadyFree': 'Bu ifade zaten herkeste açık',
  'server.error.emoteAlreadyOwned': 'Bu ifadeye zaten sahipsin',
  'server.error.emoteNotPurchasable': 'Bu ifade satın alınamaz',
  'server.error.avatarAlreadyFree': 'Bu profil fotoğrafı zaten herkeste açık',
  'server.error.avatarAlreadyOwned': 'Bu profil fotoğrafına zaten sahipsin',
  'server.error.buyAvatarFirst': 'Önce bu profil fotoğrafını satın al',
  'server.error.cannotSelfRequest': 'Kendine istek gönderemezsin',
  'server.error.alreadyFriends': 'Zaten arkadaşsınız',
  'server.error.requestAlreadySent': 'İstek zaten gönderildi',
  'server.error.requestNotFound': 'İstek bulunamadı',
  'server.error.insufficientDiamonds': 'Yetersiz elmas',
  'server.error.purchaseFailed': 'Satın alma başarısız',
  'server.error.purchaseClosed': 'Satın alma şu an kapalı',
  'server.error.receiptNotFound': 'Makbuz bulunamadı',
  'server.error.receiptVerifyFailed': 'Makbuz doğrulanamadı, tekrar dene',
  'server.error.receiptInvalid': 'Makbuz geçersiz',
  'server.error.adDailyLimit': 'Günlük reklam ödülü sınırına ulaştın',
  'server.error.adTooFast': 'Çok hızlı, birazdan tekrar dene',
  'server.error.adRewardGeneric': 'Ödül verilemedi',
  'server.error.usernameMinLength': 'Kullanıcı adı en az 3 karakter olmalı',
  'server.error.usernameMaxLength': 'Kullanıcı adı en fazla 16 karakter olabilir',
  'server.error.usernameInvalidChars': 'Sadece harf, rakam ve _ kullanılabilir (boşluk yok)',
  'server.error.usernameNumericOnly': 'Sadece rakamlardan oluşamaz',
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
  'login.guest': 'Guest Login',

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
  'mode.playerPlayer': 'Player-Player',
  'mode.select': 'Select Mode',

  'pick.title': 'Pick a team',
  'pick.titleCountry': 'Pick a country',
  'pick.titleLetter': 'Pick a letter',
  'pick.titlePlayer': 'Pick a player',
  'pick.searchPlayer': 'Search player (e.g. Sneijder)',
  'pick.search': 'Search team (e.g. Galatasaray)',
  'pick.searchCountry': 'Search country...',
  'pick.picked': 'Your pick is in. Waiting for opponent…',
  'getReady': 'Get ready!',
  'matchup.vs': 'VS',
  'matchup.title': 'MATCH',

  'guess.title': 'Who is the shared player?',
  'guess.titleCountry': 'Name a {country} player who played for {team}',
  'guess.titleLetter': 'Name a player starting with {letter} who played for {team}',
  'guess.titlePlayerPlayer': 'Which club did both players play for?',
  'guess.placeholderClub': 'Club name',
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
  'result.youLost3Wrong': 'You lost by giving 3 wrong answers',
  'result.youWon3Wrong': 'You won because your opponent gave 3 wrong answers!',
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
  'store.adReward': '+5 💎',
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
  'friends.inviteMsg': 'invited you to a friendly match',
  'friends.inviteMsgScope': 'invited you to a {scope} friendly match',

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

  'leave.confirmTitle': 'Are you sure you want to leave?',
  'leave.confirmBody': 'You will lose trophies if you leave.',
  'leave.confirm': 'Yes, Leave',
  'leave.cancel': 'Cancel',

  'opponent.leftTitle': 'Your opponent left the match',
  'opponent.findNew': 'Find New Opponent',
  'opponent.goHome': 'Go Home',

  'error.connect': 'Could not connect to the server',
  'error.disconnected': 'Connection lost',
  'error.opponentLeft': 'Opponent left',

  'tab.tournaments': 'Tournaments',
  'common.comingSoon': 'Coming Soon',
  'common.online': 'Online',
  'common.offline': 'Offline',
  'profile.title': 'Profile',
  'profile.choosePicture': 'Profile Picture',
  'profile.applyPicture': 'Set Picture',
  'notif.friendRequest': 'sent you a friend request',
  'notif.newMessage': 'sent you a message',
  'chat.placeholder': 'Type a message...',
  'chat.typing': 'typing...',
  'lastSeen.prefix': 'Last seen',
  'lastSeen.justNow': 'just now',
  'lastSeen.min': '{n} min ago',
  'lastSeen.hour': '{n} h ago',
  'lastSeen.day': '{n} d ago',
  'lastSeen.long': 'a long time ago',

  'arena.mahalle': 'Local Pitch',
  'arena.amator': 'Amateur League',
  'arena.profesyonel': 'Pro League',
  'arena.sampiyonlar': 'Champions League',
  'arena.efsaneler': 'Among Legends',
  'arena.dunya': 'World Class',
  'arena.goat': 'GOAT',
  'arena.mahalle.desc': 'Where everyone starts. An easy climb.',
  'arena.amator.desc': 'You\'ve taken your first steps. Keep climbing!',
  'arena.profesyonel.desc': 'Pro level. You\'re a real contender now.',
  'arena.sampiyonlar.desc': 'Europe\'s most prestigious arena. A balanced battle.',
  'arena.efsaneler.desc': 'Legends gather here. Losses sting.',
  'arena.dunya.desc': 'Compete on the world stage. Every mistake is costly.',
  'arena.goat.desc': 'The summit of legends. Only the best survive.',

  'stats.wins': 'Wins',
  'stats.losses': 'Losses',
  'stats.winRate': 'Win %',
  'stats.winRateShort': 'Win Rate',
  'stats.trophies': 'Trophies',
  'stats.diamonds': 'Diamonds',

  'collection.loadout': 'LOADOUT',
  'collection.loadoutHint': '{n}/{max} slots — add any emotes you like',
  'collection.yourEmotes': 'YOUR EMOTES',
  'collection.equip': 'Equip',
  'collection.equipped': 'Equipped',

  'store.purchaseSuccess': 'Purchase Successful!',
  'store.gotIt': 'Awesome!',

  'common.skip': 'Skip ›',
  'common.yes': 'Yes',
  'common.no': 'No',
  'common.cancel': 'Cancel',
  'common.search': 'Search',
  'common.continue': 'Continue',
  'common.none': '—',
  'common.player': 'Player',
  'common.friend': 'Friend',
  'common.today': 'Today',
  'common.go': 'GO!',
  'common.activeUntil': 'Active — ends {date}',
  'tutorial.coachStep': 'COACH · STEP {step}/{total}',
  'difficulty.easy': 'Easy',
  'difficulty.medium': 'Medium',
  'difficulty.hard': 'Hard',
  'settings.name': 'Name',
  'settings.changeName': 'Change Name',
  'settings.help': 'Help & Info',
  'settings.privacy': 'Privacy',
  'settings.parents': 'Parents Guide',
  'settings.terms': 'Terms of Service',
  'settings.founders': 'Founders',
  'leaderboard.viewProfile': 'View Profile',
  'leaderboard.sendFriendRequest': 'Send Friend Request',
  'friends.byCode': 'By code',
  'friends.byName': 'By name',
  'friends.usernamePlaceholder': 'Type username',
  'friends.sendRequest': 'Send Friend Request',
  'friends.tabFriends': 'Friends',
  'friends.tabRequests': 'Requests',
  'friends.tabMessages': 'Messages',
  'friends.noPendingRequests': 'No pending requests',
  'friends.wantsToBeFriend': 'Wants to be your friend',
  'friends.searchFriends': 'Search friends...',
  'friends.sendMessage': 'Send Message',
  'friends.noChats': 'No chats yet',
  'friends.searchToMessage': 'Search for a friend above to start messaging',
  'friends.friendlyMatch': 'Friendly Match',
  'friends.removeFriend': 'Remove Friend',
  'friends.removeConfirmTitle': 'Remove friend?',
  'friends.removeConfirmBody': 'Are you sure you want to remove {name} from your friends?',
  'friends.matchModeTitle': 'Friendly Match - Select Mode',
  'friends.scopeTitle': 'Select Scope',
  'friends.socialPackRequired': 'Social Pack Required',
  'friends.socialPackRequiredBody': 'Buy the Social Pack to use Country-Team and Letter-Team modes in friendly matches.',
  'friends.goToStore': 'Go to Store',
  'friends.waitingAccept': 'Waiting for acceptance…',
  'chat.noMessages': 'No messages yet',
  'store.adErrorTitle': 'Ad Error',
  'store.adErrorBody': 'Code: {code}{details}',
  'store.adRewardTitle': 'Ad Reward',
  'store.adRewardFailed': 'The reward could not be granted right now. Try again shortly.',
  'store.purchasePendingTitle': 'Purchase',
  'store.purchasePendingBody': 'It will be applied to your account shortly. If the problem continues, reopen the app.',
  'store.purchaseFailedTitle': 'Purchase failed',
  'store.purchaseFailedBody': 'Payment could not be completed. Please try again.',
  'store.comingSoonBody': 'Purchases will be available soon.',
  'store.socialPack': 'SOCIAL PACK',
  'store.socialPackName': 'Social Pack',
  'store.socialPackDesc': 'Play friendly matches with your friends in Country-Team and Letter-Team modes.',
  'store.badgeActive': 'ACTIVE',
  'store.badgeNew': 'NEW',
  'store.freeDiamondsDesc': 'Watch unlimited times and get +5 diamonds each time',
  'store.loading': 'Loading...',
  'store.watchedToday': 'You watched {count} today',
  'store.countdownDaysHours': '{days} d {hours} h',
  'store.countdownHMS': '{hours}h {minutes}m {seconds}s',
  'store.thisWeek': 'THIS WEEK',
  'store.weeklyEmotes': 'WEEK {week} EMOTES',
  'profile.logout': 'Log Out',
  'profile.logoutTitle': 'Log Out',
  'profile.logoutConfirm': 'Are you sure you want to log out?',
  'profile.logoutBody': 'After logging out, you will return to the main sign-in screen.',
  'profile.pictures': 'Profile Pictures',
  'profile.ready': 'Ready',
  'profile.inUse': 'In Use',
  'profile.buyTitle': 'Buy',
  'profile.buyConfirm': 'Do you want to buy this profile picture for {price} diamonds?',
  'profile.notEnoughTitle': 'Not Enough Diamonds',
  'profile.notEnoughBody': 'Do you want to go to the store and buy diamonds?',
  'profile.changeTitle': 'Change',
  'profile.changeConfirm': 'Do you want to use this profile picture?',
  'searching.header': 'Searching for Opponent',
  'countdown.go': 'GO!',
  'arenas.open': 'ARENAS ›',
  'arenas.here': 'YOU ARE HERE',
  'tutorial.step1.gate': 'Welcome! 👋 Let\'s do a quick practice. You\'ll find a footballer who played for both teams.\n\nPress Continue, then tap Galatasaray.',
  'tutorial.step1.hint': '👇 Tap Galatasaray',
  'tutorial.step2.gateWrong': 'Not quite 🙈 The correct answer is Wesley Sneijder.\n\nPress Continue and type it exactly.',
  'tutorial.step2.gateRight': 'Your turn! A footballer who played for both Galatasaray and Real Madrid: Wesley Sneijder.\n\nPress Continue, type it, and press Send.',
  'tutorial.step2.hint': '⌨️ Type “Wesley Sneijder” and press Send',
  'tutorial.step3.gate': 'Correct! 🎉 Sneijder wore both the Galatasaray and Real Madrid shirts.\n\nBeat your opponent to the answer to win the round; win the first 3 rounds to take the trophy!',
  'tutorial.stepCta': 'Continue',
  'tutorial.start': 'START',
  'store.pack1': 'Diamond Pouch',
  'store.pack2': 'Diamond Sack',
  'store.pack3': 'Big Diamond Sack',
  'store.pack4': 'Diamond Chest',
  'store.pack5': 'Royal Chest',
  'store.pack6': 'Diamond Mountain',
  'store.socialWeekly': 'Weekly',
  'store.socialMonthly': 'Monthly',
  'fact.1': 'Pele scored 1,281 goals in his career, and the record is still debated.',
  'fact.2': 'Camp Nou is Europe\'s largest stadium with a capacity of 99,354.',
  'fact.3': 'Messi broke Gerd Muller\'s record by scoring 91 goals in a single calendar year (2012).',
  'fact.4': 'Galatasaray became the first Turkish club to win the UEFA Cup in 2000.',
  'fact.5': 'Real Madrid has won the Champions League 15 times, the most ever.',
  'fact.6': 'Paolo Maldini played only for AC Milan for 25 years.',
  'fact.7': 'The first FIFA World Cup was held in Uruguay in 1930, and Uruguay won it.',
  'fact.8': 'Zinedine Zidane made history with his headbutt in the 2006 World Cup final.',
  'fact.9': 'Standing sections help keep Bundesliga ticket prices among the lowest in Europe.',
  'fact.10': 'Johan Cruyff is considered the architect of "Total Football".',
  'fact.11': 'Cristiano Ronaldo is the highest-scoring player in international football.',
  'fact.12': 'Barcelona changed football history with tiki-taka between 2008 and 2012.',
  'fact.13': 'The Premier League is the most-watched football league in the world, broadcast in 212 countries.',
  'fact.14': 'Luka Modric ended the Messi-Ronaldo Ballon d\'Or streak in 2018.',
  'fact.15': 'Hakan Sukur scored the fastest goal in World Cup history after 11 seconds in 2002.',
  'fact.16': 'Gianluigi Buffon remained an elite goalkeeper even after turning 40.',
  'fact.17': 'Azteca Stadium is the only stadium to host two World Cup finals.',
  'fact.18': 'Mohamed Salah set a Premier League record with 32 goals in one season (2017-18).',
  'fact.19': 'Alex Ferguson spent 26 years managing Manchester United and won 38 trophies.',
  'fact.20': 'Japan became the first Asian nation to co-host a World Cup in 2002, alongside South Korea.',

  // server error messages
  'server.error.invalidJson': 'Invalid request',
  'server.error.authFailed': 'Login verification failed',
  'server.error.guestFailed': 'Guest login failed',
  'server.error.registerFirst': 'Please register first',
  'server.error.loginFirst': 'Please sign in first',
  'server.error.userNotFound': 'User not found',
  'server.error.roomNotFound': 'Room not found',
  'server.error.createOrJoinFirst': 'Create or join a room first',
  'server.error.roomFull': 'Room is full',
  'server.error.usernameTaken': 'This username is taken',
  'server.error.usernameNotAllowed': 'This username is not allowed',
  'server.error.invalidUsername': 'Invalid username',
  'server.error.invalidAvatar': 'Invalid profile picture',
  'server.error.invalidEmote': 'Invalid emote',
  'server.error.emoteAlreadyFree': 'This emote is already free for everyone',
  'server.error.emoteAlreadyOwned': 'You already own this emote',
  'server.error.emoteNotPurchasable': 'This emote cannot be purchased',
  'server.error.avatarAlreadyFree': 'This profile picture is already free for everyone',
  'server.error.avatarAlreadyOwned': 'You already own this profile picture',
  'server.error.buyAvatarFirst': 'Buy this profile picture first',
  'server.error.cannotSelfRequest': 'You cannot send a request to yourself',
  'server.error.alreadyFriends': 'You are already friends',
  'server.error.requestAlreadySent': 'Request already sent',
  'server.error.requestNotFound': 'Request not found',
  'server.error.insufficientDiamonds': 'Not enough diamonds',
  'server.error.purchaseFailed': 'Purchase failed',
  'server.error.purchaseClosed': 'Purchases are currently disabled',
  'server.error.receiptNotFound': 'Receipt not found',
  'server.error.receiptVerifyFailed': 'Receipt could not be verified, try again',
  'server.error.receiptInvalid': 'Invalid receipt',
  'server.error.adDailyLimit': 'You have reached your daily ad reward limit',
  'server.error.adTooFast': 'Too fast, try again shortly',
  'server.error.adRewardGeneric': 'Reward could not be granted',
  'server.error.usernameMinLength': 'Username must be at least 3 characters',
  'server.error.usernameMaxLength': 'Username can be at most 16 characters',
  'server.error.usernameInvalidChars': 'Only letters, numbers and _ allowed (no spaces)',
  'server.error.usernameNumericOnly': 'Cannot consist of only numbers',
};

export type MessageKey = keyof typeof tr;

const DICTS: Record<string, Partial<typeof tr>> = {
  tr, en,
  pt, es, fr, de, it, nl, no, fi, ru,
  'zh-Hans': zhHans, 'zh-Hant': zhHant,
  ko, ja, ar, fa, ms, id, th, vi,
};

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

export function currentLocale(): string {
  return LOCALE_MAP[currentLanguage] ?? LOCALE_MAP.en;
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

export function formatNumber(value: number): string {
  return new Intl.NumberFormat(currentLocale()).format(value);
}

export function formatDate(value: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(currentLocale(), options).format(new Date(value));
}

export function formatTime(value: Date | string | number, options?: Intl.DateTimeFormatOptions): string {
  return new Intl.DateTimeFormat(currentLocale(), {
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  }).format(new Date(value));
}

// ── Server error message localization ──────────────────────────────
//
// Maps hardcoded server-side error strings (Turkish or English) to i18n
// keys so they appear in the user's chosen language. Any unmapped
// message passes through untranslated.

const SERVER_ERROR_MAP: Record<string, MessageKey> = {
  'Invalid JSON': 'server.error.invalidJson',
  'Giriş doğrulanamadı': 'server.error.authFailed',
  'Misafir girişi başarısız': 'server.error.guestFailed',
  'Register first': 'server.error.registerFirst',
  'Önce kayıt ol': 'server.error.loginFirst',
  'Önce giriş yap': 'server.error.loginFirst',
  'Kullanıcı bulunamadı': 'server.error.userNotFound',
  'Room not found': 'server.error.roomNotFound',
  'Create or join a room first': 'server.error.createOrJoinFirst',
  'Room is full': 'server.error.roomFull',
  'Bu kullanıcı adı alınmış': 'server.error.usernameTaken',
  'Bu kullanıcı adı uygun değil': 'server.error.usernameNotAllowed',
  'Geçersiz kullanıcı adı': 'server.error.invalidUsername',
  'Geçersiz profil fotoğrafı': 'server.error.invalidAvatar',
  'Geçersiz ifade': 'server.error.invalidEmote',
  'Bu ifade zaten herkeste': 'server.error.emoteAlreadyFree',
  'Bu ifadeye zaten sahipsin': 'server.error.emoteAlreadyOwned',
  'Bu profil fotoğrafı zaten herkeste': 'server.error.avatarAlreadyFree',
  'Bu profil fotoğrafına zaten sahipsin': 'server.error.avatarAlreadyOwned',
  'Önce bu profil fotoğrafını satın al': 'server.error.buyAvatarFirst',
  'Kendine istek gönderemezsin': 'server.error.cannotSelfRequest',
  'Zaten arkadaşsınız': 'server.error.alreadyFriends',
  'İstek zaten gönderildi': 'server.error.requestAlreadySent',
  'İstek bulunamadı': 'server.error.requestNotFound',
  'Yetersiz elmas': 'server.error.insufficientDiamonds',
  'Satın alma başarısız': 'server.error.purchaseFailed',
  'Satın alma şu an kapalı': 'server.error.purchaseClosed',
  'Makbuz bulunamadı': 'server.error.receiptNotFound',
  'Makbuz doğrulanamadı, tekrar dene': 'server.error.receiptVerifyFailed',
  'Makbuz geçersiz': 'server.error.receiptInvalid',
  'Günlük reklam ödülü sınırına ulaştın': 'server.error.adDailyLimit',
  'Çok hızlı, birazdan tekrar dene': 'server.error.adTooFast',
  'Ödül verilemedi': 'server.error.adRewardGeneric',
  'Kullanıcı adı en az 3 karakter olmalı': 'server.error.usernameMinLength',
  'Kullanıcı adı en fazla 16 karakter olabilir': 'server.error.usernameMaxLength',
  'Sadece harf, rakam ve _ kullanılabilir (boşluk yok)': 'server.error.usernameInvalidChars',
  'Sadece rakamlardan oluşamaz': 'server.error.usernameNumericOnly',
};

const DIAMOND_PATTERN = /^Yetersiz elmas \(\d+\/\d+\)$/;

/** Translate a server-originated error string into the user's language.
 *  Falls back to the original message when no matching key exists. */
export function serverError(msg: string): string {
  const key = SERVER_ERROR_MAP[msg];
  if (key) return t(key);
  if (DIAMOND_PATTERN.test(msg)) return t('server.error.insufficientDiamonds');
  return msg;
}
