/* Branch Transfer Order — end-to-end outbound inter-branch transfer:
   request → approve → allocate (lot picking) → dispatch. On dispatch it emits a
   TRANSFER Expected Receipt into Receipt & Acknowledgement. See receiptAckPlan.md Part M. */

import { useState } from "react";
import {
  ArrowLeftRight, X, Plus, Truck, Boxes, CheckCircle2, AlertTriangle, Search, Send, ClipboardCheck,
} from "lucide-react";
import { Card, Badge, Kpi, SectionTitle, Th, Td } from "./ui";
import {
  txMeta, TRANSFER_TYPES, lotsFor, fifoSuggest, allocSum, subRange,
  nextCrId, allocRangeStr, expectedReceiptFromCR,
} from "../lib/transfers";
import { officersFor } from "../lib/receipts";

const dateStamp = () => "27 Jun 2026";

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
function ModalHead({ icon: Icon, title, onClose }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-200 px-5 py-3">
      <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Icon className="h-4 w-4 text-indigo-600" />{title}</h3>
      <button onClick={onClose} className="text-slate-400 hover:text-slate-600"><X className="h-4 w-4" /></button>
    </div>
  );
}
const StatusPill = ({ status }) => { const m = txMeta(status); return <Badge tone={m.tone}>{m.label}</Badge>; };

/* ------------------------------ New request ------------------------------ */
function NewRequestModal({ branches, products, onClose, onCreate }) {
  const opts = branches;
  const [f, setF] = useState({ type: "REQUEST_CARDS", product: products[0].code, fromBranch: "VAULT", toBranch: "PUN01", requestedQty: 250, maker: "Branch maker", note: "" });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const valid = f.fromBranch !== f.toBranch && Number(f.requestedQty) > 0;
  const t = TRANSFER_TYPES.find(x => x.code === f.type);
  return (
    <Overlay onClose={onClose}>
      <ModalHead icon={Plus} title="New transfer order" onClose={onClose} />
      <div className="space-y-3 px-5 py-4 text-sm">
        <div className="flex gap-1 rounded-lg border border-slate-200 p-1">
          {TRANSFER_TYPES.map(tt => (
            <button key={tt.code} onClick={() => set("type", tt.code)} className={`flex-1 rounded-md px-2.5 py-1.5 text-sm font-medium transition ${f.type === tt.code ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{tt.label}</button>
          ))}
        </div>
        <p className="text-xs text-slate-500">{t.hint} · {t.mode}</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Product"><select value={f.product} onChange={e => set("product", e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5">{products.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}</select></Field>
          <Field label="Quantity"><input type="number" min={1} value={f.requestedQty} onChange={e => set("requestedQty", e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono" /></Field>
          <Field label={f.type === "REQUEST_CARDS" ? "Fulfiller (from)" : "Source (from)"}><select value={f.fromBranch} onChange={e => set("fromBranch", e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5">{opts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
          <Field label="Destination (to)"><select value={f.toBranch} onChange={e => set("toBranch", e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5">{opts.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        </div>
        <Field label="Note"><input value={f.note} onChange={e => set("note", e.target.value)} placeholder="reason / reference" className="w-full rounded-lg border border-slate-300 px-2 py-1.5" /></Field>
        {!valid && <div className="flex items-center gap-2 rounded-lg bg-amber-50 p-2 text-xs text-amber-700"><AlertTriangle className="h-3.5 w-3.5" />From and To must differ and quantity must be &gt; 0.</div>}
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
        <button onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
        <button disabled={!valid} onClick={() => onCreate(f)} className={`rounded-lg px-3 py-1.5 text-sm font-medium text-white ${valid ? "bg-indigo-600 hover:bg-indigo-500" : "cursor-not-allowed bg-slate-300"}`}>Raise → New</button>
      </div>
    </Overlay>
  );
}

/* ------------------------------ Approve (maker-checker) ------------------------------ */
function ApproveModal({ cr, branchName, onClose, onApprove, onReject }) {
  const approveBranch = cr.type === "REQUEST_CARDS" ? cr.toBranch : cr.fromBranch;
  const officers = officersFor(approveBranch).filter(o => o !== cr.reqMaker);
  const [checker, setChecker] = useState(officers[0]);
  return (
    <Overlay onClose={onClose}>
      <ModalHead icon={ClipboardCheck} title={`Approve request — ${cr.cr}`} onClose={onClose} />
      <div className="space-y-3 px-5 py-4 text-sm">
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">{cr.requestedQty.toLocaleString()} × {cr.product} · {branchName(cr.fromBranch)} → {branchName(cr.toBranch)} · raised by {cr.reqMaker}</div>
        <Field label={`Checker (${branchName(approveBranch)}, must differ from maker)`}><select value={checker} onChange={e => setChecker(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5">{officersFor(approveBranch).map(o => <option key={o} disabled={o === cr.reqMaker}>{o}</option>)}</select></Field>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
        <button onClick={() => onReject(cr)} className="mr-auto rounded-lg border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-600 hover:bg-rose-50">Reject</button>
        <button onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
        <button disabled={!checker || checker === cr.reqMaker} onClick={() => onApprove(cr, checker)} className={`rounded-lg px-3 py-1.5 text-sm font-medium text-white ${checker && checker !== cr.reqMaker ? "bg-indigo-600 hover:bg-indigo-500" : "cursor-not-allowed bg-slate-300"}`}>Approve →</button>
      </div>
    </Overlay>
  );
}

/* ------------------------------ Allocate (lot picking, FIFO, multi-lot) ------------------------------ */
function AllocateModal({ cr, branchLots, branchName, productName, onClose, onAllocate }) {
  const lots = lotsFor(branchLots, cr.fromBranch, cr.product);
  const officers = officersFor(cr.fromBranch);
  const [alloc, setAlloc] = useState(() => fifoSuggest(lots, cr.requestedQty));
  const [by, setBy] = useState(officers[0]);
  const setQty = (lot, v) => setAlloc(a => ({ ...a, [lot]: v }));
  const total = allocSum(alloc);
  const short = cr.requestedQty - total;
  const overLot = lots.some(l => (Number(alloc[l.lot]) || 0) > l.available);
  const canReserve = total > 0 && total <= cr.requestedQty && !overLot;

  return (
    <Overlay onClose={onClose} wide>
      <ModalHead icon={Boxes} title={`Allocate — ${cr.cr} · ${cr.requestedQty.toLocaleString()} ${cr.product} → ${branchName(cr.toBranch)}`} onClose={onClose} />
      <div className="space-y-3 px-5 py-4 text-sm">
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
          <span>Fulfiller: <span className="font-medium text-slate-800">{branchName(cr.fromBranch)}</span></span>
          <span>Requested <span className="font-mono font-semibold">{cr.requestedQty.toLocaleString()}</span> · Allocated <span className="font-mono font-semibold text-indigo-600">{total.toLocaleString()}</span> · Short <span className={`font-mono font-semibold ${short > 0 ? "text-amber-600" : "text-emerald-600"}`}>{short}</span></span>
          <button onClick={() => setAlloc(fifoSuggest(lots, cr.requestedQty))} className="ml-auto rounded-lg border border-slate-300 px-2 py-1 font-medium text-slate-600 hover:bg-slate-50">Auto-FIFO</button>
        </div>
        {lots.length === 0 ? (
          <div className="flex items-center gap-2 rounded-lg bg-rose-50 p-3 text-xs text-rose-700"><AlertTriangle className="h-4 w-4" />No available {productName(cr.product)} stock at {branchName(cr.fromBranch)} — cannot fulfil. Reject or route to another fulfiller.</div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50"><tr><Th>Lot</Th><Th>Job ID</Th><Th>SR</Th><Th>Serial range</Th><Th>Recd</Th><Th className="text-right">Avail</Th><Th className="text-right">Allocate</Th></tr></thead>
              <tbody className="divide-y divide-slate-100">
                {lots.map(l => {
                  const q = Number(alloc[l.lot]) || 0;
                  return (
                    <tr key={l.lot} className={q > 0 ? "bg-indigo-50/40" : ""}>
                      <Td className="font-mono text-xs text-indigo-700">{l.lot}</Td>
                      <Td className="font-mono text-xs">{l.jobId}</Td>
                      <Td className="font-mono text-xs text-slate-500">{l.sr}</Td>
                      <Td className="font-mono text-xs text-slate-500">{l.from}–{l.to}</Td>
                      <Td className="text-xs text-slate-500">{l.recd}</Td>
                      <Td className="text-right font-mono">{l.available}</Td>
                      <Td className="text-right"><input type="number" min={0} max={l.available} value={alloc[l.lot] ?? 0} onChange={e => setQty(l.lot, e.target.value)} className={`w-20 rounded border px-1.5 py-1 text-right font-mono ${q > l.available ? "border-rose-400 bg-rose-50" : "border-slate-300"}`} /></Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {overLot && <div className="text-xs text-rose-600">An allocation exceeds a lot's available quantity.</div>}
        {short > 0 && total > 0 && <div className="text-xs text-amber-600">Partial fulfilment: {short} will remain on backorder (status → Partially fulfilled).</div>}
        <Field label="Allocated by (vault officer / maker)"><select value={by} onChange={e => setBy(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5">{officers.map(o => <option key={o}>{o}</option>)}</select></Field>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
        <button onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
        <button disabled={!canReserve} onClick={() => onAllocate(cr, alloc, by, total)} className={`rounded-lg px-3 py-1.5 text-sm font-medium text-white ${canReserve ? "bg-amber-600 hover:bg-amber-500" : "cursor-not-allowed bg-slate-300"}`}>Reserve &amp; send for dispatch →</button>
      </div>
    </Overlay>
  );
}

/* ------------------------------ Approve & dispatch (dual custody + shipment) ------------------------------ */
function DispatchModal({ cr, branchName, onClose, onDispatch }) {
  const officers = officersFor(cr.fromBranch).filter(o => o !== cr.allocatedBy);
  const [s, setS] = useState({ courier: "SecureLogistics", awb: "", carton: "", seal: "", eta: "28 Jun 2026" });
  const [checker, setChecker] = useState(officers[0]);
  const set = (k, v) => setS(x => ({ ...x, [k]: v }));
  const sodOk = checker && checker !== cr.allocatedBy;
  return (
    <Overlay onClose={onClose}>
      <ModalHead icon={Send} title={`Approve & dispatch — ${cr.cr}`} onClose={onClose} />
      <div className="space-y-3 px-5 py-4 text-sm">
        <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-600">
          {cr.allocations.reduce((a, x) => a + x.qty, 0).toLocaleString()} × {cr.product} · {branchName(cr.fromBranch)} → {branchName(cr.toBranch)}
          <div className="mt-1 font-mono text-slate-500">{allocRangeStr(cr.allocations)}</div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Courier"><input value={s.courier} onChange={e => set("courier", e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5" /></Field>
          <Field label="AWB / waybill"><input value={s.awb} onChange={e => set("awb", e.target.value)} placeholder="DEL-PUN-…" className="w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono" /></Field>
          <Field label="Carton ID"><input value={s.carton} onChange={e => set("carton", e.target.value)} placeholder="CTN-…" className="w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono" /></Field>
          <Field label="Tamper seal"><input value={s.seal} onChange={e => set("seal", e.target.value)} placeholder="SEAL-…" className="w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono" /></Field>
          <Field label="ETA"><input value={s.eta} onChange={e => set("eta", e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5" /></Field>
          <Field label="Dispatch checker (dual custody)"><select value={checker} onChange={e => setChecker(e.target.value)} className="w-full rounded-lg border border-slate-300 px-2 py-1.5">{officersFor(cr.fromBranch).map(o => <option key={o} disabled={o === cr.allocatedBy}>{o}</option>)}</select></Field>
        </div>
        {!sodOk && <div className="flex items-center gap-2 rounded-lg bg-rose-50 p-2 text-xs text-rose-700"><AlertTriangle className="h-3.5 w-3.5" />Dispatch checker must differ from the allocator ({cr.allocatedBy}).</div>}
        <p className="text-xs text-slate-500">On dispatch: source stock is decremented, cards go <span className="font-medium">In transit</span>, and a receipt appears in <span className="font-medium">Receipt &amp; Acknowledgement</span> for {branchName(cr.toBranch)} (by {cr.cr}).</p>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
        <button onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
        <button disabled={!sodOk} onClick={() => onDispatch(cr, { ...s, dispatched: dateStamp(), by: checker })} className={`rounded-lg px-3 py-1.5 text-sm font-medium text-white ${sodOk ? "bg-emerald-600 hover:bg-emerald-500" : "cursor-not-allowed bg-slate-300"}`}>Goods-issue → In transit</button>
      </div>
    </Overlay>
  );
}

/* ------------------------------ Track (read-only) ------------------------------ */
function TrackModal({ cr, branchName, onClose, goReceive }) {
  return (
    <Overlay onClose={onClose}>
      <ModalHead icon={Truck} title={`Track — ${cr.cr}`} onClose={onClose} />
      <div className="space-y-3 px-5 py-4 text-sm">
        <dl className="space-y-1.5">
          {[
            ["Route", `${branchName(cr.fromBranch)} → ${branchName(cr.toBranch)}`],
            ["Product / qty", `${cr.product} · ${cr.allocations.reduce((a, x) => a + x.qty, 0)}`],
            ["Serial ranges", allocRangeStr(cr.allocations)],
            ["Courier / AWB", `${cr.shipment?.courier || "—"} / ${cr.shipment?.awb || "—"}`],
            ["Carton / seal", `${cr.shipment?.carton || "—"} / ${cr.shipment?.seal || "—"}`],
            ["Dispatched / ETA", `${cr.shipment?.dispatched || "—"} → ${cr.shipment?.eta || "—"}`],
          ].map(([k, v]) => <div key={k} className="flex justify-between gap-3 border-b border-slate-100 pb-1"><dt className="text-slate-500">{k}</dt><dd className="text-right font-medium text-slate-800">{v}</dd></div>)}
        </dl>
        <div className="rounded-lg bg-indigo-50 p-2.5 text-xs text-indigo-700">Receive this at {branchName(cr.toBranch)} in <span className="font-semibold">Receipt &amp; Acknowledgement</span> (search by {cr.cr}).</div>
      </div>
      <div className="flex justify-end gap-2 border-t border-slate-200 px-5 py-3">
        <button onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Close</button>
        {goReceive && <button onClick={() => { onClose(); goReceive(); }} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500">Open Receipt &amp; Ack →</button>}
      </div>
    </Overlay>
  );
}

/* ------------------------------ main screen ------------------------------ */
export default function BranchTransferOrder({ transferOrders, setTransferOrders, branchLots, setBranchLots, setExpectedReceipts, toast, goReceive, branches, products }) {
  const [typeF, setTypeF] = useState("ALL");
  const [statusF, setStatusF] = useState("ALL");
  const [q, setQ] = useState("");
  const [modal, setModal] = useState(null); // { kind, cr }

  const branchName = id => (branches.find(b => b.id === id)?.name) || id;
  const productName = code => (products.find(p => p.code === code)?.name) || code;

  const list = transferOrders.filter(t =>
    (typeF === "ALL" || t.type === typeF) &&
    (statusF === "ALL" || t.status === statusF) &&
    (!q || `${t.cr} ${t.product} ${t.note}`.toLowerCase().includes(q.trim().toLowerCase())));

  const count = s => transferOrders.filter(t => t.status === s).length;
  const kpis = [
    { key: "NEW", label: "Awaiting approval", n: count("NEW"), tone: "slate" },
    { key: "APPROVED", label: "Awaiting allocation", n: count("APPROVED"), tone: "sky" },
    { key: "ALLOCATED", label: "Awaiting dispatch", n: count("ALLOCATED") + count("PARTIALLY_FULFILLED"), tone: "amber" },
    { key: "IN_BRANCH_TRANSFER", label: "In transit", n: count("IN_BRANCH_TRANSFER"), tone: "indigo" },
  ];

  /* ---- handlers ---- */
  function createRequest(f) {
    const cr = nextCrId(transferOrders);
    const t = TRANSFER_TYPES.find(x => x.code === f.type);
    setTransferOrders(prev => [{
      cr, type: f.type, mode: t.mode, product: f.product, fromBranch: f.fromBranch, toBranch: f.toBranch,
      requestedQty: Number(f.requestedQty), status: "NEW", reqMaker: f.maker || "Branch maker", reqChecker: null,
      allocatedBy: null, allocations: [], shipment: null, createdAt: dateStamp(), note: f.note,
    }, ...prev]);
    toast(`${t.label} ${cr} raised → New (awaiting approval)`);
    setModal(null);
  }
  function approve(cr, checker) {
    setTransferOrders(prev => prev.map(t => t.cr === cr.cr ? { ...t, status: "APPROVED", reqChecker: checker } : t));
    toast(`${cr.cr} approved by ${checker} → routed to ${branchName(cr.fromBranch)} to fulfil`);
    setModal(null);
  }
  function reject(cr) {
    setTransferOrders(prev => prev.map(t => t.cr === cr.cr ? { ...t, status: "REJECTED" } : t));
    toast(`${cr.cr} rejected`);
    setModal(null);
  }
  function allocate(cr, allocMap, by, total) {
    const allocations = lotsFor(branchLots, cr.fromBranch, cr.product)
      .filter(l => (Number(allocMap[l.lot]) || 0) > 0)
      .map(l => { const qty = Number(allocMap[l.lot]); const r = subRange(l, qty); return { lot: l.lot, jobId: l.jobId, sr: l.sr, from: r.from, to: r.to, qty }; });
    const status = total >= cr.requestedQty ? "ALLOCATED" : "PARTIALLY_FULFILLED";
    setTransferOrders(prev => prev.map(t => t.cr === cr.cr ? { ...t, status, allocatedBy: by, allocations } : t));
    toast(`${cr.cr}: ${total.toLocaleString()} allocated & reserved by ${by} → ${txMeta(status).label}`);
    setModal(null);
  }
  function dispatch(cr, shipment) {
    const updated = { ...cr, status: "IN_BRANCH_TRANSFER", shipment };
    // decrement source lots (goods-issue / conservation)
    setBranchLots(prev => prev.map(l => {
      const a = cr.allocations.find(x => x.lot === l.lot);
      return a ? { ...l, available: Math.max(0, l.available - a.qty) } : l;
    }));
    setTransferOrders(prev => prev.map(t => t.cr === cr.cr ? updated : t));
    // one CR, two halves → emit the inbound Expected Receipt
    if (setExpectedReceipts) setExpectedReceipts(prev => [expectedReceiptFromCR(updated, branchName(cr.fromBranch)), ...prev]);
    toast(`${cr.cr} dispatched (${shipment.awb || shipment.carton || "secure courier"}) → In transit · receipt created for ${branchName(cr.toBranch)}`);
    setModal(null);
  }

  const actionFor = t => {
    if (t.status === "NEW") return <button onClick={() => setModal({ kind: "approve", cr: t })} className="rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-indigo-500">Approve</button>;
    if (t.status === "APPROVED") return <button onClick={() => setModal({ kind: "allocate", cr: t })} className="rounded-lg bg-amber-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-amber-500">Allocate</button>;
    if (t.status === "ALLOCATED" || t.status === "PARTIALLY_FULFILLED") return <button onClick={() => setModal({ kind: "dispatch", cr: t })} className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-emerald-500">Approve &amp; dispatch</button>;
    if (t.status === "IN_BRANCH_TRANSFER") return <button onClick={() => setModal({ kind: "track", cr: t })} className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-50"><Truck className="h-3.5 w-3.5" />Track</button>;
    return <span className="text-xs text-slate-400">—</span>;
  };

  return (
    <div className="space-y-6">
      <SectionTitle icon={ArrowLeftRight} title="Branch Transfer Order"
        sub="Inter-branch transfer: HQ/central push (Transfer cards) or branch pull (Request cards) → approve → allocate from lots → dispatch. The receive leg is the Receipt & Acknowledgement screen (same CR)."
        right={<button onClick={() => setModal({ kind: "new" })} className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500"><Plus className="h-4 w-4" />New request</button>} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {kpis.map(k => (
          <button key={k.key} onClick={() => setStatusF(statusF === k.key ? "ALL" : k.key)} className="text-left">
            <Kpi label={k.label} value={k.n} sub={statusF === k.key ? "filtered ✓ (click to clear)" : "click to filter"} tone={k.tone} />
          </button>
        ))}
      </div>

      <Card className="flex flex-wrap items-center gap-3 p-3">
        <div className="flex items-center gap-1 rounded-lg border border-slate-200 p-1">
          {[["ALL", "All"], ["REQUEST_CARDS", "Request"], ["TRANSFER_CARDS", "Transfer"]].map(([id, label]) => (
            <button key={id} onClick={() => setTypeF(id)} className={`rounded-md px-2.5 py-1 text-sm font-medium transition ${typeF === id ? "bg-slate-800 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{label}</button>
          ))}
        </div>
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-300 px-2.5 py-1.5">
          <Search className="h-4 w-4 text-slate-400" />
          <input value={q} onChange={e => setQ(e.target.value)} placeholder="CR · product · note…" className="w-48 text-sm outline-none" />
        </div>
        {statusF !== "ALL" && <button onClick={() => setStatusF("ALL")} className="text-xs font-medium text-indigo-600 hover:underline">Clear status: {txMeta(statusF).label}</button>}
        <span className="ml-auto text-xs text-slate-500">{list.length} order{list.length === 1 ? "" : "s"}</span>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr><Th>CR</Th><Th>Type</Th><Th>From → To</Th><Th>Product</Th><Th className="text-right">Req. qty</Th><Th className="text-right">Allocated</Th><Th>Status</Th><Th className="text-right">Action</Th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {list.map(t => {
              const alloc = t.allocations.reduce((a, x) => a + x.qty, 0);
              return (
                <tr key={t.cr} className="hover:bg-slate-50">
                  <Td className="font-mono text-indigo-700">{t.cr}<div className="text-xs font-normal text-slate-400">{t.createdAt}</div></Td>
                  <Td><span className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600">{t.type === "REQUEST_CARDS" ? "Request" : "Transfer"}<span className="text-[10px] text-slate-400">({t.mode})</span></span></Td>
                  <Td className="text-sm">{branchName(t.fromBranch)} <span className="text-slate-400">→</span> {branchName(t.toBranch)}</Td>
                  <Td className="text-xs">{productName(t.product)}</Td>
                  <Td className="text-right font-mono font-semibold">{t.requestedQty.toLocaleString()}</Td>
                  <Td className="text-right font-mono">{alloc ? alloc.toLocaleString() : "—"}</Td>
                  <Td><StatusPill status={t.status} /></Td>
                  <Td className="text-right">{actionFor(t)}</Td>
                </tr>
              );
            })}
            {list.length === 0 && <tr><Td className="text-slate-400">No transfer orders match the filter.</Td></tr>}
          </tbody>
        </table>
      </Card>

      {modal?.kind === "new" && <NewRequestModal branches={branches} products={products} onClose={() => setModal(null)} onCreate={createRequest} />}
      {modal?.kind === "approve" && <ApproveModal cr={modal.cr} branchName={branchName} onClose={() => setModal(null)} onApprove={approve} onReject={reject} />}
      {modal?.kind === "allocate" && <AllocateModal cr={modal.cr} branchLots={branchLots} branchName={branchName} productName={productName} onClose={() => setModal(null)} onAllocate={allocate} />}
      {modal?.kind === "dispatch" && <DispatchModal cr={modal.cr} branchName={branchName} onClose={() => setModal(null)} onDispatch={dispatch} />}
      {modal?.kind === "track" && <TrackModal cr={modal.cr} branchName={branchName} onClose={() => setModal(null)} goReceive={goReceive} />}
    </div>
  );
}
