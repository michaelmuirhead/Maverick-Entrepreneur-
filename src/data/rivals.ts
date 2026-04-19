import type { Rival } from "@/types";

// The starting cast of rivals. Each is a personality archetype with a distinct playbook.
export const SEED_RIVALS: Rival[] = [
  {
    id: "meridian",
    name: "Meridian Holdings",
    industry: "coffee",
    archetype: "incumbent",
    tagline: "Coffee · est. 2011 · public",
    quote: "We've been in Austin longer than they've had a storefront. We will be here longer still.",
    quoteAttribution: "CEO Harlan Vale, Q4 earnings call",
    aggression: 82,
    reputation: 71,
    brandStrength: 88,
    talentPull: 55,
    politicalReach: 64,
    grudge: -72,               // nemesis
    marketShare: 0.28,
    estimatedCash: 18_200_000,
    locations: 47,
    monthlyRevenue: 2_100_000,
    growth: 0.02,
    cities: ["austin", "seattle", "sf", "denver", "nyc"],
  },
  {
    id: "vectra",
    name: "Vectra Systems",
    industry: "software",
    archetype: "disruptor",
    tagline: "Software · est. 2023 · Series B",
    quote: "Legacy software is a tax on mediocrity. We're here to refund it.",
    quoteAttribution: "CEO Ines Kovač, TechCrunch profile",
    aggression: 94,
    reputation: 54,
    brandStrength: 61,
    talentPull: 88,
    politicalReach: 28,
    grudge: -45,               // hostile
    marketShare: 0.09,
    estimatedCash: 11_800_000, // runway not cash
    locations: 3,
    monthlyRevenue: 420_000,
    growth: 0.38,
    cities: ["sf", "denver", "seattle"],
  },
  {
    id: "fermont",
    name: "Fermont & Sons",
    industry: "construction",
    archetype: "specialist",
    tagline: "Construction · est. 1978 · family-owned",
    quote:
      "Ma built this company with a nail gun. We don't chase bright shiny things — we build what lasts.",
    quoteAttribution: "President Luis Fermont, local paper profile",
    aggression: 22,
    reputation: 84,
    brandStrength: 67,
    talentPull: 42,
    politicalReach: 78,
    grudge: 0,                 // indifferent
    marketShare: 0.14,
    estimatedCash: 4_800_000,
    locations: 11,
    monthlyRevenue: 890_000,
    growth: 0.04,
    cities: ["phoenix"],
  },
  {
    id: "bellamy",
    name: "Bellamy & Reed",
    industry: "ecommerce",     // nominal; they're really a holding co
    archetype: "acquirer",
    tagline: "Holding co. · est. 1998 · PE-backed",
    quote:
      "Every founder wants an exit. We are simply the most civilized way to get one.",
    quoteAttribution: "Managing Director Claire Reed, WSJ op-ed",
    aggression: 48,
    reputation: 67,
    brandStrength: 55,
    talentPull: 60,
    politicalReach: 91,
    grudge: 10,                // patient
    marketShare: 0.0,          // doesn't compete directly
    estimatedCash: 340_000_000,
    locations: 0,
    monthlyRevenue: 0,
    growth: 0.0,
    cities: [],
  },
  {
    id: "northwind",
    name: "Northwind & Co.",
    industry: "fastfood",
    archetype: "hometown_hero",
    tagline: "Fast Food · est. 2004 · franchise model",
    quote:
      "We don't compete with Hart & Company. We root for them. Different leagues, same town.",
    quoteAttribution: "Founder Darius Shore, Chamber of Commerce event",
    aggression: 14,
    reputation: 93,
    brandStrength: 76,
    talentPull: 38,
    politicalReach: 72,
    grudge: 45,                // allied
    marketShare: 0.21,
    estimatedCash: 6_400_000,
    locations: 89,
    monthlyRevenue: 1_400_000,
    growth: 0.042,
    cities: ["austin", "nashville", "phoenix", "chicago"],
  },
  {
    id: "wellsford",
    name: "Wellsford, Pratt & Moore",
    industry: "law",
    archetype: "specialist",
    tagline: "Law · est. 1924 · partnership",
    quote: "We don't chase clients. We outlast them, and then we represent their estates.",
    quoteAttribution: "Managing Partner Sterling Wellsford IV, The American Lawyer",
    aggression: 38,
    reputation: 89,
    brandStrength: 92,
    talentPull: 81,
    politicalReach: 84,        // deep connections — law firms know everyone
    grudge: -18,               // indifferent — for now
    marketShare: 0.33,
    estimatedCash: 24_500_000,
    locations: 6,              // only major markets
    monthlyRevenue: 4_800_000,
    growth: 0.028,             // slow, steady, relentless
    cities: ["nyc", "boston", "chicago", "sf", "miami", "seattle"],
  },
];

// ---------- Helpers ----------

export function grudgeToLevel(grudge: number): "allied" | "patient" | "indifferent" | "hostile" | "nemesis" {
  if (grudge >= 40) return "allied";
  if (grudge >= 10) return "patient";
  if (grudge >= -20) return "indifferent";
  if (grudge >= -60) return "hostile";
  return "nemesis";
}

export function archetypeLabel(a: Rival["archetype"]): string {
  switch (a) {
    case "incumbent": return "The Incumbent";
    case "disruptor": return "The Disruptor";
    case "specialist": return "The Specialist";
    case "acquirer": return "The Acquirer";
    case "hometown_hero": return "The Hometown Hero";
  }
}
