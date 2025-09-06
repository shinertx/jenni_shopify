// Centralized configuration & lightweight env validation.
// This keeps the rest of the codebase cleaner and avoids scattered process.env reads.

export interface AppConfig {
	port: number;
	redisUrl: string | null;
	jenni: {
		enabled: boolean;
		apiHost: string | null;
		clientId: string | null;
		clientSecret: string | null;
	};
	googleMapsKey: string | null;
	profitGuard: {
		floorAbs: number;
		floorPct: number;
		feePct: number;
		cogsPct: number;
		courierBase: number;
		courierPerMile: number;
		trustThreshold: number;
		etaCutoffMin: number;
	};
	preview: {
		fetchTimeoutMs: number;
		rateLimitWindowMs: number;
		rateLimitMax: number;
	};
}

function num(name: string, def: number): number {
	const raw = process.env[name];
	const v = raw !== undefined ? Number(raw) : def;
	return Number.isFinite(v) ? v : def;
}

const REQUIRED_JENNI: Array<keyof Omit<AppConfig['jenni'], 'enabled'>> = [ 'apiHost', 'clientId', 'clientSecret' ];

function buildConfig(): AppConfig {
	const jenni = {
		apiHost: process.env.JENNI_API_HOST || null,
		clientId: process.env.JENNI_CLIENT_ID || null,
		clientSecret: process.env.JENNI_CLIENT_SECRET || null,
		enabled: true,
	} as AppConfig['jenni'];

	// Determine if Jenni integration is usable.
	const missing = REQUIRED_JENNI.filter(k => !(jenni as any)[k]);
	if (missing.length > 0) {
		jenni.enabled = false;
		console.warn('[config] JENNI integration disabled – missing:', missing.join(', '));
	}

	const cfg: AppConfig = {
		port: num('PORT', 4000),
		redisUrl: process.env.REDIS_URL || null,
		jenni,
		googleMapsKey: process.env.GOOGLE_MAPS_API_KEY || null,
		profitGuard: {
			floorAbs: num('PROFIT_FLOOR_ABS', 8),
			floorPct: num('PROFIT_FLOOR_PCT', 0.12),
			feePct: num('PROFIT_FEE_PCT', 0.08),
			cogsPct: num('DEFAULT_COGS_PCT', 0.6),
			courierBase: num('COURIER_BASE', 7),
			courierPerMile: num('COURIER_PER_MILE', 1.2),
			trustThreshold: num('TRUST_THRESHOLD', 0.5),
			etaCutoffMin: num('ETA_CUTOFF_MIN', 720),
		},
		preview: {
			fetchTimeoutMs: num('PREVIEW_FETCH_TIMEOUT_MS', 6000),
			rateLimitWindowMs: num('PREVIEW_RATE_WINDOW_MS', 60_000),
			rateLimitMax: num('PREVIEW_RATE_MAX', 40),
		},
	};
	return cfg;
}

export const appConfig: AppConfig = buildConfig();
