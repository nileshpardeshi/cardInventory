/* Shared UI primitives for the CIM demo.
   Extracted so the main app and feature modules (ReceiptAck, Discrepancies, …)
   render with one consistent set of components. Pure presentational — no state. */

export const SEV = {
  High: "bg-rose-100 text-rose-700",
  Medium: "bg-amber-100 text-amber-700",
  Low: "bg-slate-200 text-slate-600",
};

const TONES = {
  slate: "bg-slate-200 text-slate-700",
  green: "bg-emerald-100 text-emerald-700",
  amber: "bg-amber-100 text-amber-700",
  rose: "bg-rose-100 text-rose-700",
  indigo: "bg-indigo-100 text-indigo-700",
  sky: "bg-sky-100 text-sky-700",
};

export function Badge({ tone = "slate", children }) {
  return <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${TONES[tone] || TONES.slate}`}>{children}</span>;
}

export function Card({ children, className = "" }) {
  return <div className={`rounded-xl border border-slate-200 bg-white shadow-sm ${className}`}>{children}</div>;
}

export function SectionTitle({ icon: Icon, title, sub, right }) {
  return (
    <div className="mb-4 flex items-end justify-between gap-4">
      <div>
        <div className="flex items-center gap-2">
          {Icon && <Icon className="h-5 w-5 text-indigo-600" />}
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
        </div>
        {sub && <p className="mt-0.5 text-sm text-slate-500">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

export function Kpi({ label, value, sub, tone = "slate" }) {
  const tones = { slate: "text-slate-900", rose: "text-rose-600", amber: "text-amber-600", green: "text-emerald-600", indigo: "text-indigo-600" };
  return (
    <Card className="p-4">
      <div className="text-xs font-medium uppercase tracking-wide text-slate-500">{label}</div>
      <div className={`mt-1 font-mono text-2xl font-semibold ${tones[tone]}`}>{value}</div>
      {sub && <div className="mt-1 text-xs text-slate-500">{sub}</div>}
    </Card>
  );
}

export function Th({ children, className = "" }) {
  return <th className={`px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 ${className}`}>{children}</th>;
}

export function Td({ children, className = "" }) {
  return <td className={`px-3 py-2.5 text-sm text-slate-700 ${className}`}>{children}</td>;
}
