import { CustomerSegment, Product, ProductCategory, SegmentedPricing, SegmentedUsers } from "./types";
import { EMPTY_TEAM, TeamEffects } from "./roles";
import { RNG } from "./rng";
import { churnPenalty } from "./debt";

/** Default split of a signup cohort by segment for each category (sums to 1.0). */
export const SEGMENT_MIX: Record<ProductCategory, SegmentedUsers> = {
  productivity:   { enterprise: 0.05, smb: 0.25, selfServe: 0.70 },
  "dev-tools":    { enterprise: 0.15, smb: 0.40, selfServe: 0.45 },
  analytics:      { enterprise: 0.45, smb: 0.35, selfServe: 0.20 },
  crm:            { enterprise: 0.15, smb: 0.60, selfServe: 0.25 },
  creative:       { enterprise: 0.05, smb: 0.20, selfServe: 0.75 },
  infrastructure: { enterprise: 0.60, smb: 0.30, selfServe: 0.10 },
};

/** Weekly baseline churn rate by segment. Enterprise is very sticky, self-serve is leaky. */
export const SEGMENT_BASE_CHURN: Record<CustomerSegment, number> = {
  enterprise: 0.001,  // ~0.4%/mo — long contracts, annual cycles
  smb:        0.005,  // ~2%/mo — mid-loyalty
  selfServe:  0.015,  // ~6%/mo — trial/consumer-grade
};

/** How much a declining product's health drags each segment. Enterprise contracts absorb it better. */
const DECLINE_SENSITIVITY: Record<CustomerSegment, number> = {
  enterprise: 0.3,
  smb: 0.7,
  selfServe: 1.0,
};

/** Total user count across all segments. */
export function totalUsers(p: Product): number {
  return p.users.enterprise + p.users.smb + p.users.selfServe;
}

/** Blended monthly revenue at current segment pricing. */
export function blendedMrr(p: Product): number {
  return p.users.enterprise * p.pricing.enterprise
       + p.users.smb        * p.pricing.smb
       + p.users.selfServe  * p.pricing.selfServe;
}

/** Derive a full pricing ladder from a single self-serve price. Enterprise is 10x, SMB is 3x. */
export function derivePricing(selfServePrice: number): SegmentedPricing {
  return {
    enterprise: Math.round(selfServePrice * 10),
    smb:        Math.round(selfServePrice * 3),
    selfServe:  Math.round(selfServePrice),
  };
}

/** Zeros — used for a new concept-stage product with no paid users yet. */
export const ZERO_USERS: SegmentedUsers = Object.freeze({
  enterprise: 0, smb: 0, selfServe: 0,
}) as SegmentedUsers;

/**
 * Split a weekly signup total across segments using category defaults modulated by role mix.
 *
 *   - Without a sales team, enterprise leads barely convert (~20% of baseline mix). Hire sales
 *     to unlock the big-ticket segment. Beyond headcount, senior sales hires do more.
 *   - Marketing hires pull the mix toward self-serve (they're running ads + content to consumers).
 *   - Categories without a big enterprise presence (creative, productivity) don't magically
 *     produce enterprise deals just because you hire AEs.
 */
export function partitionSignups(
  signupTotal: number,
  p: Product,
  team: TeamEffects = EMPTY_TEAM,
  rng?: RNG,
): SegmentedUsers {
  if (signupTotal <= 0) return { enterprise: 0, smb: 0, selfServe: 0 };
  const mix = SEGMENT_MIX[p.category];
  // Sales capacity: without sales hires, enterprise pipeline is inbound-only (20% of baseline).
  // A single solid AE restores most of baseline; a team stretches it further.
  const salesCapacity = team.sales <= 0
    ? 0.2
    : Math.min(1.3, 0.3 + team.sales * 0.4);
  // Marketing lifts self-serve flow. Caps at +50% with a strong marketer.
  const marketingLift = 1 + Math.min(0.5, team.marketing * 0.15);

  const ent  = mix.enterprise * salesCapacity;
  const self = mix.selfServe  * marketingLift;
  const smb  = mix.smb;
  const total = ent + smb + self;
  // Add a tiny bit of jitter so ties don't always break the same way, but only if rng provided.
  const jitter = rng ? rng.range(0.9, 1.1) : 1;

  const entCount  = Math.round(signupTotal * (ent  / total) * jitter);
  const smbCount  = Math.round(signupTotal * (smb  / total));
  const selfCount = Math.max(0, signupTotal - entCount - smbCount);
  return {
    enterprise: Math.max(0, entCount),
    smb: Math.max(0, smbCount),
    selfServe: selfCount,
  };
}

/**
 * Weekly churn for a single segment on this product.
 * Ops role dampens churn (support quality, fewer escalations).
 */
export function segmentChurnRate(
  p: Product,
  seg: CustomerSegment,
  team: TeamEffects = EMPTY_TEAM,
): number {
  const healthPenalty = Math.max(0, (60 - p.health)) / 100;
  const stageMultiplier = p.stage === "declining" ? 4 : p.stage === "mature" ? 1.2 : 1;
  const opsDampen = Math.min(0.3, team.ops * 0.08);
  const sensitivity = DECLINE_SENSITIVITY[seg];
  // High tech debt nudges churn up on top of the health penalty — customers
  // feel the bugs. Sensitivity still applies: enterprise rides it out better.
  const debtHit = churnPenalty(p) * sensitivity;
  const raw = SEGMENT_BASE_CHURN[seg] * stageMultiplier + healthPenalty * 0.03 * sensitivity + debtHit;
  return Math.max(0, raw * (1 - opsDampen));
}

/** Apply signups (post-partition) and churn to a product, returning the new user counts. */
export function applySegmentChanges(
  p: Product,
  signups: SegmentedUsers,
  team: TeamEffects = EMPTY_TEAM,
): SegmentedUsers {
  const ent  = Math.max(0, p.users.enterprise + signups.enterprise - Math.floor(p.users.enterprise * segmentChurnRate(p, "enterprise", team)));
  const smb  = Math.max(0, p.users.smb        + signups.smb        - Math.floor(p.users.smb        * segmentChurnRate(p, "smb",        team)));
  const self = Math.max(0, p.users.selfServe  + signups.selfServe  - Math.floor(p.users.selfServe  * segmentChurnRate(p, "selfServe",  team)));
  return { enterprise: ent, smb, selfServe: self };
}

/** Backwards-compat helper: single blended churn rate, weighted by current user mix. */
export function blendedChurnRate(p: Product, team: TeamEffects = EMPTY_TEAM): number {
  const total = totalUsers(p);
  if (total <= 0) return segmentChurnRate(p, "selfServe", team);
  const w = {
    enterprise: p.users.enterprise / total,
    smb: p.users.smb / total,
    selfServe: p.users.selfServe / total,
  };
  return w.enterprise * segmentChurnRate(p, "enterprise", team)
       + w.smb        * segmentChurnRate(p, "smb", team)
       + w.selfServe  * segmentChurnRate(p, "selfServe", team);
}

/** Labels for display. */
export const SEGMENT_LABELS: Record<CustomerSegment, string> = {
  enterprise: "Enterprise",
  smb: "SMB",
  selfServe: "Self-serve",
};
