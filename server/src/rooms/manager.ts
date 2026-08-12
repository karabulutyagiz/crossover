import { Room } from './room.ts';

// Unambiguous charset (no O/0, I/1) for human-shareable room codes.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LEN = 6;

// Ayrıntılı canlı maç kartı (admin paneli) — Room.matchInfo()'nun dönüş tipi.
export type MatchInfo = ReturnType<Room['matchInfo']>;

export class RoomManager {
  private rooms = new Map<string, Room>();

  createRoom(): Room {
    const code = this.genCode();
    const room = new Room(code, (c) => this.rooms.delete(c));
    this.rooms.set(code, room);
    return room;
  }

  get(code: string): Room | undefined {
    return this.rooms.get(code.toUpperCase());
  }

  get count(): number {
    return this.rooms.size;
  }

  // Admin paneli için canlı oda istatistikleri: açık oda sayısı, o an maçta olan
  // insan oyuncular, lobide bekleyenler, bot maçı sayısı ve duruma göre dağılım.
  liveStats(): {
    rooms: number;
    playersInMatch: number;
    inLobby: number;
    botMatches: number;
    byStatus: Record<string, number>;
  } {
    let rooms = 0;
    let playersInMatch = 0;
    let inLobby = 0;
    let botMatches = 0;
    const byStatus: Record<string, number> = {};
    for (const room of this.rooms.values()) {
      const s = room.liveSnapshot();
      rooms++;
      byStatus[s.status] = (byStatus[s.status] ?? 0) + 1;
      if (s.bots > 0) botMatches++;
      if (s.status === 'lobby') inLobby += s.humans;
      else playersInMatch += s.humans;
    }
    return { rooms, playersInMatch, inLobby, botMatches, byStatus };
  }

  // Admin paneli için o an açık her odanın ayrıntılı kartı (kim kime karşı).
  liveMatches(): MatchInfo[] {
    return [...this.rooms.values()].map((r) => r.matchInfo());
  }

  private genCode(): string {
    for (let attempt = 0; attempt < 50; attempt++) {
      let code = '';
      for (let i = 0; i < CODE_LEN; i++) {
        code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
      }
      if (!this.rooms.has(code)) return code;
    }
    throw new Error('Could not generate a unique room code');
  }
}
