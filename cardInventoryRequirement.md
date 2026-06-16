# Card Inventory Management (CIM) Module
## Enterprise Business & Functional Requirements — End-to-End Implementation Specification

| | |
|---|---|
| **Document** | Card Inventory Management (CIM) — Consolidated Requirements |
| **Version** | 2.2 (consolidated) |
| **Date** | 15 June 2026 |
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
20. Resilience, Offline & Edge-Case Handling
21. Assumptions, Constraints & Dependencies
22. Risks & Mitigations
23. Open Questions & Decisions Log
24. Glossary
25. Revision History

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

### Forecasting & usage-pattern metrics
Demand history is kept per **branch × product × day**. The engine computes several candidate forecasts and **auto-selects the lowest-MAPE model per series**.

**Forecast methods** (series oldest→newest, `D̄` = mean):
- *Simple moving average (k):* `F = (1/k)·Σ(last k)`
- *Weighted MA (recent-heavy):* `F = Σ(wᵢ·Dᵢ) / Σwᵢ`
- *Single exponential smoothing:* `Fₜ₊₁ = α·Dₜ + (1−α)·Fₜ`
- *Holt's linear (trend):* `Lₜ = α·Dₜ + (1−α)(Lₜ₋₁+Tₜ₋₁)`, `Tₜ = β·(Lₜ−Lₜ₋₁)+(1−β)·Tₜ₋₁`, `Fₜ₊ₘ = Lₜ + m·Tₜ`
- *Holt-Winters (trend + day-of-week seasonality, s=7):* adds `Sₜ = γ·(Dₜ/Lₜ)+(1−γ)·Sₜ₋ₛ`, `Fₜ₊ₘ = (Lₜ+m·Tₜ)·Sₜ₋ₛ₊ₘ`

**Accuracy** (back-test, error `eₜ = Dₜ − Fₜ`): **MAPE** `= (100/n)·Σ|eₜ/Dₜ|` (target ≤ 20% on high-volume series) · `MAE` · `RMSE` · Bias `MPE = (100/n)·Σ(eₜ/Dₜ)`. Lowest-MAPE model wins and is labelled in the UI.

**Trend** (linear regression): slope `b = Σ(i−ī)(Dᵢ−D̄) / Σ(i−ī)²`, reported as **% of mean per period**.

**Usage-pattern classification:**
- *Volatility* `CV = σ/D̄`: Smooth `<0.5` · Variable `0.5–1.0` · Erratic `>1.0` (→ XYZ = X/Y/Z)
- *Volume* (ABC, Pareto): A ≤ 70% · B ≤ 90% · C = rest of branch issuance
- *Intermittency* (Syntetos–Boylan, daily): `ADI = periods / periods-with-demand`, `CV²` → Smooth / Erratic / Intermittent / Lumpy
- *Seasonality:* day-of-week index `Sᵢ = avg(weekday i) / avg(all days)` (100 = average day), plus salary-week effects
- *Peak ratio:* `max(Dᵢ) / D̄`

**Forecast-driven replenishment** (ties to §8.7): safety stock `SS = z·σ_d·√L`; reorder point `ROP = d̄_forecast·L + SS` (z = service factor — 1.65≈95%, 2.05≈98%; L = lead-time days).

**Personalised cards** are excluded from demand forecasting (named consignments, never reordered — see §9); their daily series is still classified for usage/aging insight.

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

### 8.9 Demand forecasting & usage patterns
- **M** Per **branch × product** demand forecast from daily history, with **auto model selection by lowest MAPE** across moving-average, weighted-MA, exponential-smoothing, Holt and Holt-Winters (formulas in §7). 12-week actual + 4-week forward forecast with a confidence band. *(Demonstrated in the prototype — Branch profile.)*
- **M** **Usage-pattern analytics** per product: trend (%/wk), volatility (CV → Smooth/Variable/Erratic, XYZ), volume class (ABC), intermittency (Syntetos–Boylan: Smooth/Erratic/Intermittent/Lumpy), **day-of-week seasonality** index and peak day, with a plain-language summary.
- **M** Forecast accuracy surfaced as **MAPE** per series (and volume-weighted at branch level), with the winning model labelled; ≤ 20% target on high-volume (A-class) series.
- **S** Campaign / new-branch overlays with audit; forecast feeds the replenishment ROP/order-size (§8.7).
- **C** ML model plug-in interface for a later phase without changing replenishment logic.

### 8.10 Exception management
- **M** Rule engine with severity and escalation. Standard exceptions: stock-out, below safety, near-expiry, overstock, in-transit overdue, GRN pending beyond SLA, unacknowledged dispatch, operator/custodian variance, negative-balance attempt, count variance, dormant stock, duplicate serial, PO overdue, unclaimed personalised card.
- **M** Each exception is a trackable case (open → investigating → resolved/closed) with owner, SLA timer, resolution code.
- **M** Lost/stolen stock auto-calls Issuance API to block/hotlist the affected card numbers/kits.

**Exception severity, SLA & escalation matrix** (institution-configurable; SLA clock starts at case creation):

| Exception | Severity | Resolution SLA | Escalation path |
|---|---|---|---|
| Stock-out | Critical | 4 business hours | Branch → Region (1h) → Centre (2h) |
| Operator/custodian day-close variance | Critical | Same day (blocks close) | Branch Manager → Region |
| Lost / stolen | Critical | 1h to hotlist; 24h to write-off | Branch → Risk → Centre (immediate) |
| Below safety | High | 1 business day | Branch → Region (1d) |
| In-transit overdue | High | 1 business day | Branch → Region → Carrier |
| GRN pending beyond SLA | High | 2 business days | Branch → Region |
| Duplicate / mismatched serial | High | 2 business days | Branch → Centre |
| Near-expiry (≤ 30d) | Medium | 5 business days | Branch → Region |
| Overstock / dormant stock | Medium | 5 business days | Branch → Region |
| Unacknowledged dispatch | Medium | 2 business days | Sender → Region |
| PO overdue | Medium | 3 business days | Central Ops → Vendor |
| Unclaimed personalised card | Medium | At retention horizon | Branch → Region |

- **M** Unresolved cases auto-escalate up the hierarchy at each tier's SLA breach; breach counts and resolution times feed branch/vendor quality metrics.

### 8.11 Dashboards & reporting
- **M** Executive dashboard, role-scoped operational dashboards, and a full standard report set (see §16).

### 8.12 Destruction & disposal
- **M** Destruction Request (serials/ranges + reason) with maker-checker; physical destruction recorded with method, two witnesses, and uploaded certificate → `DESTROYED`.
- **M** On approval, Issuance API permanently blocks/closes the corresponding card records. Registers retained per policy (default 10 years), immutable.

### 8.13 Notifications & alerts
- **M** Every alert rule maps to **recipients** (by role / hierarchy node) and one or more **channels**; channel and threshold are configuration, not code.
- **M** Delivery is **idempotent and de-duplicated** (one event ≠ repeated pings), with digest options to avoid alert fatigue; every alert also lands in the in-app exception inbox.

| Event class | Default channel(s) | Default recipients |
|---|---|---|
| Critical (stock-out, lost/stolen, day-close blocked) | In-app + SMS + email + push | Branch Manager, Custodian, Region; Risk for lost/stolen |
| High (below safety, in-transit overdue, GRN overdue) | In-app + email | Branch, Region |
| Medium (near-expiry, overstock, PO overdue, unclaimed) | In-app + daily email digest | Branch, Central Ops |
| Approvals pending (PO, transfer, destruction, config) | In-app + email | Designated checker / approver |
| System / integration (event replay, reconciliation break) | In-app + webhook to ops | Central Ops, Integration |

- **S** Webhook / event-bus fan-out so external systems (Finance, BI, ITSM) can subscribe. **C** Quiet-hours and per-user channel preferences.

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

**Flow index:** A Procurement→receipt · B Verification depth · C Replenishment · D In-transit tracking · E Custodian issue & return · F Personalised collection · G Destruction & disposal · H Discrepancy→exception lifecycle · I Lost/stolen/damaged incident · J Physical verification & adjustment · K Inter-branch transfer (lateral rebalancing) · L PIN-mailer reconciliation · M Custodian handover · N Configuration change · O Branch onboarding & opening balance · P CIM↔Issuance reconciliation · Q Demand forecasting & usage-pattern analysis.

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

### Flow G — Destruction & disposal (damaged / expired / unclaimed → certified destruction)

1. **Nominate** — stock becomes destruction-eligible: damaged at GRN/issue, `EXPIRED` by the aging job, or unclaimed personalised cards past retention. A maker raises a **Destruction Request** listing exact serials/ranges, reason code and source location.
2. **Approve (maker-checker)** — a different authorised approver (per DOA) reviews and approves; units move `…→ PENDING_DESTRUCTION` and are excluded from all balances and issuance.
3. **Block at source-of-truth** — on approval CIM calls the Issuance **block/close** command so the corresponding logical card records can never be activated.
4. **Physically destroy** — at the scheduled destruction event two witnesses observe shredding/incineration per policy; method, date, witnesses and quantities are captured and a signed/scanned **Destruction Certificate** is uploaded. Units → `DESTROYED`.
5. **Reconcile & retain** — destroyed quantities post to wastage analytics (by branch/product/vendor/reason); the destruction register is retained immutably per policy (default 10 years).

> **Example:** 23 Gold kits damaged by water ingress at Pune Camp plus 11 personalised cards unclaimed > 60 days are batched into `DSR-2026-0218`. The branch custodian raises it; the regional manager approves; Issuance blocks all 34 card records; on the monthly destruction run two officers witness shredding and upload `DC-2026-0218`. Wastage attributes 23 to "transit/handling damage" and 11 to "unclaimed".

### Flow H — Discrepancy → exception case → resolution

Turns a control breach into a tracked, time-boxed case.

1. **Raise** — a discrepancy (short/excess/damaged/tampered/serial-mismatch at GRN, day-close variance, count variance, overdue shipment, etc.) auto-creates an **ExceptionCase** with severity, owner, SLA timer and reason code. Affected stock is **quarantined / `BLOCKED`** where applicable.
2. **Investigate** — the owner gathers evidence (scans, carrier proof, CCTV reference, vendor confirmation); case state `OPEN → INVESTIGATING`. SLA breaches escalate branch → region → centre.
3. **Resolve** — outcome recorded with a resolution code: vendor credit note (short shipment), found-on-recount (count variance cleared), adjustment posted (genuine loss), or transfer-in matched. Linked documents attached.
4. **Close** — `INVESTIGATING → RESOLVED → CLOSED`; quarantined stock is released, written off, or sent to destruction. The full trail is auditable and feeds vendor/branch quality metrics.

> **Example:** GRN of `PO-2026-0160`'s Gold batch counts 198 against 200 declared. Case `EXC-4471` (High) opens, 198 accepted with-exceptions, the PO line stays open. Investigation shows a tamper in transit; resolution is a carrier claim plus a vendor reship of 2 — on receipt the case closes and the PO line is short-closed.

### Flow I — Lost / stolen / damaged incident & hotlisting

1. **Report** — a custodian/operator reports stock `LOST` / `STOLEN` (or `DAMAGED`) with serials/ranges and circumstances; a high-severity incident case opens immediately.
2. **Contain** — affected units drop out of balances; CIM calls the Issuance **hotlist/block** command without delay so no lost/stolen kit can ever be activated.
3. **Investigate & authorise** — branch + risk review; a maker-checker **adjustment** writes the units off against an approved reason, with **second-level authorisation** above DOA value limits.
4. **Report out** — the incident feeds risk/compliance MIS and, where thresholds require, regulatory/fraud reporting. Trail retained immutably.

> **Example:** A surprise count at Hyderabad finds `KIT-55120144` missing. Incident `EXC-5102` opens; Issuance hotlists the kit in < 1 min; CCTV is inconclusive; write-off `ADJ-2026-0733` is approved by the regional head and the kit stays permanently blocked.

### Flow J — Physical verification & variance adjustment

1. **Plan** — a scheduled (monthly) or **surprise** count is initiated for a location/custodian; optionally **blind** (book quantity hidden from the counter).
2. **Count** — two officers count physical stock by serial range; entries captured by scan or double-keyed.
3. **Compare** — the system computes variance vs book stock per product/range; zero variance → verification passed and timestamped.
4. **Adjust** — any variance opens a discrepancy; a maker-checker **adjustment document** with reason and **second-level authorisation** corrects book stock (never a silent DB edit). Repeated variances flag the location for review.
5. **Evidence** — the physical-verification report is archived and feeds GOV-06 reconciliation evidence and the audit pack.

> **Example:** A blind monthly count at Delhi CP shows 1,498 vs book 1,500 Platinum. Variance of 2 opens `EXC-4820`; recount confirms; adjustment `ADJ-2026-0701` (reason "count variance — under") is approved at level-2 and book stock corrected.

### Flow K — Inter-branch transfer (lateral rebalancing)

Moves stock branch→branch (or vault↔branch) to cure imbalance before buying new plastic.

1. **Identify** — overstock (days-of-cover > 90) at one branch with below-safety at another triggers a **lateral transfer suggestion** (also raisable manually).
2. **Raise & approve** — the sender raises a **Transfer Order** (product, serial ranges, destination); maker-checker approval per DOA; committed stock → `RESERVED`.
3. **Dispatch** — the sender packs, seals and dispatches under dual custody; units → `IN_TRANSIT`; the shipment is tracked (Flow D) and in-transit-overdue escalates.
4. **Receive** — the destination performs a two-step **GRN** against the Transfer Order; on acceptance stock → `AT_BRANCH` at the receiver and leaves the sender's books. Discrepancy → quarantine + case.

> **Example:** Delhi CP (86 days cover) → Pune Hinjawadi (net 95, ROP 350). `TRF-2026-0512` for 300 kits is approved, dispatched (`SHP-2026-0931`) and received clean two days later — averting vendor order `RP-1042`.

### Flow L — PIN mailer parallel reconciliation

Enforces card-and-PIN separation.

1. **Order / produce** — for personalised consignments PIN mailers are produced as a **separate stream** and may be tracked as their own pipeline line (ordered / received / reconciled).
2. **Dispatch separately** — mailers ship in a different envelope/courier run from the cards and are **acknowledged independently** at GRN.
3. **Reconcile two counts** — the branch confirms *N cards received* and *N PIN mailers received* as two distinct reconciliations held in **separate custody**; mismatches ("PIN mailer missing", "tampered envelope") are discrepancy codes that open a case.
4. **Issue with separation** — card and mailer are never released together by the same step unless green-PIN policy applies; green-PIN products skip the mailer stream entirely.

> **Example:** Pune Camp receives 150 personalised cards (`DA-2026-0951`) on Monday and 150 PIN mailers (`DA-2026-0952`) on Wednesday via a different courier. Reconciliation matches 150:150; one envelope arrives tampered → `EXC-4905`, that mailer is quarantined and reissued.

### Flow M — Custodian / vault-officer handover

1. **Initiate** — on leave, transfer or role change, a **handover** is started between outgoing and incoming custodians (or vault officers).
2. **Verify** — a full joint physical count of the working pool/vault by serial range; any variance opens a discrepancy + adjustment before the handover can complete.
3. **Dual sign-off** — both officers (and the branch manager as joint custodian where applicable) sign off; entitlements are re-pointed to the incoming officer via IAM.
4. **Effective** — accountability transfers with a timestamped record; the next day-open opening balance is owned by the incoming custodian.

> **Example:** Custodian S. Iyer hands Pune Hinjawadi to R. Nair; the joint count of 612 kits matches book; both plus the BM sign `HOV-2026-0044`; Iyer's issue/allocate rights are revoked and Nair's activated.

### Flow N — Configuration change (effective-dated, maker-checker)

1. **Propose** — a maker edits a governed parameter (operating model, ROP/min/max/safety, DOA matrix, vendor mapping, alert thresholds, verification depth) with an **effective date**.
2. **Approve** — a different checker approves per DOA; the change is **versioned, not overwritten**.
3. **Activate on date** — the new value takes effect on the effective date; prior values remain queryable for point-in-time reporting and audit.
4. **Propagate** — dependent engines (replenishment, exceptions) pick up the new policy on their next evaluation.

> **Example:** Region West switches Platinum from centralised to decentralised effective 1-Jul-2026; POs raised before that date retain centralised routing; the DOA/model matrix records both versions for audit.

### Flow O — Branch onboarding & opening-balance seeding (go-live)

1. **Configure** — create the location, custody mode, products, policies and entitlements.
2. **Physical count** — supervised count of existing stock by serial range at the branch/vault.
3. **Seed under dual sign-off** — counted ranges are loaded as the **opening balance**; variance vs legacy registers is documented and approved before go-live.
4. **Migrate open items** — open POs and in-transit consignments load as open documents; historical registers are archived, not migrated.
5. **Hypercare** — manual registers are retired only after **one clean monthly reconciliation**.

### Flow P — CIM ↔ Issuance reconciliation (overnight, with break handling)

1. **Pull** — the nightly batch reconciles CIM physical stock/state against Issuance logical records (pre-issued pregen, issued, blocked, personalisation status).
2. **Match** — per serial/range; the expected pairing is physical `ISSUED_TO_CUSTOMER` ↔ Issuance "issued/activated".
3. **Break handling** — mismatches (issued logically but still in physical stock, or vice-versa) raise reconciliation exceptions routed to branch/centre with an SLA.
4. **Resolve** — missed events are replayed, or adjustments posted with approval; a clean reconciliation is a precondition for register retirement and audit sign-off.

> **Example:** The overnight run finds 3 kits marked issued in Issuance but still `WITH_OPERATOR` in CIM — a dropped issuance event. The event is replayed, balances decrement, and `EXC-5210` auto-closes.

### Flow Q — Demand forecasting & usage-pattern analysis

Turns daily issuance history into a forward demand signal and a usage profile, per branch × product.

1. **Collect** — daily issuance per branch × product accumulates from `ISSUED_TO_CUSTOMER` events (≥ 12 weeks retained).
2. **Forecast** — candidate models (SMA, weighted-MA, SES, Holt, Holt-Winters s=7) are back-tested; the **lowest-MAPE model is auto-selected** and projected 4 weeks ahead with a confidence band (formulas in §7).
3. **Classify usage** — each series is tagged by trend (%/wk), volatility (CV → X/Y/Z), volume (ABC), intermittency (Smooth/Erratic/Intermittent/Lumpy) and day-of-week seasonality (peak / lightest day).
4. **Act** — the forecast feeds replenishment (forecast-driven ROP / order size, §8.7) and surfaces in Branch & product statistics; personalised cards are excluded from forecasting (named consignments).

> **Example:** Pune Hinjawadi · DEB-CLS — Holt-Winters wins (MAPE 8.6%); demand is smooth and rising slightly, peaking **Fri (+28% vs avg)** and lightest **Sun (−60%)**, and the 4-week forecast sizes the next requisition. The personalised line (DEB-PRS) is flagged **intermittent** and carries no forecast.

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

### RACI (key activities)

R = Responsible · A = Accountable · C = Consulted · I = Informed. Roles: **CIM** Central Inventory Mgr · **CIA** Central Approver · **VO** Vault Officers · **BM** Branch Manager · **BC** Branch Custodian · **OP** Operator · **R&C** Risk & Compliance.

| Activity | CIM | CIA | VO | BM | BC | OP | R&C |
|---|---|---|---|---|---|---|---|
| Raise vendor PO (centralised) | R | A | I | I | – | – | I |
| Approve PO / requisition | I | A/R | – | C | – | – | I |
| Vault GRN & acceptance | I | I | A/R | – | – | – | I |
| Branch GRN & acceptance | I | – | – | A | R | C | I |
| Day-open / day-close balancing | – | – | – | A | R | C | I |
| Operator issue / customer issuance | – | – | – | I | A | R | – |
| Inter-branch transfer approval | C | – | – | A/R | C | – | I |
| Variance adjustment (level-2) | I | A | – | R | C | – | C |
| Destruction request & sign-off | C | A | C | R | R | – | C |
| Configuration / policy change | R | A | – | C | – | – | C |
| Physical / surprise verification | I | – | C | A | R | – | C |

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

### Core data dictionary (key attributes)

Selected high-traffic entities; all additionally carry `id`, `createdAt/By`, `updatedAt/By`, and — where governed — `maker`, `checker`, `version`.

| Entity | Key attributes |
|---|---|
| **StockUnitRange** | `batchId`, `productId`, `serialFrom`, `serialTo`, `qty`, `state`, `locationId`, `custodianId`, `parentRangeId` (lineage), `receivedAt`, `expiryDate` |
| **StockMovement** (journal) | `movementId`, `docType`, `docRef`, `fromLocation`, `toLocation`, `productId`, `serialRange`, `qty`, `fromState`, `toState`, `reasonCode`, `maker`, `checker`, `channel`, `timestamp`, `clientRequestId` (idempotency) |
| **Balance** (materialised) | `locationId`, `productId`, `stockClass`, `onHand`, `inTransit`, `reserved`, `blocked`, `netAvailable`, `daysOfCover`, `health`, `asOf` |
| **GRN / GRNLine** | `grnId`, `against` (PO/ASN/Transfer), `boxId`, `sealId`, `serialRange`, `qtyDeclared`, `qtyAccepted`, `condition`, `discrepancyCode`, `receiver`, `checker`, `status` |
| **PurchaseOrder / OrderLine** | `poId`, `vendorId`, `model`, `destination`, `status`; line: `productId`, `qty`, `batchId`, `reservedRange`, `qtyDispatched`, `qtyReceived` |
| **CollectionRecord** | `cardRef` (masked PAN), `customerRef` (Issuance id), `branchId`, `receivedAt`, `state`, `reminderCount`, `retentionDueDate`, `pinMailerReconciled` |
| **ReplenishmentPolicy** | `branchId`, `productId`, `safety`, `rop`, `min`, `max`, `reviewPeriod`, `orderMultiple`, `leadTime`, `effectiveFrom` |
| **ExceptionCase** | `caseId`, `type`, `severity`, `owner`, `state`, `slaDueAt`, `escalationTier`, `resolutionCode`, `linkedDocs[]` |
| **AuditEvent** | `eventId`, `actor`, `role`, `action`, `entityRef`, `before`, `after`, `channel`, `timestamp`, `hashPrev` (tamper-evident chain) |

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
- **Branch profile:** per-product position vs policy (on hand, in transit, reserved, blocked, net, cover, safety, ROP, max, health), weekly issuance by product, aging by product, **demand & forecast (12-wk actual + 4-wk forecast, best-fit model & MAPE)**, **usage pattern (day-of-week seasonality, trend, volatility, ABC/XYZ)**, today's order & movement activity (placed / in-transit / received / dispatched / issued, each as *documents (cards)*), pipeline, exceptions, and a personalised collection summary.
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
| **Branch & product stats** | Branch profile (incl. **demand forecast + day-of-week usage pattern**, per product), branch × product matrix, product league (per §16) |
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

### Accessibility & UX standards
- **M** Target **WCAG 2.1 AA**: full keyboard operability for every flow (issue, GRN, day-close), visible focus, ARIA labelling, and form-error association.
- **M** Status is **never conveyed by colour alone** — each health colour (red/amber/orange/green/indigo) is paired with a label and/or icon, for colour-vision deficiency.
- **M** Minimum 4.5:1 text contrast; layout scalable to 200% zoom; data tables expose proper header semantics for screen readers.
- **S** Localisation-ready (externalised strings, locale date/number formats, per-branch timezone display). **C** Right-to-left layout for relevant locales.

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

### Test & UAT strategy

| Layer | Coverage |
|---|---|
| **Unit / component** | Ledger invariant (`Opening + Receipts − Issues − Transfers ± Adjustments = Closing`), ROP / days-of-cover / health computation, range split & merge with lineage |
| **Contract** | CMS adapter (stubbed + live), Issuance events, idempotency on `clientRequestId` |
| **Integration / flow** | Each end-to-end flow A–P scripted as a scenario with expected state transitions and audit entries |
| **Negative / control** | Day-close blocked on variance, negative-balance rejected, maker = checker rejected, replay/duplicate suppressed, offline-sync without double-decrement |
| **Non-functional** | Load to NFR targets (§14: balance P95 < 500ms, posting < 1s, 500k movements/day), DR replay (RPO/RTO), security (OWASP ASVS L2) |
| **UAT** | Branch-ops sign-off on the pilot (vault + 5–10 branches) with real opening-balance seeding; **exit gate = one clean monthly reconciliation** before register retirement |

- Lower environments use **masked PANs / synthetic kit ranges only** — no production PAN outside production.

---

## 20. Resilience, Offline & Edge-Case Handling

Branch networks are imperfect; the module must degrade gracefully and never lose serial accountability.

- **Offline day operations:** if connectivity drops, the branch app supports a constrained **offline mode** — customer issuance and operator returns are queued locally with full serial detail and synced **idempotently** (by client request ID) on reconnect. Day-close cannot finalise until the queue is drained and balanced; retries never double-decrement.
- **Idempotency & retries:** all posting APIs are idempotent on a client request ID, so flaky branch links never create duplicate movements.
- **Event loss / out-of-order:** Issuance events are sequenced; missed or out-of-order events are detected by reconciliation (Flow P) and replayed. The append-only **stock ledger is the source of truth**; the read model is fully rebuildable by replay.
- **Edge cases handled explicitly:** spoilage at point of issue (operator finds a damaged kit while serving a customer → quarantine + replacement from the pool); partial / over receipt; serial ranges split across multiple movements with preserved lineage; a customer relocating before collecting a personalised card (transfer of an `AWAITING_COLLECTION` card); negative-balance attempts hard-blocked; concurrent movements on the same range serialised to prevent oversell.
- **Disaster recovery:** RPO ≤ 5 min, RTO ≤ 2h; event replay rebuilds read models; no movement is accepted against a stale balance snapshot.

---

## 21. Assumptions, Constraints & Dependencies

**Assumptions** — Issuance exposes the adapter contract (§14); branches have scanners or accept double-keyed entry; vendors can embed Batch IDs in embossing-file headers and send structured ASNs; enterprise IAM/SSO provides identities and MFA.

**Constraints** — no full PAN stored in CIM; jurisdiction rules are delivered as **configuration, not code**; Phase-1 excludes the items in §3; destruction methods are bounded by approved environmental/security policy.

**Dependencies** — Issuance Service (card metadata, events, block/hotlist), enterprise IAM, vendor integration (API/SFTP/portal), courier tracking APIs (optional, for live scans), the Finance event consumer (accounting feed), and the notification gateway (email/SMS/push/webhook).

---

## 22. Risks & Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Endpoint-only scanning misses a middle card | Latent shortage discovered late | Two-person count + FIFO sequential issue + latent-discrepancy SLA window (Flow B) |
| Vendor cannot send a structured ASN | Manual GRN, keying errors | Portal/manual ASN entry fallback; ASN capability gated in vendor onboarding |
| Branch connectivity outage | Issuance/day-close stalls | Offline queue with idempotent sync (§20) |
| Missed Issuance issuance event | Phantom stock, balance drift | Nightly reconciliation + event replay (Flow P) |
| Card and PIN handled together | A usable instrument leaks | Enforced separation: separate consignment + custody (Flow L) |
| Custodian collusion / silent edits | Fraud, audit findings | Maker-checker, dual custody, no direct DB edits, immutable hash-chained audit (§13) |
| Opening-balance error at go-live | Persistent variance | Supervised count, dual sign-off, one clean reconciliation before register retirement (Flow O) |
| Over-ordering / aging | Locked capital, write-offs | ROP/Max band, days-of-cover overstock detection, lateral transfer before vendor order (Flows C/K) |

---

## 23. Open Questions & Decisions Log

| # | Question / decision | Status |
|---|---|---|
| 1 | Retention windows — unclaimed-card (60d) and registers (10y): confirm per jurisdiction | **Open** — Risk/Compliance |
| 2 | Green-PIN vs physical PIN mailer per product/program | **Open** — Product |
| 3 | Courier live-tracking integration in Phase 1 vs Phase 3 | **Decided** — Phase 3 |
| 4 | Stock cost ownership (CIM tracks qty + emits cost feed; financial postings stay in Finance) | **Decided** — §3 |
| 5 | ML forecasting engine approach/vendor | **Open** — Phase 4 |
| 6 | Multi-entity / cross-border transfers permitted? | **Open** — Legal |
| 7 | Verification-depth default per product tier (full-scan vs endpoint+count+sample) | **Open** — Ops/Risk |

---

## 24. Glossary

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

## 25. Revision History

| Version | Date | Author | Summary |
|---|---|---|---|
| 1.x | — | — | Initial drafts (superseded) |
| 2.0 | Jun 2026 | Product / Eng | Consolidated requirements baseline |
| 2.1 | 15 Jun 2026 | Product / Eng | Added end-to-end flows **G–P** (destruction, exception lifecycle, lost/stolen incident, physical verification, inter-branch transfer, PIN-mailer reconciliation, custodian handover, configuration change, branch onboarding, CIM↔Issuance reconciliation). New sections: **20** Resilience/Offline & Edge-Cases, **21** Assumptions/Constraints/Dependencies, **22** Risks & Mitigations, **23** Open Questions & Decisions Log, **25** Revision History. Added subsections: exception severity/SLA & escalation matrix (§8.10), notifications & alerts (§8.13), RACI matrix (§13), core data dictionary (§15), accessibility & WCAG standards (§17), test & UAT strategy (§19). TOC and version updated. |
| 2.2 | 17 Jun 2026 | Product / Eng | **Demand forecasting & usage patterns** implemented in the prototype (product-level, per branch) and documented: expanded §7 forecasting metrics with the formulas (SMA/WMA/SES/Holt/Holt-Winters, MAPE/MAE/RMSE/bias, trend, CV, ABC/XYZ, Syntetos–Boylan, day-of-week seasonality, forecast-driven SS/ROP), rewrote **§8.9** as Demand forecasting & usage patterns, added **Flow Q**, and extended §16/§17 (Branch profile shows demand & forecast + day-of-week usage pattern). |

---

*End of document — Card Inventory Management Module, Consolidated Requirements v2.2.*
