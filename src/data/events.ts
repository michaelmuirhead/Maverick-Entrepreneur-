import type { GameEvent } from "@/types";

// Event templates. Each is instantiated with a month when rolled.
export interface EventTemplate {
  id: string;
  category: GameEvent["category"];
  weight: number; // relative selection weight
  minMonth?: number;
  build: (month: number) => GameEvent;
}

export const EVENT_TEMPLATES: EventTemplate[] = [
  {
    id: "viral_review",
    category: "business",
    weight: 8,
    build: (month) => ({
      id: `viral_review_${month}`,
      month,
      category: "business",
      headline: "A Viral Review",
      body: "A food writer with 400,000 followers wrote something uncomfortably kind about your flagship location. Lines stretch down the block.",
      choices: [
        {
          id: "ride_wave",
          label: "Ride the wave — raise prices 8%",
          effect: { cash: 4000, reputation: 2, morale: -3 },
          resultText: "Margins fatten. A few regulars quietly leave.",
        },
        {
          id: "hold_line",
          label: "Hold the line — reward loyal staff",
          effect: { cash: -1500, reputation: 6, morale: 8, brand: 4 },
          resultText: "The team stays sharp. Word spreads further.",
        },
      ],
    }),
  },
  {
    id: "landlord_raises_rent",
    category: "business",
    weight: 7,
    build: (month) => ({
      id: `rent_${month}`,
      month,
      category: "business",
      headline: "The Landlord Calls",
      body: "Your flagship lease renewal just landed. They're asking for 22% more. Your lawyer says you have leverage. Your gut says she's bluffing about the leverage.",
      choices: [
        {
          id: "pay",
          label: "Pay. Keep the corner.",
          effect: { cash: -3200, reputation: 1 },
          resultText: "Expensive. But the location matters.",
        },
        {
          id: "negotiate",
          label: "Counter at 8% — risk the walkout",
          effect: { cash: -800, reputation: -1, stress: 8 },
          resultText: "She blinks. You save money and two weeks of sleep.",
        },
        {
          id: "move",
          label: "Relocate to a cheaper street",
          effect: { cash: -6000, reputation: -4, brand: -5 },
          resultText: "The new spot is fine. Foot traffic is not.",
        },
      ],
    }),
  },
  {
    id: "recession_watch",
    category: "economy",
    weight: 5,
    minMonth: 6,
    build: (month) => ({
      id: `recession_${month}`,
      month,
      category: "economy",
      headline: "The Yield Curve Inverts",
      body: "Every business section is running the same chart. Your CFO is forwarding articles with no commentary, which is itself commentary.",
      choices: [
        {
          id: "hoard_cash",
          label: "Build the war chest — freeze hiring",
          effect: { cash: 2000, morale: -6 },
          resultText: "Cash rises. Ambition dims.",
        },
        {
          id: "invest_down",
          label: "Buy while everyone panics",
          effect: { cash: -8000, brand: 6, reputation: 3 },
          resultText: "A bold move. History will decide if it was wise.",
        },
      ],
    }),
  },
  {
    id: "labor_law",
    category: "politics",
    weight: 6,
    minMonth: 8,
    build: (month) => ({
      id: `labor_${month}`,
      month,
      category: "politics",
      headline: "A New Labor Bill Passes",
      body: "The state legislature just raised minimum wage and mandated paid leave. Your payroll will feel it within ninety days.",
      choices: [
        {
          id: "comply_publicly",
          label: "Comply early. Make a show of it.",
          effect: { cash: -2500, reputation: 5, morale: 6 },
          resultText: "The press notices. So does the competition.",
        },
        {
          id: "quiet_comply",
          label: "Comply minimally. Automate where possible.",
          effect: { cash: -800, reputation: -2, morale: -2 },
          resultText: "Cheaper. Colder. Harder to recruit next quarter.",
        },
      ],
    }),
  },
  {
    id: "key_hire",
    category: "business",
    weight: 8,
    build: (month) => ({
      id: `hire_${month}`,
      month,
      category: "business",
      headline: "A Candidate You Can't Afford",
      body: "A regional VP from a competitor is quietly looking. She's asking 40% above your bands. She would probably be worth it.",
      choices: [
        {
          id: "hire",
          label: "Break the band. Hire her.",
          effect: { cash: -4000, brand: 8, morale: 4 },
          resultText: "Your org just got a tier sharper.",
        },
        {
          id: "pass",
          label: "Pass. Promote internally.",
          effect: { morale: 3, reputation: 1 },
          resultText: "Loyalty rewarded. For now.",
        },
      ],
    }),
  },
  {
    id: "rival_undercut",
    category: "business",
    weight: 7,
    minMonth: 4,
    build: (month) => ({
      id: `rival_${month}`,
      month,
      category: "business",
      headline: "A Rival Undercuts You",
      body: "They're charging 18% less across your category. It is not sustainable for them. That does not make it less annoying.",
      choices: [
        {
          id: "match",
          label: "Match the price. Bleed them out.",
          effect: { cash: -3500, reputation: 0 },
          resultText: "A knife fight. Winners look like losers for a while.",
        },
        {
          id: "premium",
          label: "Lean into premium. Own the ceiling.",
          effect: { cash: 1500, brand: 6, reputation: 3, morale: 2 },
          resultText: "Your brand sharpens. Their customers start drifting up.",
        },
      ],
    }),
  },
  {
    id: "family_birth",
    category: "family",
    weight: 2,
    minMonth: 12,
    build: (month) => ({
      id: `family_${month}`,
      month,
      category: "family",
      headline: "A New Arrival",
      body: "Your family just grew. The nursery is yellow, mostly. You haven't slept in eleven days.",
      choices: [
        {
          id: "lean_in",
          label: "Take paternity time. The empire waits.",
          effect: { cash: -1500, stress: -20, reputation: 2 },
          resultText: "You return clearer. The business survived.",
        },
        {
          id: "push_on",
          label: "Push through. Sleep later.",
          effect: { stress: 15, morale: -3 },
          resultText: "You caught the deal. You didn't catch the first steps.",
        },
      ],
    }),
  },
  {
    id: "press_profile",
    category: "prestige",
    weight: 4,
    minMonth: 10,
    build: (month) => ({
      id: `press_${month}`,
      month,
      category: "prestige",
      headline: "Forbes Wants a Profile",
      body: "A staff writer is pitching a 3,000-word piece. You've read her takedowns. You've also read her coronations.",
      choices: [
        {
          id: "open_up",
          label: "Give her full access",
          effect: { reputation: 7, brand: 10, stress: 6 },
          resultText: "The cover is flattering. Mostly.",
        },
        {
          id: "decline",
          label: "Decline politely",
          effect: { reputation: -2 },
          resultText: "She writes a shorter piece. It is not flattering.",
        },
      ],
    }),
  },
  {
    id: "morale_dip",
    category: "business",
    weight: 5,
    build: (month) => ({
      id: `morale_${month}`,
      month,
      category: "business",
      headline: "Morale Survey Results",
      body: "The anonymous survey is in. It is worse than expected. A manager at your second location is named three separate times.",
      choices: [
        {
          id: "invest",
          label: "Invest in training, tools, and a real raise cycle",
          effect: { cash: -2800, morale: 12, reputation: 3 },
          resultText: "A slow build, but people notice.",
        },
        {
          id: "fire",
          label: "Quietly remove the manager",
          effect: { cash: -800, morale: 6 },
          resultText: "The conversation changes overnight. Loyalty takes longer.",
        },
      ],
    }),
  },
  {
    id: "tax_audit",
    category: "politics",
    weight: 3,
    minMonth: 14,
    build: (month) => ({
      id: `tax_${month}`,
      month,
      category: "politics",
      headline: "A Letter from the IRS",
      body: "A routine audit. Probably. Your accountant says not to worry. Your accountant's tone says worry.",
      choices: [
        {
          id: "comply",
          label: "Cooperate fully. Pay what's owed.",
          effect: { cash: -4500, reputation: 2 },
          resultText: "Resolved in six weeks. No scars.",
        },
        {
          id: "fight",
          label: "Lawyer up. Contest every line.",
          effect: { cash: -2000, reputation: -3, stress: 10 },
          resultText: "You win most of it. The stress outlasts the savings.",
        },
      ],
    }),
  },
  // ============================================================
  // Law firm flavored events
  // These read naturally when you have a law firm in your portfolio.
  // If you don't, the narrative still works — lawyers and ethics boards
  // exist adjacent to every business.
  // ============================================================
  {
    id: "star_litigator_poach",
    category: "business",
    weight: 5,
    minMonth: 24,
    build: (month) => ({
      id: `star_litigator_${month}`,
      month,
      category: "business",
      headline: "A Star Litigator Is Being Poached",
      body: "Your top trial attorney — the one who anchors the bankruptcy practice — just got a direct call from the GC at Meridian Holdings. They're offering triple her salary to come in-house. She's asking what you're willing to do.",
      choices: [
        {
          id: "counter",
          label: "Counter-offer. Match the compensation.",
          effect: { cash: -240000, morale: 5, reputation: 3 },
          resultText: "She stays. The other partners take note of what loyalty costs.",
        },
        {
          id: "walk",
          label: "Let her walk. Reassure the team.",
          effect: { cash: 0, brand: -8, morale: -6, reputation: -4 },
          resultText: "She leaves with two associates and a client list. The press notices.",
        },
        {
          id: "non_compete",
          label: "Match the offer — with a binding non-compete.",
          effect: { cash: -180000, morale: -3, reputation: 1 },
          resultText: "She signs. Privately, she considers herself bought. You consider her retained.",
        },
      ],
    }),
  },
  {
    id: "ethics_investigation",
    category: "business",
    weight: 4,
    minMonth: 36,
    build: (month) => ({
      id: `ethics_${month}`,
      month,
      category: "business",
      headline: "A Partner Is Under Ethics Investigation",
      body: "The state bar is examining billing irregularities in a closed case from three years ago. It's not actionable yet, but it's in the papers. The press has the name. Employees are watching how you handle it.",
      choices: [
        {
          id: "stand_by",
          label: "Stand by the partner publicly.",
          effect: { cash: -12000, morale: 6, reputation: -8, stress: 8 },
          resultText: "The team closes ranks. The public does not.",
        },
        {
          id: "quiet_suspension",
          label: "Quiet suspension pending review.",
          effect: { cash: -4000, morale: -2, reputation: 1, brand: -2 },
          resultText: "A careful middle path. Nobody is thrilled with it.",
        },
        {
          id: "force_departure",
          label: "Force an immediate departure.",
          effect: { cash: 0, morale: -8, reputation: 6, brand: 2 },
          resultText: "The press calls it decisive. Two other partners start updating their résumés.",
        },
      ],
    }),
  },
  {
    id: "pro_bono_opportunity",
    category: "prestige",
    weight: 5,
    minMonth: 12,
    build: (month) => ({
      id: `probono_${month}`,
      month,
      category: "prestige",
      headline: "A Pro Bono Case Arrives",
      body: "A civil rights non-profit wants your firm to lead a high-profile case. No fees. Substantial press. A senior partner would need to clear six months of calendar.",
      choices: [
        {
          id: "take_case",
          label: "Take the case. Clear the calendar.",
          effect: { cash: -35000, brand: 10, reputation: 12, morale: 8 },
          resultText: "The coverage is exactly what hoped for. Paying clients can wait.",
        },
        {
          id: "decline_gracefully",
          label: "Decline. Refer them to a smaller firm.",
          effect: { cash: 0, reputation: -2 },
          resultText: "You keep the billable hours. The partner who wanted the case takes it personally.",
        },
        {
          id: "junior_case",
          label: "Assign it to a junior partner.",
          effect: { cash: -8000, brand: 3, reputation: 4, morale: 3 },
          resultText: "The case gets done. The press coverage is modest. The junior remembers.",
        },
      ],
    }),
  },
  {
    id: "big_retainer",
    category: "business",
    weight: 6,
    minMonth: 18,
    build: (month) => ({
      id: `retainer_${month}`,
      month,
      category: "business",
      headline: "A Corporate Retainer Is On Offer",
      body: "A regional bank wants your firm on retainer — $40K/month for general counsel work. Their general counsel is a known hardass. The work will be steady, the demands relentless, and they'll expect you to drop other clients for them.",
      choices: [
        {
          id: "accept",
          label: "Sign the retainer.",
          effect: { cash: 40000, morale: -4, stress: 8, brand: 4 },
          resultText: "Cash reliably hits every month. So do the 7 AM calls.",
        },
        {
          id: "negotiate",
          label: "Negotiate terms — lower fee, more autonomy.",
          effect: { cash: 28000, morale: 2, brand: 2 },
          resultText: "Less money. Fewer Sunday emails. An acceptable trade.",
        },
        {
          id: "decline",
          label: "Decline. Keep the firm's independence.",
          effect: { cash: 0, morale: 6, reputation: 3 },
          resultText: "The team appreciates not being chained to one client. The partners notice the revenue that wasn't.",
        },
      ],
    }),
  },
];
