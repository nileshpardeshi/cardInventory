/* Deterministic daily issuance series for the CIM demo (no persistence).
   Seeded so it is stable across reloads; embeds day-of-week seasonality,
   a salary-week bump, a mild trend and bounded pseudo-noise. */

export const DOW = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
export const DAYS = 84; // 12 weeks

/* Per-product demand behaviour. dow weights are relative (normalised at runtime). */
const PROFILES = {
  "DEB-CLS": { dow: [1.15, 1.20, 1.18, 1.12, 1.28, 0.72, 0.40], trend: 0.0010, noise: 0.10, salary: 0.18, gap: 0.00 }, // high-vol, strong weekday → Holt-Winters
  "DEB-PLT": { dow: [1.08, 1.12, 1.10, 1.08, 1.20, 0.82, 0.55], trend: 0.0030, noise: 0.16, salary: 0.12, gap: 0.00 }, // rising trend → Holt
  "PPD-GFT": { dow: [0.85, 0.95, 1.00, 1.08, 1.35, 1.45, 0.60], trend: -0.0012, noise: 0.30, salary: 0.10, gap: 0.10 }, // noisy, weekend-leaning
  "DEB-PRS": { dow: [1.00, 1.10, 1.00, 1.05, 1.10, 0.45, 0.15], trend: 0.0005, noise: 0.38, salary: 0.05, gap: 0.45 }, // personalised arrivals — intermittent/lumpy
};

/* Small LCG → deterministic [0,1) */
function rngFactory(seed) {
  let s = (seed >>> 0) || 1;
  return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; };
}

export function dailySeries(seed, avgDaily, code) {
  const p = PROFILES[code] || PROFILES["DEB-CLS"];
  const dowMean = p.dow.reduce((a, b) => a + b, 0) / 7;
  const rnd = rngFactory(seed * 7 + code.length * 101);
  const out = [];
  for (let i = 0; i < DAYS; i++) {
    const seasonal = p.dow[i % 7] / dowMean;           // weekday shape, mean 1
    const trend = 1 + p.trend * (i - DAYS / 2);         // centred → mean ~1
    const salary = (i % 30) < 7 ? 1 + p.salary : 1;     // first week of each ~month
    const noise = 1 + (rnd() - 0.5) * 2 * p.noise;
    let v = avgDaily * seasonal * trend * salary * noise;
    if (p.gap && rnd() < p.gap) v = 0;                  // intermittent zero-demand days
    out.push(Math.max(0, Math.round(v)));
  }
  return out;
}

/* Sum a daily series into consecutive 7-day weeks (oldest -> newest) */
export function toWeekly(daily) {
  const w = [];
  for (let i = 0; i < daily.length; i += 7) w.push(daily.slice(i, i + 7).reduce((a, b) => a + b, 0));
  return w;
}

/* Day-of-week profile: average per weekday and index vs overall average (100 = average) */
export function dowProfile(daily) {
  const sums = Array(7).fill(0), cnt = Array(7).fill(0);
  daily.forEach((v, i) => { sums[i % 7] += v; cnt[i % 7]++; });
  const avg = sums.map((s, i) => (cnt[i] ? s / cnt[i] : 0));
  const overall = avg.reduce((a, b) => a + b, 0) / 7 || 1;
  return DOW.map((d, i) => ({ day: d, avg: Math.round(avg[i] * 10) / 10, index: Math.round((100 * avg[i]) / overall) }));
}
