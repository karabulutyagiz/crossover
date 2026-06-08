import { useEffect, useMemo, useRef, useState, type ComponentProps, type ReactNode } from 'react';
import {
  ActivityIndicator,
  Image,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { theme } from './theme';
import type { GameState } from './useCrossover';
import type { ClubRef, Difficulty, GameOptions, ProfileView, Scope, SpellInfo } from './protocol';

type Actions = {
  register: (name: string, gameCenterId?: string) => void;
  changeName: (newName: string) => void;
  openLeaderboard: () => void;
  closeLeaderboard: () => void;
  findMatch: (options?: GameOptions) => void;
  cancelSearch: () => void;
  createRoom: (name: string, options?: GameOptions) => void;
  createSolo: (name: string, options?: GameOptions) => void;
  joinRoom: (code: string, name: string) => void;
  start: () => void;
  pickTeam: (clubId: number) => void;
  searchClubs: (q: string) => void;
  submitGuess: (text: string) => void;
  playAgain: () => void;
  leave: () => void;
};

interface Props {
  state: GameState;
  actions: Actions;
}

type IoniconName = ComponentProps<typeof Ionicons>['name'];

// ---- shared primitives ----
function Btn({
  label,
  onPress,
  kind = 'primary',
  disabled,
  icon,
}: {
  label: string;
  onPress: () => void;
  kind?: 'primary' | 'ghost' | 'accent';
  disabled?: boolean;
  icon?: IoniconName;
}) {
  const bg = kind === 'primary' ? theme.primary : kind === 'accent' ? theme.accent : 'transparent';
  const fg = kind === 'ghost' ? theme.text : '#06131F';
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={[
        styles.btn,
        { backgroundColor: bg, opacity: disabled ? 0.4 : 1, borderWidth: kind === 'ghost' ? 1 : 0 },
      ]}
    >
      {icon ? <Ionicons name={icon} size={20} color={fg} style={{ marginRight: 8 }} /> : null}
      <Text style={[styles.btnText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

function Screen({ children }: { children: ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

const BADGE_COLORS = ['#E63946', '#457B9D', '#2A9D8F', '#E9C46A', '#F4A261', '#A06CD5', '#06D6A0', '#EF476F'];
function badgeColor(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return BADGE_COLORS[h % BADGE_COLORS.length]!;
}
function initial(name: string): string {
  const m = name.replace(/[^A-Za-zÀ-ÿ0-9 ]/g, '').trim();
  return (m.charAt(0) || '#').toUpperCase();
}
function yearsText(s: SpellInfo): string {
  if (!s.startYear && !s.endYear) return '';
  return `${s.startYear ?? '?'}–${s.endYear ?? ''}`.replace(/–$/, '+');
}

function ClubBadge({ name, size = 36, logoUrl }: { name: string; size?: number; logoUrl?: string | null }) {
  if (logoUrl) {
    return (
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: '#fff',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <Image source={{ uri: logoUrl }} style={{ width: size * 0.78, height: size * 0.78 }} resizeMode="contain" />
      </View>
    );
  }
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: badgeColor(name),
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.4 }}>{initial(name)}</Text>
    </View>
  );
}

function CareerRow({ spell, highlight }: { spell: SpellInfo; highlight?: boolean }) {
  return (
    <View style={[styles.careerRow, highlight && styles.careerRowHi]}>
      <ClubBadge name={spell.clubName} size={32} logoUrl={spell.logoUrl} />
      <Text style={styles.careerClub} numberOfLines={1}>
        {spell.clubName}
      </Text>
      <Text style={styles.careerYears}>{yearsText(spell)}</Text>
      {highlight ? (
        <Ionicons name="checkmark-circle" size={18} color={theme.primary} style={{ marginLeft: 6 }} />
      ) : null}
    </View>
  );
}

// ---- Home ----
const DIFF_LABEL: Record<Difficulty, string> = { easy: 'Kolay', medium: 'Orta', hard: 'Zor' };

function scopeLabel(scope: Scope): string {
  return scope.type === 'all' ? 'Tüm takımlar' : scope.value;
}

type Picker = null | 'difficulty' | 'scopeType' | 'league' | 'country';

function ProfileCard({ profile }: { profile: ProfileView }) {
  return (
    <View style={styles.profileCard}>
      <View style={styles.profileRow}>
        <Text style={{ fontSize: 22 }}>{profile.arena.icon}</Text>
        <View style={{ flex: 1 }}>
          <Text style={styles.profileName}>{profile.displayName}</Text>
          <Text style={styles.profileArena}>{profile.arena.name}</Text>
        </View>
        <View style={styles.profileStat}>
          <Text style={styles.profileStatIcon}>🏆</Text>
          <Text style={styles.profileStatVal}>{profile.trophies}</Text>
        </View>
        <View style={styles.profileStat}>
          <Text style={styles.profileStatIcon}>💎</Text>
          <Text style={styles.profileStatVal}>{profile.diamonds}</Text>
        </View>
      </View>
      <View style={styles.profileWL}>
        <Text style={[styles.muted, { fontSize: 11 }]}>
          {profile.wins}G / {profile.losses}M
        </Text>
      </View>
    </View>
  );
}

export function HomeScreen({ actions, state }: Props) {
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [difficulty, setDifficulty] = useState<Difficulty>('medium');
  const [scope, setScope] = useState<Scope>({ type: 'all' });
  const [picker, setPicker] = useState<Picker>(null);
  const opts: GameOptions = { scope, difficulty };
  const profile = state.profile;

  return (
    <Screen>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 20 }} showsVerticalScrollIndicator={false}>
        <View style={styles.center}>
          <Ionicons name="football" size={36} color={theme.primary} />
        </View>
        <Text style={styles.logo}>CROSSOVER</Text>
        <Text style={styles.tagline}>{"İki takımda da oynamış futbolcuyu ilk bilen kazanır"}</Text>

        {profile ? (
          <ProfileCard profile={profile} />
        ) : (
          <>
            <TextInput
              placeholder="Adın"
              placeholderTextColor={theme.muted}
              value={name}
              onChangeText={setName}
              style={styles.input}
            />
            <Btn
              label="Kayıt Ol"
              icon="person-add"
              kind="primary"
              onPress={() => actions.register(name || 'Oyuncu')}
              disabled={!name.trim()}
            />
          </>
        )}

        <Btn
          label="Hemen Oyna"
          icon="flash"
          kind="primary"
          onPress={() => actions.findMatch({ scope })}
          disabled={!profile}
        />
        <Btn label="Lider Tablosu" icon="trophy" kind="ghost" onPress={actions.openLeaderboard} />

        {/* Settings chips */}
        <View style={styles.optRow}>
          <Pressable style={styles.optChip} onPress={() => setPicker('scopeType')}>
            <Ionicons name="globe-outline" size={15} color={theme.accent} />
            <Text style={styles.optChipText} numberOfLines={1}>
              {scopeLabel(scope)}
            </Text>
            <Ionicons name="chevron-down" size={14} color={theme.muted} />
          </Pressable>
          <Pressable style={styles.optChip} onPress={() => setPicker('difficulty')}>
            <Ionicons name="speedometer-outline" size={15} color={theme.accent} />
            <Text style={styles.optChipText}>Bot: {DIFF_LABEL[difficulty]}</Text>
            <Ionicons name="chevron-down" size={14} color={theme.muted} />
          </Pressable>
        </View>

        <Btn
          label="Oda Kur"
          icon="add-circle"
          onPress={() => actions.createRoom(profile?.displayName ?? (name || 'Oyuncu'), opts)}
          disabled={!profile && !name.trim()}
        />
        <Btn
          label="Bot'a Karşı Oyna"
          kind="accent"
          icon="game-controller"
          onPress={() => actions.createSolo(profile?.displayName ?? (name || 'Oyuncu'), opts)}
          disabled={!profile && !name.trim()}
        />
        <View style={styles.divider} />
        <TextInput
          placeholder="ODA KODU"
          placeholderTextColor={theme.muted}
          value={code}
          autoCapitalize="characters"
          onChangeText={(t) => setCode(t.toUpperCase())}
          style={styles.input}
        />
        <Btn
          label="Odaya Katıl"
          kind="ghost"
          icon="enter"
          onPress={() => actions.joinRoom(code, profile?.displayName ?? (name || 'Oyuncu'))}
          disabled={(!profile && !name.trim()) || code.trim().length < 4}
        />
        {state.error ? <Text style={styles.error}>{state.error}</Text> : null}
      </ScrollView>

      <PickerModal
        picker={picker}
        scopes={state.scopes}
        onClose={() => setPicker(null)}
        onDifficulty={(d) => {
          setDifficulty(d);
          setPicker(null);
        }}
        onScope={(s) => {
          setScope(s);
          setPicker(null);
        }}
        goto={setPicker}
      />
    </Screen>
  );
}

function PickerModal({
  picker,
  scopes,
  onClose,
  onDifficulty,
  onScope,
  goto,
}: {
  picker: Picker;
  scopes: GameState['scopes'];
  onClose: () => void;
  onDifficulty: (d: Difficulty) => void;
  onScope: (s: Scope) => void;
  goto: (p: Picker) => void;
}) {
  const visible = picker !== null;
  const allList =
    picker === 'league' ? scopes?.leagues ?? [] : picker === 'country' ? scopes?.countries ?? [] : [];

  const [search, setSearch] = useState('');

  // Reset search when picker changes
  useEffect(() => { setSearch(''); }, [picker]);

  const filtered = search.trim()
    ? allList.filter((o) => (o.displayName ?? o.value).toLowerCase().includes(search.toLowerCase()))
    : allList;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.modalBg} onPress={onClose}>
        <Pressable style={styles.modalCard} onPress={() => {}}>
          {picker === 'difficulty' && (
            <>
              <Text style={styles.modalTitle}>Bot zorluğu</Text>
              {(['easy', 'medium', 'hard'] as Difficulty[]).map((d) => (
                <Pressable key={d} style={styles.modalRow} onPress={() => onDifficulty(d)}>
                  <Text style={styles.modalRowText}>{DIFF_LABEL[d]}</Text>
                </Pressable>
              ))}
            </>
          )}

          {picker === 'scopeType' && (
            <>
              <Text style={styles.modalTitle}>Kapsam</Text>
              <Pressable style={styles.modalRow} onPress={() => onScope({ type: 'all' })}>
                <Text style={styles.modalRowText}>{"Tüm takımlar"}</Text>
              </Pressable>
              <Pressable style={styles.modalRow} onPress={() => goto('league')}>
                <Text style={styles.modalRowText}>{"Lig seç ›"}</Text>
              </Pressable>
              <Pressable style={styles.modalRow} onPress={() => goto('country')}>
                <Text style={styles.modalRowText}>{"Ülke seç ›"}</Text>
              </Pressable>
            </>
          )}

          {(picker === 'league' || picker === 'country') && (
            <>
              <Text style={styles.modalTitle}>{picker === 'league' ? 'Lig seç' : 'Ülke seç'}</Text>
              <View style={styles.modalSearchBox}>
                <Ionicons name="search" size={16} color={theme.muted} />
                <TextInput
                  placeholder={picker === 'league' ? 'Lig ara...' : 'Ülke ara...'}
                  placeholderTextColor={theme.muted}
                  value={search}
                  onChangeText={setSearch}
                  style={styles.modalSearchInput}
                  autoFocus
                />
                {search.length > 0 ? (
                  <Pressable onPress={() => setSearch('')}>
                    <Ionicons name="close-circle" size={16} color={theme.muted} />
                  </Pressable>
                ) : null}
              </View>
              <ScrollView style={{ maxHeight: 320 }} keyboardShouldPersistTaps="handled">
                {filtered.map((o) => (
                  <Pressable
                    key={o.value}
                    style={styles.modalRow}
                    onPress={() => onScope({ type: picker === 'league' ? 'league' : 'country', value: o.value })}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                      {picker === 'league' && o.logoUrl ? (
                        <Image source={{ uri: o.logoUrl }} style={{ width: 24, height: 24 }} resizeMode="contain" />
                      ) : picker === 'country' && o.logoUrl ? (
                        <Text style={{ fontSize: 20 }}>{o.logoUrl}</Text>
                      ) : null}
                      <Text style={[styles.modalRowText, { flex: 1 }]} numberOfLines={1}>{o.displayName ?? o.value}</Text>
                    </View>
                    <Text style={styles.modalCount}>{o.count}</Text>
                  </Pressable>
                ))}
                {filtered.length === 0 && search.trim() ? (
                  <Text style={[styles.muted, { marginTop: 12 }]}>{"Sonuç bulunamadı"}</Text>
                ) : null}
                {allList.length === 0 ? <Text style={styles.muted}>{"Yükleniyor…"}</Text> : null}
              </ScrollView>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ---- Lobby ----
export function LobbyScreen({ state, actions }: Props) {
  const room = state.room!;
  const you = room.players.find((p) => p.id === room.youId);
  const canStart = !!you?.isHost && room.players.length === 2;
  const hasBot = room.players.some((p) => p.name === 'Bot');
  return (
    <Screen>
      {!hasBot ? (
        <>
          <Text style={styles.label}>ODA KODU</Text>
          <Text style={styles.code}>{room.code}</Text>
          <Text style={styles.muted}>Arkadaşına bu kodu gönder</Text>
        </>
      ) : (
        <>
          <Ionicons name="game-controller" size={44} color={theme.accent} style={{ alignSelf: 'center' }} />
          <Text style={styles.h1}>Bot Maçı</Text>
        </>
      )}
      <View style={styles.divider} />
      {room.players.map((p) => (
        <View key={p.id} style={styles.lobbyRow}>
          <Ionicons
            name={p.name === 'Bot' ? 'game-controller' : p.isHost ? 'star' : 'person'}
            size={18}
            color={p.isHost ? theme.accent : theme.muted}
          />
          <Text style={styles.lobbyName}>
            {p.name}
            {p.id === room.youId ? ' (sen)' : ''}
          </Text>
        </View>
      ))}
      <View style={{ height: 24 }} />
      {room.players.length < 2 ? (
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
          <Text style={styles.muted}>Rakip bekleniyor…</Text>
        </View>
      ) : canStart ? (
        <Btn label="Başlat" icon="play" onPress={actions.start} />
      ) : (
        <Text style={styles.muted}>Oda sahibinin başlatması bekleniyor…</Text>
      )}
      <View style={{ height: 16 }} />
      <Btn label="Çık" kind="ghost" icon="close" onPress={actions.leave} />
    </Screen>
  );
}

// ---- Countdown ----
export function CountdownScreen({ state }: Props) {
  return (
    <Screen>
      <View style={styles.center}>
        <Text style={styles.big}>{state.countdown ?? ''}</Text>
        <Text style={styles.muted}>Hazır ol!</Text>
      </View>
    </Screen>
  );
}

// ---- Pick team ----
export function PickTeamScreen({ state, actions }: Props) {
  const [q, setQ] = useState('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pickSecs, setPickSecs] = useState<number | null>(null);

  useEffect(() => {
    if (!state.pickEndsAt) return;
    const tick = () => setPickSecs(Math.max(0, Math.ceil((state.pickEndsAt! - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [state.pickEndsAt]);

  const onChange = (text: string) => {
    setQ(text);
    if (timer.current) clearTimeout(timer.current);
    if (text.trim().length >= 2) timer.current = setTimeout(() => actions.searchClubs(text), 180);
  };

  if (state.picked) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={theme.primary} />
          <Text style={styles.muted}>{"Takımın seçildi. Rakip bekleniyor\u2026"}</Text>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <View style={{ alignItems: 'center', marginBottom: 8 }}>
        <Text style={styles.h1}>{"Bir takım seç"}</Text>
        <View style={styles.pickTimerBox}>
          <Ionicons name="time-outline" size={18} color={pickSecs !== null && pickSecs <= 3 ? theme.danger : theme.accent} />
          <Text style={[styles.pickTimerText, pickSecs !== null && pickSecs <= 3 ? { color: theme.danger } : null]}>
            {pickSecs !== null ? pickSecs : 10}
          </Text>
        </View>
      </View>
      <View style={styles.searchBox}>
        <Ionicons name="search" size={18} color={theme.muted} />
        <TextInput
          placeholder="Takım ara (ör. Galatasaray)"
          placeholderTextColor={theme.muted}
          value={q}
          onChangeText={onChange}
          style={styles.searchInput}
          autoFocus
        />
      </View>
      <ScrollView style={{ alignSelf: 'stretch' }} keyboardShouldPersistTaps="handled">
        {state.clubResults.map((c: ClubRef) => (
          <Pressable key={c.id} style={styles.clubRow} onPress={() => actions.pickTeam(c.id)}>
            <ClubBadge name={c.name} size={32} logoUrl={c.logoUrl} />
            <Text style={styles.clubText} numberOfLines={1}>
              {c.name}
            </Text>
            <Ionicons name="chevron-forward" size={18} color={theme.muted} />
          </Pressable>
        ))}
      </ScrollView>
    </Screen>
  );
}

// ---- Reveal + Guess ----
export function GuessScreen({ state, actions }: Props) {
  const [text, setText] = useState('');
  const teams = state.teams;
  const room = state.room!;
  const youAnswered = state.locked?.byId === room.youId;
  const someoneElseAnswered = state.locked && state.locked.byId !== room.youId;

  const [secs, setSecs] = useState<number | null>(null);
  useEffect(() => {
    if (state.phase !== 'guess' || !state.guessEndsAt) return;
    const tick = () => setSecs(Math.max(0, Math.ceil((state.guessEndsAt! - Date.now()) / 1000)));
    tick();
    const id = setInterval(tick, 250);
    return () => clearInterval(id);
  }, [state.phase, state.guessEndsAt]);

  return (
    <Screen>
      <View style={styles.teamsRow}>
        <View style={styles.teamCard}>
          <ClubBadge name={teams?.teamA.name ?? '?'} size={44} logoUrl={teams?.teamA.logoUrl ?? null} />
          <Text style={styles.teamName} numberOfLines={2}>
            {teams?.teamA.name ?? '…'}
          </Text>
        </View>
        <Ionicons name="add" size={26} color={theme.accent} />
        <View style={styles.teamCard}>
          <ClubBadge name={teams?.teamB.name ?? '?'} size={44} logoUrl={teams?.teamB.logoUrl ?? null} />
          <Text style={styles.teamName} numberOfLines={2}>
            {teams?.teamB.name ?? '…'}
          </Text>
        </View>
      </View>

      {state.phase === 'reveal' ? (
        <Text style={styles.h1}>Hazır ol…</Text>
      ) : (
        <>
          <Text style={styles.timer}>{secs !== null ? `${secs}s` : ''}</Text>
          {someoneElseAnswered ? (
            <View style={styles.center}>
              <Ionicons name="lock-closed" size={28} color={theme.muted} />
              <Text style={styles.muted}>{state.locked?.byName} cevapladı, bekle…</Text>
            </View>
          ) : (
            <>
              <Text style={styles.h1}>Ortak oyuncuyu yaz!</Text>
              <TextInput
                placeholder="Futbolcu adı"
                placeholderTextColor={theme.muted}
                value={text}
                onChangeText={setText}
                style={styles.input}
                autoFocus
                editable={!youAnswered}
                onSubmitEditing={() => text.trim() && actions.submitGuess(text.trim())}
              />
              <Btn
                label="Gönder"
                icon="send"
                onPress={() => actions.submitGuess(text.trim())}
                disabled={!text.trim() || youAnswered}
              />
            </>
          )}
        </>
      )}
    </Screen>
  );
}

// ---- Searching ----
const FUN_FACTS = [
  { icon: '🇧🇷', text: 'Pele, kariyeri boyunca 1.281 gol attı ve bu rekor hâlâ tartışılıyor.' },
  { icon: '🏟️', text: "Camp Nou, Avrupa'nın en büyük stadyumu olarak 99.354 kişi kapasitesine sahiptir." },
  { icon: '🇦🇷', text: "Messi, tek bir takvim yılında 91 gol atarak Gerd Müller'in rekorunu kırdı (2012)." },
  { icon: '🇹🇷', text: "Galatasaray, 2000 yılında UEFA Kupası'nı kazanan ilk Türk takımı oldu." },
  { icon: '🏆', text: "Real Madrid, 15 Şampiyonlar Ligi kupasıyla en çok kazanan takımdır." },
  { icon: '🇮🇹', text: "Paolo Maldini, 25 yıl boyunca yalnızca AC Milan forması giydi." },
  { icon: '⚽', text: "İlk FIFA Dünya Kupası 1930'da Uruguay'da düzenlendi ve ev sahibi Uruguay şampiyon oldu." },
  { icon: '🇫🇷', text: "Zinedine Zidane, 2006 Dünya Kupası finalinde kafa attığı anla tarihe geçti." },
  { icon: '🇩🇪', text: "Bundesliga'da ayakta seyirci bölümleri sayesinde bilet fiyatları Avrupa'nın en düşüğüdür." },
  { icon: '🇳🇱', text: "Johan Cruyff, 'toplam futbol' felsefesinin mimarı olarak kabul edilir." },
  { icon: '🇵🇹', text: "Cristiano Ronaldo, uluslararası arenada en çok gol atan futbolcudur." },
  { icon: '🇪🇸', text: "Barcelona, 2008-2012 arasında tiki-taka stiliyle futbol tarihini değiştirdi." },
  { icon: '🏴󠁧󠁢󠁥󠁮󠁧󠁿', text: "Premier Lig, dünyanın en çok izlenen futbol ligidir; 212 ülkede yayınlanır." },
  { icon: '🇭🇷', text: "Luka Modric, 2018'de Ballon d'Or'u kazanarak Messi-Ronaldo hegemonyasını kırdı." },
  { icon: '🇹🇷', text: "Hakan Şükür, 2002 Dünya Kupası'nda tarihin en erken golünü 11. saniyede attı." },
  { icon: '🧤', text: "Gianluigi Buffon, 40 yaşını geçtikten sonra bile üst düzey kaleciliğe devam etti." },
  { icon: '🇲🇽', text: "Azteca Stadyumu, iki Dünya Kupası finaline ev sahipliği yapan tek stadyumdur." },
  { icon: '🇪🇬', text: "Mohamed Salah, Premier Lig'de tek sezonda 32 gol atarak rekoru kırdı (2017-18)." },
  { icon: '🏅', text: "Alex Ferguson, Manchester United'da 26 yıl teknik direktörlük yaptı ve 38 kupa kazandı." },
  { icon: '🇯🇵', text: "Japonya, 2002'de Güney Kore ile birlikte Dünya Kupası'na ev sahipliği yapan ilk Asya ülkesiydi." },
];

export function SearchingScreen({ actions }: Props) {
  const [factIdx, setFactIdx] = useState(Math.floor(Math.random() * FUN_FACTS.length));

  useEffect(() => {
    const id = setInterval(() => {
      setFactIdx((prev) => (prev + 1) % FUN_FACTS.length);
    }, 6000);
    return () => clearInterval(id);
  }, []);

  const fact = FUN_FACTS[factIdx]!;

  return (
    <Screen>
      <View style={styles.center}>
        <Ionicons name="flash" size={44} color={theme.primary} />
        <Text style={styles.h1}>Rakip Aranıyor</Text>
        <View style={{ height: 20 }} />
        <ActivityIndicator size="large" color={theme.primary} />
        <View style={{ height: 12 }} />
        <Text style={styles.muted}>{"Çevrim içi bir rakip bekleniyor..."}</Text>
      </View>

      <View style={styles.factCard}>
        <Text style={styles.factIcon}>{fact.icon}</Text>
        <Text style={styles.factText}>{fact.text}</Text>
      </View>

      <Btn label="Vazgeç" kind="ghost" icon="close" onPress={actions.cancelSearch} />
    </Screen>
  );
}

// ---- Leaderboard ----
const RANK_COLORS = ['#FFD700', '#C0C0C0', '#CD7F32']; // gold, silver, bronze

export function LeaderboardScreen({ state, actions }: Props) {
  const lb = state.leaderboard;
  return (
    <Screen>
      <View style={styles.center}>
        <Ionicons name="trophy" size={36} color={theme.accent} />
        <Text style={styles.h1}>Lider Tablosu</Text>
      </View>
      <ScrollView style={{ flex: 1, marginTop: 10 }} showsVerticalScrollIndicator={false}>
        {lb.map((entry) => (
          <View key={entry.rank} style={styles.lbRow}>
            <Text style={[styles.lbRank, entry.rank <= 3 ? { color: RANK_COLORS[entry.rank - 1] } : null]}>
              {entry.rank}
            </Text>
            <Text style={{ fontSize: 18 }}>{entry.arena.icon}</Text>
            <View style={{ flex: 1 }}>
              <Text style={styles.lbName} numberOfLines={1}>{entry.displayName}</Text>
              <Text style={styles.lbArena}>{entry.arena.name}</Text>
            </View>
            <View style={styles.lbTrophyBox}>
              <Text style={{ fontSize: 12 }}>🏆</Text>
              <Text style={styles.lbTrophies}>{entry.trophies}</Text>
            </View>
            <Text style={styles.lbWL}>{entry.wins}G {entry.losses}M</Text>
          </View>
        ))}
        {lb.length === 0 ? <Text style={styles.muted}>Henüz oyuncu yok</Text> : null}
      </ScrollView>
      <View style={{ height: 10 }} />
      <Btn label="Geri" kind="ghost" icon="arrow-back" onPress={actions.closeLeaderboard} />
    </Screen>
  );
}

// ---- Result ----
function TeamResultCard({ team, spells, played }: { team: ClubRef; spells: SpellInfo[]; played: boolean }) {
  return (
    <View style={[styles.teamResult, { borderColor: played ? theme.primary : theme.danger }]}>
      <ClubBadge name={team.name} size={40} logoUrl={team.logoUrl} />
      <Text style={styles.teamResultName} numberOfLines={2}>
        {team.name}
      </Text>
      <Ionicons
        name={played ? 'checkmark-circle' : 'close-circle'}
        size={20}
        color={played ? theme.primary : theme.danger}
      />
      <Text style={styles.teamResultYears}>
        {played ? spells.map(yearsText).filter(Boolean).join(', ') || 'oynadı' : 'oynamadı'}
      </Text>
    </View>
  );
}

export function ResultScreen({ state, actions }: Props) {
  const r = state.result!;
  const room = state.room!;
  const you = room.players.find((p) => p.id === room.youId);
  const isHost = !!you?.isHost;

  const { icon, color, headline } = useMemo(() => {
    if (r.reason === 'timeout')
      return { icon: 'time' as IoniconName, color: theme.muted, headline: 'Süre doldu' };
    return r.correct
      ? { icon: 'checkmark-circle' as IoniconName, color: theme.primary, headline: 'DOĞRU' }
      : { icon: 'close-circle' as IoniconName, color: theme.danger, headline: 'YANLIŞ' };
  }, [r]);

  const playedA = r.spellsA.length > 0;
  const playedB = r.spellsB.length > 0;

  return (
    <Screen>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 30 }} showsVerticalScrollIndicator={false}>
        <View style={styles.center}>
          <Ionicons name={icon} size={64} color={color} />
          <Text style={[styles.h1, { color }]}>{headline}</Text>
          {r.matchedPlayerImageUrl ? (
            <Image source={{ uri: r.matchedPlayerImageUrl }} style={styles.playerPhoto} />
          ) : null}
          {r.matchedPlayerName ? <Text style={styles.matched}>{r.matchedPlayerName}</Text> : null}
          {r.answeredByName ? (
            <Text style={styles.muted}>
              {r.answeredByName} • "{r.guess}"
            </Text>
          ) : null}
          {r.autocorrected ? (
            <View style={styles.fixRow}>
              <Ionicons name="swap-horizontal" size={13} color={theme.accent} />
              <Text style={styles.fixText}>otomatik düzeltildi</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.teamResultRow}>
          <TeamResultCard team={r.teamA} spells={r.spellsA} played={playedA} />
          <TeamResultCard team={r.teamB} spells={r.spellsB} played={playedB} />
        </View>

        {r.allClubs.length ? (
          <>
            <Text style={styles.sectionLabel}>KARİYER</Text>
            {r.allClubs.map((s, i) => (
              <CareerRow
                key={`${s.clubId}-${i}`}
                spell={s}
                highlight={s.clubId === r.teamA.id || s.clubId === r.teamB.id}
              />
            ))}
          </>
        ) : null}

        {!r.correct ? (
          <>
            <Text style={styles.sectionLabel}>{"İKİ TAKIMDA DA OYNAMIŞ OYUNCULAR"}</Text>
            {r.commonPlayers && r.commonPlayers.length > 0 ? (
              r.commonPlayers.map((cp, i) => (
                <View key={i} style={styles.commonRow}>
                  {cp.imageUrl ? (
                    <Image source={{ uri: cp.imageUrl }} style={styles.commonPhoto} resizeMode="cover" />
                  ) : (
                    <View style={[styles.commonPhoto, { backgroundColor: badgeColor(cp.name), alignItems: 'center', justifyContent: 'center' }]}>
                      <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{initial(cp.name)}</Text>
                    </View>
                  )}
                  <Text style={styles.commonName}>{cp.name}</Text>
                </View>
              ))
            ) : (
              <Text style={[styles.muted, { marginTop: 6 }]}>
                {"Bu iki takımda ortak oynamış oyuncu bulunamadı"}
              </Text>
            )}
          </>
        ) : r.commonPlayers && r.commonPlayers.length > 1 ? (
          <>
            <Text style={styles.sectionLabel}>DİĞER ORTAK OYUNCULAR</Text>
            {r.commonPlayers.filter(cp => cp.name !== r.matchedPlayerName).map((cp, i) => (
              <View key={i} style={styles.commonRow}>
                {cp.imageUrl ? (
                  <Image source={{ uri: cp.imageUrl }} style={styles.commonPhoto} resizeMode="cover" />
                ) : (
                  <View style={[styles.commonPhoto, { backgroundColor: badgeColor(cp.name), alignItems: 'center', justifyContent: 'center' }]}>
                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14 }}>{initial(cp.name)}</Text>
                  </View>
                )}
                <Text style={styles.commonName}>{cp.name}</Text>
              </View>
            ))}
          </>
        ) : null}

        <View style={styles.scoreRow}>
          {room.players.map((p) => (
            <View key={p.id} style={styles.scoreChip}>
              <Ionicons name={p.name === 'Bot' ? 'game-controller' : 'person'} size={14} color={theme.muted} />
              <Text style={styles.scoreText}>
                {p.name} {p.score}
              </Text>
            </View>
          ))}
        </View>

        {isHost ? (
          <Btn label="Tekrar Oyna" kind="accent" icon="refresh" onPress={actions.playAgain} />
        ) : (
          <Text style={styles.muted}>Oda sahibi yeni tur başlatabilir…</Text>
        )}
        <View style={{ height: 10 }} />
        <Btn label="Çık" kind="ghost" icon="close" onPress={actions.leave} />
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: theme.bg, padding: 22, justifyContent: 'center' },
  center: { alignItems: 'center', gap: 6 },
  logo: { color: theme.primary, fontSize: 28, fontWeight: '900', textAlign: 'center', letterSpacing: 2, marginTop: 6 },
  tagline: { color: theme.muted, textAlign: 'center', marginBottom: 20, marginTop: 4, fontSize: 12 },
  h1: { color: theme.text, fontSize: 16, fontWeight: '800', textAlign: 'center', marginVertical: 6 },
  label: { color: theme.muted, fontSize: 10, letterSpacing: 2, textAlign: 'center' },
  sectionLabel: { color: theme.muted, fontSize: 10, letterSpacing: 2, marginTop: 12, marginBottom: 4 },
  code: { color: theme.accent, fontSize: 32, fontWeight: '900', textAlign: 'center', letterSpacing: 4 },
  big: { color: theme.text, fontSize: 64, fontWeight: '900' },
  muted: { color: theme.muted, textAlign: 'center', fontSize: 12 },
  error: { color: theme.danger, textAlign: 'center', marginTop: 10, fontSize: 12 },
  input: {
    backgroundColor: theme.card,
    color: theme.text,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 10,
    padding: 12,
    fontSize: 14,
    marginVertical: 6,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    marginVertical: 8,
  },
  searchInput: { flex: 1, color: theme.text, paddingVertical: 12, fontSize: 14 },
  btn: {
    flexDirection: 'row',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 4,
    borderColor: theme.border,
  },
  btnText: { fontSize: 14, fontWeight: '800' },
  divider: { height: 1, backgroundColor: theme.border, marginVertical: 16, alignSelf: 'stretch' },
  lobbyRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginVertical: 5 },
  lobbyName: { color: theme.text, fontSize: 14 },
  clubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: theme.card,
    borderRadius: 12,
    padding: 12,
    marginVertical: 4,
  },
  clubText: { color: theme.text, fontSize: 13, flex: 1 },
  teamsRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10 },
  teamCard: { flex: 1, backgroundColor: theme.card, borderRadius: 14, padding: 14, alignItems: 'center', gap: 8 },
  teamName: { color: theme.text, fontSize: 13, fontWeight: '700', textAlign: 'center' },
  plus: { color: theme.accent, fontSize: 22, fontWeight: '900' },
  timer: { color: theme.accent, fontSize: 22, fontWeight: '900', textAlign: 'center', marginTop: 8 },
  playerPhoto: { width: 80, height: 80, borderRadius: 40, marginTop: 8, borderWidth: 2, borderColor: theme.border },
  matched: { color: theme.text, fontSize: 18, fontWeight: '800', textAlign: 'center', marginTop: 2 },
  fixRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  fixText: { color: theme.accent, fontSize: 12, fontWeight: '600' },
  teamResultRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
  teamResult: { flex: 1, backgroundColor: theme.card, borderRadius: 14, borderWidth: 1.5, padding: 12, alignItems: 'center', gap: 6 },
  teamResultName: { color: theme.text, fontSize: 12, fontWeight: '700', textAlign: 'center' },
  teamResultYears: { color: theme.muted, fontSize: 10, textAlign: 'center' },
  careerList: { alignSelf: 'stretch', maxHeight: 220 },
  careerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 7,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  careerRowHi: { backgroundColor: 'rgba(61,220,132,0.10)', borderRadius: 8 },
  careerClub: { color: theme.text, fontSize: 12, flex: 1 },
  careerYears: { color: theme.muted, fontSize: 11 },
  pickTimerBox: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: theme.card, borderRadius: 20, paddingVertical: 6, paddingHorizontal: 14, marginTop: 6, borderWidth: 1, borderColor: theme.border },
  pickTimerText: { color: theme.accent, fontSize: 22, fontWeight: '900' },
  factCard: { backgroundColor: theme.card, borderRadius: 12, padding: 16, marginVertical: 24, borderWidth: 1, borderColor: theme.border, alignItems: 'center', gap: 10 },
  factIcon: { fontSize: 28 },
  factText: { color: theme.text, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  lbRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.card, borderRadius: 10, padding: 10, marginVertical: 3, borderWidth: 1, borderColor: theme.border },
  lbRank: { color: theme.muted, fontSize: 15, fontWeight: '900', width: 24, textAlign: 'center' },
  lbName: { color: theme.text, fontSize: 13, fontWeight: '700' },
  lbArena: { color: theme.accent, fontSize: 10 },
  lbTrophyBox: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  lbTrophies: { color: theme.accent, fontSize: 13, fontWeight: '800' },
  lbWL: { color: theme.muted, fontSize: 10, width: 40, textAlign: 'right' },
  profileCard: { backgroundColor: theme.card, borderRadius: 12, padding: 12, marginVertical: 8, borderWidth: 1, borderColor: theme.border },
  profileRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  profileName: { color: theme.text, fontSize: 15, fontWeight: '800' },
  profileArena: { color: theme.accent, fontSize: 11, fontWeight: '600' },
  profileStat: { alignItems: 'center', gap: 2 },
  profileStatIcon: { fontSize: 14 },
  profileStatVal: { color: theme.text, fontSize: 13, fontWeight: '700' },
  profileWL: { alignItems: 'flex-end', marginTop: 4 },
  commonList: { alignSelf: 'stretch', marginTop: 4 },
  commonRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: theme.border },
  commonPhoto: { width: 32, height: 32, borderRadius: 16, overflow: 'hidden' },
  commonName: { color: theme.text, fontSize: 13, fontWeight: '600', flex: 1 },
  scoreRow: { flexDirection: 'row', justifyContent: 'center', gap: 10, marginVertical: 14 },
  scoreChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.card,
    borderRadius: 20,
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  scoreText: { color: theme.text, fontSize: 12, fontWeight: '700' },
  optRow: { flexDirection: 'row', gap: 8, marginBottom: 4 },
  optChip: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: theme.card,
    borderColor: theme.border,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  optChipText: { color: theme.text, fontSize: 12, fontWeight: '600', flex: 1 },
  modalBg: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: theme.card,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: 20,
    paddingBottom: 34,
    borderTopWidth: 1,
    borderColor: theme.border,
  },
  modalSearchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: theme.bg, borderRadius: 10, paddingHorizontal: 12, marginBottom: 8 },
  modalSearchInput: { flex: 1, color: theme.text, paddingVertical: 10, fontSize: 13 },
  modalTitle: { color: theme.text, fontSize: 15, fontWeight: '800', marginBottom: 8 },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: theme.border,
  },
  modalRowText: { color: theme.text, fontSize: 13 },
  modalCount: { color: theme.muted, fontSize: 11 },
});
