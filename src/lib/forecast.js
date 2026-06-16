/* Demand-forecasting & usage-pattern math for the CIM demo.
   Pure, dependency-free, deterministic. Operates on a numeric series
   ordered oldest -> newest. See cardInventoryRequirement.md §8.9 / §11 Flow Q. */

/* ----------------------------- basic stats ----------------------------- */
export const mean = a => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0);

export function std(a) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}

/* coefficient of variation = σ / mean */
export const cv = a => { const m = mean(a); return m ? std(a) / m : 0; };

/* ----------------------------- forecast methods -----------------------------
   Each returns { name, fit, forecast } where:
     fit         = one-step-ahead in-sample forecast aligned to the series
                   (null during the warm-up window) — used to back-test accuracy
     forecast(m) = m-step-ahead forecast (m >= 1)
--------------------------------------------------------------------------- */

/* Simple moving average over the last k points */
export function sma(series, k = 7) {
  const fit = series.map((_, i) => (i < k ? null : mean(series.slice(i - k, i))));
  const f = mean(series.slice(-k));
  return { name: `SMA-${k}`, fit, forecast: () => f };
}

/* Weighted moving average, linearly recent-heavy (weights 1..k) */
export function wma(series, k = 7) {
  const weights = Array.from({ length: k }, (_, i) => i + 1);
  const wsum = weights.reduce((a, b) => a + b, 0);
  const calc = win => win.reduce((s, x, i) => s + x * weights[i], 0) / wsum;
  const fit = series.map((_, i) => (i < k ? null : calc(series.slice(i - k, i))));
  const f = calc(series.slice(-k));
  return { name: `WMA-${k}`, fit, forecast: () => f };
}

/* Single exponential smoothing (level only) */
export function ses(series, alpha = 0.3) {
  const fit = [];
  let f = series[0] ?? 0;
  for (let i = 0; i < series.length; i++) {
    fit.push(i === 0 ? null : f);
    f = alpha * series[i] + (1 - alpha) * f;
  }
  return { name: `SES·α${alpha}`, fit, forecast: () => f };
}

/* Holt's linear trend (double exponential smoothing) */
export function holt(series, alpha = 0.3, beta = 0.1) {
  if (series.length < 2) {
    const v = series[0] ?? 0;
    return { name: "Holt", fit: series.map(() => null), forecast: () => v };
  }
  let level = series[0];
  let trend = series[1] - series[0];
  const fit = [null];
  for (let i = 1; i < series.length; i++) {
    fit.push(level + trend); // one-step forecast for period i
    const prev = level;
    level = alpha * series[i] + (1 - alpha) * (level + trend);
    trend = beta * (level - prev) + (1 - beta) * trend;
  }
  return { name: "Holt", fit, forecast: m => level + m * trend, level, trend };
}

/* Holt-Winters (triple exponential, multiplicative seasonal). Needs >= 2 seasons. */
export function holtWinters(series, season = 7, alpha = 0.3, beta = 0.05, gamma = 0.3) {
  if (series.length < 2 * season) return null;
  const first = series.slice(0, season);
  let level = mean(first);
  let trend = (mean(series.slice(season, 2 * season)) - level) / season;
  const seasonal = first.map(x => (level ? x / level : 1));
  const fit = series.map(() => null);
  for (let i = season; i < series.length; i++) {
    const s = seasonal[i % season] || 1;
    fit[i] = (level + trend) * s;
    const prev = level;
    level = alpha * (series[i] / s) + (1 - alpha) * (level + trend);
    trend = beta * (level - prev) + (1 - beta) * trend;
    seasonal[i % season] = gamma * (series[i] / (level || 1)) + (1 - gamma) * s;
  }
  const n = series.length;
  const forecast = m => Math.max(0, (level + m * trend) * (seasonal[(n + m - 1) % season] || 1));
  return { name: `Holt-Winters·s${season}`, fit, forecast, level, trend, seasonal };
}

/* ----------------------------- accuracy ----------------------------- */
export function metrics(series, fit) {
  let n = 0, ae = 0, ape = 0, se = 0, pe = 0;
  for (let i = 0; i < series.length; i++) {
    if (fit[i] == null) continue;
    const e = series[i] - fit[i];
    n++; ae += Math.abs(e); se += e * e;
    if (series[i] !== 0) { ape += Math.abs(e / series[i]); pe += e / series[i]; }
  }
  if (!n) return { mape: null, mae: null, rmse: null, bias: null };
  return { mape: (100 * ape) / n, mae: ae / n, rmse: Math.sqrt(se / n), bias: (100 * pe) / n };
}

/* Run every candidate, back-test, return the lowest-MAPE model (+ its metrics). */
export function bestForecast(series, { season = 7 } = {}) {
  const candidates = [sma(series, season), wma(series, season), ses(series), holt(series)];
  const hw = holtWinters(series, season);
  if (hw) candidates.push(hw);
  const scored = candidates
    .map(c => ({ ...c, ...metrics(series, c.fit) }))
    .filter(c => c.mape != null);
  scored.sort((a, b) => a.mape - b.mape);
  return scored[0] || holt(series);
}

/* ----------------------------- usage-pattern classifiers ----------------------------- */

/* Linear-regression trend, expressed as % of mean per period */
export function trendPct(series) {
  const n = series.length;
  if (n < 2) return 0;
  const xs = series.map((_, i) => i);
  const xbar = mean(xs), ybar = mean(series);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (xs[i] - xbar) * (series[i] - ybar); den += (xs[i] - xbar) ** 2; }
  const slope = den ? num / den : 0;
  return ybar ? (slope / ybar) * 100 : 0;
}

export const volatilityClass = cvVal => (cvVal < 0.5 ? "Smooth" : cvVal <= 1.0 ? "Variable" : "Erratic");
export const xyz = cvVal => (cvVal < 0.5 ? "X" : cvVal <= 1.0 ? "Y" : "Z");

/* Syntetos–Boylan demand classification from a daily series */
export function sbcClass(daily) {
  const nz = daily.filter(v => v > 0);
  const adi = nz.length ? daily.length / nz.length : Infinity;
  const cv2 = cv(nz) ** 2;
  if (adi < 1.32 && cv2 < 0.49) return "Smooth";
  if (adi < 1.32) return "Erratic";
  if (cv2 < 0.49) return "Intermittent";
  return "Lumpy";
}

/* ABC (Pareto) classes from [{ code, total }]: A ≤70%, B ≤90%, C rest */
export function abcClasses(items) {
  const sorted = [...items].sort((a, b) => b.total - a.total);
  const grand = sorted.reduce((s, x) => s + x.total, 0) || 1;
  let cum = 0; const out = {};
  sorted.forEach(x => { cum += x.total; const pct = cum / grand; out[x.code] = pct <= 0.7 ? "A" : pct <= 0.9 ? "B" : "C"; });
  return out;
}

export function peak(series) {
  const m = mean(series), mx = Math.max(...series);
  return { ratio: m ? mx / m : 0, value: mx };
}

/* Forecast-driven safety stock & reorder point (z = service factor, L = lead-time days) */
export function safetyStock(sigmaDaily, leadDays, z = 1.65) { return z * sigmaDaily * Math.sqrt(leadDays); }
export function reorderPoint(forecastDaily, leadDays, sigmaDaily, z = 1.65) {
  return Math.round(forecastDaily * leadDays + safetyStock(sigmaDaily, leadDays, z));
}
