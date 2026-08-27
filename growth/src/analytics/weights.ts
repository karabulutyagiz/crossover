import { pool } from '../db/pool.ts';

// learning_state okuma/yazma. Ağırlık sözlüğü boyut başına {anahtar: ağırlık}
// tutar; boş durumda her şey 1.0 kabul edilir (uniform).

export interface PlatformWeights {
  pillar: Record<string, number>;
  hook_type: Record<string, number>;
  cta: Record<string, number>;
  slot: Record<string, number>;
}

export const EMPTY_WEIGHTS: PlatformWeights = { pillar: {}, hook_type: {}, cta: {}, slot: {} };

export async function loadWeights(platform: string): Promise<PlatformWeights> {
  const { rows } = await pool.query<{ weights: Partial<PlatformWeights> }>(
    `SELECT weights FROM growth_learning_state WHERE platform = $1`,
    [platform],
  );
  const w = rows[0]?.weights ?? {};
  return {
    pillar: w.pillar ?? {},
    hook_type: w.hook_type ?? {},
    cta: w.cta ?? {},
    slot: w.slot ?? {},
  };
}

export async function saveWeights(platform: string, weights: PlatformWeights): Promise<void> {
  await pool.query(
    `INSERT INTO growth_learning_state (platform, weights, updated_at)
     VALUES ($1, $2::jsonb, now())
     ON CONFLICT (platform) DO UPDATE SET weights = EXCLUDED.weights, updated_at = now()`,
    [platform, JSON.stringify(weights)],
  );
}
