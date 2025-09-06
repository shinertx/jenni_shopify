import { appConfig } from '../config.js';

export interface ProfitGuardInputs {
  price: number; // selling price (PDP price)
  distanceMiles: number;
  trustScore: number;
  buyCost?: number; // optional procurement cost (e.g., JENNi minPrice)
}

export interface ProfitGuardResult {
  price: number;
  landed_cost: number;
  buy_cost: number; // alias for clarity in demos
  fee: number;
  courier_est: number;
  margin: number;
  floor: number;
  trustScore: number;
  pass: boolean;
  reason: 'ok' | 'low_margin' | 'low_trust';
}

export function computeProfitGuard({ price, distanceMiles, trustScore, buyCost }: ProfitGuardInputs): ProfitGuardResult {
  const PG = appConfig.profitGuard;
  const courier_est = PG.courierBase + PG.courierPerMile * distanceMiles;
  const fee = PG.feePct * price;
  const landed_cost = typeof buyCost === 'number' && Number.isFinite(buyCost)
    ? buyCost
    : PG.cogsPct * price;
  const floor = Math.max(PG.floorAbs, PG.floorPct * price);
  const margin = price - landed_cost - fee - courier_est;
  const pass = margin >= floor && trustScore >= PG.trustThreshold;
  return {
    price,
    landed_cost: round2(landed_cost),
    buy_cost: round2(landed_cost),
    fee: round2(fee),
    courier_est: round2(courier_est),
    margin: round2(margin),
    floor: round2(floor),
    trustScore: round2(trustScore),
    pass,
    reason: pass ? 'ok' : (trustScore < PG.trustThreshold ? 'low_trust' : 'low_margin')
  };
}

export function round2(n: number){
  return Number(n.toFixed(2));
}

export function etaMinutesForZip(zip: string): number | null {
  if (!zip) return null;
  return zip.startsWith('94') ? 80 : 110; // demo heuristic
}
