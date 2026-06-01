import { useCallback, useEffect, useReducer, useRef } from 'react';
import { SERVER_URL, HTTP_URL } from './config';
import type {
  ClientMsg,
  ClubRef,
  GameOptions,
  RoomView,
  RoundResult,
  ScopesList,
  ServerMsg,
} from './protocol';

export type Phase = 'home' | 'lobby' | 'countdown' | 'pick' | 'reveal' | 'guess' | 'result';

export interface GameState {
  connected: boolean;
  phase: Phase;
  room: RoomView | null;
  error: string | null;
  countdown: number | null;
  teams: { teamA: ClubRef; teamB: ClubRef } | null;
  picked: boolean;
  guessEndsAt: number | null;
  locked: { byId: string; byName: string } | null;
  result: RoundResult | null;
  clubResults: ClubRef[];
  scopes: ScopesList | null;
}

const initialState: GameState = {
  connected: false,
  phase: 'home',
  room: null,
  error: null,
  countdown: null,
  teams: null,
  picked: false,
  guessEndsAt: null,
  locked: null,
  result: null,
  clubResults: [],
  scopes: null,
};

// Local actions are prefixed with "_" to distinguish them from server messages.
type Action =
  | ServerMsg
  | { type: '_connected'; value: boolean }
  | { type: '_reset' }
  | { type: '_picked' }
  | { type: '_scopes'; scopes: ScopesList };

function reducer(state: GameState, action: Action): GameState {
  switch (action.type) {
    case '_connected':
      return { ...state, connected: action.value };
    case '_reset':
      return { ...initialState, scopes: state.scopes };
    case '_picked':
      return { ...state, picked: true };
    case '_scopes':
      return { ...state, scopes: action.scopes };

    case 'room_state':
      return {
        ...state,
        room: action.room,
        // Only the first room_state moves us out of "home"; phase transitions
        // afterwards are driven by the explicit phase events below.
        phase: state.phase === 'home' ? 'lobby' : state.phase,
        error: state.phase === 'home' ? null : state.error,
      };
    case 'countdown':
      return { ...state, phase: 'countdown', countdown: action.n, result: null, teams: null, locked: null };
    case 'pick_phase':
      return { ...state, phase: 'pick', picked: false, teams: null, locked: null, result: null, clubResults: [] };
    case 'reveal_teams':
      return { ...state, phase: 'reveal', teams: { teamA: action.teamA, teamB: action.teamB } };
    case 'guess_phase':
      return { ...state, phase: 'guess', guessEndsAt: action.endsAt };
    case 'guess_locked':
      return { ...state, locked: { byId: action.byId, byName: action.byName } };
    case 'result':
      return {
        ...state,
        phase: 'result',
        result: action.result,
        room: state.room ? { ...state.room, players: action.players } : state.room,
      };
    case 'club_results':
      return { ...state, clubResults: action.clubs };
    case 'opponent_left':
      return { ...state, phase: 'lobby', error: 'Rakip ayrıldı', teams: null, result: null, locked: null };
    case 'error':
      return { ...state, error: action.message };
    default:
      return state;
  }
}

export function useCrossover() {
  const [state, dispatch] = useReducer(reducer, initialState);
  const wsRef = useRef<WebSocket | null>(null);

  const connectAndSend = useCallback((first: ClientMsg) => {
    wsRef.current?.close();
    const ws = new WebSocket(SERVER_URL);
    wsRef.current = ws;
    ws.onopen = () => {
      dispatch({ type: '_connected', value: true });
      ws.send(JSON.stringify(first));
    };
    ws.onmessage = (e) => {
      try {
        dispatch(JSON.parse(String(e.data)) as ServerMsg);
      } catch {
        /* ignore malformed */
      }
    };
    ws.onclose = () => dispatch({ type: '_connected', value: false });
    ws.onerror = () => dispatch({ type: 'error', message: 'Sunucuya bağlanılamadı' });
  }, []);

  const send = useCallback((msg: ClientMsg) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
  }, []);

  // Load available leagues/countries once for the scope picker.
  useEffect(() => {
    let alive = true;
    fetch(`${HTTP_URL}/scopes`)
      .then((r) => r.json())
      .then((s: ScopesList) => {
        if (alive) dispatch({ type: '_scopes', scopes: s });
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);

  const actions = {
    createRoom: (name: string, options?: GameOptions) =>
      connectAndSend({ type: 'create_room', name, options }),
    createSolo: (name: string, options?: GameOptions) =>
      connectAndSend({ type: 'create_solo', name, options }),
    joinRoom: (code: string, name: string) => connectAndSend({ type: 'join_room', code: code.toUpperCase(), name }),
    start: () => send({ type: 'start' }),
    pickTeam: (clubId: number) => {
      send({ type: 'pick_team', clubId });
      dispatch({ type: '_picked' });
    },
    searchClubs: (q: string) => send({ type: 'search_clubs', reqId: 'q', q }),
    submitGuess: (text: string) => send({ type: 'submit_guess', text }),
    playAgain: () => send({ type: 'play_again' }),
    leave: () => {
      wsRef.current?.close();
      wsRef.current = null;
      dispatch({ type: '_reset' });
    },
  };

  return { state, actions };
}
