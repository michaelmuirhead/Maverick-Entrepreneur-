# Features-as-Objects — Implementation Spec

## TL;DR

Today a product is a category plus two dials (quality, health) and a version number. Players raise devBudget and quality creeps up. Shipping software doesn't feel like shipping software.

This spec adds a **feature backlog per product** — a first-class list of discrete, named features that the player selects, builds, and ships. Features have prerequisites, eng-week costs, segment-specific effects, and they *decay* over time as they become table stakes. This becomes the central PM loop of the game.

It's also the scaffolding for a bunch of future systems: PMF-as-state, experimentation, research-driven discovery, competitor feature tracking, vNext bundles. Most of the "deepen the product side" ideas hang off this one.

---

## Goals

- Make week-to-week product work feel like product work: *which feature next?*
- Give segment unlocks a causal mechanism ("enterprise won't buy without SSO")
- Give tech debt a richer origin story (rushed features add debt)
- Give launch buzz + vNext a real payload (a feature *bundle*, not a budget slider)
- Leave structural room for PMF, experiments, research, competitor feature races

## Non-goals (v1)

- Player-authored features (no custom feature editor — catalog only)
- Per-feature A/B experiments (reserved for separate spec)
- Cross-product feature reuse (reserved)
- Competitor feature tracking (reserved)
- Feature-level analytics/adoption metrics (reserved)

---

## Data model

### New types (`src/game/types.ts`)

```typescript
export type FeatureId = string;
// Product areas a feature touches — used for filtering and catalog UX
export type FeatureArea = "security" | "platform" | "growth" | "enterprise" | "engagement" | "quality";
export type FeatureStatus = "backlog" | "in-progress" | "shipped" | "decayed";

/** Static template — defined in the catalog, not mutated per-product. */
export interface FeatureTemplate {
  id: FeatureId;
  label: string;
  description: string;                       // one-sentence flavor
  area: FeatureArea;
  applicableTo: ProductCategory[] | "any";   // gate by category
  baseEngWeeks: number;                      // 1..8 typical
  baseDebtAdded: number;                     // 0..8 — rushed = x2
  prerequisites: FeatureId[];                // must be shipped on same product
  effects: FeatureEffect;
}

/** What happens when this feature ships on a product. */
export interface FeatureEffect {
  qualityLift?: number;                      // flat add to product.quality
  unlocksSegment?: "enterprise" | "smb" | "selfServe"; // gating effect
  stickinessLift?: Partial<Record<"enterprise" | "smb" | "selfServe", number>>; // churn reduction
  arpuMultiplier?: Partial<Record<"enterprise" | "smb" | "selfServe", number>>; // +% ARPU
  launchBuzzBoost?: number;                  // one-shot if product launches within 8 weeks
  signupBoost?: {                            // temporary weekly uplift
    perWeek: number;
    durationWeeks: number;
    segment?: "enterprise" | "smb" | "selfServe";
  };
}

/** Per-product feature state. Exists once a player queues a feature into backlog. */
export interface ProductFeature {
  templateId: FeatureId;
  status: FeatureStatus;
  progress: number;                          // eng-weeks accumulated, 0..baseEngWeeks
  shippedWeek?: number;
  rushed?: boolean;                          // true if shipped at ≥70% progress with penalty
  decayed?: boolean;                         // set once age > DECAY_WEEKS
}
```

### `Product` additions

```typescript
export interface Product {
  // ...existing fields unchanged
  features: ProductFeature[];                // everything ever queued for this product
  activeFeatureBuild?: FeatureId;            // which feature is consuming dev effort this week
}
```

### `GameState`

No direct change — features live on Product. `SCHEMA_VERSION = 5`.

---

## Game mechanics

### Lifecycle

```
       [catalog]
          │   player adds to product backlog
          ▼
      backlog ──prereqs met──▶ eligible to start
          │   player presses "Start build"
          ▼
     in-progress (1 per product at a time)
          │   dev eng-weeks accumulate each tick
          ▼
       shipped (effects applied on ship tick)
          │   ageWeeks > DECAY_WEEKS
          ▼
       decayed (unlock stays; boosts drop to floor)
```

### Ticking features (one per product per week)

Each tick, for every Product with `activeFeatureBuild` set:

1. Compute `engOutput = assignedEngineers × avgSkill × teamEffects.velocityMultiplier × (debtDragFactor from current techDebt)`. Same math you already use for devBudget throughput — just reused against features.
2. Convert to eng-weeks. Add to that feature's `progress`.
3. If `progress >= baseEngWeeks`, ship: mark `status = "shipped"`, stamp `shippedWeek`, apply effects, clear `activeFeatureBuild`.
4. Emit a `"feature-shipped"` event to the event log.

### Rushing a feature

- Available UI action once `progress >= 0.7 × baseEngWeeks`.
- Marks `rushed = true` on the ProductFeature.
- Debt added = `2 × baseDebtAdded` instead of `1 ×`.
- Quality lift applied at 50% of template value.
- Buzz boost unaffected (the market doesn't know).

### Effect application on ship

At ship tick, compose the effect into the product:

- `qualityLift` → `product.quality = clamp(product.quality + lift, 0, 100)` (halved if rushed).
- `techDebt` → `product.techDebt += baseDebtAdded × (rushed ? 2 : 1)`.
- `unlocksSegment` → write to `product.segmentUnlocks: SegmentUnlocks` (new field — see below).
- `stickinessLift`, `arpuMultiplier` → stored as a list of *active* feature modifiers on the product; consumed by churn/revenue math each tick (see Integration).
- `signupBoost` → scheduled as a transient effect with a deadline week.
- `launchBuzzBoost` → stored as a pending boost that resolves at the product's next launch or vNext ship.

### Decay

Constants:
- `DECAY_WEEKS = 40` — a feature is "novel" for 40 weeks; after that its numeric boosts fade to a floor.
- After decay: `unlocksSegment` stays (SSO shipped is still SSO shipped), but `arpuMultiplier` and `stickinessLift` contributions fall to 25% of their original value. `signupBoost` is already one-shot so already done.

### Segment unlocks

New field on Product:

```typescript
export interface SegmentUnlocks {
  enterprise: boolean;  // e.g. SSO + SOC2 unlock enterprise
  smb: boolean;         // e.g. self-serve billing unlocks smb
  selfServe: boolean;   // typically unlocked by default
}
```

In `signupsThisWeek` / `demandFor`: if a segment isn't unlocked on this product, cap that segment's new signups at a floor (5% of raw demand — representing early adopters who tolerate the missing feature). Once unlocked, full conversion applies.

Default on new products: `{ enterprise: false, smb: true, selfServe: true }`. Enterprise starts gated, which justifies the game-length work of shipping compliance + auth features.

---

## Integration points with existing systems

**`products.ts` revenue + churn math** — after computing base MRR and churn, apply active (non-decayed) feature modifiers as a final pass. Each active `arpuMultiplier[seg]` multiplies that segment's revenue; each active `stickinessLift[seg]` subtracts from that segment's churn rate.

**`tick.ts`** — new step 3b (between product stage-advance and revenue computation): *feature tick* — accumulate eng-weeks on `activeFeatureBuild`, ship if complete, apply one-shot ship effects. Also: mark features decayed where age > DECAY_WEEKS.

**`debt.ts`** — rushed feature path feeds into existing techDebt; no new debt source logic needed beyond the `baseDebtAdded × rush multiplier` on ship.

**`roles.ts` / `teamEffects`** — existing velocity multiplier applies to feature eng-weeks the same way it applies to devBudget output. No new role math.

**vNext** — `startProductNextVersion` gets an optional `featureBundle: FeatureId[]` — a curated list of backlog features that ship together with the version bump. vNext launch buzz is computed as base + sum of each bundled feature's `launchBuzzBoost`. This is where vNext stops being a nebulous sprint and starts being a *release with a changelog*.

**Launch (first)** — at launch, buzz starts applying any `launchBuzzBoost` from features shipped in the prior 8 weeks. Incentivizes shipping the right features before launch, not after.

**Marketing budget** — unchanged, but now stacks with feature-driven signup boosts, creating a richer signup math: marketing drives awareness, features drive conversion and stickiness.

---

## Starter catalog (sample — ~15 features for v1)

Designed so every category has 2–3 category-specific features plus 4–5 universal ones. This set is the minimum required to make segment-unlock gameplay feel real.

### Universal / cross-category

| id | label | area | prereqs | weeks | debt | effect highlights |
|----|-------|------|---------|-------|------|---|
| `sso` | Single Sign-On | security | — | 3 | 2 | `unlocksSegment: enterprise`, `+5 quality` |
| `soc2` | SOC 2 Type II | enterprise | `sso` | 6 | 1 | enterprise ARPU +25%, stickinessLift enterprise +0.02 |
| `self-serve-billing` | Self-serve billing | growth | — | 2 | 2 | `unlocksSegment: smb`, signupBoost selfServe 50/w × 6w |
| `onboarding-flow` | Onboarding flow | quality | — | 2 | 1 | stickinessLift all +0.01, +3 quality |
| `mobile-app` | Mobile app | platform | — | 5 | 4 | stickinessLift selfServe +0.02, launchBuzzBoost 20 |
| `admin-controls` | Org admin controls | enterprise | `sso` | 3 | 2 | enterprise ARPU +15% |
| `audit-logs` | Audit logs | security | `sso` | 2 | 1 | enterprise ARPU +10%, stickinessLift enterprise +0.01 |

### Dev-tools / infrastructure

| id | label | prereqs | weeks | effect highlights |
|----|-------|---------|-------|---|
| `public-api` | Public API | — | 4 | +6 quality, launchBuzzBoost 15 |
| `api-rate-limiting` | API rate limiting | `public-api` | 1 | stickinessLift all +0.005 |
| `webhooks` | Webhooks | `public-api` | 2 | ARPU multiplier smb +10% |

### Analytics / CRM

| id | label | prereqs | weeks | effect highlights |
|----|-------|---------|-------|---|
| `dashboards-v2` | Rich dashboards | — | 4 | +8 quality, ARPU all +10% |
| `scheduled-reports` | Scheduled reports | `dashboards-v2` | 2 | enterprise stickinessLift +0.015 |

### Productivity / creative

| id | label | prereqs | weeks | effect highlights |
|----|-------|---------|-------|---|
| `collaboration` | Real-time collaboration | — | 5 | signupBoost all 80/w × 8w, +6 quality |
| `templates` | Template gallery | — | 2 | signupBoost selfServe 40/w × 4w |
| `ai-assist` | AI assistant | `public-api` (for infra/dev) or — | 4 | +10 quality, launchBuzzBoost 30 (trend-sensitive) |

Catalog lives in `src/game/featureCatalog.ts` as a `Record<FeatureId, FeatureTemplate>` — easy to extend later.

---

## UI

### Where it lives

Expand the existing product detail view with a new **Features** section below the vNext/debt block. Three columns (stacked on mobile):

- **Backlog** — features you've queued but not started. Each card: label, area tag, cost (eng-weeks), prereq status (locked / ready), effect summary ("unlocks enterprise"). Primary button: **Start build** (disabled if prereqs missing or another build in progress). Secondary: **Remove**.
- **In progress** — at most 1 per product. Progress bar, ETA based on current engineers, **Rush ship** button once ≥70% progress.
- **Shipped** — sorted most-recent first. Each card: label, ship week, active vs. decayed badge, rushed indicator (if applicable).

### Catalog modal / discovery

A **Browse features** button at the top opens a modal with the full catalog filtered to this product's category + universal. Each catalog row shows prereqs and can be added to backlog (becomes a `ProductFeature` with status `backlog`).

### Segment unlock chip

On the product summary block (where you show users + MRR), add a small row of three segment chips — each one colored based on unlock status. A locked one has a tooltip: "ships SSO to unlock enterprise." Makes the gating legible.

---

## Migration (v5)

In `migrateSave`, for each product without `features`:

1. Seed `features: []` and `activeFeatureBuild: undefined`.
2. Seed `segmentUnlocks` based on observed user segments and category:
   - If `users.enterprise > 0`: mark `enterprise: true` and synthesize shipped `sso` + `soc2` in the feature list (dated to `launchedWeek` or `week - 20` for flavor).
   - If `users.smb > 0`: `smb: true`, synthesize shipped `self-serve-billing`.
   - `selfServe: true` always.
3. For dev-tools / infrastructure products with `quality > 70`: synthesize shipped `public-api`.
4. Mark all synthesized features as `decayed: true` if `shippedWeek < state.week - DECAY_WEEKS`.

This keeps legacy saves' numbers stable (segment conversion stays open for segments that were converting) while giving them a visible shipped-feature history.

---

## Balance / economy

Rules of thumb for catalog tuning:

- A 4-eng-week feature should be worth ~4 weeks of devBudget equivalent: ~+5 quality OR a segment unlock OR an 8-week signup surge of +50/w OR equivalent ARPU lift.
- Universal features should be *slightly* underpriced vs. category-specific ones, since they're always available.
- Never have a single feature that solo-unlocks enterprise at a low cost; chain it through SSO → SOC 2 so unlocks are earned.
- Rush debt penalty (`2x`) should make rushing clearly bad for anything > 2 weeks; for 1-2 week features it should be a tempting pre-launch gambit.

Throughput sanity check: a 2-engineer team at skill 70 with no debt produces ~1.5 eng-weeks per tick (calibrate against existing devBudget output). So a 4-week feature takes ~3 ticks. A player with a 4-engineer team clears a 4-week feature in 1.5 ticks. Catalog sizing should support 6–10 shipped features over a 104-week run, not 40.

Run the sim-harness after tuning: **survival rates should move by less than 5pp** and **end-MRR means should stay in the existing ±10% band** across all 9 profiles. If angel/smart starts surviving 100% with higher MRR, the catalog is too easy.

---

## Testing plan

New file: `tests/features.test.ts`, ~20 tests.

**Catalog validation** (one smoke test, runs over the whole catalog)
- No circular prereqs
- Every prereq references an existing id
- Every `applicableTo` is valid
- Every effect has at least one non-empty field

**Lifecycle**
- `addFeatureToBacklog` appends a ProductFeature with status "backlog"
- `startFeatureBuild` fails when prereq not shipped
- `startFeatureBuild` fails when another build is in progress on that product
- `startFeatureBuild` succeeds otherwise and sets `activeFeatureBuild`
- Weekly tick accumulates progress toward `baseEngWeeks`
- Ship at threshold applies effects and clears `activeFeatureBuild`
- Ship emits a "feature-shipped" event

**Effects**
- `qualityLift` adds to product.quality, clamped 0..100
- `unlocksSegment` sets the right flag in `segmentUnlocks`
- `arpuMultiplier` modifies revenue calculation (integration test via `weeklyRevenue`)
- `stickinessLift` modifies churn calculation
- `signupBoost` creates a scheduled uplift that expires after N weeks
- `launchBuzzBoost` resolves at next launch / vNext

**Rush**
- Rush available only at ≥70% progress
- Rushed feature applies half quality lift + double debt

**Decay**
- After `DECAY_WEEKS` age, feature marked decayed
- Decayed feature: `unlocksSegment` still holds, numeric boosts drop to 25% floor

**Migration**
- Legacy product with enterprise users gets `segmentUnlocks.enterprise = true` and synthesized shipped `sso`/`soc2`
- Legacy dev-tools product with quality > 70 gets synthesized `public-api`
- Legacy products produce the same weekly revenue post-migration (within $50 tolerance)

**Integration sim**
- Full-sim: start a game, ship `self-serve-billing`, verify smb users rise; ship `sso` + `soc2`, verify enterprise segment starts converting

---

## Implementation order

Break into phases so each is independently shippable and testable:

### Phase 1 — Data + catalog (no UI)
- Add types, `featureCatalog.ts`, `segmentUnlocks` field, `features` field
- Migration v5
- Write catalog validation test
- No UI, no tick yet — just the data foundation compiles and migrates cleanly

### Phase 2 — Tick integration (no UI)
- `advanceFeatureBuild` pure function
- Hook into `tick.ts` step 3b
- Effect composition (arpu/stickiness modifiers) in revenue/churn math
- Signup boost scheduling
- Write lifecycle + effects tests
- Add a temporary dev-console button to start builds for manual verification

### Phase 3 — UI
- Features section on product detail
- Catalog modal
- Rush button
- Segment unlock chips on product card

### Phase 4 — vNext integration
- Allow feature bundle on vNext
- Launch buzz feature-shipment lookback window
- Update vNext UI to show feature bundle picker

### Phase 5 — Balance pass
- Run sim-harness
- Tune catalog numbers to keep existing survival curves within ±5pp
- Playtest manually through a full 104-week run

---

## Open questions

- Should features accumulate *during* a vNext sprint, or pause? Current thinking: feature builds and vNext run in parallel on different engineers — so a 4-engineer team can do both. Alternative: vNext blocks all feature builds. Cleaner rule, less flexibility.
- Does adding a feature to backlog have a cost (PM research time)? v1: free — just click to add. v2 (after research lever): only features you've *discovered* are in the catalog.
- Do competitors also have feature lists? Reserved. For now competitors compete on strength + stage. Competitor feature tracking is its own future spec.
- Should rushed features carry a permanent "legacy code" marker that makes future features on the same product slower? Tempting but adds complexity — defer to after playtesting.

---

## What this unlocks later

Each of these becomes much cheaper to add once features-as-objects exists:

- **PMF as a state** — PMF unlock requires a product to have shipped N features matching its target segment + hit retention thresholds. Concrete, satisfying.
- **User research lever** — spend eng/PM weeks to surface new catalog entries or reveal which feature will lift a target segment most.
- **Feature-level experiments** — build as an experiment → learn uplift → ship or kill. Uses the same ProductFeature record with a `variant` field.
- **Competitor feature tracking** — competitors ship features too, nullifying your differentiation boosts when they catch up.
- **Feature sunset** — end-of-life a feature to reclaim maintenance time (reduces techDebt, loses the boost).
- **Platform SKUs** — Pro / Team / Enterprise SKUs gate features by tier, structured as a "which features live in which SKU" editor.
