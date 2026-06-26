/* Receipt & Acknowledgement — two-stage GRN for the two inbound mediums
   (embossing vendor + inter-branch transfer). See receiptAckPlan.md. */

import { useState } from "react";
import {
  PackageCheck, Truck, ShieldCheck, Search, X, AlertTriangle, FileText,
  ArrowLeftRight, Inbox, CheckCircle2,
} from "lucide-react";
import { Card, Badge, Kpi, SectionTitle, Th, Td } from "./ui";
import {
  statusMeta, reasonMeta, reasonSlas, officersFor,
  verifyRows, nextDiscId, nextExcId, matchesSearch, DISCREPANCY_REASONS,
} from "../lib/receipts";

const stamp = () => {
  const d = new Date();
  return `27 Jun 2026 ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

function StatusPill({ status }) {
  const m = statusMeta(status);
  return <Badge tone={m.tone}>{m.label}</Badge>;
}

/* ------------------------------ Stage-1 gate receipt ------------------------------ */
function Stage1Modal({ er, branchName, onClose, onConfirm }) {
  const officers = officersFor(er.branch);
  const [form, setForm] = useState({
    cartons: er.asn?.carton ? 1 : 1,
    sealsIntact: true,
    declaredQty: er.expectedQty,
    challan: er.asn?.shipment ? `DC-${er.asn.carton}` : "",
    by: officers[0],
  });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const ref = er.source === "VENDOR" ? `Job ${er.jobExecId}` : er.crNumber;

  return (
    <Overlay onClose={onClose}>
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Inbox className="h-4 w-4 text-indigo-600" />Stage 1 · Gate receipt — {ref} · {branchName}</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-3 px-5 py-4 text-sm">
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          Expected: <span className="font-mono font-semibold text-slate-800">{er.expectedQty.toLocaleString()}</span> {er.product} · range {er.range}
          {er.asn ? <> · ASN {er.asn.shipment || er.asn.carton} · AWB {er.asn.awb || "—"}</> : <> · <span className="text-amber-600">no ASN — matched by {er.source === "VENDOR" ? "Job + Branch" : "CR number"}</span></>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Cover letter / challan no."><input value={form.challan} onChange={e => set("challan", e.target.value)} placeholder="DC-…" className="w-full rounded-lg border border-slate-300 px-2 py-1.5" /></Field>
          <Field label="Cartons received"><input type="number" min={0} value={form.cartons} onChange={e => set("cartons", e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono" /></Field>
          <Field label="Declared qty on challan"><input type="number" min={0} value={form.declaredQty} onChange={e => set("declaredQty", e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono" /></Field>
          <Field label="Received by"><select value={form.by} onChange={e => set("by", e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5">{officers.map(o => <option key={o}>{o}</option>)}</select></Field>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.sealsIntact} onChange={e => set("sealsIntact", e.target.checked)} />
          Tamper-evident seals intact
        </label>
        {!form.sealsIntact && (
          <div className="flex items-center gap-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700"><AlertTriangle className="h-3.5 w-3.5" />A tampered-seal discrepancy will be raised and the lot held for full Stage-2 recount.</div>
        )}
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
        <button onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
        <button onClick={() => onConfirm(er, form)} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500">Confirm receipt → Pending ack</button>
      </div>
    </Overlay>
  );
}

/* ------------------------------ Stage-2 vault verification ------------------------------ */
function Stage2Modal({ er, branchName, productName, onClose, onAccept }) {
  const officers = officersFor(er.branch);
  const stage1By = er.stage1?.by;
  const pickable = officers.filter(o => o !== stage1By);
  const [rows, setRows] = useState(() => verifyRows(er).map(r => ({ ...r, counted: r.expected, reason: "" })));
  const [verifiedBy, setVerifiedBy] = useState(pickable[0] || officers[0]);
  const [checker, setChecker] = useState(pickable[1] || pickable[0] || officers[0]);
  const [blind, setBlind] = useState(false);

  const setRow = (key, patch) => setRows(rs => rs.map(r => r.key === key ? { ...r, ...patch } : r));
  const totals = rows.reduce((a, r) => {
    const c = Number(r.counted) || 0, v = c - r.expected;
    a.counted += c; a.expected += r.expected;
    a.accepted += Math.min(c, r.expected);
    a.quarantined += v > 0 ? v : 0;     // excess held; shorts are simply missing
    if (v !== 0) a.variances += 1;
    return a;
  }, { counted: 0, expected: 0, accepted: 0, quarantined: 0, variances: 0 });

  const sodOk = verifiedBy !== stage1By && checker !== stage1By && checker !== verifiedBy;
  const reasonsMissing = rows.some(r => (Number(r.counted) || 0) - r.expected !== 0 && !r.reason);
  const canAccept = sodOk && !reasonsMissing;

  const ref = er.source === "VENDOR" ? `Job ${er.jobExecId}` : er.crNumber;

  return (
    <Overlay onClose={onClose} wide>
      <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><ShieldCheck className="h-4 w-4 text-indigo-600" />Stage 2 · Vault verification (dual custody) — {ref} · {branchName}</h3>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
      </div>
      <div className="space-y-3 px-5 py-4 text-sm">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span>Gate-received by <span className="font-medium text-slate-800">{stage1By || "—"}</span> ({er.stage1?.declaredQty?.toLocaleString() || er.expectedQty} declared)</span>
          <label className="ml-auto flex items-center gap-1.5"><input type="checkbox" checked={blind} onChange={e => setBlind(e.target.checked)} />Blind count (hide expected)</label>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr><Th>SR / lot</Th><Th>Product</Th><Th>Serial range</Th>{!blind && <Th className="text-right">Expected</Th>}<Th className="text-right">Counted</Th><Th className="text-right">Δ</Th><Th>Reason (if Δ≠0)</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(r => {
                const c = Number(r.counted) || 0, v = c - r.expected;
                return (
                  <tr key={r.key} className={v !== 0 ? "bg-amber-50/40" : ""}>
                    <Td className="font-mono text-xs text-indigo-700">{r.label}</Td>
                    <Td className="text-xs">{productName(r.product)}</Td>
                    <Td className="font-mono text-xs text-slate-500">{r.range}</Td>
                    {!blind && <Td className="text-right font-mono">{r.expected}</Td>}
                    <Td className="text-right"><input type="number" min={0} value={r.counted} onChange={e => setRow(r.key, { counted: e.target.value })} className="w-20 rounded border border-slate-300 px-1.5 py-1 text-right font-mono" /></Td>
                    <Td className={`text-right font-mono font-semibold ${v < 0 ? "text-rose-600" : v > 0 ? "text-amber-600" : "text-slate-400"}`}>{v > 0 ? "+" : ""}{v}</Td>
                    <Td>{v !== 0
                      ? <select value={r.reason} onChange={e => setRow(r.key, { reason: e.target.value })} className={`rounded border px-1.5 py-1 text-xs ${r.reason ? "border-slate-300" : "border-rose-300 bg-rose-50"}`}><option value="">— select —</option>{DISCREPANCY_REASONS.map(rs => <option key={rs.code} value={rs.code}>{rs.label}</option>)}</select>
                      : <span className="text-xs text-slate-400">—</span>}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-4 text-xs">
          <span>Clean to vault: <span className="font-mono font-semibold text-emerald-600">{totals.accepted.toLocaleString()}</span></span>
          <span>Quarantine: <span className="font-mono font-semibold text-rose-600">{totals.quarantined.toLocaleString()}</span></span>
          <span>Discrepancies: <span className="font-mono font-semibold text-amber-600">{totals.variances}</span></span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Verified by (custodian)"><select value={verifiedBy} onChange={e => setVerifiedBy(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5">{officers.map(o => <option key={o} disabled={o === stage1By}>{o}</option>)}</select></Field>
          <Field label="Checker (joint officer)"><select value={checker} onChange={e => setChecker(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5">{officers.map(o => <option key={o} disabled={o === stage1By}>{o}</option>)}</select></Field>
        </div>
        {!sodOk && <div className="flex items-center gap-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700"><AlertTriangle className="h-3.5 w-3.5" />Segregation of duties: verifier & checker must differ from each other and from the Stage-1 receiver ({stage1By}).</div>}
        {reasonsMissing && <div className="flex items-center gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-700"><AlertTriangle className="h-3.5 w-3.5" />Select a reason for every row with a variance before accepting.</div>}
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
        <button onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
        <button disabled={!canAccept} onClick={() => onAccept(er, { rows, verifiedBy, checker, blind, totals })}
          className={`rounded-lg px-3 py-1.5 text-sm font-medium text-white ${canAccept ? "bg-emerald-600 hover:bg-emerald-500" : "cursor-not-allowed bg-slate-300"}`}>
          {totals.variances ? "Accept clean → vault · raise discrepancies" : "Accept → In branch vault"}
        </button>
      </div>
    </Overlay>
  );
}

/* ------------------------------ small helpers ------------------------------ */
function Overlay({ children, onClose, wide }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-auto bg-slate-900/40 p-4 pt-16" onClick={onClose}>
      <div className={`w-full ${wide ? "max-w-3xl" : "max-w-lg"} rounded-xl bg-white shadow-xl`} onClick={e => e.stopPropagation()}>{children}</div>
    </div>
  );
}
function Field({ label, children }) {
  return <label className="block"><span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>{children}</label>;
}

/* ------------------------------ main screen ------------------------------ */
export default function ReceiptAck({ expectedReceipts, setExpectedReceipts, addDiscrepancy, addException, toast, branches, products, productColors }) {
  const [tab, setTab] = useState("worklist");
  const [src, setSrc] = useState("ALL");
  const [branch, setBranch] = useState("ALL");
  const [statusF, setStatusF] = useState("ALL");
  const [q, setQ] = useState("");
  const [stage1, setStage1] = useState(null);
  const [stage2, setStage2] = useState(null);

  const branchName = id => (branches.find(b => b.id === id)?.name) || id;
  const productName = code => (products.find(p => p.code === code)?.name) || code;

  const open = expectedReceipts.filter(er => er.status !== "IN_BRANCH_VAULT");
  const done = expectedReceipts.filter(er => er.status === "IN_BRANCH_VAULT");
  const list = (tab === "worklist" ? open : done).filter(er =>
    (src === "ALL" || er.source === src) &&
    (branch === "ALL" || er.branch === branch) &&
    (statusF === "ALL" || er.status === statusF) &&
    matchesSearch(er, q));

  const kpis = {
    inbound: open.length,
    inTransit: expectedReceipts.filter(er => er.status === "IN_TRANSIT").length,
    awaiting: expectedReceipts.filter(er => ["RECEIVED_PENDING_ACK", "PARTIALLY_ACCEPTED", "QUARANTINED"].includes(er.status)).length,
    vault: done.length,
  };

  /* Stage-1 confirm */
  function confirmStage1(er, form) {
    const sealsIntact = !!form.sealsIntact;
    setExpectedReceipts(prev => prev.map(x => x.id === er.id ? {
      ...x, status: "RECEIVED_PENDING_ACK",
      stage1: { by: form.by, at: stamp(), cartons: Number(form.cartons), declaredQty: Number(form.declaredQty), sealsIntact, challan: form.challan },
    } : x));
    if (!sealsIntact) {
      const excId = nextExcId([]);
      const disc = {
        discId: nextDiscId([]), source: er.source, ref: er.source === "VENDOR" ? er.jobExecId : er.crNumber, file: er.file,
        branch: er.branch, product: er.product, sr: "—", lot: er.asn?.carton || "consignment", reason: "TAMPERED_SEAL",
        expected: er.expectedQty, received: er.expectedQty, variance: 0, sev: "High", status: "Open", owner: "Branch Manager",
        sla: reasonSlas.High, linkedException: excId, raisedAt: stamp(), raisedBy: form.by,
        note: "Tamper-evident seal reported broken at gate; lot held for full Stage-2 recount.",
        timeline: [{ at: stamp(), who: form.by, what: "Raised at gate receipt (tampered seal)" }],
      };
      addDiscrepancy(disc);
      addException({ id: excId, sev: "High", type: "GRN discrepancy — Tampered seal", where: `${branchName(er.branch)} · ${disc.ref}`, note: disc.note, sla: disc.sla, status: "Open" });
    }
    toast(`Stage-1 receipt recorded · ${er.source === "VENDOR" ? "Job " + er.jobExecId : er.crNumber} → Received · pending ack`);
    setStage1(null);
  }

  /* Stage-2 accept */
  function acceptStage2(er, payload) {
    const newDiscs = [];
    payload.rows.forEach(r => {
      const counted = Number(r.counted) || 0, v = counted - r.expected;
      if (v !== 0 && r.reason) {
        const rm = reasonMeta(r.reason);
        const excId = nextExcId(newDiscs);
        newDiscs.push({
          discId: nextDiscId(newDiscs), source: er.source, ref: er.source === "VENDOR" ? er.jobExecId : er.crNumber, file: er.file,
          branch: er.branch, product: er.product, sr: er.source === "VENDOR" ? r.label : "—", lot: r.range, reason: r.reason,
          expected: r.expected, received: counted, variance: v, sev: rm.sev, status: "Open", owner: "Custodian",
          sla: reasonSlas[rm.sev], linkedException: excId, raisedAt: stamp(), raisedBy: payload.verifiedBy,
          note: `${rm.label}: counted ${counted} vs expected ${r.expected} (${v > 0 ? "+" : ""}${v}).`,
          timeline: [{ at: stamp(), who: payload.verifiedBy, what: "Raised at vault verification" }],
        });
      }
    });
    newDiscs.forEach(d => {
      addDiscrepancy(d);
      addException({ id: d.linkedException, sev: d.sev, type: `GRN discrepancy — ${reasonMeta(d.reason).label}`, where: `${branchName(er.branch)} · ${d.ref}`, note: d.note, sla: d.sla, status: "Open" });
    });
    const { accepted, quarantined, variances } = payload.totals;
    const newStatus = accepted === 0 ? "QUARANTINED" : variances ? "PARTIALLY_ACCEPTED" : "IN_BRANCH_VAULT";
    setExpectedReceipts(prev => prev.map(x => x.id === er.id ? {
      ...x, status: newStatus,
      stage2: { by: payload.verifiedBy, checker: payload.checker, at: stamp(), acceptedQty: accepted, quarantinedQty: quarantined, blind: payload.blind },
    } : x));
    toast(variances
      ? `Verified with ${variances} discrepancy(ies) · ${accepted.toLocaleString()} to vault, ${quarantined.toLocaleString()} quarantined`
      : `Accepted ${accepted.toLocaleString()} into branch vault → In branch vault`);
    setStage2(null);
  }

  const srcIcon = s => (s === "VENDOR" ? Truck : ArrowLeftRight);

  return (
    <div className="space-y-6">
      <SectionTitle icon={PackageCheck} title="Receipt & Acknowledgement"
        sub="Two-stage GRN for card orders from the embossing vendor (Job Execution ID) and inter-branch transfers (CR number). Keyboard search now; scan-to-receive later."
        right={
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
            {[["worklist", "Inbound worklist"], ["completed", "Completed GRNs"]].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${tab === id ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{label}</button>
            ))}
          </div>
        } />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Open inbound" value={kpis.inbound} sub="awaiting receipt/verify" tone="indigo" />
        <Kpi label="In transit" value={kpis.inTransit} sub="awaiting Stage-1 gate receipt" tone="amber" />
        <Kpi label="Awaiting verify" value={kpis.awaiting} sub="Stage-2 custodian count" tone="amber" />
        <Kpi label="In branch vault" value={kpis.vault} sub="completed GRNs" tone="green" />
      </div>

      <Card className="flex flex-wrap items-center gap-3 p-3">
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 p-1">
          {[["ALL", "All"], ["VENDOR", "Vendor"], ["TRANSFER", "Transfer"]].map(([id, label]) => (
            <button key={id} onClick={() => setSrc(id)} className={`rounded-md px-2.5 py-1 text-sm font-medium transition ${src === id ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{label}</button>
          ))}
        </div>
        <select value={branch} onChange={e => setBranch(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-sm">
          <option value="ALL">All branches</option>
          {branches.filter(b => b.id !== "VAULT").map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5">
          <Search className="h-4 w-4 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="Job 3466 · ASN · CR · AWB · seal…" className="w-56 text-sm outline-none" />
        </div>
        <span className="ml-auto text-xs text-slate-500">{list.length} document{list.length === 1 ? "" : "s"}</span>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr><Th>Reference</Th><Th>Source</Th><Th>Branch</Th><Th>Product</Th><Th className="text-right">Exp. qty</Th><Th>Serial range</Th><Th>ASN</Th><Th>Status</Th><Th className="text-right">Action</Th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map(er => {
              const Icon = srcIcon(er.source);
              const ref = er.source === "VENDOR" ? `Job ${er.jobExecId}` : er.crNumber;
              return (
                <tr key={er.id} className="hover:bg-slate-50">
                  <Td className="font-mono text-indigo-700">{ref}<div className="text-xs font-normal text-slate-400">{er.file || er.from || ""}</div></Td>
                  <Td><span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600"><Icon className="h-3.5 w-3.5" />{er.source === "VENDOR" ? "Vendor" : "Transfer"}</span></Td>
                  <Td className="text-sm">{branchName(er.branch)}</Td>
                  <Td className="flex items-center gap-1.5 text-xs"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: productColors[er.product] }} />{er.product}</Td>
                  <Td className="text-right font-mono font-semibold">{er.expectedQty.toLocaleString()}</Td>
                  <Td className="font-mono text-xs text-slate-500">{er.range}</Td>
                  <Td className="text-xs">{er.asn ? <span className="text-slate-600">{er.asn.shipment || er.asn.carton}</span> : <span className="text-amber-600">none</span>}</Td>
                  <Td><StatusPill status={er.status} /></Td>
                  <Td className="text-right">
                    {er.status === "IN_TRANSIT" && <button onClick={() => setStage1(er)} className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500">Receive</button>}
                    {["RECEIVED_PENDING_ACK", "PARTIALLY_ACCEPTED", "QUARANTINED"].includes(er.status) && <button onClick={() => setStage2(er)} className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500">Verify →</button>}
                    {er.status === "IN_BRANCH_VAULT" && <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-600"><CheckCircle2 className="h-3.5 w-3.5" />GRN done</span>}
                  </Td>
                </tr>
              );
            })}
            {list.length === 0 && <tr><Td className="text-slate-400" >No matching documents.</Td></tr>}
          </tbody>
        </table>
      </Card>

      {tab === "completed" && done.length > 0 && (
        <Card className="p-4">
          <div className="mb-2 flex items-center gap-2"><FileText className="h-4 w-4 text-indigo-600" /><h3 className="text-sm font-semibold text-slate-800">GRN acceptance summary</h3></div>
          <div className="space-y-2 text-xs">
            {done.map(er => (
              <div key={er.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-slate-200 p-2.5">
                <span className="font-mono text-indigo-700">{er.source === "VENDOR" ? `Job ${er.jobExecId}` : er.crNumber} · {branchName(er.branch)} · {er.product}</span>
                <span className="text-slate-600">Stage-1 {er.stage1?.by} · Stage-2 {er.stage2?.by} / checker {er.stage2?.checker}</span>
                <span className="font-mono">accepted <span className="font-semibold text-emerald-600">{er.stage2?.acceptedQty?.toLocaleString()}</span>{er.stage2?.quarantinedQty ? <> · quarantined <span className="font-semibold text-rose-600">{er.stage2.quarantinedQty}</span></> : null}</span>
              </div>
            ))}
          </div>
        </Card>
      )}

      {stage1 && <Stage1Modal er={stage1} branchName={branchName(stage1.branch)} onClose={() => setStage1(null)} onConfirm={confirmStage1} />}
      {stage2 && <Stage2Modal er={stage2} branchName={branchName(stage2.branch)} productName={productName} onClose={() => setStage2(null)} onAccept={acceptStage2} />}
    </div>
  );
}
