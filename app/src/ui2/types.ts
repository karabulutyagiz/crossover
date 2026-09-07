// UI2 ortak tipler: mevcut oyun mantığı (useCrossover) dışa 'Actions' tipini vermiyor → türetilir.
import type { useCrossover } from '../useCrossover';
export type { GameState } from '../useCrossover';
export type Actions = ReturnType<typeof useCrossover>['actions'];
