# Card Inventory Management — UX Demo

An interactive prototype of the Card Inventory Management (CIM) module for a card
management system: dashboards, branch & product statistics, ordering and vendor
tracking, goods receipt (GRN), branch transfers, in-transit shipment tracking,
custodian day book, personalised card collection, replenishment, exceptions and
serial trace. All data is **demo data held in memory** — nothing is persisted.

Built with React 18 + Vite, styled with Tailwind CSS, charts via Recharts,
icons via lucide-react.

---

## Run locally

Requires Node.js 18 or newer.

```bash
npm install
npm run dev
```

Open the URL Vite prints (default http://localhost:5173).

## Production build

```bash
npm run build      # outputs static files to ./dist
npm run preview    # serve the built ./dist locally to verify
```

---

## Push to GitHub

This project is meant to live at:
https://github.com/nileshpardeshi/cardInventory.git

From inside this folder:

```bash
git init
git add .
git commit -m "Card Inventory Management UX demo"
git branch -M main
git remote add origin https://github.com/nileshpardeshi/cardInventory.git
git push -u origin main
```

If the remote already has commits, pull/rebase first:
`git pull --rebase origin main` then push.

---

## Deploy on Vercel

**Option A — from GitHub (recommended):**
1. Go to https://vercel.com and sign in with GitHub.
2. **Add New → Project**, select the `cardInventory` repo.
3. Vercel auto-detects Vite (build `npm run build`, output `dist`). Click **Deploy**.
4. You get a public URL like `cardinventory.vercel.app` — open it from any device.

**Option B — Vercel CLI (no GitHub needed):**
```bash
npm install -g vercel
vercel          # first deploy (answer prompts, accept defaults)
vercel --prod   # promote to the production URL
```

A `vercel.json` is included so SPA routing and the Vite build are configured.

---

## Project structure

```
cardInventory/
├─ index.html                  # Vite HTML entry
├─ package.json                # scripts + dependencies
├─ vite.config.js              # React plugin
├─ tailwind.config.js          # Tailwind content paths
├─ postcss.config.js           # Tailwind + autoprefixer
├─ vercel.json                 # Vercel build / SPA config
├─ .gitignore
└─ src/
   ├─ main.jsx                 # mounts the component
   ├─ index.css                # Tailwind directives
   └─ CardInventoryDemo.jsx    # the full demo component
```

## Notes

- Tailwind is pinned to v3 and lucide-react to 0.383.0 to match the component.
- No backend, no API calls, no browser storage — safe to host as a static site.
