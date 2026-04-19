import type { HeirTrait, HeirTraitKind } from "@/types";

// ============================================================
// HEIR NAMES
// ============================================================

// First names split by a vibe rather than gender — we're generating heirs
// who will carry the family name. Split into two pools that feel different,
// so a family's children feel like siblings.
export const HEIR_FIRST_NAMES_A = [
  "Eleanor", "Amelia", "Beatrice", "Celia", "Delphine", "Evelyn",
  "Felicity", "Genevieve", "Helena", "Iris", "Josephine", "Katharine",
  "Louisa", "Margot", "Nora", "Olivia", "Penelope", "Rosalind",
  "Sylvie", "Tessa", "Vivienne", "Winifred",
];

export const HEIR_FIRST_NAMES_B = [
  "Gabriel", "Augustus", "Benedict", "Cassius", "Desmond", "Elliot",
  "Frederick", "Gideon", "Harrison", "Ignatius", "Julian", "Kenneth",
  "Leopold", "Maximilian", "Nathaniel", "Oscar", "Percival", "Quentin",
  "Reginald", "Sebastian", "Theodore", "Wolfgang",
];

// ============================================================
// TRAITS
// ============================================================

export const HEIR_TRAITS: Record<HeirTraitKind, HeirTrait> = {
  ambitious: { kind: "ambitious", label: "AMBITIOUS", polarity: "positive" },
  prudent: { kind: "prudent", label: "PRUDENT", polarity: "positive" },
  reckless: { kind: "reckless", label: "RECKLESS", polarity: "negative" },
  charismatic: { kind: "charismatic", label: "CHARISMATIC", polarity: "positive" },
  benevolent: { kind: "benevolent", label: "BENEVOLENT", polarity: "positive" },
  ruthless: { kind: "ruthless", label: "RUTHLESS", polarity: "negative" },
  cosmopolitan: { kind: "cosmopolitan", label: "COSMOPOLITAN", polarity: "neutral" },
  hometown_loyal: { kind: "hometown_loyal", label: "HOMETOWN-LOYAL", polarity: "neutral" },
  spendthrift: { kind: "spendthrift", label: "SPENDTHRIFT", polarity: "negative" },
  cautious: { kind: "cautious", label: "CAUTIOUS", polarity: "neutral" },
};

export const TRAIT_KINDS: HeirTraitKind[] = Object.keys(HEIR_TRAITS) as HeirTraitKind[];

// Traits that pair naturally — don't assign both in the same heir
export const CONFLICTING_TRAIT_PAIRS: [HeirTraitKind, HeirTraitKind][] = [
  ["reckless", "cautious"],
  ["reckless", "prudent"],
  ["ambitious", "cautious"],
  ["benevolent", "ruthless"],
  ["cosmopolitan", "hometown_loyal"],
];

// ============================================================
// BIO TEMPLATES
// ============================================================

// For children (under 18)
export const CHILD_BIO_TEMPLATES = [
  "Still a child. Shows early promise at reading, less so at sharing.",
  "A quiet reader. Prefers the company of books to company entirely.",
  "Full of questions. Dinner conversations last longer than anticipated.",
  "Loud, curious, and prone to climbing the furniture.",
  "Attends the right schools. Whether it's taking is another matter.",
  "A watcher. Says little at gatherings, misses nothing.",
];

// For adults (18+) — interpolated by age band and primary trait
export const ADULT_BIO_TEMPLATES: Record<string, string[]> = {
  ambitious: [
    "Rose through the ranks after earning their degree. Already running $COMPANY in everything but title.",
    "Made their own small mark before returning. Restless. Wants the whole table.",
    "Has a spreadsheet for everything and a plan for even the contingencies.",
  ],
  prudent: [
    "Careful, thoughtful, underestimated. Has asked better questions at dinner than some executives do in meetings.",
    "The steady hand. Would rather be right than loud.",
    "Quietly studied the family businesses from the inside. Knows where every dollar sleeps at night.",
  ],
  reckless: [
    "Built their own small firm across the bay. Visits for holidays. The press adores them.",
    "Has been described, variously, as brilliant, impossible, and a little too fond of the phone.",
    "Runs hot. When they win they win loud, and when they lose they do not talk about it.",
  ],
  charismatic: [
    "The room shifts when they walk in. Whether it shifts the right way depends on the day.",
    "Gives a better speech than most politicians. Has, on occasion, been asked to.",
    "Magnetic at a dinner, middling in a spreadsheet.",
  ],
  benevolent: [
    "Sits on three charity boards. The local paper has run a profile twice.",
    "Hosts a monthly dinner for the staff. Remembers everyone's children's names.",
    "Considered by employees to be the reasonable one. This will matter later.",
  ],
  ruthless: [
    "Has already fired a cousin. The cousin deserved it. Others took note.",
    "Reads every contract themselves. Lawyers have learned to be careful.",
    "Does not raise their voice. Does not need to.",
  ],
  cosmopolitan: [
    "Educated abroad, returned with opinions. Speaks three languages with middling fluency.",
    "Spends half the year in Europe. The family is not sure how they feel about this.",
    "More at home in airport lounges than in any particular city.",
  ],
  hometown_loyal: [
    "Never left the home city. Considers this a feature, not a bug.",
    "Knows the mayor, the florist, the chef at the old club. The city knows them back.",
    "Believes deeply that the best business in the world is a well-run local one.",
  ],
  spendthrift: [
    "Drives something Italian. Favors hotels that require reservations a year out.",
    "The allowance has been raised, quietly, three times.",
    "Has a gift for the grand gesture. And the grand invoice.",
  ],
  cautious: [
    "Takes notes. Asks follow-up questions. Does not commit until the papers are signed.",
    "Moves slowly. Has never been wrong about a major decision, though there haven't been many.",
    "The safest pair of hands in the room. Sometimes that is enough.",
  ],
};

// ============================================================
// DOCTOR'S NOTES
// ============================================================

// Notes rotate based on age range + health + stress combinations.
// Each entry is an array of possible strings to pick from at random.

export interface DoctorsNoteContext {
  age: number;
  health: number;
  stress: number;
  companyCount: number;
}

// Returns one appropriate note based on the context
export function pickDoctorsNote(ctx: DoctorsNoteContext, founderName: string): string {
  const { age, health, stress, companyCount } = ctx;
  const first = founderName.split(" ")[0];

  // Under 55 — no real concerns, occasional flavor
  if (age < 55) {
    if (stress > 75) {
      return `${first} is running hot. Nothing alarming, but the pace is a young person's pace and not always sustainable.`;
    }
    return `${first} is in the prime years. Body keeping up, mind sharper than ever.`;
  }

  // 55-64 — early awareness
  if (age < 65) {
    if (health > 80 && stress < 50) {
      return `${first} is holding up remarkably well. The kind of health other CEOs envy in their annual checkups.`;
    }
    if (stress > 70) {
      return `Sleep is uneven. ${first} should consider delegating more. Nothing critical yet.`;
    }
    return `${first} is noticing the mornings take a little longer. Still formidable, but aware of the ticking.`;
  }

  // 65-74 — the empire-management years
  if (age < 75) {
    if (stress > 70 && companyCount > 4) {
      return `${first}'s health is holding, but stress is eroding it. Running ${companyCount} companies at ${age} is not without cost. A year of reduced ambition would add meaningful time.`;
    }
    if (health < 60) {
      return `${first}'s health has taken a step backward. Doctors urge rest. The empire, as always, does not share their opinion.`;
    }
    if (health > 80) {
      return `${first} is defying the calendar. Heirs remain in waiting.`;
    }
    return `${first} takes longer walks now. The coffee is decaf some days. Life adjusts around the founder.`;
  }

  // 75+ — the mortal years
  if (health < 50) {
    return `${first}'s condition is a concern. Every serious board wants a named successor. The family is asked, privately, what the plan is.`;
  }
  if (stress > 60) {
    return `At ${age}, ${first} is still at the wheel, and still stressed about it. The doctor's advice, long familiar, goes unheeded.`;
  }
  if (health > 75) {
    return `Remarkable for ${age}. ${first} is an exception to every actuarial table. The heirs grow old waiting.`;
  }
  return `${first} is well, for ${age}. Each year now is a gift — and a ledger entry for the successors to contemplate.`;
}

// ============================================================
// LIFE RISK CLASSIFICATION
// ============================================================

export function lifeRiskLevel(ctx: DoctorsNoteContext): "none" | "low" | "watchful" | "elevated" | "dangerous" {
  const { age, health, stress } = ctx;
  if (age < 55) return "none";
  const ageFactor = (age - 55) / 30;                            // 0 at 55, 1 at 85
  const healthFactor = (100 - health) / 100;                    // 0 at perfect, 1 at zero
  const stressFactor = stress / 100;
  const risk = ageFactor * 0.55 + healthFactor * 0.3 + stressFactor * 0.15;
  if (risk < 0.15) return "low";
  if (risk < 0.35) return "watchful";
  if (risk < 0.6) return "elevated";
  return "dangerous";
}

// Label + description for the life risk indicator
export const LIFE_RISK_LABELS: Record<"none" | "low" | "watchful" | "elevated" | "dangerous", { label: string; sublabel: string; colorClass: string }> = {
  none: { label: "Low", sublabel: "vigorous", colorClass: "text-moss" },
  low: { label: "Low", sublabel: "hale & clear-headed", colorClass: "text-moss" },
  watchful: { label: "Watchful", sublabel: "slowing, steady", colorClass: "text-gold" },
  elevated: { label: "Elevated", sublabel: "stress taking its toll", colorClass: "text-gold" },
  dangerous: { label: "Dangerous", sublabel: "the doctor is worried", colorClass: "text-accent" },
};

// ============================================================
// CONSTANTS
// ============================================================

export const MAX_HEIRS = 4;                         // cap on total heirs
export const HEIR_FIRST_BIRTH_MONTH_MIN = 96;       // earliest first child (year 8)
export const HEIR_FIRST_BIRTH_MONTH_MAX = 144;      // latest (year 12)
export const HEIR_SPACING_MIN = 36;                 // months between siblings (3yr)
export const HEIR_SPACING_MAX = 72;                 // (6yr)
export const HEIR_ADULT_AGE = 18;                   // can be invested in
export const HEIR_ESTABLISHED_AGE = 30;             // stats lock, can take the reins
export const FOUNDER_MORTALITY_START_AGE = 55;      // below this, no sudden-death roll
export const SUCCESSION_UI_UNLOCK_AGE = 45;         // nav link appears at this age
