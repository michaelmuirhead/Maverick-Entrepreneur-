# Maverick Entrepreneur

A deep tycoon simulation about building a career as a founder. Start a SaaS company or run a game studio, ship products, cash out, then start something new. Ventures live inside a single entrepreneur profile so successful founders carry their money, reputation, and scars across the portfolio.

Built as a mobile-web PWA with Next.js. Runs great on iPhone Safari; installable to the home screen.

## Stack

- **Next.js 14** (App Router) + **TypeScript** + **Tailwind CSS**
- **Zustand** for game state (single store, pure reducers)
- **idb-keyval** for IndexedDB save games
- **seedrandom** for deterministic reproducible runs
- **Vitest** for unit tests on the tick engines
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

## The two verticals

Ventures come in two flavors. Both live under the same entrepreneur profile, so cash, reputation, and exit proceeds compound across a career.

**SaaS company** (`/`). Pick a category, design products, price them, scale the customer segments they target. Juggle technical debt, marketing campaigns, customer support, office space, company culture, regional expansion, patents, open source positioning, partnerships, and government contracts. Fundraise through friends-and-family, seed, A, B, C — or skip the investor path and stay lean. Eventually IPO or get acquired.

**Game studio** (`/studio`). Greenlight games across scopes (prototype, indie, AA, AAA), pick genres that ride shifting trend waves, staff them with engineers and designers, ship to platforms, survive review scores and review bombs, run live-service titles and DLC, then keep reinvesting. Take on work-for-hire contracts (consulting, port, co-dev, publisher-spec) when you need cash, but watch your reputation — missing deadlines closes doors on the bigger work.

A tier system (lean / bootstrapped / angel-backed / VC-backed) shapes both verticals' constraints: lean studios can only run one project at a time, VC-backed companies face board deadlines and pressure to exit.

## Project layout

```
src/
  app/                       # Next.js app router
    page.tsx                 #  SaaS HQ (dashboard)
    new-game/                #  Pick vertical + tier + starting config
    portfolio/               #  All ventures across this entrepreneur profile
    settings/                #  Theme, save export/import, reset
    products/ team/ market/ finance/ growth/
    campaigns/ support/ culture/ office/
    regions/ patents/ oss/ partnerships/
    gov-contracts/ ipo/                   # SaaS sub-systems
    studio/                  # Game studio vertical
      page.tsx               #   Studio HQ
      games/                 #   Slate + per-game detail
      contracts/             #   Work-for-hire offers, active, history
  components/                # Reusable UI — HQ headers, KPI grids,
                             # tab bars, theme switcher, venture switcher,
                             # product/game lists, event logs, chart cards
  game/                      # Domain model
    types.ts                 #  SaaS core types + SCHEMA_VERSION (venture shape)
    store.ts                 #  Zustand store + actions (both verticals)
    tick.ts                  #  SaaS advanceWeek()
    entrepreneur.ts          #  Portfolio wrapper + ENTREPRENEUR_SCHEMA_VERSION
    portfolio.ts             #  Venture switching, exit payouts
    init.ts                  #  New-game initialization (both verticals)
    rng.ts                   #  Seeded RNG wrapper (reproducible runs)
    products.ts segments.ts categories.ts roles.ts team.ts finance.ts
    market.ts competitors.ts events.ts mergers.ts milestones.ts
    economy.ts campaigns.ts support.ts culture.ts office.ts debt.ts
    archive.ts                                     # SaaS systems
    studio/                  # Game studio systems
      types.ts               #   Game + ArchivedGame + StudioContract
      tick.ts                #   advanceStudioWeek()
      games.ts               #   Create/cancel/advance dev lifecycle
      hype.ts launch.ts      #   Pre-launch wishlist + launch sales curve
      live-service.ts        #   Live-ops MAU + ARPDAU + DLC pipeline
      crunch.ts              #   Parallel-project + crunch mechanics
      platforms.ts           #   Platform deals, revshare, trend drift
      genres.ts              #   Genre taxonomy + trend curves
      contracts.ts           #   Work-for-hire offers + lifecycle + reputation
      init.ts                #   Studio new-game bootstrap
  themes/                    # CSS token files per theme
  lib/                       # storage (IndexedDB + JSON), format helpers
tests/                       # Vitest unit tests — both tick engines,
                             # RNG determinism, product + game lifecycles,
                             # schema migration, finance math, archive math
public/                      # PWA manifest + icons
```

## Save games

Saves auto-persist to IndexedDB under the key `maverick.save.v1` every tick and every action. Visit **Settings** to:

- Export the current run as a JSON file
- Import a previously exported save
- Reset and start over (with a confirm step)

Two schema versions live side-by-side: `ENTREPRENEUR_SCHEMA_VERSION` (the portfolio wrapper — profile + ventures) and `SCHEMA_VERSION` (the legacy inner SaaS-venture shape). Old saves migrate forward automatically; the migration path is covered by `tests/migration-v8.test.ts`.

## Design principles

1. **Pure tick engines.** `advanceWeek(state) -> newState` for SaaS and `advanceStudioWeek(state) -> newState` for the studio are pure functions. No `Date.now()`, no `Math.random()`, no DOM. Trivially testable.
2. **Per-tick RNG.** Each week's randomness is derived from `makeRng(`${seed}:w${week+1}`)`, so any state replays identically from its seed. Studio uses the same pattern.
3. **Themes are pure CSS.** No component knows which theme is active; components reference CSS variables (`var(--color-accent)` etc.). Swapping `data-theme` on the root element re-skins the whole app.
4. **Player-controlled time.** Nothing happens until the player taps **Advance Week**. Every tick produces a digest of events for the log.
5. **Voice: playfully serious.** Real business vocabulary, dry wit. Copy lives alongside the logic that produces it (see `src/game/products.ts#launchFlavor`, the `RANDOM_EVENTS` pools, the studio contract flavor text in `src/game/studio/contracts.ts`, etc.).
6. **Backward-compatible state.** New systems land as optional fields with defaulted reads, so legacy saves don't crash when the schema grows. Migrations only happen at hard schema bumps.

## Tests

```bash
npm test                # run once
npm run test:watch      # TDD loop
```

Coverage spans both verticals: SaaS tick determinism and finance math, product lifecycle transitions, segment/category economics, campaign and support systems, office/culture upgrades, archive post-mortems, buyout-offer valuations, milestone triggers, and schema-v8 migration safety — plus the studio side's dev lifecycle, hype and launch curves, crunch mechanics, and tick-level orchestration.
