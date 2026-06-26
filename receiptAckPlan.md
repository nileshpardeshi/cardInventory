# Receipt & Acknowledgement (R&A) — Detailed Design Plan

| | |
|---|---|
| **Document** | Receipt & Acknowledgement (Card Order GRN) — UX & Functional Design Plan |
| **Status** | **APPROVED — IN BUILD** (pregen scope; personalised deferred) |
| **Version** | 0.2 |
| **Date** | 27 June 2026 |
| **Module** | Card Inventory Management (CIM) → *Receipt & Acknowledgement* |
| **Relates to** | `cardInventoryRequirement.md` §5 (identifier hierarchy), §6 (state model), §8.4 (GRN), §10 (PIN mailer), §11 Flows A / H / K |
| **Author** | Product / Eng (drafted with Claude) |

> This plan answers every question raised in the brief, designs the end-to-end UX (with submenus, two-stage flow, and a discrepancy register), gives realistic dummy data and flow diagrams, lists edge cases, and ends with **improvements & suggestions / my comments**. Please review before implementation.

---

## Table of contents
1. Understanding the requirement (playback)
2. Part A — Real-world research: how embossing vendors print, pack, dispatch & notify
3. Part B — The identification problem: how a branch finds the order to receive
4. Part C — Two-stage receipt & acknowledgement flow
5. Part D — Discrepancy tracking design
6. Part E — Inter-branch transfer receipt (CR number) & gap analysis
7. Part F — UX design: screens, submenus, wireframes
8. Part G — Data model & dummy data
9. Part H — Edge cases
10. Part I — Status / state machine
11. Part J — Implementation plan (phased)
12. Part K — Alignment with the requirements doc
13. Improvements, suggestions & my comments
14. Glossary (key terms)

---

## 1. Understanding the requirement (playback)

To confirm I've understood the business flow before designing:

```mermaid
flowchart LR
  A["Branch raises pregen card requests<br/>each gets a Service Request no.<br/>SR-565757576 / 577 / 578 ..."] --> B{Approved?}
  B -- yes --> C["EOD batch (scheduler)<br/>Job Execution ID = 3466<br/>tags all today's approved SRs"]
  C --> D["Embossing files generated<br/>split by product / branch / both<br/>(header • body • footer, PGP-encrypted)<br/>Job Exec ID 3466 in HEADER"]
  C --> E[("Expected Receipts<br/>auto-created by CMS:<br/>Job 3466 × Branch × Product<br/>knows SR list + qty + ranges")]
  D --> F[Vendor decrypts with its key & personalises plastic]
  F --> G["Re-sort personalised cards by<br/>DESTINATION BRANCH → pack cartons + tamper seals"]
  G --> H["Dispatch (secure courier)<br/>+ delivery challan/cover letter<br/>+ Dispatch Advice / ASN (if capable)"]
  H --> I["Branch Stage-1 gate receipt<br/>status = Received – Pending Ack"]
  I --> J["Custodian Stage-2 verification<br/>(dual custody) count per SR/lot"]
  J -->|clean| K["IN_BRANCH_VAULT<br/>ready for issuance"]
  J -->|variance| L["Discrepancy case<br/>+ Quarantine"]
  E -. "matches & pre-populates" .-> I
```

**Key facts captured from the brief**

- A **Service Request (SR)** = one approved card-order request. Many per day.
- The **EOD batch** assigns one **Job Execution ID** (e.g. `3466`) to *all* of that day's approved SRs and writes it into the **header** of every embossing file it produces.
- Embossing files are **split** by `product` / `branch` / `product+branch` per the bank's **split config**, are sectioned **header / body / footer**, and are **PGP-encrypted** with the vendor's key.
- The vendor prints, then **ships cards to each branch**.
- The branch must **receive & acknowledge** card orders arriving via **two mediums**:
  1. **Embossing vendor** (carries **Job Execution ID** + optional shipment details).
  2. **Inter-branch transfer** (from Central Vault / HQ / neighbouring branch), each carrying a **CR — Change Request — number**.
- Receipt is **two-stage**: (1) *Received – Pending Acknowledgement* → (2) *In_Branch_Vault* after custodian count/verification, capturing **discrepancies** (excess / short / tampered / missing / etc.) against each **SR / lot**.

A crucial property I will lean on throughout: **the CMS already owns the `SR → Job → Branch → Product → Qty → serial-range` mapping** the moment the batch runs. The vendor never needs SR numbers. This is the key that unlocks the search/identification problem (Part B).

---

## 2. Part A — Real-world research: how embossing vendors print, pack, dispatch & notify

This section answers each question from the brief with how it actually works at card-personalisation bureaus (IDEMIA, Thales, G+D, Perfect Plastic, etc.), governed by **PCI Card Production & Provisioning** (physical + logical security) and, for India, RBI card-issuance/outsourcing guidance.

### 2.1 The embossing file is a *production input*, not a *shipping unit*

The split config decides how many **data files** the bureau receives and what each contains. But **physical packing & dispatch are always reorganised by destination branch**, because cards must physically arrive at specific branches. A *file* is an accounting/production unit; a *carton to a branch* is the logistics unit. They reconcile on the **dispatch advice / packing list**.

| Split config | Files produced | How the bureau packs & dispatches |
|---|---|---|
| **Branch only** | 1 file per branch (mixed products) | 1 logical consignment per branch; products banded as sub-lots inside the branch carton. Cleanest 1:1 file→branch. |
| **Product only** | 1 file per product, **covering all branches** | Bureau personalises the whole product run, then **sorts by branch** and packs **N branch cartons from the one file**. One file *fans out* to many cartons/branches. |
| **Product + branch** | 1 file per (product × branch) | 1 carton per file — the tidiest mapping; each carton = one file = one (branch, product) lot. |

> **Realistic example.** Bank uses **product+branch** split. Job `3466` produced `EMF-2026-0461` (Pune Camp × DEB-CLS, 750) and `EMF-2026-0462` (Pune Camp × DEB-PLT, 250). The bureau personalises both, packs **CTN-77** (DEB-CLS, 750, seal `SEAL-44821`) and **CTN-78** (DEB-PLT, 250, seal `SEAL-44822`), bands them onto one pallet for Pune Camp, and dispatches both under one AWB.

### 2.2 Packing & the cover letter — **yes, always**

Per PCI Card Production, every secure consignment is **tamper-evident sealed** and accompanied by a **delivery challan / packing list / cover note** (and a chain-of-custody manifest). It typically lists:

- Vendor, dispatch date/time, destination **branch code & address**
- **Courier & AWB / waybill**, number of cartons, total weight
- **Per carton:** carton ID, **tamper-evident seal number**, product, **batch / Job Execution ID reference**, **quantity**, **serial/kit range** (from–to)
- A **declared grand total** the receiver signs against
- Often a **2D barcode / QR** on each carton encoding `{branch, job, carton, seal, qty}` for scan-based receipt

> **Recommendation (carried to Part B & §13):** the bank should *mandate in the vendor SOW* that the **Job Execution ID is printed on the cover letter and carton label**. It is already in the file header the vendor holds, so even a low-tech vendor can do this — and it becomes the reliable receipt key.

### 2.3 Dispatch

Secure logistics: tamper-evident cartons, **bonded / secure courier** (CIT-style for high value), one **AWB per consignment**, often GPS-tracked, **ID-verified handover** at the branch. The PCI Card Production *physical* standard adds explicit secure-transport / chain-of-custody criteria across road, rail, sea and air.

### 2.4 How the vendor notifies the bank — Dispatch Advice / ASN

The standard mechanism is a **Dispatch Advice / Advance Shipping Notice (ASN)** — the retail/manufacturing world's **EDI 856** (EDIFACT equivalent **DESADV**). It is **hierarchical**, which maps perfectly onto card receipt:

```
Shipment (AWB, courier, dispatch date, ETA)
  └─ Order / Job  (Job Execution ID 3466, embossing file ref)
       └─ Pack / Carton  (CTN-77, seal SEAL-44821)
            └─ Item  (product DEB-CLS, qty 750, serial 78112001–78112750)
```

**Should the CMS expose an API for this?** **Yes — but as one of several ingestion modes**, because vendor capability varies:

| Mode | When | Identifier the vendor sends |
|---|---|---|
| **API** `POST /inventory/v1/dispatch-advices` | Mature vendors | Job Exec ID + branch + carton/seal + qty + ranges + AWB |
| **SFTP / EDI 856 / DESADV** file drop | EDI-capable vendors | same, as a structured file |
| **Vendor portal** (manual web form) | Mid-tier vendors | same, keyed by hand |
| **Manual / no ASN** | Low-tech vendors | *nothing electronic* — only the paper challan travels |

**Which unique identifier do they update against?** The **Job Execution ID** (the guaranteed common thread, already in the file header) **+ destination branch + carton/seal**, optionally AWB. **They do NOT reference SR numbers** — SRs are not in a form the vendor tracks per shipment, and the bank doesn't need them to (it resolves SR↔Job internally — see Part B).

### 2.5 How banks accept & verify — realistic example

> **Pune Camp, 19 Jun 2026.** A secure courier delivers 2 sealed cartons for Job `3466`. The **receiving officer (Stage 1)** checks AWB vs challan, counts **2 cartons**, confirms **seals intact**, and signs for a **declared 1,000** cards → system marks both lots **Received – Pending Acknowledgement**. The parcel goes to the **receiving bay (not the vault)**.
> Later, the **custodian + a second officer (Stage 2, dual custody)** open the cartons in the strong-room, scan/count by serial range: **DEB-CLS counts 748 against 750** (2 short), **DEB-PLT = 250 (clean)**. They accept **998 into the vault** (`IN_BRANCH_VAULT`), **quarantine the shortfall**, and raise **discrepancy DISC-2026-0007 (SHORT, 2, SR-565757578)** → vendor claim. The job line for the 2 short cards stays **open**.

### 2.6 Answers to the brief's questions (quick reference)

| # | Question | Answer (short) |
|---|---|---|
| 1 | Print/dispatch when split is product-wise across branches? | File = production unit; bureau **re-sorts by branch** to pack. One product file → N branch cartons. (§2.1) |
| 2 | Is there a cover letter? | **Yes** — delivery challan / packing list + chain-of-custody manifest with carton/seal/qty/range and **Job Exec ID**. (§2.2) |
| 3 | How do they dispatch? | Sealed cartons, secure/bonded courier, AWB, ID-verified handover (PCI Card Production). (§2.3) |
| 4 | How do they update shipment details? | **Dispatch Advice / ASN** — API / SFTP-EDI / portal / manual. (§2.4) |
| 5 | Must CMS expose an API? | **Yes, plus SFTP/portal/manual fallbacks** — vendor capability varies. (§2.4) |
| 6 | Update against which identifier? | **Job Execution ID + branch + carton/seal (+AWB)** — **not** SR. (§2.4, Part B) |
| 7 | How do banks accept & verify? | **Two-stage GRN** under dual custody, 3-way match, discrepancy capture. (§2.5, Part C) |

---

## 3. Part B — The identification problem: how a branch finds the order to receive

This is the brief's central concern: *"1,000 cards arrive — how does the user search which order to mark received?"* and *"job id vs shipment id — but not all banks get shipment updates, and SR is not in the embossing file."*

### 3.1 The insight that resolves it

> **The CMS created the `SR → Job → Branch → Product → Qty → serial-range` map at batch time.** So the system can generate an **Expected Receipt (Inbound Manifest)** *the moment the batch runs* — with **zero vendor input**. The vendor only ever has to quote the **Job Execution ID + branch** (both already on the file header / cover letter).

### 3.2 The "Expected Receipt" object

When Job `3466` runs, CMS auto-creates one Expected Receipt **per (Job × Branch × Product / embossing file)**:

| Field | Example |
|---|---|
| `expectedReceiptId` | `ER-2026-3466-PUN01-CLS` |
| `source` | `VENDOR` |
| `jobExecId` | `3466` |
| `embossingFile` | `EMF-2026-0461` |
| `branch` | `PUN01` (Pune Camp) |
| `product` | `DEB-CLS` |
| `srList` | `SR-565757576 (600)`, `SR-565757578 (150)` |
| `expectedQty` | `750` |
| `serialRange` | `KIT-78112001 – 78112750` |
| `asn` | *(filled later if vendor sends one)* `SHP-2026-0951 / AWB BLR-7781234 / CTN-77 / SEAL-44821` |
| `status` | `AWAITING_DISPATCH → IN_TRANSIT → RECEIVED_PENDING_ACK → IN_BRANCH_VAULT` |

### 3.3 Recommended search/lookup — a tiered key, anchored on Job + Branch

```mermaid
flowchart TD
  Start([Cards arrive at branch]) --> Q1{ASN / shipment<br/>on file?}
  Q1 -- yes --> S1["Search by Shipment/ASN ID or AWB or Carton/Seal<br/>→ auto-resolves to Expected Receipts"]
  Q1 -- no --> Q2{Vendor or transfer?}
  Q2 -- vendor --> S2["Search by JOB EXEC ID + BRANCH (+product)<br/>★ always works — system owns the map"]
  Q2 -- transfer --> S3["Search by CR NUMBER<br/>(full contents known internally)"]
  S1 --> P[Pick matching Expected Receipt rows from worklist]
  S2 --> P
  S3 --> P
  P --> R[Proceed to Stage-1 gate receipt]
  Note[/"Fallback: branch 'Inbound worklist' lists all open<br/>expected receipts for this branch — pick, don't type"/] -.-> P
```

**Decision: primary key = `Job Execution ID + Branch` (optionally + Product).** Rationale:

- **Always available** — the Job Exec ID is the guaranteed common thread (file header → cover letter). Branch is where the cards physically are.
- **Independent of vendor capability** — works even when the bank gets **no ASN** (the system pre-built the expected receipts).
- **Shipment/ASN/AWB/Carton-seal** become *enhanced* keys that **auto-match** to the same expected receipts when present — smoother, scan-friendly, but never *required*.
- **CR number** is the analogous key for transfers.
- **Zero-typing fallback:** the branch's **Inbound Worklist** simply lists every open expected receipt for that branch, so the user can pick rather than search.

> **This directly resolves the brief's dilemma:** banks *with* shipment updates get the richer ASN-driven path; banks *without* still find everything by Job + Branch, because the system — not the vendor — is the source of the expected-receipt data. SR numbers never need to leave the bank.

---

## 4. Part C — Two-stage receipt & acknowledgement flow

### 4.1 Is the proposed two-stage flow standard? **Yes — and it's the right control.**

It matches PCI Card Production dual-control/chain-of-custody and `cardInventoryRequirement.md` §8.4 (two-step acceptance). I propose only refinements (roles, segregation of duties, partial acceptance, quarantine).

```mermaid
sequenceDiagram
  actor V as Vendor / Sender
  actor R as Receiving Officer (Stage 1)
  actor C as Custodian + Checker (Stage 2, dual custody)
  participant S as CMS / CIM
  V->>R: Deliver sealed cartons + challan (Job 3466 / CR-…)
  R->>S: Search Job ID + Branch (or ASN / CR) → Expected Receipt
  S-->>R: Expected qty, cartons, serial ranges
  R->>S: Confirm carton count, seal integrity, declared qty
  S-->>R: status = RECEIVED_PENDING_ACK (parcel → receiving bay)
  Note over C: different person from Stage 1 (SoD)
  C->>S: Open verification under dual custody
  C->>S: Count per SR / lot, 3-way match (expected vs challan vs physical)
  alt all match
    C->>S: Accept clean qty into vault
    S-->>C: status = IN_BRANCH_VAULT (issuable)
  else variance
    C->>S: Record discrepancy (reason, qty, SR/lot, evidence)
    S-->>C: clean qty → vault; variance → QUARANTINED + Discrepancy case
    Note over S: job/SR line stays OPEN for the shortfall
  end
```

### 4.2 Stage definitions

| | **Stage 1 — Gate / mailroom receipt** | **Stage 2 — Custodian vault verification** |
|---|---|---|
| **Who** | Receiving officer | Custodian **+ second officer** (dual custody); **≠ Stage-1 person** (SoD) |
| **Action** | Count cartons, check **seals**, AWB vs challan, sign for **declared qty** | Open cartons, **count cards by serial range per SR/lot**, 3-way match |
| **Granularity** | Carton / consignment level | **SR / lot / serial-range level** |
| **Outcome status** | `RECEIVED_PENDING_ACK` | `IN_BRANCH_VAULT` (clean) · `PARTIALLY_ACCEPTED` · `QUARANTINED` (variance) |
| **Location** | Receiving bay (not vault) | Strong-room / vault |
| **Discrepancies** | Only gross (missing carton, broken seal) | Detailed (short, excess, missing serial, damaged, wrong product…) |

> **Status mapping to the requirements doc:** the brief's `In_Branch_Vault` = doc's `AT_BRANCH` / `IN_VAULT`. I'll use **`IN_BRANCH_VAULT`** in the UI (the user's term) and note the mapping in §K.

### 4.3 Refinements I recommend

1. **Segregation of duties** — Stage-1 receiver cannot be the Stage-2 verifier/checker (system-enforced).
2. **Partial acceptance** — accept the good, quarantine the bad, keep the SR/job line **open** for the shortfall; supports **split shipments** (one job arriving over several days).
3. **"Subject to verification"** — Stage-1 acknowledgement is provisional; a **latent-discrepancy window** lets post-GRN shortages still be claimed against the vendor.
4. **Blind count option** at Stage 2 (hide expected qty from the counter) for high-value lots.
5. **Day-close interaction** — a branch shouldn't day-close with parcels stuck in `RECEIVED_PENDING_ACK` (raise an exception).

---

## 5. Part D — Discrepancy tracking design

The brief: *"we don't have any screen for discrepancies — suggest and implement."*

### 5.1 Approach — a **Discrepancy Register** that feeds the existing Exception engine

Rather than a silo, each discrepancy is a **case** captured at Stage-2, linked to **SR + lot + receipt**, that **auto-creates/links an Exception** (the app already has an Exceptions screen with severity/SLA/escalation). The Discrepancy Register is the *receipt-centric* view; Exceptions remains the *enterprise* view. This reuses existing infrastructure.

### 5.2 Discrepancy record (data model)

| Field | Example |
|---|---|
| `discId` | `DISC-2026-0007` |
| `raisedAt` / `raisedBy` | `19 Jun 2026 14:20 · P. Deshmukh` |
| `source` | `VENDOR` (or `TRANSFER`) |
| `ref` | `Job 3466` (or `CR-2026-0312`) |
| `embossingFile` / `carton` | `EMF-2026-0461` / `CTN-77` |
| `branch` / `product` | `PUN01` / `DEB-CLS` |
| `srNumber` / `lot` | `SR-565757578` / `KIT-78112601–78112750` |
| `reasonCode` | `SHORT` |
| `expectedQty` / `receivedQty` / `varianceQty` | `750 / 748 / −2` |
| `severity` | `High` |
| `status` | `Open → Investigating → Resolved → Closed` |
| `owner` / `slaDueAt` | `Custodian` / `+2 business days` |
| `resolutionCode` | `VENDOR_RESHIP` / `VENDOR_CREDIT` / `WRITE_OFF` / `FOUND_ON_RECOUNT` / `ACCEPTED_DEVIATION` |
| `linkedExceptionId` | `EXC-2026-4471` |
| `evidence` / `notes` | seal photo ref, CCTV ref, vendor email |

### 5.3 Standard reason codes

`SHORT` · `EXCESS` · `TAMPERED_SEAL` · `TAMPERED_ENVELOPE` · `CARD_MISSING` (specific serial) · `DAMAGED` · `MISPRINT` · `WRONG_PRODUCT` · `WRONG_BRANCH` · `SERIAL_MISMATCH` · `DUPLICATE_SERIAL` · `MISSING_PIN_MAILER` · `LATE_DELIVERY` · `ASN_MISMATCH`.

### 5.4 Discrepancy lifecycle

```mermaid
stateDiagram-v2
  [*] --> Open: raised at Stage-2 verify
  Open --> Investigating: owner assigned, evidence gathered
  Investigating --> Resolved: resolution code set\n(reship / credit / write-off / found / deviation)
  Resolved --> Closed: clean-up done\n(quarantine released / written off / re-received)
  Investigating --> Open: reopened (new info)
  Closed --> [*]
```

> **Example.** `DISC-2026-0007` (SHORT 2, SR-565757578) opens as **High**, links `EXC-2026-4471`, owner = custodian, SLA 2 days. Vendor confirms a pick-pack miss → **VENDOR_RESHIP**; 2 cards arrive next cycle as a tiny new receipt; on acceptance the case → **Closed**, the SR line balances.

---

## 6. Part E — Inter-branch transfer receipt (CR number) & gap analysis

### 6.1 Flow (mirrors the vendor flow; **easier**, because the system fully owns the contents)

```mermaid
flowchart LR
  A["Transfer raised → CR-2026-0312<br/>(Central Vault → Pune Hinjawadi)"] --> B[Maker-checker approval at sender]
  B --> C["Source stock → RESERVED → IN_TRANSIT<br/>(serial ranges locked)"]
  C --> D[Dispatch under dual custody + challan]
  D --> E["Receiver searches by CR NUMBER<br/>Expected Receipt already complete"]
  E --> F[Stage-1 gate receipt → RECEIVED_PENDING_ACK]
  F --> G[Stage-2 verify per lot]
  G -->|clean| H[IN_BRANCH_VAULT]
  G -->|variance| I[Discrepancy + Quarantine]
  H -. "reconciles sender dispatch-out vs receiver GRN-in" .-> A
```

### 6.2 Gaps I see in the CR flow (and fixes)

| Gap | Risk | Fix |
|---|---|---|
| **Source not decremented on dispatch** | Same stock issued twice (sender + receiver) | On CR approve/dispatch, move source stock to `RESERVED`→`IN_TRANSIT`; receiver GRN moves it to their `IN_BRANCH_VAULT`. **Conservation of serials** end-to-end. |
| **No two-sided reconciliation** | "Dispatched but never received" goes unnoticed | Link sender **dispatch-out** to receiver **GRN-in**; **in-transit-overdue** escalation if not received by ETA (app already has In-transit + overdue). |
| **CR carries qty only, not serial ranges** | Can't trace which kits moved | CR **must carry serial/kit ranges** (internal transfer → fully known). Receipt verifies by range. |
| **Mixed provenance** | A neighbour-branch transfer may bundle leftover vendor stock | Preserve **per-lot provenance** (which job/CR each lot came from) so trace/aging survive the hop. |
| **Status divergence** | Two different receipt UIs for vendor vs transfer | **Unify** both under one Inbound model with a `source` discriminator (`VENDOR` | `TRANSFER`) and the *same* two statuses. One worklist, one Stage-1/Stage-2, one discrepancy register. |
| **PIN mailer separation** | If personalised stock transfers, card+PIN could travel together | Keep PIN-mailer separation rule (usually pregen transfers carry no PIN; flag if they do). |

**Verdict:** the CR flow is sound and, because contents are internally known, the receipt is actually *simpler* than the vendor case. The main work is **stock conservation at the source** and **unifying the UI** with the vendor path.

---

## 7. Part F — UX design: screens, submenus, wireframes

### 7.1 Information architecture

Rename the existing **"Receive (GRN)"** nav item to **"Receipt & Acknowledgement"**, with **internal tabs** (the app already uses tabs in *Branch & product stats*, and modals in *Collection* / *Custodian* — I'll follow those patterns):

```
Receipt & Acknowledgement   (sidebar item; badge = count Pending-Ack)
├─ Tab 1: Inbound worklist      ← search + pick (default)
├─ Tab 2: Discrepancies         ← register + case detail
└─ Tab 3: Completed GRNs        ← acknowledgement document archive
   Actions launched from a worklist row:
     • Stage-1 gate receipt   (drawer/modal)
     • Stage-2 vault verify   (full-width panel)
```

### 7.2 Wireframe — **Tab 1: Inbound worklist** (search + pick hub)

```
┌ Receipt & Acknowledgement ─────────────────────────────────────────────────┐
│ [ Inbound worklist ] [ Discrepancies ] [ Completed GRNs ]                    │
│                                                                              │
│ Source: (•) All ( ) Vendor ( ) Transfer    Branch: [Pune Camp ▼]            │
│ Search: [ Job 3466 / ASN / CR / AWB …          🔍 ]   Status: [All ▼]       │
│                                                                              │
│ ┌──────────────────────────────────────────────────────────────────────┐  │
│ │ Ref          Source   Product  Exp.Qty  Serial range        Status     │  │
│ │ Job 3466     Vendor   DEB-CLS    750     78112001–78112750   ● In transit│ │
│ │ Job 3466     Vendor   DEB-PLT    250     78120001–78120250   ● In transit│ │
│ │ CR-2026-0312 Transfer DEB-CLS    300     90011–90310         ● Pending Ack│ │  ← [Verify →]
│ │ Job 3460     Vendor   PPD-GFT    400     61500–61899         ● In Vault ✓ │ │
│ └──────────────────────────────────────────────────────────────────────┘  │
│  Inbound today: 4 docs (1,700 cards) · Pending Ack: 1 · Awaiting verify: 1  │
└──────────────────────────────────────────────────────────────────────────┘
   row action by status:  In transit → [Receive] · Pending Ack → [Verify] · In Vault → [GRN]
```

### 7.3 Wireframe — **Stage-1 gate receipt** (drawer)

```
┌ Stage 1 · Gate receipt — Job 3466 · Pune Camp ─────────────────────────┐
│ Expected: 2 cartons · 1,000 cards (DEB-CLS 750, DEB-PLT 250)            │
│ Cover letter / challan no.: [ DC-77231        ]   AWB: [ BLR-7781234 ] │
│ Cartons received:  [ 2 ]   Seals intact?  (•) Yes ( ) No → reason ___  │
│ Declared qty on challan: [ 1000 ]                                      │
│ Received by: P. Deshmukh (auto)   Time: 19 Jun 2026 11:05 (auto)       │
│                                                                        │
│ ⚠ Gate-level issue? [+ Missing carton] [+ Broken seal] [+ Wrong branch]│
│                                                                        │
│           [ Cancel ]                 [ Confirm receipt → Pending Ack ] │
└────────────────────────────────────────────────────────────────────────┘
```

### 7.4 Wireframe — **Stage-2 custodian verification** (per-SR/lot count + discrepancy)

```
┌ Stage 2 · Vault verification (dual custody) — Job 3466 · Pune Camp ─────────┐
│ Custodian: P. Deshmukh    Joint officer: B. Patil    [☐ Blind count]        │
│                                                                             │
│ ┌ SR / lot table ──────────────────────────────────────────────────────┐  │
│ │ SR             Product  Serial range        Exp.  Counted  Δ   Reason   │ │
│ │ SR-565757576   DEB-CLS  78112001–78112600   600   [600]    0   —        │ │
│ │ SR-565757578   DEB-CLS  78112601–78112750   150   [148]   −2   [SHORT▼] │ │
│ │ SR-565757577   DEB-PLT  78120001–78120250   250   [250]    0   —        │ │
│ └────────────────────────────────────────────────────────────────────────┘│
│ Clean to vault: 998   Quarantine: 2   Discrepancies: 1                     │
│ Checker sign-off: [ B. Patil ▼ ]  (must differ from receiver)              │
│                                                                             │
│        [ Save draft ]        [ Raise discrepancy ]   [ Accept → In Vault ] │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 7.5 Wireframe — **Tab 2: Discrepancy register**

```
┌ Discrepancies ──────────────────────────────────────────────────────────────┐
│ Filter: [Open ▼]  Source:[All ▼]  Reason:[All ▼]   Linked exceptions: 3      │
│ ┌────────────────────────────────────────────────────────────────────────┐ │
│ │ ID            Ref     SR/Lot          Reason   Δ    Sev   Status    SLA  │ │
│ │ DISC-2026-0007 Job3466 SR-565757578   SHORT    −2   High  Open      1d   │ │
│ │ DISC-2026-0006 CR-0312 CTN-91         TAMPERED  —   High  Investig. 4h   │ │
│ │ DISC-2026-0005 Job3460 SR-565700912   EXCESS   +5   Med   Resolved  —    │ │
│ └────────────────────────────────────────────────────────────────────────┘ │
│ ▸ click a row → detail drawer: timeline, evidence, resolution, linked EXC   │
└───────────────────────────────────────────────────────────────────────────────┘
```

### 7.6 Component breakdown (React, matching existing conventions)

- `ReceiptAck` (new top-level view; replaces/absorbs `Receiving`) — holds the 3 tabs + worklist state.
- `InboundWorklist`, `Stage1ReceiptDrawer`, `Stage2VerifyPanel`, `DiscrepancyRegister`, `DiscrepancyDetailDrawer`, `GrnDocument`.
- Reuse primitives: `Card`, `Kpi`, `Badge`, `SectionTitle`, `Th`, `Td`; reuse `addException`/`toast`; reuse `Cell`/charts if a small "inbound by status" donut is wanted.
- All in `CardInventoryDemo.jsx` (consistent with the single-file pattern) or a new `src/components/ReceiptAck.jsx` if we want to start modularising (decision for review — see §13).

---

## 8. Part G — Data model & dummy data

### 8.1 New constants (deterministic, in-memory — same style as existing demo data)

```text
EMBOSSING_JOBS = [
  { jobExecId:"3466", runDate:"16 Jun 2026", vendor:"SecurePrint Card Co.",
    split:"product+branch", files:["EMF-2026-0461","EMF-2026-0462", ...] }
]

SERVICE_REQUESTS = [
  { sr:"SR-565757576", branch:"PUN01", product:"DEB-CLS", qty:600, jobExecId:"3466",
    file:"EMF-2026-0461", serialFrom:"KIT-78112001", serialTo:"KIT-78112600", status:"IN_TRANSIT" },
  { sr:"SR-565757578", branch:"PUN01", product:"DEB-CLS", qty:150, jobExecId:"3466",
    file:"EMF-2026-0461", serialFrom:"KIT-78112601", serialTo:"KIT-78112750", status:"IN_TRANSIT" },
  { sr:"SR-565757577", branch:"PUN01", product:"DEB-PLT", qty:250, jobExecId:"3466",
    file:"EMF-2026-0462", serialFrom:"KIT-78120001", serialTo:"KIT-78120250", status:"IN_TRANSIT" },
  ... (more SRs for other branches under the same job)
]

EXPECTED_RECEIPTS = [
  { id:"ER-3466-PUN01-CLS", source:"VENDOR", jobExecId:"3466", file:"EMF-2026-0461",
    branch:"PUN01", product:"DEB-CLS", srList:["SR-565757576","SR-565757578"],
    expectedQty:750, serialRange:"KIT-78112001–78112750",
    asn:{ shipment:"SHP-2026-0951", awb:"BLR-7781234", carton:"CTN-77", seal:"SEAL-44821",
          courier:"SecureLogistics", dispatched:"17 Jun", eta:"19 Jun" },
    status:"IN_TRANSIT" },
  { id:"ER-3466-PUN01-PLT", source:"VENDOR", jobExecId:"3466", file:"EMF-2026-0462",
    branch:"PUN01", product:"DEB-PLT", srList:["SR-565757577"], expectedQty:250,
    serialRange:"KIT-78120001–78120250",
    asn:{ ...CTN-78 / SEAL-44822... }, status:"IN_TRANSIT" },
  { id:"ER-CR0312-PUN02-CLS", source:"TRANSFER", crNumber:"CR-2026-0312",
    from:"Central Vault", branch:"PUN02", product:"DEB-CLS", expectedQty:300,
    serialRange:"KIT-90011–90310", status:"RECEIVED_PENDING_ACK" },
]

DISCREPANCY_REASONS = ["SHORT","EXCESS","TAMPERED_SEAL","CARD_MISSING","DAMAGED",
  "MISPRINT","WRONG_PRODUCT","WRONG_BRANCH","SERIAL_MISMATCH","DUPLICATE_SERIAL",
  "MISSING_PIN_MAILER","LATE_DELIVERY","ASN_MISMATCH"]

INITIAL_DISCREPANCIES = [
  { discId:"DISC-2026-0007", source:"VENDOR", ref:"3466", file:"EMF-2026-0461",
    branch:"PUN01", product:"DEB-CLS", sr:"SR-565757578", lot:"KIT-78112601–78112750",
    reason:"SHORT", expected:750, received:748, variance:-2, severity:"High",
    status:"Open", owner:"Custodian", sla:"2 business days", linkedException:"EXC-2026-4471" },
  { discId:"DISC-2026-0006", source:"TRANSFER", ref:"CR-2026-0312", branch:"PUN02",
    product:"DEB-CLS", lot:"CTN-91", reason:"TAMPERED_SEAL", severity:"High",
    status:"Investigating", owner:"BM", sla:"4 hours", linkedException:"EXC-2026-4469" },
]
```

### 8.2 Reuse / extend existing demo data
- Extend `INITIAL_GRNS` → the new `EXPECTED_RECEIPTS` + `RECEIPTS` model (keep current GRN cards working).
- Reuse `INITIAL_TRANSFERS` + `INITIAL_SHIPMENTS` for the CR/ASN linkage.
- New discrepancies feed the existing `exceptions` state via `addException`.

---

## 9. Part H — Edge cases (must-handle)

| # | Edge case | Handling |
|---|---|---|
| 1 | **Split shipment** — one job arrives over several days | Partial acceptance; SR/job line stays open; each delivery is its own receipt against the same expected record |
| 2 | **Short / excess** | Discrepancy SHORT/EXCESS; accept matched qty, quarantine variance |
| 3 | **Tampered seal / envelope** | Stage-1 can flag; force Stage-2 full count; high-severity case |
| 4 | **Specific card missing (middle of range)** | CARD_MISSING with the exact serial; range split + lineage preserved |
| 5 | **Wrong branch delivery** | WRONG_BRANCH; reroute / inter-branch transfer to correct branch; don't vault |
| 6 | **Wrong product / misprint / damaged** | Respective reason; quarantine; vendor reship/credit |
| 7 | **Duplicate / mismatched serial** | DUPLICATE_SERIAL / SERIAL_MISMATCH; block from vault; investigate |
| 8 | **No ASN (low-tech vendor)** | Search by Job + Branch; expected receipt already exists |
| 9 | **ASN mismatch vs physical / challan** | ASN_MISMATCH; physical+challan is source of truth, ASN flagged |
| 10 | **Vendor quoted wrong Job ID** | Worklist fallback (browse branch inbound) + manual link to correct expected receipt |
| 11 | **One carton → multiple jobs / one job → multiple cartons** | Carton↔job is many-to-many; receipt operates at expected-receipt (job×branch×product) grain, cartons are evidence |
| 12 | **Receipt while day closed** | Allow gate receipt; block vault posting if day-close rules require, or raise exception |
| 13 | **Receiver = verifier (SoD breach)** | System blocks; checker must differ |
| 14 | **PIN mailer (personalised)** | Separate consignment, separate count, MISSING_PIN_MAILER reason; never co-located with cards |
| 15 | **In-transit overdue** | Escalation exception before receipt even happens (links to In-transit screen) |
| 16 | **Re-open after partial** | Shortfall remains open; later delivery closes it |

---

## 10. Part I — Status / state machine (receipt sub-states)

```mermaid
stateDiagram-v2
  [*] --> AWAITING_DISPATCH: Expected Receipt created at batch
  AWAITING_DISPATCH --> IN_TRANSIT: dispatched (ASN or transfer dispatch)
  IN_TRANSIT --> RECEIVED_PENDING_ACK: Stage-1 gate receipt
  RECEIVED_PENDING_ACK --> IN_BRANCH_VAULT: Stage-2 verified clean
  RECEIVED_PENDING_ACK --> PARTIALLY_ACCEPTED: some clean, some variance
  RECEIVED_PENDING_ACK --> QUARANTINED: held (tamper / investigation)
  PARTIALLY_ACCEPTED --> IN_BRANCH_VAULT: shortfall later received & cleared
  QUARANTINED --> IN_BRANCH_VAULT: discrepancy resolved (re-received)
  QUARANTINED --> WRITTEN_OFF: discrepancy resolved (write-off)
  IN_BRANCH_VAULT --> [*]
  WRITTEN_OFF --> [*]
```

Aligns with `cardInventoryRequirement.md` §6 (`RECEIVED_PENDING_ACK` → `AT_BRANCH/IN_VAULT`; `QUARANTINED`/`BLOCKED`).

---

## 11. Part J — Implementation plan (phased — to start after your review)

| Phase | Scope | Files |
|---|---|---|
| **J1 — Data** | Add `EMBOSSING_JOBS`, `SERVICE_REQUESTS`, `EXPECTED_RECEIPTS`, `DISCREPANCY_REASONS`, `INITIAL_DISCREPANCIES`; helpers `expectedFor(branch)`, `resolveSRs(jobExecId,branch)` | `CardInventoryDemo.jsx` (or new `src/lib/receipts.js` for pure helpers) |
| **J2 — Worklist + search** | `ReceiptAck` view with tabs; `InboundWorklist` with tiered search (Job+Branch / ASN / CR) + status badges | `CardInventoryDemo.jsx` |
| **J3 — Stage 1** | `Stage1ReceiptDrawer`: carton/seal/declared-qty, → `RECEIVED_PENDING_ACK`; gate-level issues | same |
| **J4 — Stage 2** | `Stage2VerifyPanel`: per-SR/lot count, 3-way match, SoD checker, partial accept, → `IN_BRANCH_VAULT`/quarantine | same |
| **J5 — Discrepancies** | `DiscrepancyRegister` + detail drawer; auto-link `addException`; lifecycle | same |
| **J6 — Transfers (CR)** | Unify CR receipts into the same worklist/stages; source reservation note | same + `Transfers` |
| **J7 — Nav + polish** | Rename nav item, badges (Pending-Ack / discrepancy counts), toasts, KPIs, completed-GRN archive | nav array |
| **J8 — Docs** | Update `cardInventoryRequirement.md` (see §K) once implemented | `cardInventoryRequirement.md` |

> Decision for review: keep everything in the single `CardInventoryDemo.jsx` (current convention) **or** begin extracting `ReceiptAck` into `src/components/` + `src/lib/receipts.js`. My recommendation in §13.

---

## 12. Part K — Alignment with the requirements doc

| Brief term | Requirements-doc term | Action |
|---|---|---|
| Service Request (SR) | (new) order-request grain under order line | Add SR to §5 identifier hierarchy |
| Job Execution ID | Batch run / (new) | Add as the receipt anchor key in §5/§8.4 |
| Embossing file (header/body/footer, PGP) | EMF (§5) | Note sections + encryption |
| `Received – Pending Ack` → `In_Branch_Vault` | §6 `RECEIVED_PENDING_ACK` → `AT_BRANCH/IN_VAULT` | Map terms; keep both |
| CR number (transfer) | TransferOrder (§11 Flow K) | Add CR as the transfer-receipt key |
| Discrepancy register | §8.4 discrepancy + §11 Flow H | New screen realises existing requirement |

**Proposed doc updates (after build):** expand **§8.4** with the two-stage R&A + Expected-Receipt concept; add **SR / Job Exec ID / CR** to **§5**; add a **Flow R — Receipt & acknowledgement (vendor + transfer)**; bump to **v2.3**; add a revision-history row. (Consistent with the "update doc once implementation done" pattern.)

---

## 13. Improvements, suggestions & my comments

**On the core design**
1. **Generate Expected Receipts at batch time** — this is the single most important recommendation. It decouples receipt from vendor capability and makes **Job Exec ID + Branch** a reliable key. Build the demo around this.
2. **Mandate "Job Exec ID on the cover letter & carton label" in the vendor SOW.** Costs the vendor nothing (it's in the file header) and guarantees the receipt key even for the lowest-tech vendor.
3. **Treat ASN as an enhancement, never a dependency.** Support API + SFTP/EDI-856 + portal + manual. When present, ASN auto-matches expected receipts and enables **scan-to-receive** (QR/2D barcode on cartons).
4. **Unify vendor + transfer under one Inbound model** with a `source` discriminator. One worklist, one two-stage flow, one discrepancy register — far less UI and fewer bugs than two parallel paths.

**On controls**
5. **Enforce segregation of duties** (Stage-1 receiver ≠ Stage-2 verifier/checker) and **dual custody** at Stage 2 — both are PCI Card Production expectations and cheap to demo.
6. **Latent-discrepancy window** — let Stage-1 acknowledgement be "subject to verification" so post-GRN shortages remain claimable.
7. **Blind-count toggle** at Stage 2 for high-value lots (hide expected qty).
8. **Conserve serials end-to-end on transfers** — reserve/decrement at source on CR dispatch; the receiver GRN is the only thing that re-creates the stock. Prevents double-issue.

**On discrepancies**
9. **Don't silo discrepancies** — make each one spawn/link an **Exception** (existing engine) so SLA, escalation and reporting come for free.
10. **Capture variance at SR/lot grain**, not just consignment — the brief explicitly needs "which lot/SR has the issue."

**On product/UX**
11. **KPIs worth surfacing:** GRN turnaround (dispatch→vault), discrepancy rate by vendor & by branch, ack-SLA breaches, % received-pending-ack aging. These also feed vendor SLA scorecards (already in the doc).
12. **PIN mailer** stays a separate consignment with its own reconciliation and `MISSING_PIN_MAILER` reason (personalised programs).
13. **Modularisation:** the main file is ~2,100 lines. I suggest extracting this feature into `src/components/ReceiptAck.jsx` + pure helpers in `src/lib/receipts.js`. It keeps the demo maintainable and mirrors what we did for `forecast.js`/`demandSeries.js`. *(Your call — I can also keep it inline to match the current single-file style.)*

**Decisions (confirmed 27 Jun 2026)**
- **A. ✅ Yes** — surface explicit `Partially Accepted` and `Quarantined` sub-states in the UI (needed for real edge cases).
- **B. Keyboard search now; scan-to-receive (QR/barcode) later.** Build the tiered keyboard search (Job + Branch / ASN / CR); leave a clean hook for a future scan facility.
- **C. Pregen now; personalised later.** This build covers pregen vendor + transfer receipts. Personalised card-by-card receipt is a later phase (the discrepancy register is designed to absorb it then).
- **D. Modularise.** New code in `src/components/ReceiptAck.jsx` + `src/components/Discrepancies.jsx`, pure logic/data in `src/lib/receipts.js`; shared UI primitives extracted to `src/components/ui.jsx`.
- **E. Separate top-level nav item** for the Discrepancy register (not a tab), with links to/from Exceptions.

---

---

## 14. Glossary (key terms)

Formal one-liners for the terms used throughout this plan:

- **Dual custody** — A control requiring **two authorised officers to be jointly present and both sign off** before high-value stock (e.g., a card vault) can be opened, accepted, or moved; neither can act alone.
- **ASN — Advance Shipping Notice** (a.k.a. *Dispatch Advice*) — An **electronic notice the dispatching party sends at/before dispatch** declaring exactly what is being shipped (courier, AWB, ETA, cartons, seals, product, quantity, serial ranges) so the receiver can prepare and pre-match before the physical goods arrive.
- **GRN — Goods Receipt Note** — The **controlled record that turns "a consignment arrived" into "stock verified, accepted, and on our books,"** capturing quantity, condition, discrepancies, who received it, and the acceptance decision.
- **EDI 856** — The **ANSI X12 electronic-data-interchange message format used to transmit an ASN** (the EDIFACT equivalent is *DESADV*); hierarchical as **Shipment → Order → Pack → Item**.
- **Maker–checker** — A four-eyes control where one user initiates an action and a **different** authorised user approves it.
- **Segregation of duties (SoD)** — Conflicting responsibilities (here: Stage-1 receiver vs Stage-2 verifier/checker) must be held by **different** people.
- **Expected Receipt (Inbound Manifest)** — A system-generated "what's coming" record created at batch time per *Job × Branch × Product*, listing the SRs, expected quantity and serial range — the demand side a receipt is matched against.
- **SR — Service Request** — One approved card-order request; the grain at which quantity, product and serial range are tracked.
- **Job Execution ID** — The EOD-batch run identifier stamped into every embossing-file header; the **common thread** used as the primary receipt search key.
- **CR — Change Request** — The unique identifier for an inter-branch transfer; the receipt search key for the transfer medium.

---

*End of plan — Receipt & Acknowledgement, v0.2 (approved, in build). Scope: pregen vendor + transfer; personalised deferred.*
