/* Receipt & Acknowledgement (R&A) — data model + pure helpers for the CIM demo.
   All in-memory, deterministic. See receiptAckPlan.md.

   Two inbound mediums share one model via `source`:
     • VENDOR   — embossing vendor, anchored on Job Execution ID + Branch
     • TRANSFER — inter-branch, anchored on CR (Change Request) number

   Two-stage receipt:
     IN_TRANSIT → (Stage-1 gate) RECEIVED_PENDING_ACK → (Stage-2 verify)
        → IN_BRANCH_VAULT | PARTIALLY_ACCEPTED | QUARANTINED
*/

/* ----------------------------- status meta ----------------------------- */
export const RECEIPT_STATUS = {
  AWAITING_DISPATCH:    { label: "Awaiting dispatch",      tone: "slate", step: 0 },
  IN_TRANSIT:           { label: "In transit",             tone: "sky",   step: 1 },
  RECEIVED_PENDING_ACK: { label: "Received · pending ack", tone: "amber", step: 2 },
  PARTIALLY_ACCEPTED:   { label: "Partially accepted",     tone: "amber", step: 3 },
  QUARANTINED:          { label: "Quarantined",            tone: "rose",  step: 3 },
  IN_BRANCH_VAULT:      { label: "In branch vault",        tone: "green", step: 4 },
};
export const statusMeta = s => RECEIPT_STATUS[s] || { label: s, tone: "slate", step: 0 };

/* ----------------------------- discrepancy reasons ----------------------------- */
export const DISCREPANCY_REASONS = [
  { code: "SHORT",              label: "Short received",            sev: "High"   },
  { code: "EXCESS",             label: "Excess received",           sev: "Medium" },
  { code: "TAMPERED_SEAL",      label: "Tampered seal / envelope",  sev: "High"   },
  { code: "CARD_MISSING",       label: "Card missing (serial)",     sev: "High"   },
  { code: "DAMAGED",            label: "Damaged cards",             sev: "Medium" },
  { code: "MISPRINT",           label: "Misprint / illegible",      sev: "Medium" },
  { code: "WRONG_PRODUCT",      label: "Wrong product",             sev: "High"   },
  { code: "WRONG_BRANCH",       label: "Wrong branch",              sev: "High"   },
  { code: "SERIAL_MISMATCH",    label: "Serial mismatch",           sev: "High"   },
  { code: "DUPLICATE_SERIAL",   label: "Duplicate serial",          sev: "High"   },
  { code: "MISSING_PIN_MAILER", label: "Missing PIN mailer",        sev: "Medium" },
  { code: "LATE_DELIVERY",      label: "Late delivery",             sev: "Low"    },
  { code: "ASN_MISMATCH",       label: "ASN vs physical mismatch",  sev: "Medium" },
];
export const reasonMeta = code => DISCREPANCY_REASONS.find(r => r.code === code) || { code, label: code, sev: "Medium" };
export const reasonSlas = { High: "Same day", Medium: "2 business days", Low: "5 business days" };

/* ----------------------------- branch officers (for SoD / dual custody) ----------------------------- */
const BRANCH_OFFICERS = {
  PUN01: ["P. Deshmukh", "B. Patil", "S. Kale"],
  PUN02: ["R. Nair", "S. Iyer", "M. Joshi"],
  MUM01: ["A. Shah", "D. Mehta", "N. Rao"],
  BLR01: ["K. Iyer", "L. Menon", "T. Gowda"],
};
export const officersFor = id => BRANCH_OFFICERS[id] || ["Custodian on record", "Joint officer", "Branch manager"];

/* ----------------------------- embossing batch jobs (EOD) ----------------------------- */
export const EMBOSSING_JOBS = [
  { jobExecId: "3466", runDate: "26 Jun 2026", vendor: "SecurePrint Card Co.", split: "product + branch", files: ["EMF-2026-0461", "EMF-2026-0462", "EMF-2026-0463"] },
  { jobExecId: "3460", runDate: "24 Jun 2026", vendor: "Indus Emboss Pvt Ltd",  split: "branch",          files: ["EMF-2026-0455"] },
];

/* ----------------------------- service requests (one approved card order) ----------------------------- */
export const SERVICE_REQUESTS = [
  // Job 3466 → Pune Camp (PUN01): 600 + 150 + 250 = 1,000 cards
  { sr: "SR-565757576", branch: "PUN01", product: "DEB-CLS", qty: 600, jobExecId: "3466", file: "EMF-2026-0461", from: "KIT-78112001", to: "KIT-78112600" },
  { sr: "SR-565757578", branch: "PUN01", product: "DEB-CLS", qty: 150, jobExecId: "3466", file: "EMF-2026-0461", from: "KIT-78112601", to: "KIT-78112750" },
  { sr: "SR-565757577", branch: "PUN01", product: "DEB-PLT", qty: 250, jobExecId: "3466", file: "EMF-2026-0462", from: "KIT-78120001", to: "KIT-78120250" },
  // Job 3466 → Mumbai Fort (MUM01)
  { sr: "SR-565757590", branch: "MUM01", product: "DEB-CLS", qty: 400, jobExecId: "3466", file: "EMF-2026-0463", from: "KIT-78112751", to: "KIT-78113150" },
  // Job 3460 → Bengaluru (BLR01)
  { sr: "SR-565700912", branch: "BLR01", product: "PPD-GFT", qty: 400, jobExecId: "3460", file: "EMF-2026-0455", from: "KIT-61500", to: "KIT-61899" },
];
export const srDetail = sr => SERVICE_REQUESTS.find(s => s.sr === sr);

/* ----------------------------- expected receipts (inbound manifest) -----------------------------
   Auto-created at batch time (VENDOR) or on transfer dispatch (TRANSFER). The system owns the
   SR↔Job↔Branch↔Qty↔range map, so the branch can search by Job+Branch with zero vendor input.
   `asn` is an optional enhancement (present only when the vendor sends a dispatch advice). */
export const INITIAL_EXPECTED_RECEIPTS = [
  {
    id: "ER-3466-PUN01-CLS", source: "VENDOR", jobExecId: "3466", file: "EMF-2026-0461",
    branch: "PUN01", product: "DEB-CLS", srList: ["SR-565757576", "SR-565757578"],
    expectedQty: 750, range: "KIT-78112001 – 78112750",
    asn: { shipment: "SHP-2026-0951", awb: "BLR-7781234", carton: "CTN-77", seal: "SEAL-44821", courier: "SecureLogistics", dispatched: "26 Jun 2026", eta: "27 Jun 2026" },
    status: "IN_TRANSIT",
  },
  {
    id: "ER-3466-PUN01-PLT", source: "VENDOR", jobExecId: "3466", file: "EMF-2026-0462",
    branch: "PUN01", product: "DEB-PLT", srList: ["SR-565757577"],
    expectedQty: 250, range: "KIT-78120001 – 78120250",
    asn: { shipment: "SHP-2026-0951", awb: "BLR-7781234", carton: "CTN-78", seal: "SEAL-44822", courier: "SecureLogistics", dispatched: "26 Jun 2026", eta: "27 Jun 2026" },
    status: "IN_TRANSIT",
  },
  {
    // No ASN — low-tech vendor path: still findable by Job 3466 + Branch MUM01
    id: "ER-3466-MUM01-CLS", source: "VENDOR", jobExecId: "3466", file: "EMF-2026-0463",
    branch: "MUM01", product: "DEB-CLS", srList: ["SR-565757590"],
    expectedQty: 400, range: "KIT-78112751 – 78113150",
    asn: null, status: "IN_TRANSIT",
  },
  {
    // Inter-branch transfer — already gate-received (Stage 1 done), awaiting Stage-2 verify
    id: "ER-CR0312-PUN02-CLS", source: "TRANSFER", crNumber: "CR-2026-0312", from: "Central Vault – Mumbai",
    branch: "PUN02", product: "DEB-CLS", srList: [],
    expectedQty: 300, range: "KIT-90011 – 90310",
    asn: { carton: "CTN-91", seal: "SEAL-91", courier: "Vault van MV-2231", dispatched: "26 Jun 2026", eta: "27 Jun 2026" },
    status: "RECEIVED_PENDING_ACK",
    stage1: { by: "R. Nair", at: "27 Jun 2026 09:10", cartons: 1, declaredQty: 300, sealsIntact: true, challan: "TRF-DC-0312" },
  },
  {
    // Completed GRN example (already in vault) — for the "Completed GRNs" tab
    id: "ER-3460-BLR01-GFT", source: "VENDOR", jobExecId: "3460", file: "EMF-2026-0455",
    branch: "BLR01", product: "PPD-GFT", srList: ["SR-565700912"],
    expectedQty: 400, range: "KIT-61500 – 61899",
    asn: { shipment: "SHP-2026-0940", awb: "BLR-7770021", carton: "CTN-55", seal: "SEAL-55012", courier: "SecureLogistics", dispatched: "24 Jun 2026", eta: "25 Jun 2026" },
    status: "IN_BRANCH_VAULT",
    stage1: { by: "L. Menon", at: "25 Jun 2026 10:30", cartons: 1, declaredQty: 405, sealsIntact: true, challan: "DC-55012" },
    stage2: { by: "K. Iyer", checker: "T. Gowda", at: "25 Jun 2026 15:05", acceptedQty: 400, quarantinedQty: 5, blind: false },
  },
];

/* ----------------------------- initial discrepancies ----------------------------- */
export const INITIAL_DISCREPANCIES = [
  {
    discId: "DISC-2026-0006", source: "TRANSFER", ref: "CR-2026-0312", branch: "PUN02", product: "DEB-CLS",
    sr: "—", lot: "CTN-91", reason: "TAMPERED_SEAL", expected: 300, received: 300, variance: 0,
    sev: "High", status: "Investigating", owner: "Branch Manager", sla: "Same day",
    linkedException: "EXC-2026-4469", raisedAt: "27 Jun 2026 09:25", raisedBy: "R. Nair",
    note: "Outer seal SEAL-91 found broken at gate; full recount ordered before vault entry.",
    timeline: [
      { at: "27 Jun 09:25", who: "R. Nair", what: "Raised at gate receipt (tampered seal)" },
      { at: "27 Jun 09:40", who: "Branch Manager", what: "Assigned · CCTV + courier handover under review" },
    ],
  },
  {
    discId: "DISC-2026-0005", source: "VENDOR", ref: "3460", file: "EMF-2026-0455", branch: "BLR01", product: "PPD-GFT",
    sr: "SR-565700912", lot: "KIT-61895 – 61899", reason: "EXCESS", expected: 400, received: 405, variance: 5,
    sev: "Medium", status: "Resolved", resolution: "VENDOR_CREDIT", owner: "Custodian", sla: "2 business days",
    linkedException: "EXC-2026-4460", raisedAt: "25 Jun 2026 15:05", raisedBy: "K. Iyer",
    note: "5 excess kits over declared 400; quarantined and a vendor credit note raised.",
    timeline: [
      { at: "25 Jun 15:05", who: "K. Iyer", what: "Raised at vault verification (excess +5)" },
      { at: "25 Jun 16:20", who: "Custodian", what: "Excess quarantined; vendor notified" },
      { at: "26 Jun 11:00", who: "Vendor Mgmt", what: "Resolved · vendor credit note CN-7781" },
    ],
  },
];

export const RESOLUTION_CODES = [
  { code: "VENDOR_RESHIP",      label: "Vendor reship" },
  { code: "VENDOR_CREDIT",      label: "Vendor credit note" },
  { code: "WRITE_OFF",          label: "Write-off (adjustment)" },
  { code: "FOUND_ON_RECOUNT",   label: "Found on recount" },
  { code: "ACCEPTED_DEVIATION", label: "Accepted with deviation" },
];

/* ----------------------------- pure helpers ----------------------------- */

/* Stage-2 verification rows: one per SR for vendor receipts, one lot row for transfers. */
export function verifyRows(er) {
  if (er.source === "VENDOR" && er.srList && er.srList.length) {
    return er.srList.map(sr => {
      const d = srDetail(sr);
      return { key: sr, label: sr, product: er.product, range: d ? `${d.from} – ${d.to}` : er.range, expected: d ? d.qty : er.expectedQty };
    });
  }
  return [{ key: er.crNumber || er.id, label: er.crNumber || er.jobExecId || er.id, product: er.product, range: er.range, expected: er.expectedQty }];
}

/* Next sequential id like DISC-2026-0007 from the existing list */
export function nextDiscId(existing) {
  const max = existing.reduce((m, d) => {
    const n = parseInt(String(d.discId).split("-").pop(), 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 0);
  return `DISC-2026-${String(max + 1).padStart(4, "0")}`;
}

/* Next linked exception id like EXC-2026-4472 */
export function nextExcId(existing) {
  const max = existing.reduce((m, d) => {
    const n = parseInt(String(d.linkedException || "").split("-").pop(), 10);
    return Number.isFinite(n) && n > m ? n : m;
  }, 4470);
  return `EXC-2026-${max + 1}`;
}

/* Tiered free-text search over an expected-receipt row (Job / ASN / CR / AWB / file / id) */
export function matchesSearch(er, q) {
  if (!q) return true;
  const hay = [er.jobExecId, er.crNumber, er.id, er.file, er.asn?.shipment, er.asn?.awb, er.asn?.carton, er.asn?.seal]
    .filter(Boolean).join(" ").toLowerCase();
  return hay.includes(q.trim().toLowerCase());
}
