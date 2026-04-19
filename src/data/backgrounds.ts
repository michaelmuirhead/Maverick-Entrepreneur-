import type { BackgroundId, Trait } from "@/types";

export interface Background {
  id: BackgroundId;
  name: string;
  description: string;
  startingCash: number;
  preferredIndustry: string;
  bonus: string;
}

export const BACKGROUNDS: Background[] = [
  {
    id: "barista",
    name: "Barista",
    description: "You pulled shots for a decade. You know the rhythm of a morning rush.",
    startingCash: 22000,
    preferredIndustry: "coffee",
    bonus: "+10% revenue at coffee locations.",
  },
  {
    id: "developer",
    name: "Software Engineer",
    description: "You shipped code at a FAANG-adjacent company. You left with stock and a plan.",
    startingCash: 48000,
    preferredIndustry: "software",
    bonus: "+15% revenue at software companies.",
  },
  {
    id: "contractor",
    name: "General Contractor",
    description: "You built other people's dreams. Now you're pouring the foundation of your own.",
    startingCash: 35000,
    preferredIndustry: "construction",
    bonus: "+12% revenue at construction companies.",
  },
  {
    id: "marketer",
    name: "Marketing Director",
    description: "You made mediocre products famous. Imagine what you'll do with a good one.",
    startingCash: 30000,
    preferredIndustry: "ecommerce",
    bonus: "+10% brand strength growth across all companies.",
  },
  {
    id: "accountant",
    name: "CPA",
    description: "You've seen every way a business can quietly bleed out. You'll spot it sooner.",
    startingCash: 40000,
    preferredIndustry: "ecommerce",
    bonus: "-8% operating costs across all companies.",
  },
  {
    id: "salesperson",
    name: "Enterprise Seller",
    description: "You closed seven-figure deals. You can sell rain to a thundercloud.",
    startingCash: 32000,
    preferredIndustry: "fastfood",
    bonus: "+12% reputation gain from all actions.",
  },
];

export const BACKGROUND_MAP = Object.fromEntries(BACKGROUNDS.map((b) => [b.id, b]));

export const TRAITS: Trait[] = [
  { id: "visionary", name: "Visionary", description: "Events trigger slightly better outcomes." },
  { id: "frugal", name: "Frugal", description: "Operating costs reduced by 5%." },
  { id: "charismatic", name: "Charismatic", description: "Reputation rises faster." },
  { id: "ruthless", name: "Ruthless", description: "Aggressive tactics cost less reputation." },
  { id: "resilient", name: "Resilient", description: "Stress accumulates more slowly." },
  { id: "patient", name: "Patient", description: "Long-term revenue grows more reliably." },
];
