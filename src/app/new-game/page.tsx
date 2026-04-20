"use client";
import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useGame } from "@/game/store";
import { PRODUCT_CATEGORIES, ProductCategory, RevenueModel } from "@/game/types";
import { GENRE_INFO, GENRE_ORDER, SCOPE_INFO } from "@/game/studio/genres";
import type { GameGenre, GameScope } from "@/game/studio/types";
import { money } from "@/lib/format";

const REVENUE_MODEL_LABEL: Record<RevenueModel, string> = {
  subscription: "Subscription",
  "one-time":   "One-time",
  contract:     "Contract",
  freemium:     "Freemium",
};

type Arch = "technical" | "business" | "design";
type Cash = "lean" | "bootstrapped" | "angel-backed";
type Vertical = "saas" | "game-studio";

const VERTICAL_META: Record<Vertical, { label: string; tagline: string; glyph: string; desc: string }> = {
  "saas": {
    label: "Software / SaaS",
    tagline: "Ship subscriptions. Hunt PMF.",
    glyph: "💾",
    desc: "Build web/mobile products, close MRR, hire engineers, pitch VCs, and IPO on revenue.",
  },
  "game-studio": {
    label: "Game Studio",
    tagline: "Ship games. Survive reviews.",
    glyph: "🎮",
    desc: "Greenlight titles, manage crunch, court platforms, ride genre waves, and pray for an 80+ Metacritic.",
  },
};

const ARCH_META: Record<Arch, { label: string; desc: string; glyph: string }> = {
  technical: { label: "Technical", desc: "You can ship. Your cofounder will have to do sales.", glyph: "🛠️" },
  business:  { label: "Business",  desc: "You close deals. You'll need a strong technical cofounder.", glyph: "📇" },
  design:    { label: "Design",    desc: "Your taste is your edge. Balanced across product work.", glyph: "🎨" },
};

const CASH_META: Record<Cash, { label: string; amount: number; desc: string }> = {
  lean:          { label: "Lean",          amount: 15_000,  desc: "Bootstrapping on personal savings. High stakes." },
  bootstrapped:  { label: "Bootstrapped",  amount: 50_000,  desc: "A friends-and-family round. Comfortable but tight." },
  "angel-backed":{ label: "Angel-backed",  amount: 250_000, desc: "An angel bet big on you. Pre-seed stage unlocked." },
};

/** Scope blurbs shown on the studio path. */
const SCOPE_BLURBS: Record<GameScope, string> = {
  indie: "Small team, fast iteration, scrappy charm.",
  AA:    "Mid-sized ambition — proper production values.",
  AAA:   "Blockbuster scale. Big teams, big risks, big launches.",
};

export default function NewGamePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const startSaas = useGame(s => s.startNewGame);
  const startStudio = useGame(s => s.startNewStudio);
  const foundAdditionalSaas = useGame(s => s.foundAdditionalSaas);
  const foundAdditionalStudio = useGame(s => s.foundAdditionalStudio);
  const entrepreneur = useGame(s => s.entrepreneur);

  // `mode=add` → founding an additional venture out of personal wealth. The
  // existing entrepreneur is kept; we just append a new venture. Default mode
  // is "new" which starts a fresh entrepreneur (overwriting any existing save).
  const mode: "new" | "add" = searchParams?.get("mode") === "add" && entrepreneur
    ? "add"
    : "new";

  const preselectedVertical = searchParams?.get("vertical") as Vertical | null;
  const [vertical, setVertical] = useState<Vertical>(
    preselectedVertical === "game-studio" || preselectedVertical === "saas"
      ? preselectedVertical
      : "saas",
  );

  // Shared fields
  const [companyName, setCompanyName] = useState("Maverick Labs");
  const [founderName, setFounderName] = useState(
    mode === "add" && entrepreneur ? entrepreneur.founderName : "",
  );
  const [arch, setArch] = useState<Arch>("technical");
  const [cash, setCash] = useState<Cash>("bootstrapped");

  // SaaS-specific
  const [cat, setCat] = useState<ProductCategory>("application");

  // Studio-specific
  const [genre, setGenre] = useState<GameGenre>("rpg");
  const [scope, setScope] = useState<GameScope>("indie");

  // Add-mode investment from personal wealth. Default to the midpoint between
  // the minimum seed capital and the player's available wealth so the slider
  // lands on a sensible figure first render.
  const personalWealth = entrepreneur?.personalWealth ?? 0;
  const minSeed = vertical === "saas" ? 25_000 : 35_000;
  const [invest, setInvest] = useState<number>(0);
  useEffect(() => {
    if (mode !== "add") return;
    // Re-seed the invest slider whenever the vertical (or personalWealth)
    // changes — the minimums differ across verticals.
    const cap = Math.max(minSeed, personalWealth);
    const start = Math.min(
      Math.max(minSeed, Math.round(personalWealth * 0.5)),
      cap,
    );
    setInvest(start);
  }, [mode, vertical, minSeed, personalWealth]);

  // In add-mode, block verticals that the player can't afford even at their
  // minimum seed level. Prevents the submit button from being clickable into a
  // no-op.
  const canAffordSaas = mode === "new" || personalWealth >= 25_000;
  const canAffordStudio = mode === "new" || personalWealth >= 35_000;
  const canAffordCurrent = vertical === "saas" ? canAffordSaas : canAffordStudio;
  const investValid = mode === "new"
    ? true
    : invest >= minSeed && invest <= personalWealth;

  const submitLabel = useMemo(() => {
    if (mode === "add") return vertical === "saas" ? "Fund the new SaaS" : "Open the new studio";
    return vertical === "saas" ? "Incorporate & begin" : "Open the studio";
  }, [mode, vertical]);

  const submit = () => {
    const base = {
      companyName: companyName.trim() || "Maverick Labs",
      founderName: founderName.trim() || "You",
      archetype: arch,
      startingCash: cash,
    };
    if (mode === "add") {
      if (!investValid) return;
      if (vertical === "saas") {
        const id = foundAdditionalSaas({ ...base, startingCategory: cat }, invest);
        if (!id) return;
        router.replace("/");
      } else {
        const id = foundAdditionalStudio({ ...base, signatureGenre: genre, defaultScope: scope }, invest);
        if (!id) return;
        router.replace("/studio");
      }
      return;
    }
    if (vertical === "saas") {
      startSaas({ ...base, startingCategory: cat });
      router.replace("/");
    } else {
      startStudio({ ...base, signatureGenre: genre, defaultScope: scope });
      router.replace("/studio");
    }
  };

  return (
    <main className="app-shell" style={{ paddingTop: "calc(24px + var(--safe-top))", paddingBottom: 40 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "10px 4px", fontFamily: "var(--font-display)" }}>
        {mode === "add" ? "Found another company" : "Start a company"}
      </h1>
      <p style={{ color: "var(--color-ink-2)", fontSize: 14, margin: "0 4px 18px" }}>
        {mode === "add"
          ? `Pick the vertical, commit capital from your personal wealth (${money(personalWealth, { short: true })} available), and draft your first product.`
          : "Pick your vertical, set up your founder, and draft your first product. You can found additional companies in different verticals later."}
      </p>

      <Section title="Vertical">
        <Options>
          {(Object.keys(VERTICAL_META) as Vertical[]).map(k => (
            <OptionCard key={k} active={vertical === k} onClick={() => setVertical(k)}>
              <div style={{ fontSize: 22 }}>{VERTICAL_META[k].glyph}</div>
              <div style={{ fontWeight: 700, fontSize: 15, marginTop: 4 }}>{VERTICAL_META[k].label}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: "var(--color-accent)", marginTop: 2 }}>{VERTICAL_META[k].tagline}</div>
              <div style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 4 }}>{VERTICAL_META[k].desc}</div>
            </OptionCard>
          ))}
        </Options>
      </Section>

      <Section title="Company">
        <Field label="Company name">
          <TextInput value={companyName} onChange={setCompanyName} placeholder="Maverick Labs" />
        </Field>
        <Field label="Your name">
          <TextInput value={founderName} onChange={setFounderName} placeholder="What investors will print on the term sheet" />
        </Field>
      </Section>

      <Section title="Founder archetype">
        <Options>
          {(Object.keys(ARCH_META) as Arch[]).map(k => (
            <OptionCard key={k} active={arch === k} onClick={() => setArch(k)}>
              <div style={{ fontSize: 22 }}>{ARCH_META[k].glyph}</div>
              <div style={{ fontWeight: 700, fontSize: 15, marginTop: 4 }}>{ARCH_META[k].label}</div>
              <div style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 2 }}>{ARCH_META[k].desc}</div>
            </OptionCard>
          ))}
        </Options>
      </Section>

      {mode === "new" ? (
        <Section title="Starting capital">
          <Options>
            {(Object.keys(CASH_META) as Cash[]).map(k => (
              <OptionCard key={k} active={cash === k} onClick={() => setCash(k)}>
                <div className="mono" style={{ fontSize: 16, fontWeight: 700 }}>{money(CASH_META[k].amount, { short: true })}</div>
                <div style={{ fontWeight: 700, fontSize: 13, marginTop: 4 }}>{CASH_META[k].label}</div>
                <div style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 2 }}>{CASH_META[k].desc}</div>
              </OptionCard>
            ))}
          </Options>
        </Section>
      ) : (
        <Section title="Invest from personal wealth">
          <div className="themed-card" style={{ padding: "14px 16px", display: "grid", gap: 10 }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
              <div className="mono" style={{ fontSize: 20, fontWeight: 700 }}>
                {money(invest, { short: true })}
              </div>
              <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)" }}>
                of {money(personalWealth, { short: true })} available
              </div>
            </div>
            <input
              type="range"
              min={Math.min(minSeed, personalWealth)}
              max={Math.max(minSeed, personalWealth)}
              step={1_000}
              value={invest}
              disabled={!canAffordCurrent}
              onChange={(e) => setInvest(Number(e.target.value))}
              style={{ width: "100%" }}
            />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 6 }}>
              {[minSeed, Math.round(personalWealth / 2), personalWealth].map((v, i) => {
                const disabled = v < minSeed || v > personalWealth;
                const label = i === 0 ? "min" : i === 1 ? "half" : "all-in";
                return (
                  <button
                    key={`${label}_${v}`}
                    className="themed-btn"
                    style={{ fontSize: 11, padding: "6px 8px", opacity: disabled ? 0.4 : 1 }}
                    disabled={disabled}
                    onClick={() => setInvest(v)}
                  >
                    {label} · {money(v, { short: true })}
                  </button>
                );
              })}
            </div>
            <div style={{ fontSize: 11, color: "var(--color-ink-2)", lineHeight: 1.45 }}>
              This is the new venture's opening cash balance. Personal wealth drops by the same amount.
              Minimum seed for a {vertical === "saas" ? "SaaS" : "game studio"} is {money(minSeed, { short: true })}.
              {!canAffordCurrent && <> You don&apos;t have enough personal wealth to fund this vertical yet.</>}
            </div>
          </div>
        </Section>
      )}

      {vertical === "saas" && (
        <Section title="First product category">
          <Options>
            {PRODUCT_CATEGORIES.map(c => (
              <OptionCard key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{c.label}</div>
                <div style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 2 }}>{c.blurb}</div>
                <div className="mono" style={{ fontSize: 10, color: "var(--color-ink-2)", marginTop: 6, letterSpacing: ".04em" }}>
                  {REVENUE_MODEL_LABEL[c.revenueModel]} · ~{c.devWeeksBase}w build · min {c.teamSizeMin} eng
                </div>
              </OptionCard>
            ))}
          </Options>
        </Section>
      )}

      {vertical === "game-studio" && (
        <>
          <Section title="Signature genre">
            <Options>
              {GENRE_ORDER.map(g => {
                const info = GENRE_INFO[g];
                return (
                  <OptionCard key={g} active={genre === g} onClick={() => setGenre(g)}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{info.label}</div>
                    <div style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 2 }}>{info.blurb}</div>
                    <div className="mono" style={{ fontSize: 10, color: "var(--color-ink-2)", marginTop: 6, letterSpacing: ".04em" }}>
                      ~{info.devWeeksBase}w base · min {info.teamSizeMin} eng · reach {info.marketSize.toFixed(1)}×
                    </div>
                  </OptionCard>
                );
              })}
            </Options>
          </Section>

          <Section title="Ambition">
            <Options>
              {(Object.keys(SCOPE_INFO) as GameScope[]).map(s => {
                const info = SCOPE_INFO[s];
                return (
                  <OptionCard key={s} active={scope === s} onClick={() => setScope(s)}>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{info.label}</div>
                    <div style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 4 }}>{SCOPE_BLURBS[s]}</div>
                    <div className="mono" style={{ fontSize: 10, color: "var(--color-ink-2)", marginTop: 6, letterSpacing: ".04em" }}>
                      {info.devWeeksMult.toFixed(1)}× time · {info.priceMult.toFixed(1)}× price · min {info.minTeam} team
                    </div>
                  </OptionCard>
                );
              })}
            </Options>
          </Section>
        </>
      )}

      <button
        onClick={submit}
        disabled={mode === "add" && (!canAffordCurrent || !investValid)}
        style={{
          background: mode === "add" && (!canAffordCurrent || !investValid)
            ? "var(--color-muted)"
            : "var(--color-accent)",
          color: "#fff",
          border: "var(--border-card)", borderRadius: "var(--radius-card)",
          padding: "14px 18px", fontSize: 16, fontWeight: 700,
          boxShadow: "var(--shadow-card)", marginTop: 20, width: "100%",
          cursor: mode === "add" && (!canAffordCurrent || !investValid) ? "not-allowed" : "pointer",
        }}
      >
        {submitLabel}
      </button>
    </main>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{ marginTop: 16 }}>
      <h2 className="sec-head">{title}</h2>
      <div style={{ display: "grid", gap: 8 }}>{children}</div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ display: "block", fontSize: 11, color: "var(--color-ink-2)", fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase", marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder }: { value: string; onChange: (s: string) => void; placeholder?: string }) {
  return (
    <input
      value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      style={{
        width: "100%",
        background: "var(--color-surface)",
        border: "var(--border-card)",
        borderRadius: "var(--radius-card)",
        padding: "10px 14px",
        fontSize: 16,
        fontFamily: "var(--font-sans)",
      }}
    />
  );
}

function Options({ children }: { children: React.ReactNode }) {
  return <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>{children}</div>;
}

function OptionCard({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className="themed-card"
      style={{
        textAlign: "left",
        padding: "12px 14px",
        borderColor: active ? "var(--color-accent)" : "var(--color-line)",
        borderWidth: active ? 4 : 3,
        background: active ? "var(--color-surface-2)" : "var(--color-surface)",
      }}
    >{children}</button>
  );
}
