"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useGame } from "@/game/store";
import { PRODUCT_CATEGORIES, ProductCategory } from "@/game/types";
import { money } from "@/lib/format";

type Arch = "technical" | "business" | "design";
type Cash = "lean" | "bootstrapped" | "angel-backed";

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

export default function NewGamePage() {
  const router = useRouter();
  const start = useGame(s => s.startNewGame);

  const [companyName, setCompanyName] = useState("Maverick Labs");
  const [founderName, setFounderName] = useState("");
  const [arch, setArch] = useState<Arch>("technical");
  const [cash, setCash] = useState<Cash>("bootstrapped");
  const [cat, setCat] = useState<ProductCategory>("productivity");

  const submit = () => {
    start({
      companyName: companyName.trim() || "Maverick Labs",
      founderName: founderName.trim() || "You",
      archetype: arch,
      startingCash: cash,
      startingCategory: cat,
    });
    router.replace("/");
  };

  return (
    <main className="app-shell" style={{ paddingTop: "calc(24px + var(--safe-top))", paddingBottom: 40 }}>
      <h1 style={{ fontSize: 24, fontWeight: 700, margin: "10px 4px", fontFamily: "var(--font-display)" }}>Start a company</h1>
      <p style={{ color: "var(--color-ink-2)", fontSize: 14, margin: "0 4px 18px" }}>
        Set up your founder, your stake, and your first product idea. You can adjust everything from Year 1, Week 1.
      </p>

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

      <Section title="First product category">
        <Options>
          {PRODUCT_CATEGORIES.map(c => (
            <OptionCard key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>
              <div style={{ fontWeight: 700, fontSize: 14 }}>{c.label}</div>
              <div style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 2 }}>{c.blurb}</div>
            </OptionCard>
          ))}
        </Options>
      </Section>

      <button
        onClick={submit}
        style={{
          background: "var(--color-accent)", color: "#fff",
          border: "var(--border-card)", borderRadius: "var(--radius-card)",
          padding: "14px 18px", fontSize: 16, fontWeight: 700,
          boxShadow: "var(--shadow-card)", marginTop: 20, width: "100%",
        }}
      >
        Incorporate & begin
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
