import { ArchivedProduct, Product } from "./types";
import { totalUsers, blendedMrr } from "./segments";

/**
 * Turn a closed product into a post-mortem archive entry.
 * Pure function — takes the final Product snapshot plus the week it was archived,
 * and returns all the stats the UI needs to render a verdict card.
 *
 *   closedReason - "sunset" = player pulled the plug deliberately.
 *                  "decayed" = auto-EOL from the tick (health/users collapsed).
 *                  "preLaunch" = closed before ever shipping.
 */
export function buildArchiveEntry(
  p: Product,
  archivedWeek: number,
  rawReason: "sunset" | "decayed",
): ArchivedProduct {
  const everLaunched = typeof p.launchedWeek === "number";
  const closedReason: ArchivedProduct["closedReason"] = everLaunched ? rawReason : "preLaunch";

  // Backfill peaks from current values if they were never written (should be 0 for fresh save games).
  const endUsers = totalUsers(p);
  const endMrr = blendedMrr(p);
  const peakUsers = Math.max(p.peakUsers ?? 0, endUsers);
  const peakMrr = Math.max(p.peakMrr ?? 0, endMrr);

  const verdict = scoreVerdict({
    launched: everLaunched,
    revenue: p.lifetimeRevenue,
    cost: p.lifetimeCost,
    peakUsers,
    peakMrr,
  });

  return {
    id: p.id,
    name: p.name,
    category: p.category,
    finalVersion: p.version,
    launchedWeek: p.launchedWeek,
    archivedWeek,
    ageWeeks: p.ageWeeks,
    closedReason,
    peakUsers,
    peakMrr,
    lifetimeRevenue: Math.round(p.lifetimeRevenue),
    lifetimeCost: Math.round(p.lifetimeCost),
    lifetimeDevCost: Math.round(p.lifetimeDevCost),
    lifetimeMarketingCost: Math.round(p.lifetimeMarketingCost),
    finalUsers: { ...p.users },
    finalHealth: p.health,
    finalQuality: p.quality,
    verdict,
    narrative: buildNarrative(p, verdict, closedReason, archivedWeek),
  };
}

function scoreVerdict(args: {
  launched: boolean;
  revenue: number;
  cost: number;
  peakUsers: number;
  peakMrr: number;
}): ArchivedProduct["verdict"] {
  if (!args.launched) return "stillborn";
  const roi = args.cost > 0 ? args.revenue / args.cost : 0;
  // "Hit": well in the black, meaningful scale. "Solid": profitable or break-even, real users.
  // "Meh": modest scale but deep in the red. "Flop": barely registered.
  if (roi >= 1.5 && args.peakUsers >= 1000) return "hit";
  if (roi >= 0.8 && args.peakUsers >= 300) return "solid";
  if (args.peakUsers >= 100) return "meh";
  return "flop";
}

function buildNarrative(
  p: Product,
  verdict: ArchivedProduct["verdict"],
  reason: ArchivedProduct["closedReason"],
  archivedWeek: number,
): string {
  const rev = Math.round(p.lifetimeRevenue);
  const cost = Math.round(p.lifetimeCost);
  const peak = Math.max(p.peakUsers, totalUsers(p));
  const net = rev - cost;

  if (verdict === "stillborn") {
    const spent = cost > 0 ? `${fmt(cost)} sunk into development before you pulled it` : "no money spent before you pulled it";
    return `${p.name} never made it out of ${p.stage}. ${spent}. Not every concept wants to be a product.`;
  }

  const runLen = p.launchedWeek !== undefined ? archivedWeek - p.launchedWeek : p.ageWeeks;
  const lifespan = runLen < 13 ? `${runLen}-week run` : runLen < 52 ? `${Math.round(runLen / 4.33)}-month run` : `${(runLen / 52).toFixed(1)}-year run`;

  const causeLine = reason === "decayed"
    ? "The tech aged out, users drifted, and the numbers stopped making sense."
    : "You made the call to close it out cleanly.";

  switch (verdict) {
    case "hit":
      return `${p.name} was the real deal: a ${lifespan} that peaked at ${peak.toLocaleString()} users and ${fmt(p.peakMrr)} MRR, returning ${fmt(rev)} on ${fmt(cost)} spent (+${fmt(net)}). ${causeLine} Take the win.`;
    case "solid":
      return `${p.name} paid its rent: a ${lifespan}, peak ${peak.toLocaleString()} users at ${fmt(p.peakMrr)} MRR, ${fmt(rev)} earned against ${fmt(cost)} invested (${net >= 0 ? "+" : "-"}${fmt(Math.abs(net))}). ${causeLine} Not every product needs to be a rocket.`;
    case "meh":
      return `${p.name} had a pulse but never its moment: ${peak.toLocaleString()} peak users, ${fmt(rev)} earned against ${fmt(cost)} spent (${fmt(Math.abs(net))} ${net >= 0 ? "ahead" : "underwater"}). ${causeLine}`;
    case "flop":
      return `${p.name} didn't find a market. Peak of ${peak.toLocaleString()} users, ${fmt(rev)} earned against ${fmt(cost)} spent. ${causeLine} The lesson is cheaper than business school, technically.`;
    default:
      return `${p.name} closed.`;
  }
}

function fmt(n: number): string {
  if (!Number.isFinite(n)) return "$0";
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (Math.abs(n) >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${Math.round(n).toLocaleString()}`;
}
