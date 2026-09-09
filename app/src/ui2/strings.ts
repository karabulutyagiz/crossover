// UI2 metinleri — hepsi i18n (21 dil). S.* getter'ları t() okur; dil değişince yeniden render yeter.
// Eski ekranlarla ortak anahtarlar (tab.*, store.*, friends.*…) yeniden kullanılır; yalnız UI2'ye özgü olanlar ui2.*.
import { currentLang, t } from '../i18n';

/** Yerel ayara göre BÜYÜK HARF (tr: i→İ, ı→I). Başlık fontu için. */
export function up(s: string): string {
  // undefined GECME: iOS'ta varsayilan yerel ayar CIHAZIN dilidir, uygulamaninki degil.
  // Cihaz Turkce iken Ingilizce arayuzde 'COLLECTION' -> 'COLLECTİON' oluyordu.
  const l = currentLang();
  return s.normalize('NFC').toLocaleUpperCase(l === 'tr' ? 'tr-TR' : (l || 'en')).normalize('NFC');
}

export const S = {
  get store() { return up(t('store.title')); }, get collection() { return up(t('tab.collection')); }, get play() { return t('ui2.play'); },
  get friends() { return up(t('friends.title')); }, get tournaments() { return up(t('tab.tournaments')); },
  // Arkadaşlar
  get inviteTitle() { return t('ui2.inviteTitle'); }, get inviteTitle2() { return t('ui2.inviteTitle2'); }, get inviteDesc() { return t('ui2.inviteDesc'); }, get inviteBtn() { return t('ui2.inviteBtn'); },
  gemsN: (n: number) => t('store.diamonds', { n }),
  get addFriend() { return t('friends.addFriend'); }, get addFriendSub() { return t('ui2.addFriendSub'); }, get inviteCode() { return t('ui2.inviteCode'); }, get inviteCodeSub() { return t('ui2.inviteCodeSub'); },
  get requests() { return t('friends.tabRequests'); }, get requestsSub() { return t('ui2.requestsSub'); },
  get onlineFriends() { return t('ui2.onlineFriends'); }, get online() { return t('common.online'); }, get inMatch() { return t('ui2.inMatch'); }, get offline() { return t('common.offline'); },
  minAgo: (m: number) => (m < 1 ? t('ui2.justNow') : m < 60 ? t('ui2.minAgo', { m }) : m < 1440 ? t('ui2.hoursAgo', { h: Math.floor(m / 60) }) : t('ui2.daysAgo', { d: Math.floor(m / 1440) })),
  get inviteRow() { return t('ui2.inviteRow'); }, get noFriends() { return t('ui2.noFriends'); },
  get socialRewards() { return t('ui2.socialRewards'); }, get socialRewardsSub() { return t('ui2.socialRewardsSub'); }, friendsN: (n: number) => t('ui2.friendsN', { n }),
  get specialEmote() { return t('level.exclusiveEmote'); }, get specialFrame() { return t('ui2.specialFrame'); }, get soon() { return up(t('common.comingSoon')); },
  get suggestions() { return t('ui2.suggestions'); }, get suggestionsSub() { return t('ui2.suggestionsSub'); }, get searchPlaceholder() { return t('ui2.searchPlaceholder'); },
  get add() { return t('ui2.add'); }, get search() { return t('friends.search'); }, get noResults() { return t('common.noResults'); },
  // Turnuvalar
  get liveEvent() { return t('ui2.liveEvent'); }, get bigPrize() { return t('ui2.bigPrize'); }, get entry() { return t('ui2.entry'); }, get free() { return t('ui2.free'); },
  get join() { return t('ui2.join'); }, get joined() { return t('ui2.joined'); }, get view() { return t('ui2.view'); }, get tournamentDesc() { return t('ui2.tournamentDesc'); },
  get daily() { return t('ui2.daily'); }, get dailySub() { return t('ui2.dailySub'); }, get leagueCup() { return t('ui2.leagueCup'); }, get leagueCupSub() { return t('ui2.leagueCupSub'); },
  get rewards() { return t('ui2.rewards'); }, get rewardsSub() { return t('ui2.rewardsSub'); },
  get activeTournaments() { return t('ui2.activeTournaments'); }, get activeSub() { return t('ui2.activeSub'); }, players: (n: number) => t('ui2.players', { n }),
  get singleElim() { return t('ui2.singleElim'); }, get ongoing() { return t('ui2.ongoing'); }, get registration() { return t('ui2.registration'); }, get finished() { return t('ui2.finished'); }, get prize() { return t('ui2.prize'); },
  get rewardRoad() { return t('ui2.rewardRoad'); }, get rewardRoadSub() { return t('ui2.rewardRoadSub'); }, levelN: (n: number) => t('ui2.levelN', { n }), get claim() { return t('ui2.claim'); },
  get upcoming() { return t('ui2.upcoming'); }, get upcomingSub() { return t('ui2.upcomingSub'); }, get noTournaments() { return t('ui2.noTournaments'); }, get moreTournaments() { return t('ui2.moreTournaments'); },
  get loading() { return t('common.loading'); },
  // Mağaza / ortak
  get owned() { return up(t('store.owned')); },
};
