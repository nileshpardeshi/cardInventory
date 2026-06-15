# Card Inventory Management (CIM) Module
## Enterprise Business & Functional Requirements — End-to-End Implementation Specification

| | |
|---|---|
| **Document** | Card Inventory Management (CIM) — Consolidated Requirements |
| **Version** | 2.0 (consolidated) |
| **Date** | June 2026 |
| **Classification** | Confidential — Internal |
| **Module placement** | Bounded context within the **Issuance Service** of the CMS |
| **Card programs covered** | Debit, Prepaid, Pre-generated (pregen/insta) and Personalised |
| **Audience** | Product, Engineering, Branch Operations, Risk & Compliance, Internal Audit, Vendor Management |

---

## Table of Contents

1. Executive Summary
2. Background & Problem Statement
3. Scope
4. Operating Models (Centralised / Decentralised / Hybrid)
5. The Identifier Hierarchy — the Golden Thread
6. Card Stock Lifecycle & State Model
7. Stock Classes & Key Inventory Concepts (Safety, ROP, Max…)
8. Functional Requirements by Capability
9. Pregen vs Personalised — Two Tracking Axes
10. PIN Mailer Handling
11. End-to-End Process Flows (with realistic examples)
12. Branch Day-to-Day Operating Cycle
13. Governance, Risk & Compliance
14. Architecture & Integration (CMS-agnostic)
15. Data Model & API Catalog
16. Reporting, Dashboards & Statistics
17. UX Reference (screen-by-screen)
18. Implementation Roadmap
19. Acceptance Criteria & KPIs
20. Glossary

---

## 1. Executive Summary

The bank's Card Management System (CMS) already manages the full lifecycle of debit, prepaid and pregen cards under its **Issuance Service**. The single material gap against industry-standard CMS platforms is **Card Inventory Management** — managing the *physical* card stock from procurement with the embossing/personalisation vendor, through receipt, vaulting, branch distribution, custodian and operator handling, customer issuance/collection, and finally destruction of damaged, expired or unclaimed stock.

This document specifies an enterprise-grade **Card Inventory Management (CIM) module**, built as a bounded context inside the Issuance Service. It is **CMS-agnostic**: it owns its own inventory data, exposes and consumes well-defined REST/event APIs, and retrieves any card master data it needs (BIN/product, card number, embossing batch, card status) from the Issuance Service via API. It therefore works with the bank's current CMS, with any third-party CMS, or standalone.

The module delivers thirteen capability pillars: real-time multi-branch stock visibility; serial-level traceability from order to issuance; governance, audit and regulatory reporting; operational dashboards (stock levels, aging, usage patterns); exception management; receipt and acknowledgement (GRN) with discrepancy capture; inter-branch transfers; custodian and operator day-to-day stock management with enforced day-open/day-close balancing; automated threshold-based replenishment; excess-stock and wastage minimisation; usage-trend forecasting; vendor order and dispatch tracking; and configurable support for both centralised and decentralised ordering models at institution level. It additionally covers **personalised card collection** and **PIN mailer** handling as first-class flows.

The design embeds the control expectations of **PCI DSS v4.0**, the **PCI Card Production and Provisioning — Physical and Logical Security Requirements**, applicable central-bank guidance (e.g., RBI Master Directions on card issuance and outsourcing), and standard banking controls: maker-checker, dual custody, segregation of duties, immutable audit trails, FIFO/FEFO rotation, and periodic physical-to-system reconciliation.

---

## 2. Background & Problem Statement

### Current state
The CMS is microservice-based. The Issuance Service owns card master data, card lifecycle (issue, activate, block, replace, renew), BIN/product configuration, and embossing-file generation. No system tracks physical stock: orders to vendors, goods receipt, vault balances, branch balances, custodian/teller balances, transfers, damages and destruction are handled on spreadsheets and manual registers.

### Problems this causes

| Problem | Business impact |
|---|---|
| No real-time stock visibility | Stock-outs at some branches (lost activations, customer turned away) and overstock at others (locked capital, wastage) |
| No serial-level traceability | Cannot answer "where is this kit?"; fraud and mis-issuance risk; audit observations |
| Manual custodian registers | No enforced day-open/day-close balancing; discrepancies found late or never |
| Manual reordering | Reactive, emergency orders at premium cost; long stock-out windows |
| Aging/expiry not monitored | Plastic expires in vaults; write-offs; regulator/auditor findings |
| No vendor order/dispatch tracking | No SLA measurement; disputes on shipped vs received quantities |
| Personalised cards untracked at branch | Unclaimed named cards lying in drawers — a security and regulatory exposure |

---

## 3. Scope

### In scope
Inventory of pregen/insta kits, personalised cards in transit/at branch, blank plastic at vendor or central vault, and PIN mailers / welcome-kit collateral. Order management with vendors; dispatch and in-transit tracking; receipt and acknowledgement; vault and branch stock; custodian and operator stock; customer issuance and personalised-card collection linkage; returns; damage/loss/expiry; destruction; transfers; reconciliation; replenishment automation; forecasting; dashboards, reports, alerts and audit. Institution-level configurability for centralised and decentralised models; multi-entity support.

### Out of scope (Phase 1)
Logical card lifecycle management (stays in Issuance), PIN generation/HSM operations, courier route optimisation, vendor invoice/payables (an accounting **event feed** is in scope; financial postings stay in Finance), and barcode-scanner **hardware** procurement (the module supports scan input; hardware rollout is a separate project).

---

## 4. Operating Models (Centralised / Decentralised / Hybrid)

Selectable per institution, changeable with effective-dating. Model selection drives who can raise orders, where vendor dispatches land, and how replenishment behaves.

| Model | Description | Behaviour in CIM |
|---|---|---|
| **Centralised** | A central Cards Operations team orders all stock; vendor delivers to central vault(s); centre allocates and dispatches to branches. | Only central roles raise vendor POs. Branches raise internal **Stock Requisitions** to the centre. Auto-replenishment generates branch→centre requisitions and consolidated centre→vendor POs. |
| **Decentralised** | Each branch orders directly from approved vendors; vendor delivers to the branch. | Branch roles raise vendor POs within delegated limits, against centrally approved vendors/rate contracts. Auto-replenishment generates branch-level vendor POs into the branch approval queue. |
| **Hybrid** | Some products/regions centralised, others decentralised. | Operating model resolved by precedence: **institution → product → region/branch override**. |

**Institution-level configuration parameters:** operating model; vendor master and product–vendor mapping; delegation-of-authority (DOA) matrix (who may order/approve/transfer/destroy, and to what value/quantity); replenishment policy (reorder point, min–max, EOQ, review period); lead times per vendor/branch; safety-stock policy; document numbering series; discrepancy reason codes; destruction policy and retention; alert thresholds and recipients; per-product verification depth (full-scan / endpoint+count / sample).

---

## 5. The Identifier Hierarchy — the Golden Thread

Card production is tracked by a **hierarchy of linked identifiers**. Every level rolls up to the one above, so a single kit or card is traceable end to end. This is the backbone of the whole module.

| Level | Identifier (example) | Owns / carries |
|---|---|---|
| **Purchase Order** | `PO-2026-0160` | The commercial order: total quantity, destination, multiple lines |
| **Order line** | `PO-2026-0160 / L1` | One product within the order (e.g., 500 Platinum) |
| **Embossing / personalisation file** | `EMF-2026-0461` | The data file sent to the vendor for one product line |
| **Batch ID** | `BATCH-PLT-0461` | The accountability unit — one batch per file; the key that survives the whole journey |
| **Vendor job / lot** | `JOB-SP-9912` | The vendor's production run, mapped 1:1 to the Batch ID |
| **Serial / kit range** | `KIT-78112001 – 78112500` | Per-unit identifiers within a batch (kit numbers for pregen; PANs for personalised) |
| **Carton / box** | `CTN-0001` + seal `SEAL-44821` | Physical packing unit; one carton may hold several batches |
| **Dispatch advice (ASN)** | `DA-2026-0904` + AWB | The electronic manifest declaring carton → batches → ranges → quantities |

### Why this matters — worked example

> **Order:** `PO-2026-0160` for Pune — **500 Platinum + 200 Gold = 700 cards, one order, two lines.**
>
> 1. Issuance generates **two embossing files**, one per product line, each with its own Batch ID and reserved serial/PAN range. The Batch ID is **embedded in the file header** — so the vendor knows exactly which cards belong to which ID; it never guesses.
> 2. The vendor creates **two production jobs**, mapping each to the Batch ID, and prints the two batches.
> 3. The vendor packs all 700 into **one carton** (`CTN-0001`), banded into the two groups, and sends an **ASN** declaring: carton → BATCH-PLT-0461 (500, range…) + BATCH-GLD-0462 (200, range…), with seal number and AWB.
> 4. At receipt the branch performs a **three-way match** (PO vs ASN vs physical) and acknowledges **per batch** — 500 Platinum clean, 200 Gold clean — only then does stock enter the branch balance.

**The Batch ID is the golden thread:** created by Issuance, embedded in the embossing file, adopted by the vendor's job, declared on the dispatch manifest, and reconciled at GRN. The carton/box ID handles physical logistics; the Batch ID handles accountability.

### Reserved range — what it is and who owns it

| Identifier | What it is | Embedded in embossing file? |
|---|---|---|
| **PAN** (card number) | The financial account number embossed on the card | **Yes** — for personalised cards it *is* the data being printed |
| **Kit / serial number** | A physical inventory tag (often a barcode on the carrier) | **Usually no** — for pregen, the kit-number range travels on the **manifest** and is reconciled at receipt |

"Reserving a range" means the issuer **earmarks a block of identifiers** (PANs for personalised, kit numbers for pregen) so no other process consumes them while stock is out at the vendor. It is the link between the *logical* card record in Issuance and the *physical* kit in CIM, established before the plastic even exists.

---

## 6. Card Stock Lifecycle & State Model

Every stock unit (an individual kit/serial, or a contiguous serial range) moves through a controlled state machine. **Transitions occur only via documents**, and each records who, when, where, from-state, to-state, document reference and reason code.

| State | Meaning | Entered via |
|---|---|---|
| `ORDERED` | Quantity ordered on vendor; serial range reserved | Purchase Order approval |
| `IN_PRODUCTION` | Vendor confirmed and producing/personalising | Vendor order acknowledgement |
| `DISPATCHED` | Vendor shipped; serial ranges, AWB captured | Vendor Dispatch Advice (ASN) |
| `IN_TRANSIT` | Between any two locations | Dispatch / Transfer-out confirmation |
| `RECEIVED_PENDING_ACK` | Physically arrived, GRN not finalised | Goods receipt initiation |
| `IN_VAULT` | Accepted into central vault stock (dual custody) | GRN approval at vault |
| `AT_BRANCH` | Accepted into branch joint-custody stock | GRN approval at branch |
| `WITH_CUSTODIAN` | Allocated to branch custodian working stock | Custodian Allocation |
| `WITH_OPERATOR` | Issued intra-day to teller/operator | Operator Issue Slip |
| `ISSUED_TO_CUSTOMER` | Handed to customer; linked to Issuance card record | Customer issuance event |
| `AWAITING_COLLECTION` | (Personalised) at branch, held for named customer pickup | Branch GRN of personalised card |
| `COLLECTED` | (Personalised) customer collected after KYC verification | Handover event |
| `RETURNED` | Returned by operator/custodian/branch | Return document |
| `DAMAGED / LOST / STOLEN` | Marked unusable or missing; triggers incident | Discrepancy / Incident |
| `EXPIRED` | Past plastic/campaign validity | System aging job |
| `PENDING_DESTRUCTION` | Approved for destruction, awaiting physical destruction | Destruction Request (maker-checker) |
| `DESTROYED` | Physically destroyed with certificate | Destruction Certificate (dual sign-off) |

**Range handling:** movements may reference full or partial serial ranges; the system automatically **splits ranges** on partial movement and preserves parent–child lineage, so any serial's full custody chain is reconstructable.

**Ledger invariant (enforced per location, product, stock class):**
`Opening + Receipts − Issues − Transfers-Out + Transfers-In − Adjustments = Closing`

---

## 7. Stock Classes & Key Inventory Concepts

### Stock classes
Blank plastic (at vendor/vault), pregen/insta kits, personalised cards (named), PIN mailers, and promotional/welcome collateral. Each is tracked separately because each behaves differently.

### The replenishment policy — Safety, ROP, Max

These three numbers form the operating band, set **per branch × product**.

| Term | One-line meaning | Question it answers | Example (Pune Hinjawadi) |
|---|---|---|---|
| **Safety stock** | Emergency buffer never to fall below | What covers surprises (rush, late delivery)? | 220 |
| **Reorder Point (ROP)** | Trigger line: order *now* so stock arrives before hitting safety | When do we order? | ≈ 350 |
| **Max** | Ceiling; caps order size, prevents overstock | How much, at most? | 750 |

- **ROP formula:** `ROP = (average daily issuance × vendor/vault lead time) + safety stock`.
- **Order quantity** (min–max): order up to Max, i.e., `Max − net available`. Example: net available 95 → order 655.
- **Rule of thumb:** *stay between Safety and Max; act at ROP.*

### Balance columns (the quantities tracked)

| Column | Meaning |
|---|---|
| **On hand** | Physically present and counted now (what an audit must match) |
| **In transit** | Dispatched toward this location but not yet received |
| **Reserved** | On hand but committed to a requisition/transfer; cannot be issued |
| **Blocked** | Present but unusable (damaged / quarantined / under investigation) |
| **Net available** | `On hand + In transit − Reserved − Blocked` — the **decision number** used against ROP |
| **Days of cover** | `Net available ÷ average daily issuance` — "days until empty" |

### Health statuses (computed, priority order)

| Status | Trigger | Action |
|---|---|---|
| **Stock-out** (red) | On hand = 0 | Customers turned away — urgent |
| **Awaiting inbound** (amber) | 0 on hand but in transit | Chase the consignment |
| **Below safety** (amber) | Net available < safety | Order should already be in flight |
| **At reorder point** (orange) | Net available ≤ ROP | Normal order trigger |
| **Overstock** (indigo) | Days of cover > 90 | Transfer out, don't re-order |
| **Healthy** (green) | Inside the band | No action |

### Aging & rotation
Aging buckets (0–30, 31–90, 91–180, 181–365, >365 days) computed from receipt date at the location. **FIFO/FEFO** enforced — issue oldest / earliest-expiry first; overrides logged with reason. Old stock signals over-ordering and approaching plastic expiry.

### Forecasting metrics
Demand history per branch × product × day. Statistical forecasts (moving average, Holt-Winters for seasonality). Accuracy tracked as **MAPE** (Mean Absolute Percentage Error) — lower is more trustworthy; ≤ 20% on high-volume series is the target.

### Vendor metrics
**Lead time** (order-to-delivery; a slow vendor forces higher safety stock), **fill rate** (% of ordered quantity delivered), **defect rate** (faulty kits per delivery), discrepancy rate.

---

## 8. Functional Requirements by Capability

Priority: **M** = must (Phase 1), **S** = should, **C** = could.

### 8.1 Real-time visibility
- **M** Real-time balances per institution → region → branch → vault → custodian → operator, by stock class, product/BIN and design.
- **M** Drill-down to serial range and individual serial; show committed vs available (on-hand, reserved, in-transit, blocked, net).
- **M** Balances via REST API and streaming events; read-model lag ≤ 5s. Exportable to CSV/XLSX/PDF.

### 8.2 Traceability
- **M** Track every kit/serial (or range with lineage) through the full state model.
- **M** "Trace" enquiry by kit number, card sequence or masked PAN returns the complete custody chain (timestamps, locations, documents, users) in < 30s.
- **M** Every movement carries: document number/type, from/to location & custodian, quantity, serial range(s), maker, checker, timestamp, channel, reason code.
- **S** Barcode/QR scan capture at receipt, transfer, allocation, issue and customer issuance; manual entry with double-keying fallback.

### 8.3 Order, vendor dispatch & tracking
- **M** Vendor master with SLAs, approved products, delivery locations, integration mode (API/SFTP/portal/manual).
- **M** PO lifecycle: Draft → Pending Approval (maker-checker) → Approved/Sent → Acknowledged → Partially Dispatched → Dispatched → Closed/Cancelled/Short-closed.
- **M** Capture ASN/dispatch advice (date, AWB, courier, boxes, per-box serial ranges, expected delivery).
- **M** Track ordered vs dispatched vs received vs accepted with automatic short/over-shipment detection.
- **S** Vendor SLA dashboard (lead-time adherence, fill rate, defect/discrepancy rate), data ≥ 24 months.

### 8.4 Receipt & acknowledgement (GRN)
- **M** GRN at vault/branch against PO/ASN/transfer: capture boxes, quantities, serial ranges, seal-intact, condition, receiver, timestamp.
- **M** Two-step acceptance: physical receipt (`RECEIVED_PENDING_ACK`) then verification & acknowledgement by a **different** checker → `IN_VAULT`/`AT_BRANCH`.
- **M** Discrepancy capture with reason codes (short, excess, damaged, tampered seal, serial mismatch, missing PIN mailer, wrong product); discrepant units quarantined and a case opened.
- **M** Acknowledgement (clean/with-exceptions) auto-communicated to sender and recorded against SLA. Partial receipts supported.

### 8.5 Branch transfers
- **M** Transfer Order between any two locations with maker-checker at sender; receiving location performs GRN.
- **M** In-transit aging alerts escalate (branch → region → centre) when expected transit time is exceeded.
- **S** **Lateral transfer suggestions** from overstocked to understocked branches *before* raising vendor orders.

### 8.6 Custodian & operator stock
- **M** Branch joint-custody (e.g., BM + Custodian); custodian handover workflow with full stock verification and dual sign-off.
- **M** **Day-Open:** custodian confirms opening = previous closing (enforced), allocates working stock to operators via **Operator Issue Slips** (serial ranges, operator-acknowledged).
- **M** **Intra-day:** operator-to-customer issuance decrements operator balance in real time; ad-hoc top-ups from custodian supported.
- **M** **Day-Close:** each operator returns unissued stock; system computes `issued − sold − returned = 0`; any variance opens a discrepancy and **blocks day-close**; branch cannot close with open operator balances.
- **M** **Day-In/Day-Out report** per branch/custodian/operator (opening, received, issued, sold, returned, damaged, closing) with serial detail, auto-archived.
- **M** Physical verification (scheduled + surprise), blind-count option, variance via approved adjustment with second-level authorisation.
- **M** **FIFO sequence maintained:** custodian issues contiguous ranges from the front of the pool, so accountability is by serial, not just count.

### 8.7 Automated replenishment
- **M** Policy per branch × product × class (ROP, min, max, safety, review period, order multiple, lead time) with institution/product defaults and branch overrides.
- **M** On ROP breach of **net available**, generate a proposal sized to restore Max (or by EOQ), capped by Max and forecast.
- **M** Route by operating model: centralised → branch requisition (+ consolidated vendor PO); decentralised → branch vendor PO into approval queue.
- **M** Auto-approval thresholds (e.g., ≤ 200 kits auto-approve); duplicate-order protection (open PO/requisition suppresses new proposals).

### 8.8 Excess inventory, aging & wastage
- **M** Aging buckets; FIFO/FEFO enforcement; overstock detection by days-of-cover.
- **M** Near-expiry alerts at configurable horizons (180/90/30 days) with redistribute / campaign / destroy workflow.
- **M** Wastage analytics (destroyed/expired/damaged units and cost by branch, product, vendor, reason).

### 8.9 Forecasting
- **S** Statistical forecasts at branch-product level; accuracy (MAPE) tracked; campaign/new-branch overlays with audit.
- **C** ML model plug-in interface for a later phase without changing replenishment logic.

### 8.10 Exception management
- **M** Rule engine with severity and escalation. Standard exceptions: stock-out, below safety, near-expiry, overstock, in-transit overdue, GRN pending beyond SLA, unacknowledged dispatch, operator/custodian variance, negative-balance attempt, count variance, dormant stock, duplicate serial, PO overdue, unclaimed personalised card.
- **M** Each exception is a trackable case (open → investigating → resolved/closed) with owner, SLA timer, resolution code.
- **M** Lost/stolen stock auto-calls Issuance API to block/hotlist the affected card numbers/kits.

### 8.11 Dashboards & reporting
- **M** Executive dashboard, role-scoped operational dashboards, and a full standard report set (see §16).

### 8.12 Destruction & disposal
- **M** Destruction Request (serials/ranges + reason) with maker-checker; physical destruction recorded with method, two witnesses, and uploaded certificate → `DESTROYED`.
- **M** On approval, Issuance API permanently blocks/closes the corresponding card records. Registers retained per policy (default 10 years), immutable.

---

## 9. Pregen vs Personalised — Two Tracking Axes

Both card types use the **same module, same data model, same custody and audit backbone, same order → dispatch → GRN flow**. The difference is *what* is tracked.

| | **Pregen / insta kit** | **Personalised card** |
|---|---|---|
| Made for | Anonymous — any walk-in customer | One specific **named** customer/account |
| Inventory nature | **Fungible stock** (a number that goes down) | **Named consignment** (a list of names ticked off) |
| Reorder logic | Min–max, forecast, auto-replenish | **None** — never reorder a customer's card |
| At the branch | Pooled in custodian working stock, issued FIFO | Held individually, identified by customer |
| Released to customer | Any walk-in, over the counter | Only that customer, after KYC verification |
| Key identifier | Kit number | Card ID / masked PAN linked to customer |
| Verification at GRN | By serial range + count | **Card-by-card** against the manifest |

**Configuration switches by product type:**
- *Pregen* turns ON replenishment, forecasting, FIFO pooling, custodian working stock.
- *Personalised* turns those OFF and turns ON per-card named tracking, the **awaiting-collection register**, KYC-verified handover, collection aging, and unclaimed-card destruction.

### Personalised collection lifecycle
`Received at branch (GRN, card-by-card)` → `AWAITING_COLLECTION` (named register, aging clock starts) → reminders at 15/30/45 days → `COLLECTED` (KYC verified, custody chain closed) **or** `Unclaimed > retention (e.g., 60 days)` → blocked via Issuance API → `PENDING_DESTRUCTION` → `DESTROYED` (certificate). Uncollected cards can also be **transferred** if a customer moves branches.

> **Example:** A named Platinum card for customer *A. Rao* is embossed under `BATCH-PRS-0506`, dispatched to Pune Camp, received card-by-card at GRN, and logged as `CRD-2026-119004 · Awaiting collection`. Rao visits on day 12; the branch verifies photo ID against the application, hands over the card, captures acknowledgement, and the chain closes. A different card unclaimed for 61 days is auto-flagged, blocked, and sent for witnessed destruction.

---

## 10. PIN Mailer Handling

**Core security rule: the card and its PIN must never travel or be received together** — whoever holds both holds a usable instrument. Therefore:

- **Personalised cards:** the PIN mailer is produced by the vendor and dispatched as a **separate consignment** (different envelope, often a different courier run/timing) and **acknowledged independently**. The branch reconciles "N cards received" and "N PIN mailers received" as two separate counts, kept in separate custody.
- **Pregen/insta kits:** the PIN mailer is usually inside the kit but **inactive until issuance**, so it is not a separate accountable item — though "missing PIN mailer" remains a valid GRN discrepancy reason.
- **Green PIN:** many banks avoid physical mailers entirely (customer sets the PIN via ATM/IVR/app). Where mailers exist, CIM tracks them as a distinct stock class.

**Requirements:** the GRN screen must support a separate PIN-mailer reconciliation step for personalised consignments; "PIN mailer missing" and "tampered envelope" are discrepancy codes; PIN mailers may optionally be tracked as their own line in the order pipeline (ordered / received / reconciled), parallel to the card stream.

---

## 11. End-to-End Process Flows (with realistic examples)

### Flow A — Procurement to receipt (multi-item order)

1. **Order** — Central Ops raises `PO-2026-0160` (500 Platinum + 200 Gold) for Pune. Maker-checker approval per DOA.
2. **Embossing files** — Issuance generates `EMF-…0461` (BATCH-PLT-0461, 500, range reserved) and `EMF-…0462` (BATCH-GLD-0462, 200). Batch IDs embedded in file headers.
3. **Production** — Vendor maps each file to a job, prints both batches; status → `IN_PRODUCTION`.
4. **Dispatch** — Vendor packs one carton `CTN-0001` (banded 500+200, seal `SEAL-44821`), sends ASN (carton → 2 batches → ranges → AWB). Status → `DISPATCHED` / `IN_TRANSIT`.
5. **Receipt (GRN)** — Branch does the **three-way match** (PO vs ASN vs physical), seal check, scans and counts **per batch**, acknowledges per batch (different checker). Stock → `AT_BRANCH`. Discrepancy on either batch → that batch quarantined, case opened, PO line stays open; the other batch is unaffected.

### Flow B — Verification depth (the middle-of-band missing card)

Endpoint-only scanning (first + last serial) is a **speed/risk trade-off**, safe only when paired with:
- an **independent two-person count** (a missing middle card fails the count even if endpoints pass),
- **downstream reconciliation gates** (FIFO sequential issue hits the gap; periodic/surprise counts; issuance-to-stock reconciliation),
- a **latent-discrepancy SLA clause** (acknowledgement "subject to verification" for a defined window so post-GRN shortages can still be claimed).

**Policy:** tier verification depth by value — **full serial scan** for personalised/high-value stock (reports the exact missing serial on the spot); **endpoint + count + sample** for low-value pregen.

### Flow C — Replenishment (centralised vs decentralised)

Net available at a branch breaches ROP → proposal generated → routed by operating model:
- *Centralised:* branch **requisition** on Central Vault; if the vault itself breaches ROP, a consolidated **vendor PO** is proposed.
- *Decentralised:* branch **vendor PO** into the branch approval queue.

> **Example:** Pune Hinjawadi drops to net available 95 (ROP 350). Proposal `RP-1042` suggests 655 kits (Max 750 − 95). Before ordering, the system also suggests a **lateral transfer** from overstocked Delhi CP (86 days cover) — cheaper than a vendor order.

### Flow D — In-transit tracking

Every consignment in flight (vendor→vault, vault→branch, branch→branch) is tracked with courier, AWB, seal, route legs and **live scan events**, merging carrier-API data with internal dual-custody dispatch/GRN events. In-transit aging alerts fire when a shipment passes its expected transit time and escalate.

> **Example:** `SHP-2026-0899` (Vault → Hyderabad, 300 DEB-CLS) shows its last scan at Solapur hub, then "not delivered — overdue 2 days," raising exception `EXC-3304` and contributing to Hyderabad's stock-out.

### Flow E — Custodian issue & return (FIFO by kit range)

1. **Day-Open** — custodian confirms opening pool (e.g., `KIT-77904711–780`, 70 kits) equals previous closing.
2. **Issue** — custodian carves contiguous ranges from the **front** (FIFO) to each operator via an Issue Slip; operator acknowledges. E.g., issue 10 → `KIT-77904711–720`, pool drops to 60.
3. **Intra-day** — operator issues to customers; balance decrements in real time; ad-hoc top-ups follow the same control.
4. **Day-Close** — each operator returns the unissued tail; system checks `issued − sold − returned = 0`. K. Joshi: 40 issued − 31 sold → 9 expected back. Match → balanced; mismatch → variance, day-close **blocked**, discrepancy case raised.

### Flow F — Personalised collection (last mile)

Order → produce → dispatch → **card-by-card GRN** → `AWAITING_COLLECTION` (named register) → reminders → **KYC handover** (`COLLECTED`) or **unclaimed → destroy** (blocked + certificate). PIN mailer reconciled separately.

---

## 12. Branch Day-to-Day Operating Cycle

A realistic daily cycle for a branch operating under this module:

| Time | Activity | System action |
|---|---|---|
| **Day-open (09:00)** | Custodian + joint officer open the branch vault (dual custody) | Confirm opening balance = previous closing; system enforces match before any movement |
| **09:00–09:15** | Custodian issues working stock to each operator/teller | Operator Issue Slips with FIFO kit ranges; operators acknowledge in-system |
| **Through the day** | Operators issue pregen cards to walk-in customers; hand over personalised cards to customers who come to collect (after KYC) | Real-time balance decrement; `ISSUED_TO_CUSTOMER` / `COLLECTED` events; collection register updated |
| **Ad hoc** | Operator runs low → custodian top-up; consignment arrives → GRN; transfer arrives/leaves | All movements documented; balances and in-transit updated live |
| **Continuous** | System monitors thresholds | ROP breaches raise replenishment proposals; aging/expiry and in-transit overdue raise exceptions |
| **Day-close (17:30)** | Each operator returns unissued kits; custodian balances every till | `issued − sold − returned = 0` enforced; any variance blocks close and opens a case |
| **Day-close (17:45)** | Custodian closes the branch day; stock returns to joint custody | Day-In/Day-Out report auto-generated and archived; second-officer hand-back confirmation |
| **Overnight (batch)** | System reconciliation | Movement-vs-balance invariant check; CIM↔Issuance reconciliation; chase lists for pending GRNs/acknowledgements |

**Periodic cycles:** monthly physical verification and CIM↔Issuance reconciliation (physical pregen vs logical pre-issued records); quarterly blind counts and access recertification; near-expiry sweeps feeding redistribution or destruction.

---

## 13. Governance, Risk & Compliance

### Regulatory & standards alignment

| Framework | How CIM complies |
|---|---|
| **PCI DSS v4.0** | No full PAN stored in CIM (masked PAN / kit number / card sequence only); RBAC least-privilege; unique IDs; MFA via enterprise IAM; all access logged; periodic access reviews |
| **PCI Card Production & Provisioning (Physical/Logical Security)** | Dual custody of vaults; documented chain of custody; serial-number accountability; secure transport tracking; receipt verification; certified destruction with witnesses |
| **Central-bank directions** (e.g., RBI Master Direction on card issuance; outsourcing/vendor-risk guidelines) | Traceable issuance records; control over unsolicited/undelivered cards (returned/unclaimed workflow with retention and destruction); vendor SLA oversight evidence; periodic reconciliation; board-grade MIS — jurisdiction rules are **configuration, not code** |
| **ISO 27001 / internal ISMS** | Audit logging; segregation of duties; change-managed configuration; encryption at rest/in transit; retention & disposal schedules |
| **SOX-style internal controls** | Maker-checker on sensitive actions; immutable audit trail; system-enforced day-close and reconciliation; point-in-time reporting |

### Core control requirements

| ID | Requirement |
|---|---|
| GOV-01 | **Maker-checker** mandatory for: PO create/amend/cancel, GRN-with-discrepancy, transfers, adjustments, parameter changes, custodian changes, destruction, write-offs. Checker must differ from maker (enforced). |
| GOV-02 | **Segregation of duties** — ordering, receiving, custody and reconciliation roles assignable to different users; conflicting combinations blocked/flagged. |
| GOV-03 | **Dual custody** — vault and branch joint-custody locations require two distinct authorised users to confirm inward/outward movements. |
| GOV-04 | **Immutable audit trail** — every create/update/state-change/trace-read logged append-only with user, role, timestamp, before/after, channel; tamper-evident (hash-chained); retained ≥ 10 years. |
| GOV-05 | **No silent data changes** — no direct DB updates in production; all corrections via reversal/adjustment documents with approval. |
| GOV-06 | **Reconciliation** — daily movement-vs-balance invariant; periodic physical-to-system verification with variance approval; monthly CIM↔Issuance reconciliation. |
| GOV-07 | **Data privacy** — no customer PII in CIM; customer linkage by Issuance card ID only; PAN never stored/displayed in full. |
| GOV-08 | **Access governance** — RBAC via enterprise IAM/SSO; branch-scoped entitlements; recertification extracts; break-glass access logged and reported next day. |

### Roles (representative)
Central Inventory Manager (PO maker), Central Inventory Approver (checker), Vault Officers ×2 (dual custody), Branch Manager (approvals, variance level-1), Branch Custodian (GRN maker, allocations, day-open/close, counts), Operator/Teller (acknowledge slips, customer issuance, end-of-day return), Risk & Compliance (read-all, oversight), Internal/External Auditor (read-only point-in-time, trace, audit trail), System/Integration (adapter scopes only). Entitlements scoped to hierarchy nodes; conflicting combinations blocked.

---

## 14. Architecture & Integration (CMS-agnostic)

### Placement
CIM is a **bounded context inside the Issuance Service** deployment boundary — its own schema (no cross-schema joins), its own API namespace (`/inventory/v1`), communicating with Issuance core only via internal APIs/events. This honours "build under Issuance" while preserving the option to extract CIM into a standalone service later with **zero contract change**.

### Internal components
Order Management, Receipt/GRN, **Stock Ledger** (balances + state machine), Transfer, Custodian Operations, Replenishment Engine, Forecasting Engine, Exception Engine, Reporting/Read Model, Configuration, Audit Logger, Vendor Integration Adapter, **CMS Adapter** (anti-corruption layer).

### CMS adapter contract (the only thing a CMS must implement)

| Adapter capability | Used for |
|---|---|
| Get card/kit metadata by sequence/kit number (masked PAN, BIN, product, design, expiry, perso status) | Receipt validation, trace enrichment, aging |
| Resolve serial range → card IDs | Linking stock units to logical records |
| Event: card issued / activated | Auto-decrement operator stock; `ISSUED_TO_CUSTOMER` |
| Command: block / hotlist / close card(s) | Lost, stolen, destroyed, unclaimed |
| Event: embossing file / batch created (batch ID, qty, ranges) | Auto-create expected dispatch |
| Reference data: products, BINs, branches, users-roles | Configuration and entitlement scoping |

If no CMS is connected, the same data can be supplied via batch file upload — so CIM also runs **standalone**.

### Key design decisions
- **Stock ledger as append-only journal** with materialised balances — guarantees the invariant, enables point-in-time reporting and tamper-evidence.
- **Serial-range model with lineage** — manageable data volumes with per-serial traceability.
- **Idempotent document APIs** keyed by client request ID — survive retries from branch networks.
- **CQRS read model** — analytics/dashboards never impact posting throughput.

### Non-functional targets
Balance enquiry P95 < 500ms; movement posting P95 < 1s; trace < 30s; dashboard lag ≤ 5s. ≥ 2,000 branches, ≥ 500k movements/day, ≥ 200M serials. 99.9% availability for movement APIs; RPO ≤ 5 min, RTO ≤ 2h; event replay to rebuild read models. OAuth2/OIDC, TLS 1.2+, AES-256 at rest, OWASP ASVS L2.

---

## 15. Data Model & API Catalog

### Key entities
Institution / OperatingModelConfig · Location (hierarchy node, custody mode) · StockClass / Product / Design · Vendor / VendorSLA · PurchaseOrder / RequisitionOrder / OrderLine · DispatchAdvice / Consignment / Box · GRN / GRNLine / DiscrepancyCase · TransferOrder · Shipment / TrackingEvent · StockUnitRange / StockUnit · StockMovement (journal) · Balance (materialised) · CustodianAssignment / OperatorIssueSlip / DayBook · CollectionRecord (personalised) · PinMailerStock · ReplenishmentPolicy / ReplenishmentProposal · ForecastSeries / ForecastOverlay · ExceptionCase / AlertRule · DestructionRequest / DestructionCertificate · AuditEvent.

### Representative API (`/inventory/v1`)

| Endpoint | Method | Purpose |
|---|---|---|
| `/balances?location=&product=&state=` | GET | Real-time balance enquiry with drill-down |
| `/stock-units/{serial}/trace` | GET | Full custody chain for a serial/kit |
| `/purchase-orders`, `/{id}/approve` | POST | Create / approve vendor PO (maker-checker) |
| `/requisitions` | POST | Branch stock requisition (centralised) |
| `/dispatch-advices` | POST | Vendor/vault dispatch with serial manifest |
| `/grns`, `/{id}/acknowledge` | POST | Goods receipt and two-step acknowledgement |
| `/transfers`, `/{id}/dispatch`, `/{id}/receive` | POST | Inter-branch transfer lifecycle |
| `/shipments`, `/{id}/events` | GET | In-transit tracking & scan events |
| `/custodians/{id}/day-open`, `/day-close` | POST | Custodian day operations with balancing |
| `/operator-issues`, `/operator-returns` | POST | Intra-day operator movements |
| `/collection`, `/{id}/handover`, `/{id}/destroy` | POST | Personalised card collection lifecycle |
| `/adjustments` | POST | Approved variance adjustments |
| `/replenishment/proposals`, `/{id}/approve` | GET/POST | Auto-replenishment review |
| `/exceptions`, `/{id}` | GET/PATCH | Exception case management |
| `/reports/{code}/run` | POST | Parameterised report execution |
| `/config/*` | GET/PUT | Maker-checker governed configuration |

**Domain events:** `inventory.po.approved`, `inventory.dispatch.received`, `inventory.grn.completed`, `inventory.transfer.dispatched/received`, `inventory.shipment.scan`, `inventory.stock.state-changed`, `inventory.custodian.day-closed`, `inventory.collection.received/collected`, `inventory.exception.raised`, `inventory.destruction.completed`, `inventory.replenishment.proposed`.

---

## 16. Reporting, Dashboards & Statistics

### Dashboards
- **Executive:** total stock by state and product; branch health heat-map (healthy / below safety / stock-out / overstock); in-transit pipeline; exceptions summary; wastage and forecast-accuracy KPIs.
- **Role-scoped operational:** vault, branch manager, custodian, central ops — each scoped to its hierarchy node.

### Branch & product statistics (per the UX)
- **Branch profile:** per-product position vs policy (on hand, in transit, reserved, blocked, net, cover, safety, ROP, max, health), weekly issuance by product, aging by product, today's order & movement activity (placed / in-transit / received / dispatched / issued, each as *documents (cards)*), pipeline, exceptions, and a personalised collection summary.
- **Branch × product matrix:** net available per branch × product with health dots and totals; today's order activity by branch.
- **Product league:** branches ranked by days-of-cover per product (lowest first).

### Standard reports
Stock balance (as-on-date, point-in-time reconstructable), movement register, aging analysis, usage pattern, order book, vendor SLA, transfer register, GRN register, discrepancy register, destruction register, custodian day-book, physical-verification results, personalised collection & unclaimed register, audit-trail extract. All parameterised, schedulable, exportable (PDF/XLSX/CSV), reproducible as-of any historical date. One-click **regulatory/audit pack** per branch.

---

## 17. UX Reference (screen-by-screen)

The accompanying React prototype demonstrates the module. Screens:

| Screen | What it shows |
|---|---|
| **Dashboard** | Network KPIs, usage-vs-forecast, branch health heat grid, lifecycle-state mix, aging |
| **Inventory** | Network → branch drill-down; committed vs available; serial ranges; custody split |
| **Branch & product stats** | Branch profile, branch × product matrix, product league (per §16) |
| **Orders & vendors** | PO lifecycle, dispatch/AWB, ordered vs received (short detection), vendor SLA cards |
| **Receive (GRN)** | Two-step acceptance; pregen box/range scan **or** personalised card-by-card + PIN reconciliation; discrepancy → quarantine + case |
| **Transfers** | Maker-checker transfers; lateral-rebalance suggestions; overdue escalation |
| **In-transit tracking** | All shipments by leg; courier/AWB/seal; live scan timeline; overdue alerts |
| **Custodian day book** | FIFO working pool; issue kit ranges to operators; receive returns; enforced day-close balancing; Day-In/Day-Out |
| **Card collection** | Personalised order pipeline (ordered→…→collected) + named register; KYC handover; unclaimed → destroy |
| **Replenishment** | ROP-breach proposals routed by operating model; duplicate-order protection |
| **Exceptions** | Rule-driven cases with severity, SLA, status |
| **Serial trace** | Full custody chain for any kit/card |
| **Settings** | Operating model (centralised/decentralised), replenishment defaults, governance controls |

The prototype uses in-memory demo data (no backend, no storage) and is packaged as a Vite + React + Tailwind project for local run or Vercel/Netlify deployment.

---

## 18. Implementation Roadmap

| Phase | Indicative duration | Scope |
|---|---|---|
| **Phase 0 — Design** | 3–4 weeks | State machine, adapter contract, data model, configuration workbook (locations, products, vendors, DOA), control walkthrough with Risk/Audit |
| **Phase 1 — Foundation** | 8–10 weeks | Stock ledger + state machine, masters, PO→dispatch→GRN, transfers, balances API, audit trail, core reports, RBAC. Pilot: vault + 5–10 branches |
| **Phase 2 — Branch ops** | 6–8 weeks | Custodian/operator (FIFO issue/return, day-open/close), discrepancy cases, physical verification, exception engine, dashboards, destruction, **personalised collection**, Issuance event integration |
| **Phase 3 — Automation** | 6–8 weeks | Replenishment (both models), lateral transfer suggestions, aging/FEFO, in-transit tracking, vendor SLA analytics, regulatory pack |
| **Phase 4 — Intelligence** | 6 weeks | Forecasting with overlays and accuracy, parameter recalibration, ML plug-in interface |
| **Rollout** | Wave-based | Branch onboarding with supervised opening-balance capture (physical count → system seed under dual sign-off), training, hypercare; retire registers only after one clean monthly reconciliation |

**Data migration / opening balances:** supervised physical count per location with serial-range capture and dual sign-off; variance against legacy registers documented and approved before go-live. Open POs/in-transit migrated as open documents; historical registers archived, not migrated.

---

## 19. Acceptance Criteria & KPIs

### Acceptance (samples)
- Any serial's end-to-end trace retrievable in < 30s with complete custody chain.
- Branch cannot day-close with non-zero operator balances or open mandatory discrepancies.
- Replenishment proposals generated within 5 min of ROP breach, routed per operating model; no duplicates against open orders.
- All sensitive actions demonstrably maker-checker; audit trail reproduces any balance as-of any past date.
- Personalised GRN feeds the named collection register; unclaimed → block + destruction certificate.
- CIM runs against a **stubbed adapter** (no CMS), proving independence; switching adapter requires no CIM change.

### Success KPIs (12-month targets, to be baselined)

| KPI | Target |
|---|---|
| Branch stock-out incidents / month | ↓ ≥ 80% |
| Stock aged > 180 days (% holdings) | ↓ ≥ 50% |
| Wastage (expired/destroyed as % received) | ↓ ≥ 40% |
| Unreconciled discrepancies open > 7 days | Zero-tolerance trend |
| Emergency/ad-hoc vendor orders | ↓ ≥ 70% |
| Unclaimed personalised cards > retention | ↓ ≥ 60% |
| Audit observations on card stock | Zero repeat findings |
| Forecast accuracy (MAPE, A-class series) | ≤ 20% |

---

## 20. Glossary

| Term | Meaning |
|---|---|
| **Pregen / insta kit** | Pre-generated, non-personalised card kit issued over the counter, linked to a customer at issuance |
| **Personalised card** | Card embossed for a specific named customer, collected at branch after KYC |
| **GRN** | Goods Receipt Note — the controlled record that turns "a box arrived" into "stock verified, accepted, on our books" |
| **ASN / Dispatch Advice** | Advance Shipping Notice — electronic manifest declaring carton → batches → ranges → AWB |
| **Batch ID** | The accountability unit (one per embossing file) — the golden thread from order to receipt |
| **Reserved range** | Block of identifiers (PANs or kit numbers) earmarked so nothing else consumes them while at the vendor |
| **Safety / ROP / Max** | Emergency floor / order trigger / ceiling — the replenishment band |
| **Net available** | On hand + in transit − reserved − blocked; the decision number vs ROP |
| **Days of cover** | Net available ÷ average daily issuance |
| **FIFO / FEFO** | First-In-First-Out / First-Expiry-First-Out rotation |
| **DOA** | Delegation of Authority — approval limits by role and value/quantity |
| **Dual custody** | Two authorised persons jointly required to access/move stock |
| **Maker-checker** | Four-eyes control: one initiates, a different authorised user approves |
| **Custodian / Operator** | Branch officer accountable for working stock / teller issuing cards to customers |
| **Day-In/Day-Out report** | Daily physical stock account: opening, receipts, issues, returns, closing |
| **PIN mailer** | Printed PIN carrier; kept separate from the card; or replaced by green PIN |
| **MAPE** | Mean Absolute Percentage Error — forecast accuracy measure |
| **Quarantine** | Logical holding area for disputed/damaged stock, excluded from issuance |
| **Adapter contract** | The minimal API/event interface any CMS must implement for CIM to obtain card data |

---

*End of document — Card Inventory Management Module, Consolidated Requirements v2.0.*
