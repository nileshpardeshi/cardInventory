/* Discrepancy register — receipt-centric view of GRN discrepancies, each linked
   to an Exception case. Captured at Stage-1/Stage-2 of Receipt & Acknowledgement.
   See receiptAckPlan.md Part D. */

import { useState } from "react";
import { FileWarning, X, AlertTriangle, ArrowLeftRight, Truck, ChevronRight, ExternalLink } from "lucide-react";
import { Card, Badge, Kpi, SectionTitle, Th, Td } from "./ui";
import { reasonMeta, RESOLUTION_CODES } from "../lib/receipts";

const SEV_TONE = { High: "rose", Medium: "amber", Low: "slate" };
const STATUS_TONE = { Open: "rose", Investigating: "amber", Resolved: "green", Closed: "slate" };
const FLOW = ["Open", "Investigating", "Resolved", "Closed"];

const stamp = () => {
  const d = new Date();
  return `27 Jun 2026 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

export default function Discrepancies({ discrepancies, setDiscrepancies, toast, branches }) {
  const [statusF, setStatusF] = useState("ALL");
  const [srcF, setSrcF] = useState("ALL");
  const [reasonF, setReasonF] = useState("ALL");
  const [openId, setOpenId] = useState(null);

  const branchName = id => (branches.find(b => b.id === id)?.name) || id;

  const list = discrepancies.filter(d =>
    (statusF === "ALL" || d.status === statusF) &&
    (srcF === "ALL" || d.source === srcF) &&
    (reasonF === "ALL" || d.reason === reasonF));

  const kpis = {
    open: discrepancies.filter(d => d.status === "Open").length,
    investigating: discrepancies.filter(d => d.status === "Investigating").length,
    resolved: discrepancies.filter(d => ["Resolved", "Closed"].includes(d.status)).length,
    high: discrepancies.filter(d => d.sev === "High" && d.status !== "Closed").length,
  };

  const reasons = [...new Set(discrepancies.map(d => d.reason))];
  const active = discrepancies.find(d => d.discId === openId) || null;

  function advance(disc, to, resolution) {
    setDiscrepancies(prev => prev.map(d => d.discId === disc.discId ? {
      ...d, status: to,
      ...(resolution ? { resolution } : {}),
      timeline: [...(d.timeline || []), { at: stamp(), who: d.owner || "Owner", what: to === "Resolved" && resolution ? `Resolved · ${RESOLUTION_CODES.find(r => r.code === resolution)?.label || resolution}` : `Status → ${to}` }],
    } : d));
    toast(`${disc.discId} → ${to}`);
  }

  return (
    <div className="space-y-6">
      <SectionTitle icon={FileWarning} title="Discrepancies"
        sub="Receipt & GRN discrepancies, captured per SR / lot and linked to an Exception case with SLA and escalation." />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Open" value={kpis.open} tone="rose" />
        <Kpi label="Investigating" value={kpis.investigating} tone="amber" />
        <Kpi label="Resolved / closed" value={kpis.resolved} tone="green" />
        <Kpi label="High severity (active)" value={kpis.high} tone="rose" />
      </div>

      <Card className="flex flex-wrap items-center gap-3 p-3">
        <Filter label="Status" value={statusF} set={setStatusF} options={["ALL", ...FLOW]} />
        <Filter label="Source" value={srcF} set={setSrcF} options={["ALL", "VENDOR", "TRANSFER"]} />
        <Filter label="Reason" value={reasonF} set={setReasonF} options={["ALL", ...reasons]} render={v => v === "ALL" ? "All" : reasonMeta(v).label} />
        <span className="ml-auto text-xs text-slate-500">{list.length} case{list.length === 1 ? "" : "s"}</span>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr><Th>ID</Th><Th>Reference</Th><Th>Branch</Th><Th>SR / lot</Th><Th>Reason</Th><Th className="text-right">Δ</Th><Th>Severity</Th><Th>Status</Th><Th>SLA</Th><Th></Th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map(d => {
              const Icon = d.source === "VENDOR" ? Truck : ArrowLeftRight;
              return (
                <tr key={d.discId} className="cursor-pointer hover:bg-slate-50" onClick={() => setOpenId(d.discId)}>
                  <Td className="font-mono text-xs text-indigo-700">{d.discId}</Td>
                  <Td className="text-xs"><span className="inline-flex items-center gap-1.5"><Icon className="h-3.5 w-3.5 text-slate-400" />{d.source === "VENDOR" ? `Job ${d.ref}` : d.ref}</span></Td>
                  <Td className="text-sm">{branchName(d.branch)}</Td>
                  <Td className="font-mono text-xs text-slate-500">{d.sr && d.sr !== "—" ? d.sr : d.lot}</Td>
                  <Td className="text-xs">{reasonMeta(d.reason).label}</Td>
                  <Td className={`text-right font-mono font-semibold ${d.variance < 0 ? "text-rose-600" : d.variance > 0 ? "text-amber-600" : "text-slate-400"}`}>{d.variance > 0 ? "+" : ""}{d.variance}</Td>
                  <Td><Badge tone={SEV_TONE[d.sev]}>{d.sev}</Badge></Td>
                  <Td><Badge tone={STATUS_TONE[d.status]}>{d.status}</Badge></Td>
                  <Td className="text-xs text-slate-500">{d.sla}</Td>
                  <Td className="text-right text-slate-400"><ChevronRight className="h-4 w-4" /></Td>
                </tr>
              );
            })}
            {list.length === 0 && <tr><Td className="text-slate-400">No discrepancies match the filter — clean receipts.</Td></tr>}
          </tbody>
        </table>
      </Card>

      {active && <DetailDrawer disc={active} branchName={branchName(active.branch)} onClose={() => setOpenId(null)} onAdvance={advance} />}
    </div>
  );
}

function Filter({ label, value, set, options, render }) {
  return (
    <label className="flex items-center gap-1.5 text-sm">
      <span className="text-xs font-medium text-slate-500">{label}</span>
      <select value={value} onChange={e => set(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm">
        {options.map(o => <option key={o} value={o}>{render ? render(o) : (o === "ALL" ? "All" : o)}</option>)}
      </select>
    </label>
  );
}

function DetailDrawer({ disc, branchName, onClose, onAdvance }) {
  const [resolution, setResolution] = useState(disc.resolution || RESOLUTION_CODES[0].code);
  const rm = reasonMeta(disc.reason);
  const idx = FLOW.indexOf(disc.status);
  const next = idx >= 0 && idx < FLOW.length - 1 ? FLOW[idx + 1] : null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-end overflow-auto bg-slate-900/40" onClick={onClose}>
      <div className="min-h-full w-full max-w-md bg-white shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><FileWarning className="h-4 w-4 text-amber-500" />{disc.discId}</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-4 px-5 py-4 text-sm">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={SEV_TONE[disc.sev]}>{disc.sev}</Badge>
            <Badge tone={STATUS_TONE[disc.status]}>{disc.status}</Badge>
            <span className="text-xs text-slate-500">SLA {disc.sla}</span>
          </div>

          <dl className="space-y-1.5">
            {[
              ["Reason", rm.label],
              ["Source", disc.source === "VENDOR" ? `Vendor · Job ${disc.ref}` : `Transfer · ${disc.ref}`],
              ["Branch", branchName],
              ["Product", disc.product],
              ["SR / lot", (disc.sr && disc.sr !== "—") ? disc.sr : disc.lot],
              ["Expected / received", `${disc.expected} / ${disc.received}`],
              ["Variance", `${disc.variance > 0 ? "+" : ""}${disc.variance}`],
              ["Owner", disc.owner],
              ["Raised", `${disc.raisedAt} · ${disc.raisedBy}`],
            ].map(([k, v]) => (
              <div key={k} className="flex justify-between gap-3 border-b border-slate-100 pb-1"><dt className="text-slate-500">{k}</dt><dd className="text-right font-medium text-slate-800">{v}</dd></div>
            ))}
          </dl>

          {disc.note && <div className="rounded-lg bg-slate-50 p-2.5 text-xs text-slate-600">{disc.note}</div>}

          <div>
            <div className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Linked exception</div>
            <span className="inline-flex items-center gap-1 font-mono text-xs text-indigo-700">{disc.linkedException}<ExternalLink className="h-3 w-3" /></span>
          </div>

          {disc.timeline && (
            <div>
              <div className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-slate-500">Timeline</div>
              <ol className="space-y-1.5">
                {disc.timeline.map((t, i) => (
                  <li key={i} className="flex gap-2 text-xs"><span className="mt-0.5 h-2 w-2 shrink-0 rounded-full bg-indigo-400" /><span><span className="text-slate-400">{t.at}</span> · {t.who} — {t.what}</span></li>
                ))}
              </ol>
            </div>
          )}

          {disc.status !== "Closed" && (
            <div className="space-y-2 rounded-lg border border-slate-200 p-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Advance case</div>
              {(disc.status === "Investigating" || next === "Resolved") && (
                <label className="block text-xs">Resolution
                  <select value={resolution} onChange={e => setResolution(e.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
                    {RESOLUTION_CODES.map(r => <option key={r.code} value={r.code}>{r.label}</option>)}
                  </select>
                </label>
              )}
              <div className="flex flex-wrap gap-2">
                {next && (
                  <button onClick={() => onAdvance(disc, next, next === "Resolved" ? resolution : undefined)}
                    className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500">→ {next}</button>
                )}
                {disc.status === "Resolved" && (
                  <button onClick={() => onAdvance(disc, "Closed")} className="rounded-lg bg-slate-700 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-600">Close case</button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
