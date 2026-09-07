// UI2 metinleri — TEK yer. i18n geçişinde (21 dil) bu anahtarlar i18n.ts'e taşınır; ekranlar S.* okur.
export const S = {
  store: 'MAĞAZA', collection: 'KOLEKSİYON', play: 'Oyna', friends: 'ARKADAŞLAR', tournaments: 'TURNUVALAR',
  // Arkadaşlar
  inviteTitle: 'ARKADAŞINI', inviteTitle2: 'DAVET ET', inviteDesc: 'Arkadaşlarını oyuna davet et,\nhem sen hem de arkadaşın\nödül kazansın!', inviteBtn: 'DAVET ET', gemsN: (n: number) => `${n} Elmas`,
  addFriend: 'Arkadaş Ekle', addFriendSub: 'Oyuncu adı ile ara', inviteCode: 'Davet Kodu', inviteCodeSub: 'Kodu paylaş', requests: 'İstekler', requestsSub: 'Gelen istekler',
  onlineFriends: 'ÇEVRİMİÇİ ARKADAŞLAR', online: 'Çevrimiçi', inMatch: 'Maçta', minAgo: (m: number) => (m < 1 ? 'az önce' : m < 60 ? `${m} dk önce` : m < 1440 ? `${Math.floor(m / 60)} sa önce` : `${Math.floor(m / 1440)} gün önce`), offline: 'Çevrimdışı',
  inviteRow: 'Davet Et', noFriends: 'Henüz arkadaşın yok — kodunu paylaş!',
  socialRewards: 'SOSYAL ÖDÜLLER', socialRewardsSub: 'Daha fazla arkadaş davet et, daha fazla ödül kazan!', friendsN: (n: number) => `${n} Arkadaş`, specialEmote: 'Özel İfade', specialFrame: 'Özel Çerçeve', soon: 'YAKINDA',
  suggestions: 'ARKADAŞ ÖNERİLERİ', suggestionsSub: 'Tanıdıklarını bul ve daha fazla eğlen!', searchPlaceholder: 'Oyuncu adı yaz…', add: 'Ekle', search: 'Ara', noResults: 'Sonuç yok',
  // Turnuvalar
  liveEvent: 'CANLI ETKİNLİK', bigPrize: 'Büyük Ödül:', entry: 'Katılım:', free: 'Ücretsiz', join: 'KATIL', joined: 'KATILDIN', view: 'GÖR', tournamentDesc: 'En iyi oyuncuların mücadele ettiği\nbüyük turnuvaya katıl!',
  daily: 'Günlük Turnuva', dailySub: 'Her gün yeni ödül', leagueCup: 'Lig Kupası', leagueCupSub: 'Sıralamaya tırman', rewards: 'Ödüller', rewardsSub: 'Sezon ödüllerini kazan',
  activeTournaments: 'AKTİF TURNUVALAR', activeSub: 'Devam eden turnuvalara katıl, ödülleri kazan!', players: (n: number) => `${n} Oyuncu`, singleElim: 'Tek Eleme', ongoing: 'Devam Ediyor', registration: 'Kayıt Açık', finished: 'Bitti', prize: 'Ödül:',
  rewardRoad: 'ÖDÜL YOLU', rewardRoadSub: 'Seviye atla, ödülleri topla!', levelN: (n: number) => `${n}. Seviye`, claim: 'AL',
  upcoming: 'YAKLAŞAN TURNUVALAR', upcomingSub: 'Kaçırma! Yaklaşan turnuvaları takip et.', noTournaments: 'Şu an açık turnuva yok', moreTournaments: 'Daha fazla turnuva seni bekliyor!',
  loading: 'Yükleniyor…',
} as const;
