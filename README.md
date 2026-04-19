# Maverick Entrepreneur

A deep tycoon simulation about starting and running a small software company. Deploy a product, watch it grow, then replace it before it obsoletes itself.

Built as a mobile-web PWA with Next.js. Runs great on iPhone Safari; installable to the home screen.

## Stack

- **Next.js 14** (App Router) + **TypeScript** + **Tailwind CSS**
- **Zustand** for game state (single store, pure reducers)
- **idb-keyval** for IndexedDB save games
- **seedrandom** for deterministic reproducible runs
- **Vitest** for unit tests on the tick engine
- Two themes via CSS tokens: **Cartoonish+Dashboard** (default) and **Pixel+Dashboard** (alt)

## Running locally

```bash
npm install
npm run dev          # starts Next on :3000
npm test             # runs the Vitest suite
npm run build        # production build — this is what Vercel runs
```

Open http://localhost:3000 on your laptop. To test on your iPhone: find your laptop's LAN IP (`ipconfig getifaddr en0` on macOS) and visit `http://<lan-ip>:3000` in iPhone Safari. Add to Home Screen for the PWA install.

## Pushing to your existing GitHub repo

Your repo is at: https://github.com/michaelmuirhead/Maverick-Entrepreneur-

From this scaffold folder, first time:

```bash
cd maverick-entrepreneur
git init
git remote add origin https://github.com/michaelmuirhead/Maverick-Entrepreneur-.git
git branch -M main
git add .
git commit -m "Initial scaffold: playable prototype with all 4 MVP systems"

# If the remote already has commits you want to preserve, use --allow-unrelated-histories:
git pull origin main --allow-unrelated-histories
# Or, if you want to blow away the remote with this scaffold:
git push -f origin main

# Otherwise a clean push:
git push -u origin main
```

## Deploying to Vercel

1. Push to GitHub (see above).
2. In Vercel dashboard: **Add New Project** → import `Maverick-Entrepreneur-`.
3. Leave all defaults (framework: Next.js, build: `npm run build`, output: `.next`).
4. Deploy. First build takes ~1 min.
5. Vercel gives you a URL like `maverick-entrepreneur.vercel.app`. Open it on your iPhone and Add to Home Screen.

Every future `git push` triggers an auto-deploy.

## Project layout

```
src/
  app/               # Next.js app router pages
    page.tsx           #  HQ (dashboard)
    products/          #  Products — portfolio, design flow, assignments
    team/              #  Team — roster + hire
    market/            #  Market — trends, demand, competitors
    finance/           #  Finance — cash, runway, fundraising
    settings/          #  Settings — theme, save export/import, reset
    new-game/          #  Player-customized start
  components/        # Reusable UI: TabBar, KpiGrid, MrrChart, ThemeSwitcher, etc.
  game/              # Domain model, store, tick engine, systems
    types.ts         #  Core TypeScript types + SCHEMA_VERSION
    store.ts         #  Zustand store + actions
    tick.ts          #  advanceWeek() — the heart of the simulation
    products.ts      #  Product lifecycle (concept → dev → launch → mature → declining → EOL)
    team.ts          #  Hiring, morale, attrition
    finance.ts       #  Revenue, burn, runway, fundraising offers
    market.ts        #  Market trends, tech shifts
    competitors.ts   #  AI competitor companies
    events.ts        #  Random flavor event system
    init.ts          #  New-game initialization
    rng.ts           #  Seeded RNG wrapper (reproducible runs)
  themes/            # CSS token files per theme (cartoonish.css, pixel.css)
  lib/               # storage (IndexedDB + JSON export/import), formatting helpers
tests/               # Vitest unit tests — tick engine, RNG determinism, product lifecycle
public/              # PWA manifest + icons
```

## Save games

Saves auto-persist to IndexedDB under the key `maverick.save.v1` every tick and every action. Visit **Settings** to:

- Export the current run as a JSON file
- Import a previously exported save
- Reset and start over (with a confirm step)

The `schemaVersion` field lets us migrate saves in future releases.

## Design principles

1. **Pure tick engine.** `advanceWeek(state) -> newState` is a pure function. No `Date.now()`, no `Math.random()`, no DOM. Trivially testable.
2. **Per-tick RNG.** Each week's randomness is derived from `makeRng(`${seed}:w${week+1}`)`, so any state replays identically from its seed.
3. **Themes are pure CSS.** No component knows which theme is active; components reference CSS variables (`var(--color-accent)` etc.). Swapping `data-theme` on the root element re-skins the whole app.
4. **Player-controlled time.** Nothing happens until the player taps **Advance Week**. Every tick produces a digest of events for the log.
5. **Voice: playfully serious.** Real business vocabulary, dry wit. Copy lives alongside the logic that produces it (see `src/game/products.ts#launchFlavor`, `src/game/events.ts` RANDOM_EVENTS pool, etc.).

## Tests

```bash
npm test                # run once
npm run test:watch      # TDD loop
```

Coverage today: 29 tests across `tests/tick.test.ts` and `tests/rng.test.ts` — determinism, purity, finance math, bankruptcy flag, product lifecycle transitions, RNG reproducibility.
