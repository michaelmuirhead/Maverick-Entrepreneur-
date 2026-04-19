# Maverick Entrepreneur

A dynasty business simulator. Build a company, expand into an empire, navigate politics and economic cycles, and chronicle the rise and fall of your holdings across generations.

Built with **Vite + React + TypeScript + Tailwind + Zustand**. Deployable to Vercel via GitHub in under five minutes.

## What's in here

- **6 industries** (coffee, e-commerce, software, fast food, construction, law firm) with materially different economics
- **10 cities** across the US with real rent, labor, and industry-fit multipliers
- **6 founder backgrounds** + **6 traits**, each with mechanical bonuses
- **10 choice-and-consequence event templates** across business, economy, politics, family, and prestige
- **Monthly turn processor** that evolves GDP, interest rates, inflation, consumer confidence, and economic phase
- **Newspaper-style UI** ("The Maverick") with masthead, marquee ticker, and paper-card dashboards
- **LocalStorage save** via Zustand persist middleware — your empire survives browser restarts

## Run locally

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

## Build

```bash
npm run build
npm run preview
```

## Deploy to Vercel via GitHub

1. **Create a GitHub repo**

   ```bash
   git init
   git add .
   git commit -m "Initial commit: Maverick Entrepreneur"
   git branch -M main
   git remote add origin https://github.com/YOUR-USERNAME/maverick-entrepreneur.git
   git push -u origin main
   ```

2. **Import to Vercel**

   - Go to [vercel.com/new](https://vercel.com/new)
   - Import your GitHub repo
   - Vercel auto-detects Vite — no config needed (`vercel.json` handles SPA rewrites)
   - Click **Deploy**

3. Every subsequent push to `main` auto-deploys. Preview deployments are created automatically for pull requests.

## Architecture

Three layers, strictly separated:

```
src/
├── pages/          → screens (presentation only)
├── components/ui/  → shared UI atoms (masthead, ticker, modals)
├── app/store/      → Zustand state + persistence
├── engine/         → pure simulation functions (no React)
├── data/           → industries, cities, backgrounds, events
└── types/          → shared TypeScript types
```

The simulation engine (`src/engine/simulation.ts`) is pure TypeScript. UI components never embed business logic — they call store actions, which delegate to the engine.

## Roadmap (from the design doc)

Phase 1 — MVP (✅ shipped)
- Founder creation, 5 industries, 10 cities, monthly turns, loans, events, basic reputation

Phase 2 — Depth (✅ complete)
- ✅ **Rival AI** — 5 archetyped rivals (Incumbent, Disruptor, Specialist, Acquirer, Hometown Hero) with signature quotes, grudge levels, and monthly moves
- ✅ **Rivals page** — recent moves feed, rival dashboards with contested markets, threat intelligence
- ✅ **Politics system** — regulatory climate dials, 4 levers (lobbying with dice-roll odds, donations, relocation, automation), asymmetric stakeholder reputation (6 groups), political activity ledger
- ✅ **Real Estate** — 8 property types (office, retail, industrial, apartment, land, penthouse, vineyard, townhouse), dual-use occupancy (lease or occupy), appreciation, monthly cash flow, collateralized credit line at 4.8% APR, prestige stakeholder boosts, rolling marketplace with narrative hooks
- ✅ **Operations layer** — 4 staff tiers (Lean/Standard/Premium/Elite) with salary deltas, morale caps, and location-count gating; marketing spend with diminishing-returns curve and 5 presets; 3-tier location quality system with rent-index-weighted upgrade costs and flagship narrative labeling

Phase 3 — Legacy (🔶 in progress)
- ✅ **Phase 3.1 — Founder mortality &amp; heir generation** — founder ages continuously with no cap, health drifts from age + stress + company load; qualitative life-risk indicator (Low / Watchful / Elevated / Dangerous); contextual rotating doctor's notes across 4 age bands; up to 4 heirs generated over time with inherited surname and trait-driven adult bios; 10 heir traits with conflict pairs; 3 investment actions (tutoring, mentorship, public role) with diminishing returns; draftable succession order; Succession nav link gated by founder age ≥ 45
- ✅ **Phase 3.2 — Succession mechanic** — sudden-death rolls per monthly tick keyed to life-risk band (low ~1%/yr, dangerous ~35%/yr); voluntary step-down action gated by founder age ≥ 60; estate tax scaled by politics and inflation (20-45%, halved on voluntary step-down); full-screen succession modal shows successor bio, stats, tax breakdown; unchosen-heir branching with defection outcomes (loyal / left quietly / stayed bitter / became rival); defecting heirs with ambitious + ruthless traits can found their own rival company with a grudge; generation counter tracks dynasty depth; DynastyEnded screen when no eligible heir inherits, showing reign history and restart option
- ⏳ **Phase 3.3 — Legacy Score &amp; dynasty eulogy** — multi-generation scoring formula, final obituary screen, playthrough gravestone carried forward

Phase 4 — Mobile Rebuild (🔶 in progress)
- ✅ **Phase 4.1 — Visual framework** — Inter sans-serif + pastel palette + rounded cards + 5-slot bottom tab bar replace the newspaper aesthetic; phone-first 430px container with desktop fallback; daily tick cadence with week strip and `Simulate Day N` primary CTA; every primary screen rebuilt in the new theme — Home dashboard, FounderCreation 3-step flow, My Empire (city scroller + business list), Business Detail (hero + metrics + staff tier + marketing + locations), People (founder + heirs + succession), Messages (events feed + resolution modal), Real Estate (portfolio + marketplace + credit), Services hub, Bank (service detail), Settings (reset + run summary)
- ⏳ **Phase 4.2 — Content model** — distributors, factories, services sub-pages (Healthcare Insurance, Hiring Agency, Marketing Agency, Tax Office, Finance Manager, Education Centre), neighborhoods as sub-locations
- ⏳ **Phase 4.3 — Voice &amp; polish** — rewrite event bodies, rival quotes, doctor's notes, headlines in the new product voice; real city hero illustrations; animations and micro-interactions

## License

MIT — do what you want. Build your empire.
