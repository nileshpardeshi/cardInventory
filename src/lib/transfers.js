/* Branch Transfer Order (BTO) — data model + pure helpers for the CIM demo.
   The OUTBOUND half of inter-branch transfer: request → approve → allocate → dispatch.
   The INBOUND half (receipt by CR) is the Receipt & Acknowledgement screen.
   See receiptAckPlan.md Part M.

   One CR, two halves: on dispatch a CR emits a TRANSFER Expected Receipt that flows
   into the Receipt & Acknowledgement worklist (expectedReceiptFromCR).

   Document lifecycle:
     NEW → APPROVED → ALLOCATED → IN_BRANCH_TRANSFER → (Receipt & Ack) → IN_BRANCH_VAULT
     (+ REJECTED / CANCELLED / PARTIALLY_FULFILLED)
   Stock-unit layer: IN_VAULT → RESERVED (allocate) → IN_TRANSIT (goods-issue) → … */

export const TRANSFER_STATUS = {
  NEW:                  { label: "New",                    tone: "slate",  step: 0 },
  APPROVED:             { label: "Approved",               tone: "sky",    step: 1 },
  ALLOCATED:            { label: "Allocated",              tone: "amber",  step: 2 },
  PARTIALLY_FULFILLED:  { label: "Partially fulfilled",    tone: "amber",  step: 2 },
  IN_BRANCH_TRANSFER:   { label: "In branch transfer",     tone: "indigo", step: 3 },
  RECEIVED_PENDING_ACK: { label: "Received · pending ack", tone: "amber",  step: 4 },
  IN_BRANCH_VAULT:      { label: "In branch vault",        tone: "green",  step: 5 },
  REJECTED:             { label: "Rejected",               tone: "rose",   step: 0 },
  CANCELLED:            { label: "Cancelled",              tone: "rose",   step: 0 },
};
export const txMeta = s => TRANSFER_STATUS[s] || { label: s, tone: "slate", step: 0 };

/* Transfer types */
export const TRANSFER_TYPES = [
  { code: "REQUEST_CARDS",  label: "Request cards",  mode: "PULL", hint: "Branch requests stock from a fulfiller" },
  { code: "TRANSFER_CARDS", label: "Transfer cards", mode: "PUSH", hint: "HQ / source pushes stock to a branch" },
];

/* ----------------------------- transfer orders (CRs) ----------------------------- */
export const INITIAL_TRANSFER_ORDERS = [
  {
    cr: "CR-2026-0501", type: "REQUEST_CARDS", mode: "PULL", product: "DEB-PLT",
    fromBranch: "DEL01", toBranch: "PUN01", requestedQty: 500, status: "APPROVED",
    reqMaker: "A. Kulkarni", reqChecker: "S. Patil", allocatedBy: null, allocations: [],
    shipment: null, createdAt: "27 Jun 2026", note: "Pune Camp Visa Platinum top-up",
  },
  {
    cr: "CR-2026-0498", type: "TRANSFER_CARDS", mode: "PUSH", product: "DEB-CLS",
    fromBranch: "VAULT", toBranch: "BLR01", requestedQty: 300, status: "ALLOCATED",
    reqMaker: "Central Ops", reqChecker: "Central Approver", allocatedBy: "A. Kulkarni",
    allocations: [{ lot: "LOT-V1", jobId: "3150", sr: "SR-559900012", from: "KIT-50000", to: "KIT-50299", qty: 300 }],
    shipment: null, createdAt: "26 Jun 2026", note: "Bengaluru replenishment (push)",
  },
  {
    cr: "CR-2026-0495", type: "REQUEST_CARDS", mode: "PULL", product: "DEB-CLS",
    fromBranch: "VAULT", toBranch: "MUM01", requestedQty: 200, status: "NEW",
    reqMaker: "A. Shah", reqChecker: null, allocatedBy: null, allocations: [],
    shipment: null, createdAt: "27 Jun 2026", note: "Mumbai Fort classic request",
  },
  {
    cr: "CR-2026-0312", type: "TRANSFER_CARDS", mode: "PUSH", product: "DEB-CLS",
    fromBranch: "VAULT", toBranch: "PUN02", requestedQty: 300, status: "IN_BRANCH_TRANSFER",
    reqMaker: "Central Ops", reqChecker: "Central Approver", allocatedBy: "A. Kulkarni",
    allocations: [{ lot: "LOT-V2", jobId: "3150", sr: "SR-559900013", from: "KIT-90011", to: "KIT-90310", qty: 300 }],
    shipment: { courier: "Vault van MV-2231", awb: "—", carton: "CTN-91", seal: "SEAL-91", dispatched: "26 Jun 2026", eta: "27 Jun 2026", by: "R. Shah" },
    createdAt: "26 Jun 2026", note: "Already dispatched — appears in Receipt & Ack inbound (CR-2026-0312)",
  },
];

/* ----------------------------- branch stock lots (fulfiller side) -----------------------------
   A lot = Job ID + SR + serial range + on-hand qty at a branch, FIFO-ordered (oldest first). */
export const BRANCH_LOTS = [
  // Delhi (DEL01) · Visa Platinum (DEB-PLT)
  { lot: "LOT-A", branch: "DEL01", product: "DEB-PLT", jobId: "3201", sr: "SR-560011001", from: "KIT-90001", to: "KIT-90250", available: 250, recd: "02 May 2026" },
  { lot: "LOT-B", branch: "DEL01", product: "DEB-PLT", jobId: "3266", sr: "SR-560022040", from: "KIT-91000", to: "KIT-91399", available: 400, recd: "20 May 2026" },
  { lot: "LOT-C", branch: "DEL01", product: "DEB-PLT", jobId: "3299", sr: "SR-560033075", from: "KIT-92000", to: "KIT-92099", available: 100, recd: "05 Jun 2026" },
  // Delhi (DEL01) · Classic (DEB-CLS) — for branch-to-branch
  { lot: "LOT-D1", branch: "DEL01", product: "DEB-CLS", jobId: "3190", sr: "SR-560000500", from: "KIT-70000", to: "KIT-70399", available: 400, recd: "12 May 2026" },
  // Central Vault · Classic (DEB-CLS)
  { lot: "LOT-V1", branch: "VAULT", product: "DEB-CLS", jobId: "3150", sr: "SR-559900012", from: "KIT-50000", to: "KIT-50999", available: 1000, recd: "15 Apr 2026" },
  { lot: "LOT-V3", branch: "VAULT", product: "DEB-CLS", jobId: "3180", sr: "SR-559900050", from: "KIT-52000", to: "KIT-52499", available: 500, recd: "10 May 2026" },
  // Central Vault · Platinum (DEB-PLT)
  { lot: "LOT-V4", branch: "VAULT", product: "DEB-PLT", jobId: "3175", sr: "SR-559900070", from: "KIT-80000", to: "KIT-80599", available: 600, recd: "08 May 2026" },
];

/* ----------------------------- pure helpers ----------------------------- */

/* Fulfiller's lots for a product, FIFO order (seeded oldest-first) */
export const lotsFor = (lots, branch, product) => lots.filter(l => l.branch === branch && l.product === product && l.available > 0);

/* FIFO suggestion: fill `qty` from the front of the lot list → { [lot]: qty } */
export function fifoSuggest(lots, qty) {
  let left = qty;
  const out = {};
  for (const l of lots) {
    if (left <= 0) break;
    const take = Math.min(left, l.available);
    out[l.lot] = take;
    left -= take;
  }
  return out;
}

/* Sum of an allocation map { lot: qty } */
export const allocSum = map => Object.values(map).reduce((a, n) => a + (Number(n) || 0), 0);

/* Build the allocated serial sub-range from a lot, taking the first `qty` from its start. */
export function subRange(lot, qty) {
  const m = String(lot.from).match(/^(\D*)(\d+)$/);
  if (!m) return { from: lot.from, to: lot.to };
  const prefix = m[1], start = parseInt(m[2], 10);
  return { from: lot.from, to: `${prefix}${start + qty - 1}` };
}

/* Next CR id from the existing list */
export function nextCrId(existing) {
  const max = existing.reduce((m, t) => {
    const n = parseInt(String(t.cr).split("-").pop(), 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 500);
  return `CR-2026-${String(max + 1).padStart(4, "0")}`;
}

/* Combined serial range string across allocations */
export const allocRangeStr = allocs => (allocs || []).map(a => `${a.from}–${a.to}`).join(", ") || "—";

/* Build a TRANSFER Expected Receipt for the Receipt & Acknowledgement worklist (one CR, two halves). */
export function expectedReceiptFromCR(cr, fromBranchName) {
  const qty = (cr.allocations || []).reduce((a, x) => a + x.qty, 0);
  return {
    id: `ER-${cr.cr}-${cr.toBranch}`,
    source: "TRANSFER", crNumber: cr.cr, from: fromBranchName || cr.fromBranch,
    branch: cr.toBranch, product: cr.product, srList: [],
    expectedQty: qty, range: allocRangeStr(cr.allocations),
    asn: cr.shipment ? {
      carton: cr.shipment.carton, seal: cr.shipment.seal, courier: cr.shipment.courier,
      awb: cr.shipment.awb, dispatched: cr.shipment.dispatched, eta: cr.shipment.eta,
    } : null,
    status: "IN_TRANSIT",
  };
}
