import React, { useMemo, useState } from "react";
import {
  LayoutDashboard, Boxes, ShoppingCart, PackageCheck, ArrowLeftRight, Vault,
  RefreshCw, AlertTriangle, Route, Settings2, Search, ChevronRight, CheckCircle2,
  Clock, Truck, Factory, Building2, UserCheck, User, CreditCard,
  ShieldCheck, Scan, Landmark, CircleDot, Lock, BarChart3, ClipboardCheck,
  Hourglass, FileSignature, Trash2, TrendingUp, CalendarClock, Inbox, FileWarning, Send
} from "lucide-react";
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid,
  BarChart, Bar, Cell, Legend, ComposedChart, Area
} from "recharts";
import {
  bestForecast, metrics, cv, trendPct, volatilityClass, xyz, sbcClass, abcClasses, peak
} from "./lib/forecast";
import { dailySeries, toWeekly, dowProfile } from "./lib/demandSeries";
import { SEV, Badge, Card, SectionTitle, Kpi, Th, Td } from "./components/ui";
import ReceiptAck from "./components/ReceiptAck";
import Discrepancies from "./components/Discrepancies";
import { INITIAL_EXPECTED_RECEIPTS, INITIAL_DISCREPANCIES } from "./lib/receipts";
import BranchTransferOrder from "./components/BranchTransferOrder";
import { INITIAL_TRANSFER_ORDERS, BRANCH_LOTS } from "./lib/transfers";

function trendBadge(t) {
  if (t >= 2) return { sym: "▲", tone: "text-emerald-600", word: "Rising" };
  if (t <= -2) return { sym: "▼", tone: "text-rose-600", word: "Falling" };
  return { sym: "▬", tone: "text-slate-400", word: "Flat" };
}
function usageNarrative(scope, dow) {
  const hi = [...dow].sort((a, b) => b.index - a.index)[0];
  const lo = [...dow].sort((a, b) => a.index - b.index)[0];
  if (scope) {
    const tb = scope.trend >= 2 ? "rising" : scope.trend <= -2 ? "falling" : "flat";
    return `${scope.code}: ${scope.sbc.toLowerCase()} demand · peaks ${hi.day} (+${hi.index - 100}% vs avg), lightest ${lo.day} · ${tb} trend ${Math.abs(scope.trend).toFixed(1)}%/wk.`;
  }
  return `Branch pregen demand peaks ${hi.day} (+${hi.index - 100}% vs avg) and is lightest ${lo.day}.`;
}

/* ----------------------------- DEMO DATA ----------------------------- */

const PRODUCTS = [
  { code: "DEB-CLS", name: "Debit Classic Kit", cls: "Pregen kit" },
  { code: "DEB-PLT", name: "Debit Platinum Kit", cls: "Pregen kit" },
  { code: "PPD-GFT", name: "Prepaid Gift Kit", cls: "Pregen kit" },
  { code: "DEB-PRS", name: "Debit Personalised (named)", cls: "Personalised" },
];

const BRANCHES = [
  { id: "VAULT", name: "Central Vault – Mumbai", region: "Central", onHand: 18450, inTransit: 5000, reserved: 2200, blocked: 35, avgDaily: 410, safety: 6000, rop: 9000, max: 24000 },
  { id: "MUM01", name: "Mumbai Fort", region: "West", onHand: 612, inTransit: 0, reserved: 40, blocked: 2, avgDaily: 22, safety: 250, rop: 400, max: 900 },
  { id: "PUN01", name: "Pune Camp", region: "West", onHand: 184, inTransit: 250, reserved: 0, blocked: 6, avgDaily: 18, safety: 200, rop: 320, max: 700 },
  { id: "PUN02", name: "Pune Hinjawadi", region: "West", onHand: 95, inTransit: 0, reserved: 0, blocked: 0, avgDaily: 21, safety: 220, rop: 350, max: 750 },
  { id: "DEL01", name: "Delhi Connaught Pl.", region: "North", onHand: 1480, inTransit: 0, reserved: 60, blocked: 4, avgDaily: 16, safety: 240, rop: 380, max: 850 },
  { id: "BLR01", name: "Bengaluru MG Road", region: "South", onHand: 506, inTransit: 200, reserved: 25, blocked: 1, avgDaily: 27, safety: 300, rop: 480, max: 1000 },
  { id: "CHN01", name: "Chennai Anna Salai", region: "South", onHand: 388, inTransit: 0, reserved: 0, blocked: 0, avgDaily: 14, safety: 180, rop: 290, max: 650 },
  { id: "HYD01", name: "Hyderabad Banjara H.", region: "South", onHand: 0, inTransit: 300, reserved: 0, blocked: 0, avgDaily: 19, safety: 210, rop: 340, max: 720 },
  { id: "AMD01", name: "Ahmedabad CG Road", region: "West", onHand: 742, inTransit: 0, reserved: 0, blocked: 3, avgDaily: 9, safety: 140, rop: 220, max: 500 },
  { id: "KOL01", name: "Kolkata Park Street", region: "East", onHand: 233, inTransit: 0, reserved: 10, blocked: 0, avgDaily: 12, safety: 160, rop: 260, max: 560 },
  { id: "JAI01", name: "Jaipur MI Road", region: "North", onHand: 311, inTransit: 0, reserved: 0, blocked: 0, avgDaily: 8, safety: 120, rop: 190, max: 430 },
];

function branchHealth(b) {
  const net = b.onHand + b.inTransit - b.reserved - b.blocked;
  if (b.onHand === 0) return { key: "stockout", label: "Stock-out", color: "#E11D48" };
  if (net < b.safety) return { key: "critical", label: "Below safety", color: "#F59E0B" };
  if (net <= b.rop) return { key: "reorder", label: "At reorder point", color: "#FB923C" };
  const cover = net / b.avgDaily;
  if (cover > 90) return { key: "over", label: "Overstock", color: "#6366F1" };
  return { key: "ok", label: "Healthy", color: "#10B981" };
}

/* ---- Branch × product statistics (deterministic demo allocation) ---- */

const PRODUCT_COLORS = { "DEB-CLS": "#4F46E5", "DEB-PLT": "#0EA5E9", "PPD-GFT": "#F59E0B", "DEB-PRS": "#10B981" };
const MIX_BASE = { "DEB-CLS": 0.55, "DEB-PLT": 0.2, "PPD-GFT": 0.15, "DEB-PRS": 0.1 };

function seedOf(id) { let s = 0; for (let i = 0; i < id.length; i++) s = (s * 31 + id.charCodeAt(i)) % 997; return s; }

const PRODUCT_STATS = (() => {
  const out = {};
  BRANCHES.forEach(b => {
    const seed = seedOf(b.id);
    const codes = PRODUCTS.map(p => p.code);
    let shares = codes.map((c, i) => MIX_BASE[c] + (((seed + i * 13) % 7) - 3) / 100);
    const tot = shares.reduce((a, x) => a + x, 0); shares = shares.map(s => s / tot);
    const alloc = total => { const a = codes.map((c, i) => Math.round(total * shares[i])); a[0] += total - a.reduce((x, y) => x + y, 0); return a; };
    const onH = alloc(b.onHand), avgD = alloc(b.avgDaily), saf = alloc(b.safety), rp = alloc(b.rop), mx = alloc(b.max);
    out[b.id] = codes.map((c, i) => {
      const inTransit = b.id === "VAULT" ? (c === "DEB-PLT" ? 4000 : c === "DEB-CLS" ? 1000 : 0) : (c === "DEB-CLS" ? b.inTransit : 0);
      const reserved = c === "DEB-CLS" ? b.reserved : 0;
      const blocked = c === "DEB-CLS" ? b.blocked : 0;
      const net = onH[i] + inTransit - reserved - blocked;
      const agf = [0.34, 0.39, 0.15, 0.08, 0.04];
      const aging = agf.map((f, k) => Math.max(0, Math.round(onH[i] * (f + (((seed + i * 7 + k) % 5) - 2) / 100))));
      aging[0] += onH[i] - aging.reduce((a, x) => a + x, 0);
      const weeks = Array.from({ length: 8 }, (_, k) => ({ w: `W-${8 - k}`, qty: Math.max(0, Math.round(avgD[i] * 7 * (0.82 + ((seed + i * 5 + k * 3) % 34) / 100))) }));
      return { code: c, name: PRODUCTS[i].name, cls: PRODUCTS[i].cls, onHand: onH[i], inTransit, reserved, blocked, avgDaily: avgD[i], safety: saf[i], rop: rp[i], max: mx[i], net, cover: avgD[i] ? Math.round(net / avgD[i]) : null, aging, weeks };
    });
  });
  return out;
})();

function productHealth(p) {
  if (p.onHand === 0 && p.inTransit === 0) return { key: "stockout", label: "Stock-out", color: "#E11D48" };
  if (p.onHand === 0) return { key: "critical", label: "Awaiting inbound", color: "#F59E0B" };
  if (p.net < p.safety) return { key: "critical", label: "Below safety", color: "#F59E0B" };
  if (p.net <= p.rop) return { key: "reorder", label: "At reorder point", color: "#FB923C" };
  if (p.avgDaily && p.net / p.avgDaily > 90) return { key: "over", label: "Overstock", color: "#6366F1" };
  return { key: "ok", label: "Healthy", color: "#10B981" };
}

const BRANCH_OPS_INFO = {
  VAULT: { custodian: "A. Kulkarni + B. Nair (dual custody)", backup: "R. Shah", lastCount: "31 May 2026 · no variance", dayStatus: "Vault open · dual custody verified" },
  PUN01: { custodian: "P. Deshmukh", backup: "B. Patil (joint officer)", lastCount: "28 May 2026 · no variance", dayStatus: "Day open · 3 operators active" },
  HYD01: { custodian: "V. Reddy", backup: "K. Rao", lastCount: "02 Jun 2026 · no variance", dayStatus: "Day open · stock-out, OTC issuance suspended" },
  KOL01: { custodian: "S. Banerjee", backup: "A. Ghosh", lastCount: "05 Jun 2026 · short 2 kits (EXC-3287)", dayStatus: "Day open" },
};
function opsInfo(id) { return BRANCH_OPS_INFO[id] || { custodian: "Custodian on record", backup: "Joint officer", lastCount: "May 2026 · no variance", dayStatus: "Day open" }; }

/* ---- Today's document & movement activity, per branch ---- */
/* Each item: kind, ref, product, cards (count of cards), note. Net flow derives cards in/out. */

const DAILY_ACTIVITY = {
  VAULT: {
    ordersPlaced: [
      { ref: "PO-2026-0158", product: "DEB-CLS", cards: 10000, vendor: "SecurePrint Card Co.", note: "Auto-replenishment · approved 09:20" },
    ],
    inTransitIn: [
      { ref: "PO-2026-0151", product: "DEB-PLT", cards: 4000, from: "Indus Emboss Pvt Ltd", note: "AWB BLDR-99231104 · GRN pending" },
    ],
    receivedToday: [],
    dispatchedOut: [
      { ref: "TRF-2026-0419", product: "DEB-CLS", cards: 250, to: "Pune Camp", note: "Vault van MV-2231 · 08:05" },
      { ref: "TRF-2026-0415", product: "DEB-CLS", cards: 300, to: "Hyderabad Banjara H.", note: "Overdue 2d · courier trace raised" },
    ],
  },
  PUN01: {
    ordersPlaced: [
      { ref: "REQ-2026-0521", product: "DEB-CLS", cards: 250, vendor: "Internal · on Central Vault", note: "Requisition raised 09:02" },
    ],
    inTransitIn: [
      { ref: "TRF-2026-0419", product: "DEB-CLS", cards: 250, from: "Central Vault", note: "Due today · GRN-PEND-0872" },
    ],
    receivedToday: [
      { ref: "GRN-2026-0870", product: "DEB-PLT", cards: 120, from: "Central Vault", note: "Acknowledged clean 10:48" },
    ],
    dispatchedOut: [],
    issuedToCustomers: 71,
  },
  PUN02: {
    ordersPlaced: [
      { ref: "REQ-2026-0524", product: "DEB-CLS", cards: 655, vendor: "Internal · on Central Vault", note: "Auto-proposal RP-1042 · awaiting approval" },
    ],
    inTransitIn: [],
    receivedToday: [],
    dispatchedOut: [],
    issuedToCustomers: 21,
  },
  HYD01: {
    ordersPlaced: [
      { ref: "REQ-2026-0523", product: "DEB-CLS", cards: 420, vendor: "Internal · on Central Vault", note: "Auto-proposal RP-1043 · awaiting approval" },
    ],
    inTransitIn: [
      { ref: "TRF-2026-0415", product: "DEB-CLS", cards: 300, from: "Central Vault", note: "Overdue 2d · EXC-3304 raised" },
    ],
    receivedToday: [],
    dispatchedOut: [],
    issuedToCustomers: 0,
  },
  DEL01: {
    ordersPlaced: [],
    inTransitIn: [],
    receivedToday: [],
    dispatchedOut: [
      { ref: "TRF-2026-0421", product: "DEB-CLS", cards: 300, to: "Pune Hinjawadi", note: "Lateral rebalance · pending approval" },
    ],
    issuedToCustomers: 14,
  },
};

function activityOf(id) {
  return DAILY_ACTIVITY[id] || { ordersPlaced: [], inTransitIn: [], receivedToday: [], dispatchedOut: [], issuedToCustomers: 0 };
}
const sumCards = list => (list || []).reduce((a, x) => a + x.cards, 0);

const USAGE_TREND = [
  { w: "W-12", issued: 2280, forecast: 2210 }, { w: "W-11", issued: 2410, forecast: 2330 },
  { w: "W-10", issued: 2190, forecast: 2280 }, { w: "W-09", issued: 2520, forecast: 2400 },
  { w: "W-08", issued: 2630, forecast: 2510 }, { w: "W-07", issued: 2450, forecast: 2560 },
  { w: "W-06", issued: 2710, forecast: 2620 }, { w: "W-05", issued: 2890, forecast: 2740 },
  { w: "W-04", issued: 2760, forecast: 2830 }, { w: "W-03", issued: 3020, forecast: 2900 },
  { w: "W-02", issued: 3140, forecast: 3010 }, { w: "W-01", issued: 2980, forecast: 3090 },
];

const STATE_MIX = [
  { state: "In vault", qty: 18450 }, { state: "At branch", qty: 4551 },
  { state: "With custodian", qty: 1290 }, { state: "With operator", qty: 318 },
  { state: "In transit", qty: 5750 }, { state: "Quarantine", qty: 51 },
  { state: "Pending destroy", qty: 412 },
];

const AGING = [
  { bucket: "0–30d", qty: 9120 }, { bucket: "31–90d", qty: 11840 },
  { bucket: "91–180d", qty: 5260 }, { bucket: "181–365d", qty: 2890 },
  { bucket: ">365d", qty: 1702 },
];

const ORDERS = [
  { po: "PO-2026-0158", vendor: "SecurePrint Card Co.", product: "DEB-CLS", qty: 10000, status: "In production", placed: "02 Jun 2026", eta: "19 Jun 2026", origin: "Auto-replenishment", recd: 0 },
  { po: "PO-2026-0151", vendor: "Indus Emboss Pvt Ltd", product: "DEB-PLT", qty: 4000, status: "Dispatched", placed: "21 May 2026", eta: "13 Jun 2026", origin: "Consolidated requisitions", recd: 0, awb: "BLDR-99231104" },
  { po: "PO-2026-0142", vendor: "SecurePrint Card Co.", product: "DEB-CLS", qty: 12000, status: "Partially received", placed: "28 Apr 2026", eta: "Received 26 May", origin: "Manual", recd: 11960 },
  { po: "PO-2026-0136", vendor: "CardTech Solutions", product: "PPD-GFT", qty: 6000, status: "Closed", placed: "02 Apr 2026", eta: "Received 29 Apr", origin: "Auto-replenishment", recd: 6000 },
];

const VENDORS = [
  { name: "SecurePrint Card Co.", lead: "14d (target 15d)", fill: "99.2%", defect: "0.31%", disc: "2 open" },
  { name: "Indus Emboss Pvt Ltd", lead: "19d (target 15d)", fill: "97.4%", defect: "0.55%", disc: "1 open" },
  { name: "CardTech Solutions", lead: "13d (target 14d)", fill: "100%", defect: "0.12%", disc: "0 open" },
];

const INITIAL_GRNS = [
  {
    id: "GRN-PEND-0871", ref: "PO-2026-0151 · Indus Emboss", to: "Central Vault – Mumbai",
    courier: "BlueDart · AWB BLDR-99231104", expected: 4000, product: "DEB-PLT",
    boxes: [
      { box: "BX-01", range: "KIT-78112001 – 78113000", qty: 1000 },
      { box: "BX-02", range: "KIT-78113001 – 78114000", qty: 1000 },
      { box: "BX-03", range: "KIT-78114001 – 78115000", qty: 1000 },
      { box: "BX-04", range: "KIT-78115001 – 78116000", qty: 1000 },
    ],
    status: "Awaiting receipt",
  },
  {
    id: "GRN-PEND-0872", ref: "TRF-2026-0419 · from Central Vault", to: "Pune Camp",
    courier: "Vault van · Manifest MV-2231", expected: 250, product: "DEB-CLS",
    boxes: [{ box: "BX-01", range: "KIT-77904501 – 77904750", qty: 250 }],
    status: "Awaiting receipt",
  },
  {
    id: "GRN-PEND-0873", ref: "PO-2026-0160 · L1 · SecurePrint", to: "Pune Camp",
    courier: "BlueDart secured · AWB BLDR-99240117", expected: 5, product: "DEB-PRS",
    kind: "personalised",
    pinMailers: 5, pinSeparate: true,
    cards: [
      { id: "CRD-2026-119101", customer: "T. Nair", app: "APP-88312", pan: "XXXX XXXX XXXX 1180", batch: "BATCH-PRS-0506" },
      { id: "CRD-2026-119102", customer: "G. Pillai", app: "APP-88313", pan: "XXXX XXXX XXXX 1207", batch: "BATCH-PRS-0506" },
      { id: "CRD-2026-119103", customer: "D. Shah", app: "APP-88314", pan: "XXXX XXXX XXXX 1244", batch: "BATCH-PRS-0506" },
      { id: "CRD-2026-119104", customer: "L. Menon", app: "APP-88315", pan: "XXXX XXXX XXXX 1271", batch: "BATCH-PRS-0506" },
      { id: "CRD-2026-119105", customer: "H. Gupta", app: "APP-88316", pan: "XXXX XXXX XXXX 1298", batch: "BATCH-PRS-0506" },
    ],
    status: "Awaiting receipt",
  },
];

const INITIAL_TRANSFERS = [
  { id: "TRF-2026-0421", from: "Delhi Connaught Pl.", to: "Pune Hinjawadi", product: "DEB-CLS", qty: 300, status: "Pending approval", age: "Raised today · lateral rebalance suggestion", kind: "suggested" },
  { id: "TRF-2026-0419", from: "Central Vault – Mumbai", to: "Pune Camp", product: "DEB-CLS", qty: 250, status: "In transit", age: "Dispatched 10 Jun · due today", kind: "normal" },
  { id: "TRF-2026-0415", from: "Central Vault – Mumbai", to: "Hyderabad Banjara H.", product: "DEB-CLS", qty: 300, status: "In transit · overdue 2d", age: "Dispatched 06 Jun · due 10 Jun", kind: "overdue" },
  { id: "TRF-2026-0411", from: "Ahmedabad CG Road", to: "Mumbai Fort", product: "PPD-GFT", qty: 150, status: "Completed", age: "Received 08 Jun · clean GRN", kind: "done" },
];

/* ---- In-transit shipments: full courier/route tracking across all leg types ---- */
const INITIAL_SHIPMENTS = [
  {
    id: "SHP-2026-0904", ref: "PO-2026-0151 · Indus Emboss", grn: "GRN-PEND-0871",
    leg: "Vendor → Vault", from: "Indus Emboss, Pune", to: "Central Vault – Mumbai",
    product: "DEB-PLT", qty: 4000, courier: "BlueDart", awb: "BLDR-99231104", seal: "SEAL-77120",
    dispatched: "09 Jun 17:40", eta: "13 Jun", overdue: false,
    events: [
      { t: "09 Jun 17:40", place: "Pune vendor facility", status: "Picked up · sealed", done: true },
      { t: "10 Jun 02:15", place: "Pune hub", status: "In transit", done: true },
      { t: "11 Jun 09:30", place: "Mumbai hub", status: "Arrived at destination hub", done: true },
      { t: "13 Jun (exp)", place: "Central Vault – Mumbai", status: "Out for delivery", done: false },
    ],
  },
  {
    id: "SHP-2026-0918", ref: "PO-2026-0160 / L1 · SecurePrint", grn: "GRN-PEND-0873",
    leg: "Vendor → Branch", from: "SecurePrint, Navi Mumbai", to: "Pune Camp",
    product: "DEB-PRS", qty: 5, personalised: true, courier: "BlueDart Secured", awb: "BLDR-99240117", seal: "SEAL-44821",
    dispatched: "11 Jun 19:15", eta: "12 Jun", overdue: false,
    events: [
      { t: "11 Jun 19:15", place: "Navi Mumbai facility", status: "Picked up · secured pouch", done: true },
      { t: "12 Jun 06:00", place: "Mumbai hub", status: "In transit to Pune", done: true },
      { t: "12 Jun (exp)", place: "Pune Camp", status: "Out for delivery", done: false },
    ],
  },
  {
    id: "SHP-2026-0911", ref: "TRF-2026-0419", grn: "GRN-PEND-0872",
    leg: "Vault → Branch", from: "Central Vault – Mumbai", to: "Pune Camp",
    product: "DEB-CLS", qty: 250, courier: "Bank vault van", awb: "MV-2231", seal: "SEAL-31220",
    dispatched: "10 Jun 08:05", eta: "12 Jun", overdue: false,
    events: [
      { t: "10 Jun 08:05", place: "Central Vault – Mumbai", status: "Dispatched · dual-custody sign-out", done: true },
      { t: "11 Jun 14:20", place: "Lonavala checkpoint", status: "In transit", done: true },
      { t: "12 Jun (exp)", place: "Pune Camp", status: "Arriving today", done: false },
    ],
  },
  {
    id: "SHP-2026-0899", ref: "TRF-2026-0415", grn: "—",
    leg: "Vault → Branch", from: "Central Vault – Mumbai", to: "Hyderabad Banjara H.",
    product: "DEB-CLS", qty: 300, courier: "BlueDart", awb: "BLDR-99118820", seal: "SEAL-30988",
    dispatched: "06 Jun 10:30", eta: "10 Jun", overdue: true,
    events: [
      { t: "06 Jun 10:30", place: "Central Vault – Mumbai", status: "Dispatched", done: true },
      { t: "07 Jun 22:10", place: "Mumbai hub", status: "In transit", done: true },
      { t: "08 Jun 16:45", place: "Solapur hub", status: "Delayed · no further scan", done: true, alert: true },
      { t: "10 Jun (missed)", place: "Hyderabad Banjara H.", status: "Not delivered · overdue 2 days", done: false, alert: true },
    ],
  },
];

const INITIAL_PROPOSALS = [
  { id: "RP-1042", branch: "Pune Hinjawadi", product: "DEB-CLS", net: 95, rop: 350, suggest: 655, reason: "Net available breached reorder point; forecast +12% next 4 weeks", status: "Pending" },
  { id: "RP-1043", branch: "Hyderabad Banjara H.", product: "DEB-CLS", net: 300, rop: 340, suggest: 420, reason: "Inbound transfer overdue; cover at 15.8 days vs 21-day policy", status: "Pending" },
  { id: "RP-1041", branch: "Central Vault – Mumbai", product: "DEB-PLT", net: 21250, rop: 9000, suggest: 0, reason: "Above reorder point — no action. Monitoring only.", status: "Suppressed" },
];

const INITIAL_EXCEPTIONS = [
  { id: "EXC-3308", sev: "High", type: "Stock-out", where: "Hyderabad Banjara H. · DEB-CLS", note: "On-hand zero since 09:10 today; inbound TRF-2026-0415 overdue 2 days", sla: "4h to escalate to Region Head", status: "Investigating" },
  { id: "EXC-3304", sev: "High", type: "In-transit overdue", where: "TRF-2026-0415 · Vault → Hyderabad", note: "Consignment not received within 4-day transit SLA; courier trace requested", sla: "Breach in 6h", status: "Open" },
  { id: "EXC-3299", sev: "Medium", type: "Near expiry", where: "Delhi Connaught Pl. · PPD-GFT", note: "412 kits reach plastic expiry within 90 days; redistribution proposed", sla: "Review by 20 Jun", status: "Open" },
  { id: "EXC-3287", sev: "Medium", type: "Count variance", where: "Kolkata Park Street", note: "Surprise count short by 2 kits vs system; adjustment pending level-2 approval", sla: "Awaiting checker", status: "Pending approval" },
  { id: "EXC-3275", sev: "Low", type: "Dormant stock", where: "Ahmedabad CG Road · DEB-PLT", note: "No movement for 60 days on 280 kits; overstock — transfer suggestion raised", sla: "—", status: "Open" },
];

/* ---- Personalised debit cards: collection (last-mile) register ---- */
/* Each personalised card is one named consignment, not fungible stock. */

const COLLECTION_POLICY = { retentionDays: 60, remindAt: [15, 30, 45], destroyAfter: 60 };

const INITIAL_COLLECTION = [
  { id: "CRD-2026-119004", customer: "A. Rao", app: "APP-88231", pan: "XXXX XXXX XXXX 7781", branch: "Pune Camp", received: "11 Jun 2026", ageDays: 1, status: "Awaiting collection", batch: "BATCH-PRS-0501" },
  { id: "CRD-2026-118990", customer: "S. Kulkarni", app: "APP-88210", pan: "XXXX XXXX XXXX 6620", branch: "Pune Camp", received: "28 May 2026", ageDays: 15, status: "Awaiting collection", batch: "BATCH-PRS-0498" },
  { id: "CRD-2026-118842", customer: "K. Joshi", app: "APP-88102", pan: "XXXX XXXX XXXX 4417", branch: "Pune Camp", received: "26 May 2026", ageDays: 17, status: "Awaiting collection", batch: "BATCH-PRS-0496" },
  { id: "CRD-2026-118770", customer: "M. Sayyed", app: "APP-88044", pan: "XXXX XXXX XXXX 3120", branch: "Pune Camp", received: "12 Apr 2026", ageDays: 61, status: "Unclaimed · overdue", batch: "BATCH-PRS-0489" },
  { id: "CRD-2026-118655", customer: "R. Iyer", app: "APP-87980", pan: "XXXX XXXX XXXX 2255", branch: "Pune Camp", received: "02 Apr 2026", ageDays: 71, status: "Unclaimed · overdue", batch: "BATCH-PRS-0485" },
  { id: "CRD-2026-119050", customer: "P. Deshmukh", app: "APP-88290", pan: "XXXX XXXX XXXX 9043", branch: "Mumbai Fort", received: "09 Jun 2026", ageDays: 3, status: "Awaiting collection", batch: "BATCH-PRS-0503" },
  { id: "CRD-2026-119041", customer: "V. Reddy", app: "APP-88275", pan: "XXXX XXXX XXXX 8830", branch: "Mumbai Fort", received: "30 May 2026", ageDays: 13, status: "Awaiting collection", batch: "BATCH-PRS-0502" },
  { id: "CRD-2026-118901", customer: "N. Banerjee", app: "APP-88150", pan: "XXXX XXXX XXXX 5567", branch: "Bengaluru MG Road", received: "20 May 2026", ageDays: 23, status: "Awaiting collection", batch: "BATCH-PRS-0492" },
];

function collectionBucket(c) {
  if (c.status.startsWith("Collected")) return { key: "done", label: "Collected", color: "#10B981" };
  if (c.status.startsWith("Destroyed")) return { key: "destroyed", label: "Destroyed", color: "#64748B" };
  if (c.ageDays >= COLLECTION_POLICY.destroyAfter) return { key: "overdue", label: "Overdue · destroy", color: "#E11D48" };
  if (c.ageDays >= COLLECTION_POLICY.remindAt[2]) return { key: "late", label: "Reminder due", color: "#F59E0B" };
  return { key: "ok", label: "Within window", color: "#0EA5E9" };
}

/* ---- Personalised order pipeline (per branch): order → production → transit → received → awaiting ---- */
const PERSONALISED_PIPELINE = [
  { po: "PO-2026-0160 / L1", branch: "Pune Camp", product: "Debit Personalised", ordered: 5, inProd: 0, inTransit: 5, received: 0, awaiting: 3, collected: 2, batch: "BATCH-PRS-0506", eta: "GRN-PEND-0873 due today" },
  { po: "PO-2026-0157 / L1", branch: "Pune Camp", product: "Debit Personalised", ordered: 12, inProd: 0, inTransit: 0, received: 12, awaiting: 2, collected: 10, batch: "BATCH-PRS-0498", eta: "Received 28 May" },
  { po: "PO-2026-0162 / L1", branch: "Mumbai Fort", product: "Debit Personalised", ordered: 8, inProd: 3, inTransit: 5, received: 0, awaiting: 2, collected: 0, batch: "BATCH-PRS-0509", eta: "In production · ETA 16 Jun" },
  { po: "PO-2026-0149 / L2", branch: "Bengaluru MG Road", product: "Debit Personalised", ordered: 6, inProd: 0, inTransit: 0, received: 6, awaiting: 1, collected: 5, batch: "BATCH-PRS-0492", eta: "Received 20 May" },
  { po: "PO-2026-0164 / L1", branch: "Delhi Connaught Pl.", product: "Debit Personalised", ordered: 10, inProd: 10, inTransit: 0, received: 0, awaiting: 0, collected: 0, batch: "BATCH-PRS-0511", eta: "In production · ETA 18 Jun" },
];

const TRACE_DB = {
  "KIT-77904612": {
    product: "Debit Classic Kit (DEB-CLS)", pan: "XXXX XXXX XXXX 4417", cardId: "CRD-2026-118842",
    state: "Issued to customer", chain: [
      { icon: "po", t: "28 Apr 2026 10:14", title: "Ordered", doc: "PO-2026-0142", who: "Maker R. Iyer · Checker S. Mehta", where: "Central Cards Ops" },
      { icon: "factory", t: "30 Apr 2026 09:02", title: "In production", doc: "Vendor ack VA-5521", who: "SecurePrint Card Co.", where: "Vendor facility, Navi Mumbai" },
      { icon: "truck", t: "22 May 2026 17:40", title: "Dispatched", doc: "DA-2026-0890 · AWB BLDR-99100442 · Box BX-07", who: "SecurePrint logistics", where: "In transit to Central Vault" },
      { icon: "vault", t: "26 May 2026 11:25", title: "Received into vault (dual custody)", doc: "GRN-2026-0861 · seal intact", who: "V. Officer A. Kulkarni + B. Nair", where: "Central Vault – Mumbai" },
      { icon: "truck", t: "10 Jun 2026 08:05", title: "Transfer dispatched", doc: "TRF-2026-0419 · Manifest MV-2231", who: "Vault Officer A. Kulkarni", where: "Vault → Pune Camp" },
      { icon: "branch", t: "11 Jun 2026 10:48", title: "Received at branch", doc: "GRN-2026-0872 · clean", who: "Custodian P. Deshmukh · BM appr.", where: "Pune Camp" },
      { icon: "cust", t: "12 Jun 2026 09:01", title: "Day-open · allocated to custodian stock", doc: "DB-PUN01-120626", who: "Custodian P. Deshmukh", where: "Pune Camp" },
      { icon: "op", t: "12 Jun 2026 09:04", title: "Issued to operator (Teller 2)", doc: "OIS-PUN01-0034 · ack by operator", who: "Operator K. Joshi", where: "Pune Camp · Till 2" },
      { icon: "card", t: "12 Jun 2026 11:32", title: "Issued to customer", doc: "Issuance event CRD-2026-118842 · scan verified", who: "Operator K. Joshi", where: "Pune Camp" },
    ],
  },
  "KIT-78112450": {
    product: "Debit Platinum Kit (DEB-PLT)", pan: "Not yet linked", cardId: "—",
    state: "In transit (vendor → vault)", chain: [
      { icon: "po", t: "21 May 2026 15:30", title: "Ordered", doc: "PO-2026-0151", who: "Maker R. Iyer · Checker S. Mehta", where: "Central Cards Ops" },
      { icon: "factory", t: "24 May 2026 10:00", title: "In production", doc: "Vendor ack VA-5544", who: "Indus Emboss Pvt Ltd", where: "Vendor facility, Pune" },
      { icon: "truck", t: "09 Jun 2026 19:15", title: "Dispatched", doc: "DA-2026-0904 · AWB BLDR-99231104 · Box BX-01", who: "Indus logistics", where: "In transit to Central Vault — GRN pending" },
    ],
  },
};

/* ---- Custodian working stock as an ordered FIFO kit pool ---- */
/* The custodian holds a contiguous available range; issues to operators are carved
   from the front (oldest first). Each issue slip records the exact sub-range. */

const CUSTODIAN_INIT = {
  branch: "Pune Camp",
  custodian: "P. Deshmukh",
  jointOfficer: "B. Patil",
  product: "DEB-CLS",
  // available pool the custodian can still issue from (FIFO front = lowest)
  poolFrom: 77904711,
  poolTo: 77904780,   // 70 kits available to issue
  prefix: "KIT-",
};

/* Operators each have issue slips (ranges given) and may return an unissued tail range. */
const INITIAL_OPERATORS = [
  { id: "OP-1", name: "K. Joshi", till: "Till 2",
    slips: [
      { slip: "OIS-PUN01-0031", from: 77904611, to: 77904650, qty: 40, time: "09:04", acked: true },
    ],
    sold: 31, returned: "" },
  { id: "OP-2", name: "M. Sayyed", till: "Till 4",
    slips: [
      { slip: "OIS-PUN01-0032", from: 77904651, to: 77904685, qty: 35, time: "09:06", acked: true },
    ],
    sold: 22, returned: "" },
  { id: "OP-3", name: "S. Pillai", till: "Till 5",
    slips: [
      { slip: "OIS-PUN01-0033", from: 77904686, to: 77904710, qty: 25, time: "09:08", acked: true },
    ],
    sold: 18, returned: "" },
];

/* --------------------------- UI PRIMITIVES --------------------------- */
/* Shared primitives now live in ./components/ui (imported at the top of this file). */

/* ------------------------------ VIEWS ------------------------------- */

function Dashboard({ setView, goBranch }) {
  const counts = useMemo(() => {
    const c = { stockout: 0, critical: 0, reorder: 0, over: 0, ok: 0 };
    BRANCHES.filter(b => b.id !== "VAULT").forEach(b => { c[branchHealth(b).key] += 1; });
    return c;
  }, []);
  return (
    <div className="space-y-6">
      <SectionTitle icon={LayoutDashboard} title="Network overview" sub="Real-time stock position · all branches · all products · refreshed 4s ago" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Kpi label="Total stock on hand" value="23,001" sub="kits across network" />
        <Kpi label="In transit" value="5,750" sub="2 consignments · 1 overdue" tone="indigo" />
        <Kpi label="Stock-out branches" value={counts.stockout} sub="Hyderabad Banjara H." tone="rose" />
        <Kpi label="Near expiry (≤90d)" value="412" sub="Delhi · PPD-GFT" tone="amber" />
        <Kpi label="Open exceptions" value="5" sub="2 high severity" tone="amber" />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="p-4 lg:col-span-2">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">Weekly issuance vs forecast (network)</h3>
            <Badge tone="indigo">MAPE 4.6%</Badge>
          </div>
          <div className="h-56">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={USAGE_TREND} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="w" tick={{ fontSize: 11 }} stroke="#94A3B8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94A3B8" />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Line type="monotone" dataKey="issued" name="Issued to customers" stroke="#4F46E5" strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="forecast" name="Forecast" stroke="#94A3B8" strokeDasharray="5 4" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">Branch stock health</h3>
          <div className="grid grid-cols-5 gap-2">
            {BRANCHES.filter(b => b.id !== "VAULT").map(b => {
              const h = branchHealth(b);
              return (
                <button key={b.id} onClick={() => goBranch(b.id)} title={`${b.name} · ${h.label}`}
                  className="flex aspect-square flex-col items-center justify-center rounded-lg border border-slate-200 transition hover:scale-105"
                  style={{ background: h.color + "22" }}>
                  <span className="h-2.5 w-2.5 rounded-full" style={{ background: h.color }} />
                  <span className="mt-1 font-semibold text-slate-700" style={{ fontSize: 10 }}>{b.id}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 space-y-1 text-xs text-slate-600">
            {[["#10B981", `Healthy · ${counts.ok}`], ["#FB923C", `At reorder point · ${counts.reorder}`], ["#F59E0B", `Below safety · ${counts.critical}`], ["#E11D48", `Stock-out · ${counts.stockout}`], ["#6366F1", `Overstock · ${counts.over}`]].map(([c, l]) => (
              <div key={l} className="flex items-center gap-2"><span className="h-2 w-2 rounded-full" style={{ background: c }} />{l}</div>
            ))}
          </div>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">Stock by lifecycle state</h3>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={STATE_MIX} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="state" tick={{ fontSize: 10 }} stroke="#94A3B8" interval={0} angle={-18} textAnchor="end" height={48} />
                <YAxis tick={{ fontSize: 11 }} stroke="#94A3B8" />
                <Tooltip />
                <Bar dataKey="qty" radius={[4, 4, 0, 0]}>
                  {STATE_MIX.map((s, i) => <Cell key={i} fill={["#312E81", "#4F46E5", "#6366F1", "#818CF8", "#0EA5E9", "#F59E0B", "#E11D48"][i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <Card className="p-4">
          <div className="mb-2 flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-800">Aging analysis (days at current location)</h3>
            <Badge tone="amber">1,702 kits &gt; 365d</Badge>
          </div>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={AGING} margin={{ top: 4, right: 8, bottom: 0, left: -10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} stroke="#94A3B8" />
                <YAxis tick={{ fontSize: 11 }} stroke="#94A3B8" />
                <Tooltip />
                <Bar dataKey="qty" radius={[4, 4, 0, 0]}>
                  {AGING.map((a, i) => <Cell key={i} fill={["#10B981", "#34D399", "#FBBF24", "#FB923C", "#E11D48"][i]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>
    </div>
  );
}

function Inventory({ sel, setSel, goProfile }) {
  const b = BRANCHES.find(x => x.id === sel);
  const h = branchHealth(b);
  const net = b.onHand + b.inTransit - b.reserved - b.blocked;
  return (
    <div className="space-y-6">
      <SectionTitle icon={Boxes} title="Inventory positions" sub="Drill from network → branch → custodian → serial range. Committed vs available shown per node."
        right={<Badge tone="green">Ledger invariant verified 12 Jun 06:00</Badge>} />
      <Card className="overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr><Th>Location</Th><Th>Region</Th><Th className="text-right">On hand</Th><Th className="text-right">In transit</Th><Th className="text-right">Reserved</Th><Th className="text-right">Blocked</Th><Th className="text-right">Net available</Th><Th className="text-right">Days cover</Th><Th>Status</Th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {BRANCHES.map(x => {
              const hx = branchHealth(x); const nx = x.onHand + x.inTransit - x.reserved - x.blocked;
              return (
                <tr key={x.id} onClick={() => setSel(x.id)} className={`cursor-pointer transition hover:bg-indigo-50 ${sel === x.id ? "bg-indigo-50" : ""}`}>
                  <Td className="font-medium text-slate-900">{x.id === "VAULT" ? <span className="flex items-center gap-1.5"><Vault className="h-4 w-4 text-slate-400" />{x.name}</span> : x.name}</Td>
                  <Td>{x.region}</Td>
                  <Td className="text-right font-mono">{x.onHand.toLocaleString()}</Td>
                  <Td className="text-right font-mono">{x.inTransit.toLocaleString()}</Td>
                  <Td className="text-right font-mono">{x.reserved}</Td>
                  <Td className="text-right font-mono">{x.blocked}</Td>
                  <Td className="text-right font-mono font-semibold">{nx.toLocaleString()}</Td>
                  <Td className="text-right font-mono">{x.avgDaily ? Math.round(nx / x.avgDaily) : "—"}</Td>
                  <Td><span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: hx.color }}><span className="h-2 w-2 rounded-full" style={{ background: hx.color }} />{hx.label}</span></Td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Card>

      <Card className="p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="text-sm font-semibold text-slate-800">Drill-down · {b.name}</h3>
          <div className="flex items-center gap-2 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1"><Lock className="h-3.5 w-3.5" /> Joint custody: BM + Custodian</span>
            <Badge tone={h.key === "ok" ? "green" : h.key === "stockout" ? "rose" : "amber"}>{h.label}</Badge>
          </div>
        </div>
        <div className="grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="flex items-center justify-between">
              <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Holding by product</div>
              <button onClick={() => goProfile(sel)} className="text-xs font-medium text-indigo-600 hover:underline">Full branch profile →</button>
            </div>
            <ul className="mt-2 space-y-1.5 text-sm">
              {PRODUCT_STATS[sel].map(p => {
                const ph = productHealth(p);
                return (
                  <li key={p.code} className="flex items-center justify-between gap-2">
                    <span className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: ph.color }} />{p.name}</span>
                    <span className="font-mono">{p.onHand.toLocaleString()}</span>
                  </li>
                );
              })}
            </ul>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Custody split (today)</div>
            <ul className="mt-2 space-y-1.5 text-sm">
              <li className="flex justify-between"><span className="flex items-center gap-1.5"><Vault className="h-3.5 w-3.5 text-slate-400" />Joint-custody vault</span><span className="font-mono">{Math.max(b.onHand - 100, 0)}</span></li>
              <li className="flex justify-between"><span className="flex items-center gap-1.5"><UserCheck className="h-3.5 w-3.5 text-slate-400" />Custodian working stock</span><span className="font-mono">{b.onHand ? 70 : 0}</span></li>
              <li className="flex justify-between"><span className="flex items-center gap-1.5"><User className="h-3.5 w-3.5 text-slate-400" />With operators</span><span className="font-mono">{b.onHand ? 30 : 0}</span></li>
            </ul>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Serial ranges (sample)</div>
            <ul className="mt-2 space-y-1.5 font-mono text-xs text-slate-600">
              <li>KIT-77904501 – 77904750 <Badge tone="sky">in transit</Badge></li>
              <li>KIT-77881201 – 77881290</li>
              <li>KIT-77845010 – 77845104</li>
              <li className="text-rose-600">KIT-77845105 – 77845110 · blocked (damaged)</li>
            </ul>
          </div>
        </div>
        <p className="mt-3 text-xs text-slate-500">Policy for this branch · safety stock <span className="font-mono">{b.safety}</span> · reorder point <span className="font-mono">{b.rop}</span> · max <span className="font-mono">{b.max}</span> · net available <span className="font-mono">{net}</span></p>
      </Card>
    </div>
  );
}

function Orders() {
  const tone = s => s === "Closed" ? "green" : s === "Dispatched" ? "sky" : s === "In production" ? "indigo" : "amber";
  return (
    <div className="space-y-6">
      <SectionTitle icon={ShoppingCart} title="Orders & vendor tracking" sub="Vendor purchase orders, dispatch advices and SLA performance"
        right={<button className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700">+ New purchase order</button>} />
      <Card className="overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr><Th>PO</Th><Th>Vendor</Th><Th>Product</Th><Th className="text-right">Ordered</Th><Th className="text-right">Received</Th><Th>Status</Th><Th>Placed</Th><Th>ETA / closure</Th><Th>Origin</Th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {ORDERS.map(o => (
              <tr key={o.po} className="hover:bg-slate-50">
                <Td className="font-mono text-indigo-700">{o.po}</Td>
                <Td>{o.vendor}</Td>
                <Td className="font-mono text-xs">{o.product}</Td>
                <Td className="text-right font-mono">{o.qty.toLocaleString()}</Td>
                <Td className="text-right font-mono">{o.recd.toLocaleString()}{o.po === "PO-2026-0142" && <span className="ml-1 text-xs text-rose-600">(short 40)</span>}</Td>
                <Td><Badge tone={tone(o.status)}>{o.status}</Badge>{o.awb && <div className="mt-0.5 font-mono text-slate-500" style={{ fontSize: 11 }}>AWB {o.awb}</div>}</Td>
                <Td>{o.placed}</Td><Td>{o.eta}</Td>
                <Td className="text-xs text-slate-500">{o.origin}</Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
      <div className="grid gap-4 md:grid-cols-3">
        {VENDORS.map(v => (
          <Card key={v.name} className="p-4">
            <div className="flex items-center gap-2"><Factory className="h-4 w-4 text-slate-400" /><h3 className="text-sm font-semibold text-slate-800">{v.name}</h3></div>
            <dl className="mt-3 grid grid-cols-2 gap-y-2 text-sm">
              <dt className="text-slate-500">Avg lead time</dt><dd className="text-right font-mono">{v.lead}</dd>
              <dt className="text-slate-500">Fill rate</dt><dd className="text-right font-mono">{v.fill}</dd>
              <dt className="text-slate-500">Defect rate</dt><dd className="text-right font-mono">{v.defect}</dd>
              <dt className="text-slate-500">Discrepancies</dt><dd className="text-right font-mono">{v.disc}</dd>
            </dl>
          </Card>
        ))}
      </div>
    </div>
  );
}

function Receiving({ grns, setGrns, addException, toast, setCollection }) {
  const [open, setOpen] = useState(null);
  const [disc, setDisc] = useState({ on: false, reason: "Short shipment", qty: 1, note: "" });
  const [pinOk, setPinOk] = useState(true);
  const pending = grns.filter(g => g.status === "Awaiting receipt");
  const done = grns.filter(g => g.status !== "Awaiting receipt");

  const finalize = (g, withDisc) => {
    setGrns(prev => prev.map(x => x.id !== g.id ? x : {
      ...x,
      status: withDisc ? `Acknowledged with discrepancy · ${disc.reason} (${disc.qty})` : "Acknowledged · clean",
    }));
    // personalised cards flow into the named collection register on clean acceptance
    if (g.kind === "personalised" && setCollection && !withDisc) {
      const today = "12 Jun 2026";
      const newRecs = g.cards.map(c => ({
        id: c.id, customer: c.customer, app: c.app, pan: c.pan,
        branch: g.to, received: today, ageDays: 0,
        status: "Awaiting collection", batch: c.batch,
      }));
      setCollection(prev => [...newRecs, ...prev]);
    }
    if (withDisc) addException({
      id: "EXC-" + Math.floor(3300 + Math.random() * 90), sev: "Medium", type: "GRN discrepancy",
      where: `${g.to} · ${g.ref}`, note: `${disc.reason} — ${disc.qty} unit(s). ${disc.note || "Quarantined pending vendor/sender response."}`,
      sla: "Vendor response in 48h", status: "Open",
    });
    const msg = g.kind === "personalised"
      ? (withDisc ? `Personalised GRN acknowledged with discrepancy — case opened, ${disc.qty} card(s) held` : `Personalised GRN clean — ${g.cards.length} cards added to collection register, awaiting customer pickup`)
      : (withDisc ? `GRN acknowledged with discrepancy — case opened, ${disc.qty} unit(s) quarantined` : "GRN acknowledged clean — stock moved to location balance");
    toast(msg);
    setOpen(null); setDisc({ on: false, reason: "Short shipment", qty: 1, note: "" }); setPinOk(true);
  };

  return (
    <div className="space-y-6">
      <SectionTitle icon={PackageCheck} title="Receipt & acknowledgement (GRN)" sub="Two-step acceptance: physical receipt, then verification & acknowledgement (checker). Pregen verified by serial range; personalised verified card-by-card." />
      {pending.length === 0 && <Card className="p-6 text-sm text-slate-500">No consignments awaiting receipt. Inbound dispatches will appear here automatically.</Card>}
      {pending.map(g => {
        const personalised = g.kind === "personalised";
        return (
          <Card key={g.id} className="p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-semibold text-indigo-700">{g.id}</span>
                  <Badge tone="amber">Awaiting receipt</Badge>
                  {personalised && <Badge tone="indigo">Personalised · named cards</Badge>}
                </div>
                <p className="mt-1 text-sm text-slate-600">Against <span className="font-mono">{g.ref}</span> → <strong>{g.to}</strong></p>
                <p className="text-xs text-slate-500">{g.courier} · expected <span className="font-mono">{g.expected.toLocaleString()}</span> × {g.product}{personalised && g.pinMailers ? <> · <span className="font-mono">{g.pinMailers}</span> PIN mailers {g.pinSeparate ? "(separate consignment)" : "(same box)"}</> : null}</p>
              </div>
              <button onClick={() => setOpen(open === g.id ? null : g.id)}
                className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700">
                {open === g.id ? "Hide receipt form" : "Receive consignment"}
              </button>
            </div>

            {open === g.id && (
              <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
                {personalised ? (
                  <>
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800"><Scan className="h-4 w-4 text-indigo-600" />Card-by-card verification (scan each card against the manifest)</div>
                    <div className="overflow-x-auto rounded-lg border border-slate-200 bg-white">
                      <table className="w-full">
                        <thead className="border-b border-slate-200 bg-slate-50"><tr><Th>Card ID</Th><Th>Customer</Th><Th>Application</Th><Th>Masked PAN</Th><Th>Verified</Th></tr></thead>
                        <tbody className="divide-y divide-slate-100">
                          {g.cards.map(c => (
                            <tr key={c.id}>
                              <Td className="font-mono text-xs text-indigo-700">{c.id}</Td>
                              <Td className="text-sm">{c.customer}</Td>
                              <Td className="font-mono text-xs">{c.app}</Td>
                              <Td className="font-mono text-xs">{c.pan}</Td>
                              <Td><label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" defaultChecked className="accent-indigo-600" />Present</label></Td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-2.5">
                      <label className="flex items-center gap-2 text-sm text-amber-900">
                        <input type="checkbox" checked={pinOk} onChange={e => setPinOk(e.target.checked)} className="accent-amber-600" />
                        <Lock className="h-3.5 w-3.5" />PIN mailers reconciled separately ({g.pinMailers} expected) — cards and PINs kept apart, never received together
                      </label>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800"><Scan className="h-4 w-4 text-indigo-600" />Box verification (scan or key serial ranges)</div>
                    <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                      <table className="w-full">
                        <thead className="border-b border-slate-200 bg-slate-50"><tr><Th>Box</Th><Th>Serial range</Th><Th className="text-right">Qty</Th><Th>Seal</Th></tr></thead>
                        <tbody className="divide-y divide-slate-100">
                          {g.boxes.map(bx => (
                            <tr key={bx.box}>
                              <Td className="font-mono">{bx.box}</Td>
                              <Td className="font-mono text-xs">{bx.range}</Td>
                              <Td className="text-right font-mono">{bx.qty}</Td>
                              <Td><label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" defaultChecked className="accent-indigo-600" />Intact</label></Td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                <label className="mt-3 flex items-center gap-2 text-sm text-slate-700">
                  <input type="checkbox" checked={disc.on} onChange={e => setDisc({ ...disc, on: e.target.checked })} className="accent-rose-600" />
                  Log a discrepancy on this receipt
                </label>
                {disc.on && (
                  <div className="mt-2 grid gap-2 md:grid-cols-3">
                    <select value={disc.reason} onChange={e => setDisc({ ...disc, reason: e.target.value })} className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm">
                      {(personalised
                        ? ["Card missing", "Card damaged", "Wrong personalisation", "PIN mailer missing", "Tampered envelope", "Name/PAN mismatch"]
                        : ["Short shipment", "Excess shipment", "Damaged kits", "Tampered seal", "Serial mismatch", "Missing PIN mailer", "Wrong product"]
                      ).map(r => <option key={r}>{r}</option>)}
                    </select>
                    <input type="number" min="1" value={disc.qty} onChange={e => setDisc({ ...disc, qty: Number(e.target.value) })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" placeholder="Units affected" />
                    <input value={disc.note} onChange={e => setDisc({ ...disc, note: e.target.value })} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm" placeholder="Note / evidence ref (photo, POD)" />
                  </div>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <button onClick={() => finalize(g, disc.on)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700">
                    {disc.on ? "Acknowledge with discrepancy (checker)" : "Acknowledge clean (checker)"}
                  </button>
                  <span className="text-xs text-slate-500">Checker must differ from receiver — enforced by role · this demo signs as S. Mehta (Checker)</span>
                </div>
              </div>
            )}
          </Card>
        );
      })}
      {done.length > 0 && (
        <Card className="p-4">
          <h3 className="mb-2 text-sm font-semibold text-slate-800">Completed today</h3>
          <ul className="space-y-1.5 text-sm">
            {done.map(g => (
              <li key={g.id} className="flex items-center gap-2 text-slate-600">
                {g.status.includes("discrepancy") ? <AlertTriangle className="h-4 w-4 text-amber-500" /> : <CheckCircle2 className="h-4 w-4 text-emerald-500" />}
                <span className="font-mono">{g.id}</span> · {g.to} · {g.status}{g.kind === "personalised" && !g.status.includes("discrepancy") ? <span className="text-xs text-indigo-600"> → in collection register</span> : null}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}

function Transfers({ transfers, setTransfers, toast }) {
  const tone = k => k === "done" ? "green" : k === "overdue" ? "rose" : k === "suggested" ? "indigo" : "sky";
  const approve = id => { setTransfers(p => p.map(t => t.id === id ? { ...t, status: "Approved · awaiting dispatch", kind: "normal", age: "Approved just now by S. Mehta (checker)" } : t)); toast("Transfer approved — sending branch can now dispatch with manifest"); };
  return (
    <div className="space-y-6">
      <SectionTitle icon={ArrowLeftRight} title="Branch transfers" sub="Inter-location transfers with maker-checker, in-transit tracking and overdue escalation"
        right={<button className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700">+ New transfer order</button>} />
      <div className="space-y-3">
        {transfers.map(t => (
          <Card key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div className="flex items-center gap-4">
              <div className="font-mono text-sm font-semibold text-indigo-700">{t.id}</div>
              <div className="flex items-center gap-2 text-sm text-slate-800">
                <Building2 className="h-4 w-4 text-slate-400" />{t.from}
                <ChevronRight className="h-4 w-4 text-slate-300" />
                <Building2 className="h-4 w-4 text-slate-400" />{t.to}
              </div>
              <div className="font-mono text-sm">{t.qty} × {t.product}</div>
            </div>
            <div className="flex items-center gap-3">
              <div className="text-right">
                <Badge tone={tone(t.kind)}>{t.status}</Badge>
                <div className="mt-0.5 text-xs text-slate-500">{t.age}</div>
              </div>
              {t.kind === "suggested" && (
                <button onClick={() => approve(t.id)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700">Approve (checker)</button>
              )}
              {t.kind === "overdue" && <button onClick={() => toast("Escalated to Region Head & courier trace requested")} className="rounded-lg border border-rose-300 px-3 py-1.5 text-sm font-medium text-rose-600 transition hover:bg-rose-50">Escalate</button>}
            </div>
          </Card>
        ))}
      </div>
      <p className="text-xs text-slate-500">TRF-2026-0421 was auto-suggested by the rebalancing engine: Delhi CP holds 86 days of cover while Pune Hinjawadi breached its reorder point — a lateral transfer avoids a vendor order.</p>
    </div>
  );
}

function fmtKit(prefix, n) { return prefix + n; }
function rangeStr(prefix, from, to) { return from > to ? "—" : `${prefix}${from} – ${prefix}${to}`; }

function Custodian({ ops, setOps, pool, setPool, dayClosed, setDayClosed, toast, addException }) {
  const [issueFor, setIssueFor] = useState(null);   // operator id being issued to
  const [issueQty, setIssueQty] = useState(10);
  const [returnFor, setReturnFor] = useState(null); // operator id returning

  const poolAvail = Math.max(0, pool.poolTo - pool.poolFrom + 1);

  // derive per-operator figures from slips
  const rows = ops.map(o => {
    const issued = o.slips.reduce((a, s) => a + s.qty, 0);
    const ret = o.returned === "" ? null : Number(o.returned);
    const expected = issued - o.sold;            // unissued kits that must come back
    const ok = ret !== null && ret === expected;
    const bad = ret !== null && ret !== expected;
    return { ...o, issued, expected, ret, ok, bad };
  });
  const allReturned = rows.every(r => r.ret !== null);
  const allOk = rows.every(r => r.ok);
  const anyBad = rows.some(r => r.bad);

  // ISSUE: carve qty from the FIFO front of the custodian pool, append slip to operator
  const doIssue = () => {
    const qty = Math.max(1, Math.min(issueQty, poolAvail));
    if (qty < 1) return;
    const from = pool.poolFrom, to = pool.poolFrom + qty - 1;
    const slipNo = "OIS-PUN01-00" + (36 + ops.reduce((a, o) => a + o.slips.length, 0));
    const time = new Date().toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
    setOps(p => p.map(o => o.id === issueFor
      ? { ...o, slips: [...o.slips, { slip: slipNo, from, to, qty, time, acked: true }] }
      : o));
    setPool(p => ({ ...p, poolFrom: p.poolFrom + qty }));
    const op = ops.find(o => o.id === issueFor);
    toast(`Issued ${qty} kits (${rangeStr(pool.prefix, from, to)}) to ${op.name} · slip ${slipNo} · operator acknowledged`);
    setIssueFor(null); setIssueQty(10);
  };

  // RETURN: operator hands back the unissued tail; system computes expected & checks
  const doReturn = (o, countedStr) => {
    const counted = Number(countedStr);
    const ok = counted === o.expected;
    setOps(p => p.map(x => x.id === o.id ? { ...x, returned: countedStr } : x));
    if (ok && counted > 0) {
      // returned kits flow back to custodian pool tail (kept simple: extend pool)
      setPool(p => ({ ...p, poolTo: p.poolTo + counted }));
    }
    setReturnFor(null);
    if (counted !== o.expected) {
      toast(`${o.name}: counted ${counted} but expected ${o.expected} — variance flagged, day-close blocked`);
    } else {
      toast(`${o.name} returned ${counted} unissued kits — balanced and back in custodian pool`);
    }
  };

  return (
    <div className="space-y-6">
      <SectionTitle icon={Vault} title="Custodian day book · Pune Camp · 12 Jun 2026"
        sub="Day-open verified 09:01 by Custodian P. Deshmukh — opening balance matched previous closing. Working stock issued to operators by kit range (FIFO), returned and balanced at day-close."
        right={dayClosed ? <Badge tone="green">Branch day closed · 17:42</Badge> : <Badge tone="amber">Day open · 3 operators active</Badge>} />

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <UserCheck className="h-5 w-5 text-indigo-600" />
            <div>
              <div className="text-sm font-semibold text-slate-800">Custodian working pool · {pool.product}</div>
              <div className="text-xs text-slate-500">Custodian {pool.custodian} · joint officer {pool.jointOfficer} · issues taken FIFO from the front</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="text-right">
              <div className="uppercase tracking-wide text-slate-500" style={{ fontSize: 11 }}>Available to issue</div>
              <div className="font-mono text-2xl font-semibold text-slate-900">{poolAvail}</div>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
              <div className="uppercase tracking-wide text-slate-500" style={{ fontSize: 11 }}>Next kits out (FIFO front)</div>
              <div className="font-mono text-sm text-slate-800">{poolAvail ? rangeStr(pool.prefix, pool.poolFrom, pool.poolTo) : "Pool empty"}</div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="overflow-x-auto">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr><Th>Operator</Th><Th className="text-right">Issued (kits)</Th><Th>Kit ranges held</Th><Th className="text-right">Sold</Th><Th className="text-right">Expected return</Th><Th className="text-right">Counted</Th><Th>Balance</Th><Th>Action</Th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(o => (
              <tr key={o.id} className={`align-top ${o.bad ? "bg-rose-50" : o.ok ? "bg-emerald-50" : ""}`}>
                <Td className="font-medium text-slate-900"><span className="flex items-center gap-1.5"><User className="h-4 w-4 text-slate-400" />{o.name}<span className="text-xs text-slate-400">{o.till}</span></span></Td>
                <Td className="text-right font-mono">{o.issued}</Td>
                <Td>
                  <div className="space-y-0.5">
                    {o.slips.map(s => (
                      <div key={s.slip} className="flex items-center gap-1.5 font-mono text-xs text-slate-600">
                        <span className="text-slate-400">{s.slip}</span>
                        <span>{rangeStr(pool.prefix, s.from, s.to)}</span>
                        <span className="text-slate-400">({s.qty})</span>
                        {s.acked && <CheckCircle2 className="h-3 w-3 text-emerald-500" />}
                      </div>
                    ))}
                  </div>
                </Td>
                <Td className="text-right font-mono">{o.sold}</Td>
                <Td className="text-right font-mono text-slate-500">{o.expected}</Td>
                <Td className="text-right font-mono">{o.ret === null ? "—" : o.ret}</Td>
                <Td>{o.ret === null ? <Badge>Pending return</Badge> : o.ok ? <Badge tone="green">Balanced</Badge> : <Badge tone="rose">Variance {o.ret - o.expected > 0 ? "+" : ""}{o.ret - o.expected}</Badge>}</Td>
                <Td>
                  <div className="flex flex-col gap-1">
                    <button disabled={dayClosed || poolAvail < 1} onClick={() => { setIssueFor(o.id); setIssueQty(Math.min(10, poolAvail)); }}
                      className="inline-flex items-center gap-1 rounded-lg bg-indigo-600 px-2.5 py-1 text-xs font-medium text-white shadow-sm transition hover:bg-indigo-700 disabled:cursor-not-allowed disabled:bg-slate-300">
                      <ArrowLeftRight className="h-3 w-3" />Issue kits
                    </button>
                    <button disabled={dayClosed || o.ret !== null} onClick={() => setReturnFor(o.id)}
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50">
                      <PackageCheck className="h-3 w-3" />Receive return
                    </button>
                  </div>
                </Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      {/* ISSUE PANEL */}
      {issueFor && (() => {
        const op = ops.find(o => o.id === issueFor);
        const qty = Math.max(1, Math.min(issueQty, poolAvail));
        const from = pool.poolFrom, to = pool.poolFrom + qty - 1;
        return (
          <Card className="border-indigo-200 bg-indigo-50 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800"><ArrowLeftRight className="h-4 w-4 text-indigo-600" />Issue kits to {op.name} · {op.till}</div>
            <p className="text-xs text-slate-600">Kits are carved from the front of the custodian pool (FIFO) so the sequence stays accountable. The operator acknowledges the exact range in-system.</p>
            <div className="mt-3 flex flex-wrap items-end gap-4">
              <div>
                <label className="text-xs font-medium text-slate-500">Quantity</label>
                <input type="number" min="1" max={poolAvail} value={issueQty} onChange={e => setIssueQty(Number(e.target.value))}
                  className="mt-1 block w-28 rounded-lg border border-slate-300 px-2 py-1.5 font-mono text-sm" />
              </div>
              <div className="rounded-lg border border-indigo-200 bg-white px-3 py-2">
                <div className="uppercase tracking-wide text-slate-500" style={{ fontSize: 11 }}>Range that will be issued</div>
                <div className="font-mono text-sm font-semibold text-indigo-700">{rangeStr(pool.prefix, from, to)}</div>
              </div>
              <div className="text-xs text-slate-500">Pool after issue: <span className="font-mono">{poolAvail - qty}</span> kits remain</div>
            </div>
            <div className="mt-3 flex gap-2">
              <button onClick={doIssue} className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700">Issue &amp; record slip</button>
              <button onClick={() => setIssueFor(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-white">Cancel</button>
            </div>
          </Card>
        );
      })()}

      {/* RETURN PANEL */}
      {returnFor && (() => {
        const o = rows.find(r => r.id === returnFor);
        return (
          <Card className="border-slate-300 bg-slate-50 p-4">
            <div className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-800"><PackageCheck className="h-4 w-4 text-slate-600" />Receive end-of-day return · {o.name}</div>
            <div className="grid gap-3 text-sm md:grid-cols-4">
              <div className="rounded-lg border border-slate-200 bg-white p-2.5"><div className="uppercase tracking-wide text-slate-500" style={{ fontSize: 11 }}>Issued</div><div className="mt-0.5 font-mono text-lg">{o.issued}</div></div>
              <div className="rounded-lg border border-slate-200 bg-white p-2.5"><div className="uppercase tracking-wide text-slate-500" style={{ fontSize: 11 }}>Sold to customers</div><div className="mt-0.5 font-mono text-lg">{o.sold}</div></div>
              <div className="rounded-lg border border-slate-200 bg-white p-2.5"><div className="uppercase tracking-wide text-slate-500" style={{ fontSize: 11 }}>Expected return</div><div className="mt-0.5 font-mono text-lg text-indigo-700">{o.expected}</div></div>
              <div>
                <label className="text-xs font-medium text-slate-500">Counted return (scan tail)</label>
                <input type="number" min="0" autoFocus defaultValue={o.expected} id="retInput"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 font-mono text-sm" />
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-500">Operator returns the unissued tail of their ranges. System checks issued − sold − returned = 0. A mismatch opens a discrepancy and blocks day-close.</p>
            <div className="mt-3 flex gap-2">
              <button onClick={() => doReturn(o, document.getElementById("retInput").value)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700">Confirm return</button>
              <button onClick={() => setReturnFor(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-white">Cancel</button>
            </div>
          </Card>
        );
      })()}

      <div className="flex flex-wrap items-center gap-3">
        <button disabled={!allOk || dayClosed}
          onClick={() => { setDayClosed(true); toast("Branch day closed — Day-In/Day-Out report archived; custodian stock returned to joint custody"); }}
          className={`rounded-lg px-4 py-2 text-sm font-semibold text-white shadow-sm transition ${allOk && !dayClosed ? "bg-emerald-600 hover:bg-emerald-700" : "cursor-not-allowed bg-slate-300"}`}>
          Close branch day (custodian)
        </button>
        {anyBad && !dayClosed && (
          <button onClick={() => { addException({ id: "EXC-" + Math.floor(3310 + Math.random() * 80), sev: "High", type: "Operator balance variance", where: "Pune Camp · day-close", note: "Operator counted return does not equal issued minus sold; physical recount and incident review required before day-close.", sla: "Resolve before 18:00", status: "Open" }); toast("Discrepancy case raised — day-close remains blocked until resolved"); }}
            className="rounded-lg border border-rose-300 px-4 py-2 text-sm font-medium text-rose-600 transition hover:bg-rose-50">
            Raise discrepancy case
          </button>
        )}
        {!dayClosed && !allOk && (
          <span className="flex items-center gap-1.5 text-sm text-slate-500"><Lock className="h-4 w-4" />
            {allReturned ? "Day-close blocked — a variance is open" : "Receive every operator's return first; day-close needs issued − sold − returned = 0 for all"}
          </span>
        )}
      </div>

      <Card className="p-4">
        <h3 className="mb-2 text-sm font-semibold text-slate-800">Day-In / Day-Out summary</h3>
        <div className="grid grid-cols-2 gap-3 text-sm md:grid-cols-6">
          {(() => {
            const issued = rows.reduce((a, r) => a + r.issued, 0);
            const sold = rows.reduce((a, r) => a + r.sold, 0);
            const returned = rows.reduce((a, r) => a + (r.ret ?? 0), 0);
            const opening = 70;
            return [["Opening (custodian)", opening], ["Received from vault", 0], ["Issued to operators", issued], ["Sold to customers", sold], ["Returned by operators", allReturned ? returned : "—"], ["Closing (custodian)", dayClosed ? opening - sold : "—"]];
          })().map(([l, v]) => (
            <div key={l} className="rounded-lg border border-slate-200 p-2.5">
              <div className="uppercase tracking-wide text-slate-500" style={{ fontSize: 11 }}>{l}</div>
              <div className="mt-0.5 font-mono text-lg font-semibold text-slate-900">{v}</div>
            </div>
          ))}
        </div>
        <p className="mt-2 text-xs text-slate-500">Every issue and return is serial-range stamped · report archived to audit store · joint-custody hand-back requires second officer ({pool.jointOfficer}) confirmation.</p>
      </Card>
    </div>
  );
}

function Replenishment({ proposals, setProposals, model, toast }) {
  const routing = model === "centralised"
    ? "Centralised model: branch proposals become requisitions on Central Vault; vault breaches consolidate into vendor POs."
    : "Decentralised model: branch proposals become vendor purchase orders in the branch approval queue (within delegated limits).";
  const act = (id, ok) => {
    setProposals(p => p.map(x => x.id === id ? { ...x, status: ok ? (model === "centralised" ? "Approved → Requisition REQ-2026-0533 on Central Vault" : "Approved → Vendor PO PO-2026-0159 (branch queue)") : "Rejected with reason" } : x));
    toast(ok ? (model === "centralised" ? "Approved — requisition raised on Central Vault" : "Approved — vendor PO created in branch approval queue") : "Proposal rejected — reason recorded for audit");
  };
  return (
    <div className="space-y-6">
      <SectionTitle icon={RefreshCw} title="Auto-replenishment" sub="Continuous monitoring of net available vs reorder point. Proposals are sized to restore Max, capped by forecast."
        right={<Badge tone="indigo">{model === "centralised" ? "Centralised ordering" : "Decentralised ordering"}</Badge>} />
      <Card className="border-indigo-200 bg-indigo-50 p-3 text-sm text-indigo-900">{routing} <span className="text-indigo-700">Switch the operating model in Settings to see routing change.</span></Card>
      <div className="space-y-3">
        {proposals.map(p => (
          <Card key={p.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold text-indigo-700">{p.id}</span>
                <span className="text-sm font-medium text-slate-900">{p.branch}</span>
                <span className="font-mono text-xs text-slate-500">{p.product}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">{p.reason}</p>
              <p className="mt-1 text-xs text-slate-600">Net available <span className="font-mono font-semibold">{p.net}</span> vs ROP <span className="font-mono">{p.rop}</span>{p.suggest > 0 && <> · suggested order <span className="font-mono font-semibold text-slate-900">{p.suggest}</span> kits</>}</p>
            </div>
            <div className="flex items-center gap-2">
              {p.status === "Pending" ? (
                <>
                  <button onClick={() => act(p.id, true)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-emerald-700">Approve</button>
                  <button onClick={() => act(p.id, false)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 transition hover:bg-slate-50">Reject</button>
                </>
              ) : <Badge tone={p.status.startsWith("Approved") ? "green" : p.status === "Suppressed" ? "slate" : "rose"}>{p.status}</Badge>}
            </div>
          </Card>
        ))}
      </div>
      <p className="text-xs text-slate-500">Duplicate-order protection active: open POs/requisitions for the same branch-product suppress new proposals. Auto-approval applies below 200 kits (none qualified today).</p>
    </div>
  );
}

function Exceptions({ exceptions }) {
  return (
    <div className="space-y-6">
      <SectionTitle icon={AlertTriangle} title="Exceptions" sub="Rule-driven cases with ownership, SLA timers and escalation. Lost/stolen stock auto-blocks cards via Issuance API."
        right={<Badge tone="rose">{exceptions.filter(e => e.sev === "High").length} high</Badge>} />
      <Card className="overflow-hidden">
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr><Th>Case</Th><Th>Severity</Th><Th>Type</Th><Th>Where</Th><Th>Detail</Th><Th>SLA</Th><Th>Status</Th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {exceptions.map(e => (
              <tr key={e.id} className="align-top hover:bg-slate-50">
                <Td className="font-mono text-indigo-700">{e.id}</Td>
                <Td><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${SEV[e.sev]}`}>{e.sev}</span></Td>
                <Td className="font-medium text-slate-900">{e.type}</Td>
                <Td>{e.where}</Td>
                <Td className="max-w-xs text-xs text-slate-500">{e.note}</Td>
                <Td className="text-xs">{e.sla}</Td>
                <Td><Badge tone={e.status === "Open" ? "amber" : e.status === "Investigating" ? "sky" : "indigo"}>{e.status}</Badge></Td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

const TRACE_ICONS = { po: ShoppingCart, factory: Factory, truck: Truck, vault: Vault, branch: Building2, cust: UserCheck, op: User, card: CreditCard };

function Trace() {
  const [q, setQ] = useState("KIT-77904612");
  const [serial, setSerial] = useState("KIT-77904612");
  const data = TRACE_DB[serial];
  return (
    <div className="space-y-6">
      <SectionTitle icon={Route} title="Serial trace" sub="Full chain of custody for any kit, card sequence or masked PAN — fraud/audit grade, < 30 seconds" />
      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative grow">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" />
            <input value={q} onChange={e => setQ(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === "Enter" && setSerial(q.trim())}
              className="w-full rounded-lg border border-slate-300 py-2 pl-8 pr-3 font-mono text-sm" placeholder="Kit number / card sequence / masked PAN" />
          </div>
          <button onClick={() => setSerial(q.trim())} className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm transition hover:bg-indigo-700">Trace</button>
        </div>
        <div className="mt-2 text-xs text-slate-500">Demo serials: {Object.keys(TRACE_DB).map(k => (
          <button key={k} onClick={() => { setQ(k); setSerial(k); }} className="mr-2 font-mono text-indigo-600 underline-offset-2 hover:underline">{k}</button>
        ))}</div>
      </Card>

      {!data ? (
        <Card className="p-6 text-sm text-slate-600">No record found for <span className="font-mono">{serial}</span>. Check the serial or try a demo serial above. Searches are themselves audit-logged.</Card>
      ) : (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <div className="font-mono text-lg font-semibold text-slate-900">{serial}</div>
              <div className="text-sm text-slate-500">{data.product} · PAN {data.pan} · Card ID <span className="font-mono">{data.cardId}</span></div>
            </div>
            <Badge tone={data.state.startsWith("Issued") ? "green" : "sky"}>{data.state}</Badge>
          </div>
          <ol className="mt-4">
            {data.chain.map((s, i) => {
              const Icon = TRACE_ICONS[s.icon] || CircleDot;
              const last = i === data.chain.length - 1;
              return (
                <li key={i} className="relative flex gap-4 pb-6 last:pb-0">
                  {!last && <span className="absolute top-8 h-full w-0.5 bg-slate-200" style={{ left: 15 }} />}
                  <span className={`z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${last ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"}`}>
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="pt-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`text-sm font-semibold ${last ? "text-indigo-700" : "text-slate-900"}`}>{s.title}</span>
                      <span className="font-mono text-xs text-slate-500">{s.doc}</span>
                    </div>
                    <div className="text-xs text-slate-500">{s.t} · {s.where} · {s.who}</div>
                  </div>
                </li>
              );
            })}
          </ol>
          <div className="mt-4 flex items-center gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
            <ShieldCheck className="h-4 w-4 text-emerald-500" />Audit-grade chain · hash-chained journal verified · export as PDF for investigation pack
          </div>
        </Card>
      )}
    </div>
  );
}

function SettingsView({ model, setModel, toast }) {
  return (
    <div className="space-y-6">
      <SectionTitle icon={Settings2} title="Institution configuration" sub="All parameters maker-checker governed with effective dating. This demo applies changes instantly." />
      <Card className="p-5">
        <h3 className="text-sm font-semibold text-slate-800">Operating model</h3>
        <p className="mt-1 text-sm text-slate-500">Drives who may raise vendor orders and how auto-replenishment routes. Product/region overrides supported (hybrid).</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          {[
            { id: "centralised", title: "Centralised", desc: "Central Cards Ops orders from vendors; vendor delivers to Central Vault; branches raise internal requisitions." },
            { id: "decentralised", title: "Decentralised", desc: "Branches order directly from approved vendors within delegated limits; vendor delivers to branch." },
          ].map(o => (
            <button key={o.id} onClick={() => { setModel(o.id); toast(`Operating model set to ${o.title} — replenishment routing updated`); }}
              className={`rounded-xl border-2 p-4 text-left transition ${model === o.id ? "border-indigo-600 bg-indigo-50" : "border-slate-200 hover:border-slate-300"}`}>
              <div className="flex items-center justify-between">
                <span className="font-semibold text-slate-900">{o.title}</span>
                {model === o.id && <CheckCircle2 className="h-5 w-5 text-indigo-600" />}
              </div>
              <p className="mt-1 text-sm text-slate-500">{o.desc}</p>
            </button>
          ))}
        </div>
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-800">Replenishment policy defaults</h3>
          <dl className="mt-3 space-y-2 text-sm">
            {[["Method", "Min–max with forecast cap"], ["Safety stock", "10 days of cover"], ["Reorder point", "Safety + lead-time demand"], ["Auto-approve below", "200 kits"], ["Review frequency", "Continuous (event-driven)"]].map(([k, v]) => (
              <div key={k} className="flex justify-between border-b border-slate-100 pb-1.5"><dt className="text-slate-500">{k}</dt><dd className="font-medium text-slate-800">{v}</dd></div>
            ))}
          </dl>
        </Card>
        <Card className="p-5">
          <h3 className="text-sm font-semibold text-slate-800">Governance controls (read-only here)</h3>
          <ul className="mt-3 space-y-2 text-sm text-slate-600">
            {["Maker-checker on PO, GRN-with-discrepancy, transfer, adjustment, destruction", "Dual custody on vault and branch joint-custody locations", "Day-close blocked on unbalanced operator positions", "Hash-chained audit trail · 10-year retention", "No full PAN stored — masked display per PCI DSS v4.0"].map(t => (
              <li key={t} className="flex gap-2"><ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" />{t}</li>
            ))}
          </ul>
        </Card>
      </div>
    </div>
  );
}

function BranchStats({ sel, setSel, exceptions, transfers, collection = [], setView }) {
  const [tab, setTab] = useState("profile");
  const [prodFilter, setProdFilter] = useState("ALL");
  const b = BRANCHES.find(x => x.id === sel);
  const stats = PRODUCT_STATS[sel];
  const info = opsInfo(sel);
  const bh = branchHealth(b);
  const shown = prodFilter === "ALL" ? stats : stats.filter(p => p.code === prodFilter);

  const totals = stats.reduce((a, p) => ({ onHand: a.onHand + p.onHand, inTransit: a.inTransit + p.inTransit, net: a.net + p.net, avgDaily: a.avgDaily + p.avgDaily }), { onHand: 0, inTransit: 0, net: 0, avgDaily: 0 });
  const weekly = stats[0].weeks.map((w, k) => { const row = { w: w.w }; stats.forEach(p => { row[p.code] = p.weeks[k].qty; }); return row; });
  const agingData = AGING.map((a, k) => { const row = { bucket: a.bucket }; stats.forEach(p => { row[p.code] = p.aging[k]; }); return row; });
  const branchExc = exceptions.filter(e => e.where.includes(b.name));
  const inbound = transfers.filter(t => t.to === b.name && t.kind !== "done");
  const outbound = transfers.filter(t => t.from === b.name && t.kind !== "done");

  /* ---- Demand forecasting & usage patterns (product-level, this branch) ---- */
  const fx = useMemo(() => {
    const seed = seedOf(sel);
    const per = stats.map((p, i) => {
      const personalised = p.cls === "Personalised";
      const daily = dailySeries(seed + i * 17, Math.max(1, p.avgDaily), p.code);
      const weekly = toWeekly(daily);
      const dow = dowProfile(daily);
      const total = daily.reduce((a, b2) => a + b2, 0);
      const cvW = cv(weekly);
      const base = {
        code: p.code, name: p.name, personalised, daily, weekly, dow, total,
        trend: trendPct(weekly), vol: volatilityClass(cvW), xyz: xyz(cvW), sbc: sbcClass(daily), peak: peak(weekly),
      };
      if (personalised) return { ...base, model: "N/A", mape: null, rmseDaily: 0, next7: null, fcWeekly: [null, null, null, null] };
      const best = bestForecast(daily, { season: 7 });
      const m = metrics(daily, best.fit);
      const fc = Array.from({ length: 28 }, (_, k) => Math.max(0, best.forecast(k + 1)));
      return { ...base, model: best.name, mape: m.mape, rmseDaily: m.rmse, next7: Math.round(fc.slice(0, 7).reduce((a, b2) => a + b2, 0)), fcWeekly: toWeekly(fc) };
    });
    const abc = abcClasses(per.map(p => ({ code: p.code, total: p.total })));
    per.forEach(p => { p.abc = p.personalised ? "—" : abc[p.code]; });
    const pregen = per.filter(p => !p.personalised);
    const totWt = pregen.reduce((a, p) => a + p.total, 0) || 1;
    return { per, pregen, next7: pregen.reduce((a, p) => a + (p.next7 || 0), 0), wmape: pregen.reduce((a, p) => a + (p.mape || 0) * p.total, 0) / totWt };
  }, [sel, stats]);

  const scope = prodFilter === "ALL" ? null : fx.per.find(p => p.code === prodFilter);
  const aggBase = fx.pregen.length ? fx.pregen : fx.per;
  const wkActual = scope ? scope.weekly : (aggBase[0]?.weekly.map((_, k) => aggBase.reduce((a, p) => a + p.weekly[k], 0)) || []);
  const showFc = !scope || !scope.personalised;
  const wkFc = showFc ? (scope ? scope.fcWeekly : (aggBase[0]?.fcWeekly.map((_, k) => aggBase.reduce((a, p) => a + (p.fcWeekly[k] || 0), 0)) || [])) : [];
  const rmseW = (scope ? scope.rmseDaily : Math.sqrt(fx.pregen.reduce((a, p) => a + p.rmseDaily ** 2, 0))) * Math.sqrt(7);
  const zBand = 1.28;
  const fcChart = [
    ...wkActual.map((v, k) => ({ w: `W-${wkActual.length - k}`, actual: Math.round(v) })),
    ...wkFc.map((v, k) => ({ w: `W+${k + 1}`, forecast: Math.round(v), lo: Math.round(Math.max(0, v - zBand * rmseW)), bandWidth: Math.round(2 * zBand * rmseW) })),
  ];
  if (showFc && wkActual.length && wkFc.length) fcChart[wkActual.length - 1].forecast = fcChart[wkActual.length - 1].actual;
  const scopeDaily = scope ? scope.daily : (aggBase[0]?.daily.map((_, i) => aggBase.reduce((a, p) => a + p.daily[i], 0)) || []);
  const dowData = dowProfile(scopeDaily);
  const scopeModel = scope ? scope.model : "blended best-fit";
  const scopeMape = scope ? scope.mape : fx.wmape;
  const scopeNext7 = scope ? scope.next7 : fx.next7;

  return (
    <div className="space-y-6">
      <SectionTitle icon={BarChart3} title="Branch & product statistics" sub="Everything from the branch's perspective: per-product position vs policy, demand, aging, pipeline and exceptions"
        right={
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1">
            {[["profile", "Branch profile"], ["matrix", "Branch × product matrix"], ["league", "Product league"]].map(([id, label]) => (
              <button key={id} onClick={() => setTab(id)} className={`rounded-md px-3 py-1.5 text-sm font-medium transition ${tab === id ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{label}</button>
            ))}
          </div>
        } />

      {tab === "profile" && (
        <>
          <Card className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div className="flex items-center gap-3">
              <select value={sel} onChange={e => setSel(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-medium">
                {BRANCHES.map(x => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
              <Badge tone={bh.key === "ok" ? "green" : bh.key === "stockout" ? "rose" : bh.key === "over" ? "indigo" : "amber"}>{bh.label}</Badge>
              <span className="text-sm text-slate-500">{b.region} region</span>
            </div>
            <select value={prodFilter} onChange={e => setProdFilter(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm">
              <option value="ALL">All products</option>
              {PRODUCTS.map(p => <option key={p.code} value={p.code}>{p.name}</option>)}
            </select>
          </Card>

          <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
            <Kpi label="On hand" value={totals.onHand.toLocaleString()} sub="all products, all custody" />
            <Kpi label="Inbound in transit" value={totals.inTransit.toLocaleString()} sub={inbound.length ? inbound.map(t => t.id).join(", ") : "none"} tone="indigo" />
            <Kpi label="Net available" value={totals.net.toLocaleString()} sub="on hand + inbound − reserved − blocked" />
            <Kpi label="Avg daily issuance" value={totals.avgDaily} sub="trailing 4 weeks" />
            <Kpi label="Days of cover" value={totals.avgDaily ? Math.round(totals.net / totals.avgDaily) : "—"} sub="policy band 21–90 days" tone={totals.avgDaily && totals.net / totals.avgDaily < 21 ? "amber" : "green"} />
          </div>

          {(() => {
            const a = activityOf(sel);
            const tiles = [
              { key: "placed", label: "Orders placed today", icon: ShoppingCart, tone: "indigo", list: a.ordersPlaced, party: "vendor" },
              { key: "intransit", label: "In transit (inbound)", icon: Truck, tone: "sky", list: a.inTransitIn, party: "from" },
              { key: "received", label: "Received today", icon: PackageCheck, tone: "green", list: a.receivedToday, party: "from" },
              { key: "dispatched", label: "Dispatched out today", icon: ArrowLeftRight, tone: "amber", list: a.dispatchedOut, party: "to" },
            ];
            const toneBar = { indigo: "#4F46E5", sky: "#0EA5E9", green: "#10B981", amber: "#F59E0B" };
            return (
              <Card className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Clock className="h-4 w-4 text-indigo-600" />Today&rsquo;s order &amp; movement activity · {b.name}</h3>
                  <span className="text-xs text-slate-500">Format: documents <span className="font-mono">(cards)</span> · 12 Jun 2026</span>
                </div>
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  {tiles.map(t => (
                    <div key={t.key} className="rounded-lg border border-slate-200 p-3" style={{ borderTopWidth: 3, borderTopColor: toneBar[t.tone] }}>
                      <div className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-slate-500"><t.icon className="h-3.5 w-3.5" />{t.label}</div>
                      <div className="mt-1 font-mono text-2xl font-semibold text-slate-900">
                        {t.list.length} <span className="text-base font-normal text-slate-500">({sumCards(t.list).toLocaleString()})</span>
                      </div>
                      <div className="text-xs text-slate-500">{t.list.length === 1 ? "document" : "documents"} ({sumCards(t.list).toLocaleString()} cards)</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm">
                  <span className="text-slate-600">Issued to customers today</span>
                  <span className="font-mono font-semibold text-slate-900">{a.issuedToCustomers ?? 0} <span className="font-normal text-slate-500">cards</span></span>
                </div>

                {tiles.some(t => t.list.length > 0) && (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full">
                      <thead className="border-b border-slate-200 bg-slate-50">
                        <tr><Th>Activity</Th><Th>Document</Th><Th>Product</Th><Th className="text-right">Cards</Th><Th>Counterparty</Th><Th>Detail</Th></tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {tiles.flatMap(t => t.list.map((it, i) => (
                          <tr key={t.key + i} className="hover:bg-slate-50">
                            <Td><span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: toneBar[t.tone] }}><t.icon className="h-3.5 w-3.5" />{t.label.replace(" today", "").replace(" (inbound)", "")}</span></Td>
                            <Td className="font-mono text-indigo-700">{it.ref}</Td>
                            <Td className="font-mono text-xs">{it.product}</Td>
                            <Td className="text-right font-mono font-semibold">{it.cards.toLocaleString()}</Td>
                            <Td className="text-xs text-slate-600">{it.vendor || it.from || it.to || "—"}</Td>
                            <Td className="text-xs text-slate-500">{it.note}</Td>
                          </tr>
                        )))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Card>
            );
          })()}

          <Card className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr><Th>Product</Th><Th>Class</Th><Th className="text-right">On hand</Th><Th className="text-right">In transit</Th><Th className="text-right">Reserved</Th><Th className="text-right">Blocked</Th><Th className="text-right">Net avail.</Th><Th className="text-right">Avg/day</Th><Th className="text-right">Cover (d)</Th><Th className="text-right">Safety</Th><Th className="text-right">ROP</Th><Th className="text-right">Max</Th><Th className="text-right">Fcst/wk</Th><Th className="text-right">Trend</Th><Th>Pattern</Th><Th className="text-right">MAPE</Th><Th>Status</Th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map(p => {
                  const ph = productHealth(p);
                  const fa = fx.per.find(a => a.code === p.code);
                  const tb = fa ? trendBadge(fa.trend) : null;
                  return (
                    <tr key={p.code} className="hover:bg-slate-50">
                      <Td className="font-medium text-slate-900"><span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: PRODUCT_COLORS[p.code] }} />{p.name}</span></Td>
                      <Td className="text-xs text-slate-500">{p.cls}</Td>
                      <Td className="text-right font-mono">{p.onHand.toLocaleString()}</Td>
                      <Td className="text-right font-mono">{p.inTransit.toLocaleString()}</Td>
                      <Td className="text-right font-mono">{p.reserved}</Td>
                      <Td className="text-right font-mono">{p.blocked}</Td>
                      <Td className="text-right font-mono font-semibold">{p.net.toLocaleString()}</Td>
                      <Td className="text-right font-mono">{p.avgDaily}</Td>
                      <Td className="text-right font-mono">{p.cover ?? "—"}</Td>
                      <Td className="text-right font-mono text-slate-500">{p.safety}</Td>
                      <Td className="text-right font-mono text-slate-500">{p.rop}</Td>
                      <Td className="text-right font-mono text-slate-500">{p.max}</Td>
                      <Td className="text-right font-mono">{fa && fa.fcWeekly[0] != null ? Math.round(fa.fcWeekly[0]).toLocaleString() : "—"}</Td>
                      <Td className="text-right font-mono">{tb ? <span className={tb.tone}>{tb.sym} {Math.abs(fa.trend).toFixed(1)}%</span> : "—"}</Td>
                      <Td className="text-xs">{fa ? (fa.personalised ? <span className="text-slate-400">Named</span> : <span className="font-medium text-slate-700">{fa.abc}{fa.xyz} · {fa.vol}</span>) : "—"}</Td>
                      <Td className="text-right font-mono">{fa && fa.mape != null ? `${fa.mape.toFixed(0)}%` : "—"}</Td>
                      <Td><span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: ph.color }}><span className="h-2 w-2 rounded-full" style={{ background: ph.color }} />{ph.label}</span></Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-800">Weekly issuance by product · {b.name}</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={weekly} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="w" tick={{ fontSize: 11 }} stroke="#94A3B8" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#94A3B8" />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {PRODUCTS.map(p => <Bar key={p.code} dataKey={p.code} stackId="a" fill={PRODUCT_COLORS[p.code]} />)}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
            <Card className="p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-800">Aging by product (days at this branch)</h3>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={agingData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="bucket" tick={{ fontSize: 11 }} stroke="#94A3B8" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#94A3B8" />
                    <Tooltip />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    {PRODUCTS.map(p => <Bar key={p.code} dataKey={p.code} stackId="a" fill={PRODUCT_COLORS[p.code]} />)}
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card className="p-4">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><TrendingUp className="h-4 w-4 text-indigo-600" />Demand &amp; forecast · {scope ? scope.name : "all pregen products"}</h3>
                <Badge tone="indigo">{scopeModel}{scopeMape != null ? ` · MAPE ${scopeMape.toFixed(1)}%` : ""}</Badge>
              </div>
              <div className="mb-3 grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-slate-200 p-2.5">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Forecast · next 7 days</div>
                  <div className="mt-0.5 font-mono text-lg font-semibold text-slate-900">{scopeNext7 != null ? scopeNext7.toLocaleString() : "—"} <span className="text-xs font-normal text-slate-500">cards</span></div>
                </div>
                <div className="rounded-lg border border-slate-200 p-2.5">
                  <div className="text-xs uppercase tracking-wide text-slate-500">Forecast accuracy</div>
                  <div className="mt-0.5 font-mono text-lg font-semibold text-emerald-600">{scopeMape != null ? `MAPE ${scopeMape.toFixed(1)}%` : "N/A"}</div>
                </div>
              </div>
              <div className="h-52">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={fcChart} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="w" tick={{ fontSize: 10 }} stroke="#94A3B8" interval={1} />
                    <YAxis tick={{ fontSize: 11 }} stroke="#94A3B8" />
                    <Tooltip />
                    <Area dataKey="lo" stackId="band" stroke="none" fill="transparent" isAnimationActive={false} legendType="none" />
                    <Area dataKey="bandWidth" name="80% interval" stackId="band" stroke="none" fill="#6366F1" fillOpacity={0.12} isAnimationActive={false} legendType="none" />
                    <Line dataKey="actual" name="Actual" stroke="#4F46E5" strokeWidth={2} dot={false} isAnimationActive={false} />
                    <Line dataKey="forecast" name="Forecast" stroke="#94A3B8" strokeDasharray="5 4" strokeWidth={2} dot={false} isAnimationActive={false} connectNulls />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1 text-xs text-slate-500">12 weeks actual + 4 weeks forecast · best-fit model auto-selected by lowest MAPE{showFc ? " · shaded band = 80% interval" : " · forecasting off for personalised (named cards)"}.</p>
            </Card>

            <Card className="p-4">
              <div className="mb-3 flex items-center gap-2"><CalendarClock className="h-4 w-4 text-indigo-600" /><h3 className="text-sm font-semibold text-slate-800">Usage pattern · day of week</h3></div>
              <div className="h-40">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={dowData} margin={{ top: 4, right: 8, bottom: 0, left: -16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
                    <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="#94A3B8" />
                    <YAxis tick={{ fontSize: 11 }} stroke="#94A3B8" />
                    <Tooltip formatter={v => [`${v} (100 = avg day)`, "Index"]} />
                    <Bar dataKey="index" name="vs avg" radius={[3, 3, 0, 0]}>
                      {dowData.map((d, i) => <Cell key={i} fill={d.index >= 110 ? "#4F46E5" : d.index <= 80 ? "#FB923C" : "#94A3B8"} />)}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <p className="mt-1.5 text-xs text-slate-600">{usageNarrative(scope, dowData)}</p>
              <div className="mt-2 space-y-1.5 text-xs">
                {fx.per.map(p => {
                  const tb = trendBadge(p.trend);
                  return (
                    <div key={p.code} className="flex items-center justify-between gap-2 border-b border-slate-100 pb-1">
                      <span className="flex items-center gap-1.5 font-medium text-slate-700"><span className="h-2 w-2 rounded-sm" style={{ background: PRODUCT_COLORS[p.code] }} />{p.code}</span>
                      <span className="flex items-center gap-2">
                        <span className={`font-mono ${tb.tone}`}>{tb.sym} {Math.abs(p.trend).toFixed(1)}%/wk</span>
                        <Badge tone={p.vol === "Smooth" ? "green" : p.vol === "Variable" ? "amber" : "rose"}>{p.personalised ? p.sbc : p.vol}</Badge>
                        <Badge tone="slate">{p.personalised ? "Named" : `${p.abc}${p.xyz}`}</Badge>
                      </span>
                    </div>
                  );
                })}
              </div>
            </Card>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <Card className="p-4">
              <div className="flex items-center gap-2"><ClipboardCheck className="h-4 w-4 text-indigo-600" /><h3 className="text-sm font-semibold text-slate-800">Branch operations</h3></div>
              <dl className="mt-3 space-y-2 text-sm">
                {[["Custodian", info.custodian], ["Backup / joint officer", info.backup], ["Last physical count", info.lastCount], ["Day status", info.dayStatus]].map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-3 border-b border-slate-100 pb-1.5"><dt className="text-slate-500">{k}</dt><dd className="text-right font-medium text-slate-800">{v}</dd></div>
                ))}
              </dl>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2"><Truck className="h-4 w-4 text-indigo-600" /><h3 className="text-sm font-semibold text-slate-800">Pipeline</h3></div>
              <div className="mt-3 space-y-2 text-sm">
                <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Inbound</div>
                {inbound.length ? inbound.map(t => <div key={t.id} className="flex justify-between"><span className="font-mono text-indigo-700">{t.id}</span><span className="text-slate-600">{t.qty} × {t.product} · {t.status}</span></div>) : <div className="text-slate-400">None</div>}
                <div className="pt-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Outbound</div>
                {outbound.length ? outbound.map(t => <div key={t.id} className="flex justify-between"><span className="font-mono text-indigo-700">{t.id}</span><span className="text-slate-600">{t.qty} × {t.product} · {t.status}</span></div>) : <div className="text-slate-400">None</div>}
              </div>
            </Card>
            <Card className="p-4">
              <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-500" /><h3 className="text-sm font-semibold text-slate-800">Open exceptions at this branch</h3></div>
              <div className="mt-3 space-y-2 text-sm">
                {branchExc.length ? branchExc.map(e => (
                  <div key={e.id} className="rounded-lg border border-slate-200 p-2">
                    <div className="flex items-center justify-between"><span className="font-mono text-xs text-indigo-700">{e.id}</span><span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${SEV[e.sev]}`}>{e.sev}</span></div>
                    <div className="mt-0.5 text-xs text-slate-600">{e.type} — {e.note}</div>
                  </div>
                )) : <div className="text-slate-400">No open exceptions — clean branch.</div>}
              </div>
            </Card>
          </div>

          {(() => {
            const cc = collection.filter(c => c.branch === b.name);
            const awaiting = cc.filter(c => c.status.includes("Awaiting") || c.status.includes("Unclaimed"));
            const overdue = awaiting.filter(c => collectionBucket(c).key === "overdue");
            if (cc.length === 0) return null;
            return (
              <Card className="p-4">
                <div className="mb-3 flex items-center justify-between">
                  <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><CreditCard className="h-4 w-4 text-indigo-600" />Personalised cards awaiting collection · {b.name}</h3>
                  <button onClick={() => setView && setView("collection")} className="text-xs font-medium text-indigo-600 hover:underline">Open collection register →</button>
                </div>
                <div className="mb-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <div className="rounded-lg border border-slate-200 p-2.5"><div className="text-xs uppercase tracking-wide text-slate-500">Awaiting</div><div className="mt-0.5 font-mono text-lg font-semibold text-slate-900">{awaiting.length}</div></div>
                  <div className="rounded-lg border border-slate-200 p-2.5"><div className="text-xs uppercase tracking-wide text-slate-500">Overdue (&gt;{COLLECTION_POLICY.retentionDays}d)</div><div className="mt-0.5 font-mono text-lg font-semibold text-rose-600">{overdue.length}</div></div>
                  <div className="rounded-lg border border-slate-200 p-2.5"><div className="text-xs uppercase tracking-wide text-slate-500">Oldest age</div><div className="mt-0.5 font-mono text-lg font-semibold text-slate-900">{awaiting.length ? Math.max(...awaiting.map(c => c.ageDays)) : 0}d</div></div>
                  <div className="rounded-lg border border-slate-200 p-2.5"><div className="text-xs uppercase tracking-wide text-slate-500">Tracking</div><div className="mt-0.5 text-sm font-medium text-slate-700">By name, not qty</div></div>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="border-b border-slate-200 bg-slate-50"><tr><Th>Card ID</Th><Th>Customer</Th><Th>Received</Th><Th className="text-right">Age</Th><Th>Status</Th></tr></thead>
                    <tbody className="divide-y divide-slate-100">
                      {awaiting.slice(0, 5).map(c => {
                        const bk = collectionBucket(c);
                        return (
                          <tr key={c.id}>
                            <Td className="font-mono text-xs text-indigo-700">{c.id}</Td>
                            <Td className="text-sm">{c.customer}</Td>
                            <Td className="text-xs">{c.received}</Td>
                            <Td className="text-right font-mono">{c.ageDays}d</Td>
                            <Td><span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: bk.color }}><span className="h-2 w-2 rounded-full" style={{ background: bk.color }} />{c.status}</span></Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </Card>
            );
          })()}
        </>
      )}

      {tab === "matrix" && (
        <>
          <Card className="overflow-x-auto">
            <div className="border-b border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Today&rsquo;s order activity by branch · documents (cards)</div>
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr><Th>Branch</Th><Th className="text-right">Placed</Th><Th className="text-right">In transit (in)</Th><Th className="text-right">Received</Th><Th className="text-right">Dispatched (out)</Th><Th className="text-right">Issued to cust.</Th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {BRANCHES.filter(x => DAILY_ACTIVITY[x.id]).map(x => {
                  const a = activityOf(x.id);
                  const cell = list => <span className="font-mono">{list.length} <span className="text-slate-400">({sumCards(list).toLocaleString()})</span></span>;
                  return (
                    <tr key={x.id} onClick={() => { setSel(x.id); setTab("profile"); }} className="cursor-pointer hover:bg-indigo-50">
                      <Td className="font-medium text-slate-900">{x.name}</Td>
                      <Td className="text-right">{cell(a.ordersPlaced)}</Td>
                      <Td className="text-right">{cell(a.inTransitIn)}</Td>
                      <Td className="text-right">{cell(a.receivedToday)}</Td>
                      <Td className="text-right">{cell(a.dispatchedOut)}</Td>
                      <Td className="text-right font-mono">{a.issuedToCustomers ?? 0}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="px-3 pb-3 pt-2 text-xs text-slate-500">Each cell shows number of documents and, in brackets, the total cards they carry. Click a row for the branch&rsquo;s full document feed.</p>
          </Card>

          <Card className="overflow-x-auto">
            <div className="border-b border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Net available stock · branch × product</div>
            <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr>
                <Th>Branch \ Product</Th>
                {PRODUCTS.map(p => <Th key={p.code} className="text-right"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-sm" style={{ background: PRODUCT_COLORS[p.code] }} />{p.code}</span></Th>)}
                <Th className="text-right">Total net</Th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {BRANCHES.map(x => (
                <tr key={x.id} onClick={() => { setSel(x.id); setTab("profile"); }} className="cursor-pointer hover:bg-indigo-50">
                  <Td className="font-medium text-slate-900">{x.name}</Td>
                  {PRODUCT_STATS[x.id].map(p => {
                    const ph = productHealth(p);
                    return <Td key={p.code} className="text-right font-mono"><span className="inline-flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: ph.color }} />{p.net.toLocaleString()}</span></Td>;
                  })}
                  <Td className="text-right font-mono font-semibold">{PRODUCT_STATS[x.id].reduce((a, p) => a + p.net, 0).toLocaleString()}</Td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t-2 border-slate-300 bg-slate-50">
              <tr>
                <Td className="font-semibold text-slate-900">Network total (net available)</Td>
                {PRODUCTS.map((p, i) => <Td key={p.code} className="text-right font-mono font-semibold">{BRANCHES.reduce((a, x) => a + PRODUCT_STATS[x.id][i].net, 0).toLocaleString()}</Td>)}
                <Td className="text-right font-mono font-semibold">{BRANCHES.reduce((a, x) => a + PRODUCT_STATS[x.id].reduce((s, p) => s + p.net, 0), 0).toLocaleString()}</Td>
              </tr>
            </tfoot>
          </table>
          <p className="px-3 pb-3 pt-2 text-xs text-slate-500">Cells show net available per branch × product; dot colour is product-level health at that branch. Click a row to open its branch profile.</p>
        </Card>
        </>
      )}

      {tab === "league" && (
        <div className="grid gap-4 md:grid-cols-2">
          {PRODUCTS.map((p, i) => {
            const rows = BRANCHES.map(x => ({ branch: x.name, id: x.id, ...PRODUCT_STATS[x.id][i] }))
              .sort((a, z) => (a.cover ?? 999) - (z.cover ?? 999));
            return (
              <Card key={p.code} className="p-4">
                <div className="mb-2 flex items-center justify-between">
                  <h3 className="flex items-center gap-1.5 text-sm font-semibold text-slate-800"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: PRODUCT_COLORS[p.code] }} />{p.name} — branches by days of cover (lowest first)</h3>
                </div>
                <table className="w-full">
                  <thead><tr><Th>Branch</Th><Th className="text-right">Net</Th><Th className="text-right">Avg/day</Th><Th className="text-right">Cover</Th><Th>Status</Th></tr></thead>
                  <tbody className="divide-y divide-slate-100">
                    {rows.slice(0, 6).map(r => {
                      const ph = productHealth(r);
                      return (
                        <tr key={r.id}>
                          <Td className="text-xs">{r.branch}</Td>
                          <Td className="text-right font-mono text-xs">{r.net.toLocaleString()}</Td>
                          <Td className="text-right font-mono text-xs">{r.avgDaily}</Td>
                          <Td className="text-right font-mono text-xs">{r.cover ?? "—"}</Td>
                          <Td><span className="h-2 w-2 rounded-full" style={{ background: ph.color, display: "inline-block" }} /></Td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Collection({ records, setRecords, toast, addException }) {
  const [branch, setBranch] = useState("ALL");
  const [filter, setFilter] = useState("active");
  const [verify, setVerify] = useState(null);

  const branches = ["ALL", ...Array.from(new Set(records.map(r => r.branch)))];
  let rows = branch === "ALL" ? records : records.filter(r => r.branch === branch);
  if (filter === "active") rows = rows.filter(r => r.status.includes("Awaiting") || r.status.includes("Unclaimed"));
  else if (filter === "overdue") rows = rows.filter(r => collectionBucket(r).key === "overdue");
  else if (filter === "done") rows = rows.filter(r => r.status.startsWith("Collected") || r.status.startsWith("Destroyed"));

  const active = records.filter(r => r.status.includes("Awaiting") || r.status.includes("Unclaimed"));
  const overdue = active.filter(r => collectionBucket(r).key === "overdue");
  const reminderDue = active.filter(r => collectionBucket(r).key === "late");
  const collectedToday = records.filter(r => r.status === "Collected today");

  const handover = c => {
    setRecords(prev => prev.map(x => x.id === c.id ? { ...x, status: "Collected today" } : x));
    toast(`Card ${c.id} handed to ${c.customer} — KYC verified, custody chain closed`);
    setVerify(null);
  };
  const destroy = c => {
    setRecords(prev => prev.map(x => x.id === c.id ? { ...x, status: "Destroyed (unclaimed)" } : x));
    addException({ id: "EXC-" + Math.floor(3310 + Math.random() * 80), sev: "Medium", type: "Unclaimed card destroyed", where: `${c.branch} · ${c.id}`, note: `Personalised card for ${c.customer} unclaimed ${c.ageDays}d (> ${COLLECTION_POLICY.retentionDays}d). Card blocked via Issuance API; destruction certificate raised.`, sla: "Certificate within 24h", status: "Open" });
    toast(`Card ${c.id} blocked and sent for secure destruction — certificate pending`);
  };

  return (
    <div className="space-y-6">
      <SectionTitle icon={CreditCard} title="Personalised card collection" sub="Named debit cards held at branch for customer pickup. Tracked by identity, not quantity — one card, one customer, KYC-verified handover."
        right={<Badge tone="indigo">{COLLECTION_POLICY.retentionDays}-day retention policy</Badge>} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Awaiting collection" value={active.length} sub="across all branches" tone="indigo" />
        <Kpi label="Reminder due (45d+)" value={reminderDue.length} sub="SMS / call to customer" tone="amber" />
        <Kpi label="Unclaimed · overdue" value={overdue.length} sub={`> ${COLLECTION_POLICY.retentionDays} days — destroy`} tone="rose" />
        <Kpi label="Collected today" value={collectedToday.length} sub="handed over, chain closed" tone="green" />
      </div>

      <Card className="p-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-500">Branch</span>
          <select value={branch} onChange={e => setBranch(e.target.value)} className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm">
            {branches.map(b => <option key={b} value={b}>{b === "ALL" ? "All branches" : b}</option>)}
          </select>
          <span className="ml-2 text-sm text-slate-500">Show</span>
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 p-1">
            {[["active", "Active"], ["overdue", "Overdue"], ["done", "Closed"]].map(([id, label]) => (
              <button key={id} onClick={() => setFilter(id)} className={`rounded-md px-3 py-1 text-sm font-medium transition ${filter === id ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{label}</button>
            ))}
          </div>
          <span className="ml-auto text-xs text-slate-500">Aging clock starts at branch receipt · reminders at {COLLECTION_POLICY.remindAt.join("/")} days</span>
        </div>
      </Card>

      {(() => {
        const pipe = branch === "ALL" ? PERSONALISED_PIPELINE : PERSONALISED_PIPELINE.filter(p => p.branch === branch);
        const sum = k => pipe.reduce((a, p) => a + p[k], 0);
        return (
          <Card className="overflow-x-auto">
            <div className="flex items-center justify-between border-b border-slate-200 px-3 py-2">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Route className="h-4 w-4 text-indigo-600" />Personalised order pipeline {branch === "ALL" ? "· all branches" : `· ${branch}`}</h3>
              <span className="text-xs text-slate-500">order → production → in transit → received → awaiting → collected</span>
            </div>
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50">
                <tr><Th>PO / line</Th><Th>Branch</Th><Th>Batch</Th><Th className="text-right">Ordered</Th><Th className="text-right">In prod.</Th><Th className="text-right">In transit</Th><Th className="text-right">Received</Th><Th className="text-right">Awaiting</Th><Th className="text-right">Collected</Th><Th>Stage</Th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {pipe.map(p => {
                  const stage = p.inProd > 0 ? { t: "In production", c: "indigo" } : p.inTransit > 0 ? { t: "In transit", c: "sky" } : p.awaiting > 0 ? { t: "At branch", c: "amber" } : { t: "Fulfilled", c: "green" };
                  return (
                    <tr key={p.po} className="hover:bg-slate-50">
                      <Td className="font-mono text-xs text-indigo-700">{p.po}</Td>
                      <Td className="text-xs">{p.branch}</Td>
                      <Td className="font-mono text-xs">{p.batch}</Td>
                      <Td className="text-right font-mono">{p.ordered}</Td>
                      <Td className="text-right font-mono">{p.inProd || "—"}</Td>
                      <Td className="text-right font-mono">{p.inTransit || "—"}</Td>
                      <Td className="text-right font-mono">{p.received || "—"}</Td>
                      <Td className="text-right font-mono font-semibold">{p.awaiting || "—"}</Td>
                      <Td className="text-right font-mono">{p.collected || "—"}</Td>
                      <Td><Badge tone={stage.c}>{stage.t}</Badge></Td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot className="border-t-2 border-slate-300 bg-slate-50">
                <tr>
                  <Td className="font-semibold text-slate-900" >Total</Td><Td></Td><Td></Td>
                  <Td className="text-right font-mono font-semibold">{sum("ordered")}</Td>
                  <Td className="text-right font-mono font-semibold">{sum("inProd")}</Td>
                  <Td className="text-right font-mono font-semibold">{sum("inTransit")}</Td>
                  <Td className="text-right font-mono font-semibold">{sum("received")}</Td>
                  <Td className="text-right font-mono font-semibold">{sum("awaiting")}</Td>
                  <Td className="text-right font-mono font-semibold">{sum("collected")}</Td>
                  <Td></Td>
                </tr>
              </tfoot>
            </table>
            <p className="px-3 pb-3 pt-2 text-xs text-slate-500">Each personalised PO line is one batch made-to-order. This is the branch&rsquo;s view of where its customers&rsquo; cards are — from embossing to the collection counter. Received cards drop into the named register below.</p>
          </Card>
        );
      })()}

      <Card className="overflow-x-auto">
        <div className="border-b border-slate-200 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Named collection register {branch !== "ALL" ? `· ${branch}` : ""}</div>
        <table className="w-full">
          <thead className="border-b border-slate-200 bg-slate-50">
            <tr><Th>Card ID</Th><Th>Customer</Th><Th>Application</Th><Th>Masked PAN</Th><Th>Branch</Th><Th>Received</Th><Th className="text-right">Age</Th><Th>Status</Th><Th>Action</Th></tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {rows.map(c => {
              const bk = collectionBucket(c);
              const closed = c.status.startsWith("Collected") || c.status.startsWith("Destroyed");
              return (
                <tr key={c.id} className="align-top hover:bg-slate-50">
                  <Td className="font-mono text-indigo-700">{c.id}</Td>
                  <Td className="font-medium text-slate-900">{c.customer}</Td>
                  <Td className="font-mono text-xs">{c.app}</Td>
                  <Td className="font-mono text-xs">{c.pan}</Td>
                  <Td className="text-xs">{c.branch}</Td>
                  <Td className="text-xs">{c.received}</Td>
                  <Td className="text-right font-mono">{c.ageDays}d</Td>
                  <Td><span className="inline-flex items-center gap-1.5 text-xs font-medium" style={{ color: bk.color }}><span className="h-2 w-2 rounded-full" style={{ background: bk.color }} />{c.status}</span></Td>
                  <Td>
                    {closed ? <span className="text-xs text-slate-400">—</span>
                      : bk.key === "overdue"
                        ? <button onClick={() => destroy(c)} className="inline-flex items-center gap-1 rounded-lg border border-rose-300 px-2.5 py-1 text-xs font-medium text-rose-600 transition hover:bg-rose-50"><Trash2 className="h-3.5 w-3.5" />Destroy</button>
                        : <button onClick={() => setVerify(c)} className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white shadow-sm transition hover:bg-emerald-700"><FileSignature className="h-3.5 w-3.5" />Hand over</button>}
                  </Td>
                </tr>
              );
            })}
            {rows.length === 0 && <tr><Td className="text-slate-400" >No cards match this filter.</Td></tr>}
          </tbody>
        </table>
      </Card>

      <p className="text-xs text-slate-500">Personalised cards use the same ordering, embossing-batch, dispatch and GRN flow as pregen — but replenishment and forecasting are off (you never reorder a customer&rsquo;s card). Instead each card runs this collection lifecycle: received &rarr; awaiting collection &rarr; collected (KYC handover) or unclaimed &rarr; blocked &amp; destroyed.</p>

      {verify && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={() => setVerify(null)}>
          <div className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2"><Hourglass className="h-5 w-5 text-indigo-600" /><h3 className="text-base font-semibold text-slate-900">Verify &amp; hand over</h3></div>
            <p className="mt-1 text-sm text-slate-500">Release card to the named customer only after identity/KYC verification.</p>
            <dl className="mt-3 space-y-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
              <div className="flex justify-between"><dt className="text-slate-500">Card</dt><dd className="font-mono">{verify.id}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Customer</dt><dd className="font-medium">{verify.customer}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Application</dt><dd className="font-mono text-xs">{verify.app}</dd></div>
              <div className="flex justify-between"><dt className="text-slate-500">Masked PAN</dt><dd className="font-mono text-xs">{verify.pan}</dd></div>
            </dl>
            <div className="mt-3 space-y-2 text-sm">
              <label className="flex items-center gap-2 text-slate-700"><input type="checkbox" defaultChecked className="accent-indigo-600" />Photo ID verified against application</label>
              <label className="flex items-center gap-2 text-slate-700"><input type="checkbox" defaultChecked className="accent-indigo-600" />Customer acknowledgement captured</label>
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setVerify(null)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-50">Cancel</button>
              <button onClick={() => handover(verify)} className="rounded-lg bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-emerald-700">Confirm handover</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function InTransit({ shipments, toast }) {
  const [sel, setSel] = useState(shipments[0]?.id);
  const [legFilter, setLegFilter] = useState("ALL");

  const legs = ["ALL", ...Array.from(new Set(shipments.map(s => s.leg)))];
  const rows = legFilter === "ALL" ? shipments : shipments.filter(s => s.leg === legFilter);
  const ship = shipments.find(s => s.id === sel) || rows[0];

  const overdue = shipments.filter(s => s.overdue);
  const totalCards = shipments.reduce((a, s) => a + s.qty, 0);
  const legTone = l => l.startsWith("Vendor") ? "indigo" : l.startsWith("Vault") ? "sky" : "amber";

  return (
    <div className="space-y-6">
      <SectionTitle icon={Truck} title="In-transit tracking" sub="Every consignment in flight — vendor → vault, vault → branch, branch → branch — with courier, AWB, route and live scan events."
        right={overdue.length > 0 ? <Badge tone="rose">{overdue.length} overdue</Badge> : <Badge tone="green">all on schedule</Badge>} />

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Kpi label="Shipments in transit" value={shipments.length} sub="across all legs" tone="indigo" />
        <Kpi label="Cards in flight" value={totalCards.toLocaleString()} sub="not yet received" />
        <Kpi label="Overdue" value={overdue.length} sub={overdue.length ? overdue.map(s => s.to).join(", ") : "none"} tone={overdue.length ? "rose" : "green"} />
        <Kpi label="Arriving today" value={shipments.filter(s => s.eta.includes("12 Jun")).length} sub="GRN pending at destination" tone="amber" />
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-slate-500">Leg</span>
          <div className="flex items-center gap-1 rounded-lg border border-slate-200 p-1">
            {legs.map(l => (
              <button key={l} onClick={() => setLegFilter(l)} className={`rounded-md px-3 py-1 text-sm font-medium transition ${legFilter === l ? "bg-indigo-600 text-white" : "text-slate-600 hover:bg-slate-100"}`}>{l === "ALL" ? "All legs" : l}</button>
            ))}
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-5">
        <Card className="overflow-x-auto lg:col-span-3">
          <table className="w-full">
            <thead className="border-b border-slate-200 bg-slate-50">
              <tr><Th>Shipment</Th><Th>Route</Th><Th className="text-right">Cards</Th><Th>AWB / courier</Th><Th>ETA</Th><Th>Status</Th></tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map(s => (
                <tr key={s.id} onClick={() => setSel(s.id)} className={`cursor-pointer transition hover:bg-indigo-50 ${ship?.id === s.id ? "bg-indigo-50" : ""}`}>
                  <Td>
                    <div className="font-mono text-xs font-semibold text-indigo-700">{s.id}</div>
                    <div className="mt-0.5"><Badge tone={legTone(s.leg)}>{s.leg}</Badge></div>
                  </Td>
                  <Td className="text-xs"><div className="flex items-center gap-1">{s.from}<ChevronRight className="h-3 w-3 text-slate-300" />{s.to}</div></Td>
                  <Td className="text-right font-mono">{s.qty.toLocaleString()}</Td>
                  <Td><div className="font-mono text-xs">{s.awb}</div><div className="text-xs text-slate-500">{s.courier}</div></Td>
                  <Td className="text-xs">{s.eta}</Td>
                  <Td>{s.overdue ? <Badge tone="rose">Overdue</Badge> : <Badge tone="sky">In transit</Badge>}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>

        {ship && (
          <Card className="p-4 lg:col-span-2">
            <div className="flex items-center justify-between">
              <h3 className="font-mono text-sm font-semibold text-indigo-700">{ship.id}</h3>
              {ship.overdue ? <Badge tone="rose">Overdue {ship.eta}</Badge> : <Badge tone="sky">ETA {ship.eta}</Badge>}
            </div>
            <dl className="mt-3 space-y-1.5 text-sm">
              {[["Against", ship.ref], ["Route", `${ship.from} → ${ship.to}`], ["Product", ship.product + (ship.personalised ? " (personalised)" : "")], ["Cards", ship.qty.toLocaleString()], ["Courier", ship.courier], ["AWB / manifest", ship.awb], ["Seal", ship.seal], ["Destination GRN", ship.grn]].map(([k, v]) => (
                <div key={k} className="flex justify-between gap-3 border-b border-slate-100 pb-1.5"><dt className="text-slate-500">{k}</dt><dd className="text-right font-medium text-slate-800">{v}</dd></div>
              ))}
            </dl>

            <div className="mt-4">
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Tracking timeline</div>
              <ol>
                {ship.events.map((e, i) => {
                  const last = i === ship.events.length - 1;
                  return (
                    <li key={i} className="relative flex gap-3 pb-4 last:pb-0">
                      {!last && <span className="absolute top-6 h-full w-0.5" style={{ left: 11, background: e.alert ? "#FECACA" : "#E2E8F0" }} />}
                      <span className={`z-10 mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${e.alert ? "bg-rose-100 text-rose-600" : e.done ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-400"}`}>
                        {e.alert ? <AlertTriangle className="h-3.5 w-3.5" /> : e.done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <Clock className="h-3.5 w-3.5" />}
                      </span>
                      <div>
                        <div className={`text-sm font-medium ${e.alert ? "text-rose-700" : "text-slate-800"}`}>{e.status}</div>
                        <div className="text-xs text-slate-500">{e.t} · {e.place}</div>
                      </div>
                    </li>
                  );
                })}
              </ol>
            </div>

            <div className="mt-2 flex flex-wrap gap-2">
              <button onClick={() => toast(`Courier trace requested from ${ship.courier} for ${ship.awb}`)} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-medium text-slate-600 transition hover:bg-slate-50">Request courier trace</button>
              {ship.overdue && <button onClick={() => toast(`${ship.id} escalated to Region Head — in-transit SLA breached`)} className="rounded-lg border border-rose-300 px-3 py-1.5 text-xs font-medium text-rose-600 transition hover:bg-rose-50">Escalate</button>}
            </div>
          </Card>
        )}
      </div>
      <p className="text-xs text-slate-500">In-transit aging alerts fire automatically when a shipment passes its expected transit time — SHP-2026-0899 (Vault → Hyderabad) is overdue 2 days and has already raised exception EXC-3304. Receiving a shipment happens on the GRN screen, which closes the leg.</p>
    </div>
  );
}

/* ------------------------------ SHELL ------------------------------- */

const NAV = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "inventory", label: "Inventory", icon: Boxes },
  { id: "branchstats", label: "Branch & product stats", icon: BarChart3 },
  { id: "orders", label: "Orders & vendors", icon: ShoppingCart },
  { id: "grn", label: "Receive (GRN)", icon: PackageCheck },
  { id: "receiptack", label: "Receipt & Ack", icon: Inbox },
  { id: "transfers", label: "Transfers", icon: ArrowLeftRight },
  { id: "bto", label: "Branch Transfer Order", icon: Send },
  { id: "intransit", label: "In-transit tracking", icon: Truck },
  { id: "custodian", label: "Custodian day book", icon: Vault },
  { id: "collection", label: "Card collection", icon: CreditCard },
  { id: "replenish", label: "Replenishment", icon: RefreshCw },
  { id: "exceptions", label: "Exceptions", icon: AlertTriangle },
  { id: "discrepancies", label: "Discrepancies", icon: FileWarning },
  { id: "trace", label: "Serial trace", icon: Route },
  { id: "settings", label: "Settings", icon: Settings2 },
];

export default function CardInventoryDemo() {
  const [view, setView] = useState("dashboard");
  const [branchSel, setBranchSel] = useState("PUN01");
  const [model, setModel] = useState("centralised");
  const [grns, setGrns] = useState(INITIAL_GRNS);
  const [transfers, setTransfers] = useState(INITIAL_TRANSFERS);
  const [shipments] = useState(INITIAL_SHIPMENTS);
  const [proposals, setProposals] = useState(INITIAL_PROPOSALS);
  const [exceptions, setExceptions] = useState(INITIAL_EXCEPTIONS);
  const [ops, setOps] = useState(INITIAL_OPERATORS);
  const [pool, setPool] = useState(CUSTODIAN_INIT);
  const [collection, setCollection] = useState(INITIAL_COLLECTION);
  const [expectedReceipts, setExpectedReceipts] = useState(INITIAL_EXPECTED_RECEIPTS);
  const [discrepancies, setDiscrepancies] = useState(INITIAL_DISCREPANCIES);
  const [transferOrders, setTransferOrders] = useState(INITIAL_TRANSFER_ORDERS);
  const [branchLots, setBranchLots] = useState(BRANCH_LOTS);
  const [dayClosed, setDayClosed] = useState(false);
  const [toastMsg, setToastMsg] = useState(null);

  const toast = msg => { setToastMsg(msg); window.clearTimeout(toast._t); toast._t = window.setTimeout(() => setToastMsg(null), 4200); };
  const addException = e => setExceptions(p => [e, ...p]);
  const addDiscrepancy = d => setDiscrepancies(p => [d, ...p]);

  const grnPending = grns.filter(g => g.status === "Awaiting receipt").length;
  const propPending = proposals.filter(p => p.status === "Pending").length;
  const collectOverdue = collection.filter(c => (c.status.includes("Awaiting") || c.status.includes("Unclaimed")) && collectionBucket(c).key === "overdue").length;
  const shipOverdue = shipments.filter(s => s.overdue).length;
  const receiptOpen = expectedReceipts.filter(er => er.status !== "IN_BRANCH_VAULT").length;
  const discActive = discrepancies.filter(d => d.status !== "Closed" && d.status !== "Resolved").length;
  const btoOpen = transferOrders.filter(t => ["NEW", "APPROVED", "ALLOCATED", "PARTIALLY_FULFILLED"].includes(t.status)).length;

  return (
    <div className="flex min-h-screen bg-slate-100 text-slate-900" style={{ fontFamily: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', sans-serif" }}>
      {/* Sidebar */}
      <aside className="hidden w-60 shrink-0 flex-col bg-slate-900 md:flex">
        <div className="flex items-center gap-2.5 px-5 py-5">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-indigo-600"><Landmark className="h-5 w-5 text-white" /></span>
          <div>
            <div className="text-sm font-semibold text-white">Card Inventory</div>
            <div className="text-slate-400" style={{ fontSize: 11 }}>Issuance Service · CIM module</div>
          </div>
        </div>
        <nav className="mt-2 flex-1 space-y-0.5 px-3">
          {NAV.map(n => (
            <button key={n.id} onClick={() => setView(n.id)}
              className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition ${view === n.id ? "bg-indigo-600 font-medium text-white" : "text-slate-300 hover:bg-slate-800 hover:text-white"}`}>
              <n.icon className="h-4 w-4" />
              <span className="flex-1 text-left">{n.label}</span>
              {n.id === "grn" && grnPending > 0 && <span className="rounded-full bg-amber-400 px-1.5 text-xs font-semibold text-slate-900">{grnPending}</span>}
              {n.id === "replenish" && propPending > 0 && <span className="rounded-full bg-amber-400 px-1.5 text-xs font-semibold text-slate-900">{propPending}</span>}
              {n.id === "collection" && collectOverdue > 0 && <span className="rounded-full bg-rose-500 px-1.5 text-xs font-semibold text-white">{collectOverdue}</span>}
              {n.id === "intransit" && shipOverdue > 0 && <span className="rounded-full bg-rose-500 px-1.5 text-xs font-semibold text-white">{shipOverdue}</span>}
              {n.id === "exceptions" && <span className="rounded-full bg-rose-500 px-1.5 text-xs font-semibold text-white">{exceptions.filter(e => e.sev === "High").length}</span>}
              {n.id === "receiptack" && receiptOpen > 0 && <span className="rounded-full bg-amber-400 px-1.5 text-xs font-semibold text-slate-900">{receiptOpen}</span>}
              {n.id === "discrepancies" && discActive > 0 && <span className="rounded-full bg-rose-500 px-1.5 text-xs font-semibold text-white">{discActive}</span>}
              {n.id === "bto" && btoOpen > 0 && <span className="rounded-full bg-amber-400 px-1.5 text-xs font-semibold text-slate-900">{btoOpen}</span>}
            </button>
          ))}
        </nav>
        <div className="border-t border-slate-800 px-5 py-4 leading-relaxed text-slate-500" style={{ fontSize: 11 }}>
          Signed in as <span className="text-slate-300">S. Mehta</span> · Central Inventory Approver<br />
          Institution: <span className="text-slate-300">Demo Bank Ltd</span> · {model === "centralised" ? "Centralised" : "Decentralised"} model
        </div>
      </aside>

      {/* Main */}
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between border-b border-slate-200 bg-white px-5 py-3">
          <div className="flex items-center gap-2 md:hidden">
            <select value={view} onChange={e => setView(e.target.value)} className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm">
              {NAV.map(n => <option key={n.id} value={n.id}>{n.label}</option>)}
            </select>
          </div>
          <div className="hidden items-center gap-2 text-sm text-slate-500 md:flex">
            <Clock className="h-4 w-4" /> Friday, 12 June 2026 · 11:47 IST
            <span className="mx-2 h-4 w-px bg-slate-200" />
            <span className="flex items-center gap-1.5"><span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" />Live · read model lag 4s</span>
          </div>
          <div className="flex items-center gap-2">
            <Badge tone="indigo">{model === "centralised" ? "Centralised ordering" : "Decentralised ordering"}</Badge>
            <Badge tone="slate">UAT · demo data</Badge>
          </div>
        </header>

        <main className="flex-1 overflow-auto p-5 lg:p-7">
          {view === "dashboard" && <Dashboard setView={setView} goBranch={id => { setBranchSel(id); setView("branchstats"); }} />}
          {view === "inventory" && <Inventory sel={branchSel} setSel={setBranchSel} goProfile={id => { setBranchSel(id); setView("branchstats"); }} />}
          {view === "branchstats" && <BranchStats sel={branchSel} setSel={setBranchSel} exceptions={exceptions} transfers={transfers} collection={collection} setView={setView} />}
          {view === "orders" && <Orders />}
          {view === "grn" && <Receiving grns={grns} setGrns={setGrns} addException={addException} toast={toast} setCollection={setCollection} />}
          {view === "receiptack" && <ReceiptAck expectedReceipts={expectedReceipts} setExpectedReceipts={setExpectedReceipts} addDiscrepancy={addDiscrepancy} addException={addException} toast={toast} setCollection={setCollection} branches={BRANCHES} products={PRODUCTS} productColors={PRODUCT_COLORS} />}
          {view === "transfers" && <Transfers transfers={transfers} setTransfers={setTransfers} toast={toast} />}
          {view === "bto" && <BranchTransferOrder transferOrders={transferOrders} setTransferOrders={setTransferOrders} branchLots={branchLots} setBranchLots={setBranchLots} setExpectedReceipts={setExpectedReceipts} toast={toast} goReceive={() => setView("receiptack")} branches={BRANCHES} products={PRODUCTS} />}
          {view === "intransit" && <InTransit shipments={shipments} toast={toast} />}
          {view === "custodian" && <Custodian ops={ops} setOps={setOps} pool={pool} setPool={setPool} dayClosed={dayClosed} setDayClosed={setDayClosed} toast={toast} addException={addException} />}
          {view === "collection" && <Collection records={collection} setRecords={setCollection} toast={toast} addException={addException} />}
          {view === "replenish" && <Replenishment proposals={proposals} setProposals={setProposals} model={model} toast={toast} />}
          {view === "exceptions" && <Exceptions exceptions={exceptions} />}
          {view === "discrepancies" && <Discrepancies discrepancies={discrepancies} setDiscrepancies={setDiscrepancies} toast={toast} branches={BRANCHES} />}
          {view === "trace" && <Trace />}
          {view === "settings" && <SettingsView model={model} setModel={setModel} toast={toast} />}
        </main>
      </div>

      {/* Toast */}
      {toastMsg && (
        <div className="fixed bottom-5 left-1/2 z-50 flex max-w-md -translate-x-1/2 items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-sm text-white shadow-lg">
          <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />{toastMsg}
        </div>
      )}
    </div>
  );
}
