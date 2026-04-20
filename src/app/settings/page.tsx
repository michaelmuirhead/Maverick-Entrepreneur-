"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useGame } from "@/game/store";
import { ActiveTabBar } from "@/components/ActiveTabBar";
import { useTheme } from "@/components/ThemeProvider";
import { exportSaveJSON, importSaveJSON } from "@/lib/storage";
import { ENTREPRENEUR_SCHEMA_VERSION, activeVentureCount } from "@/game/entrepreneur";
import { money } from "@/lib/format";

export default function SettingsPage() {
  const router = useRouter();
  const entrepreneur = useGame(s => s.entrepreneur);
  const hydrate = useGame(s => s.hydrate);
  const hydrated = useGame(s => s.hydrated);
  const reset = useGame(s => s.resetGame);
  const loadExternal = useGame(s => s.loadExternalSave);
  const { theme, setTheme } = useTheme();

  const fileInput = useRef<HTMLInputElement>(null);
  const [flash, setFlash] = useState<{ kind: "good" | "bad"; msg: string } | null>(null);
  const [confirmingReset, setConfirmingReset] = useState(false);

  useEffect(() => { if (!hydrated) void hydrate(); }, [hydrated, hydrate]);

  const doExport = () => {
    if (!entrepreneur) return;
    const json = exportSaveJSON(entrepreneur);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const safeName = (entrepreneur.founderName || "maverick").replace(/[^a-z0-9-]+/gi, "-").toLowerCase();
    a.href = url;
    a.download = `${safeName}-w${entrepreneur.week}-save.json`;
    a.click();
    URL.revokeObjectURL(url);
    setFlash({ kind: "good", msg: "Save exported. Keep it somewhere safe." });
  };

  const doImportFile = async (file: File) => {
    try {
      const text = await file.text();
      const parsed = importSaveJSON(text);
      if (parsed.schemaVersion !== ENTREPRENEUR_SCHEMA_VERSION) {
        setFlash({ kind: "bad", msg: `Save is from schema v${parsed.schemaVersion}, game expects v${ENTREPRENEUR_SCHEMA_VERSION}. Not loading.` });
        return;
      }
      loadExternal(parsed);
      const ventureCount = parsed.ventures.length;
      setFlash({
        kind: "good",
        msg: `Loaded ${parsed.founderName}'s portfolio — ${ventureCount} venture${ventureCount === 1 ? "" : "s"} at week ${parsed.week}.`,
      });
    } catch (e) {
      setFlash({ kind: "bad", msg: e instanceof Error ? e.message : "Could not read that file." });
    }
  };

  const doReset = () => {
    reset();
    setConfirmingReset(false);
    setFlash({ kind: "good", msg: "Cleared. Starting a new run…" });
    setTimeout(() => router.replace("/new-game"), 250);
  };

  return (
    <main className="app-shell" style={{ paddingTop: "calc(16px + var(--safe-top))" }}>
      <h1 style={{ fontSize: 22, fontWeight: 700, margin: "8px 4px", fontFamily: "var(--font-display)" }}>Settings</h1>

      {flash && (
        <div className="themed-card" style={{
          padding: 12, marginTop: 8,
          background: flash.kind === "good" ? "var(--color-good)" : "var(--color-bad)",
          color: "#fff", fontWeight: 700, fontSize: 13,
        }}>{flash.msg}</div>
      )}

      {entrepreneur && (
        <>
          <h2 className="sec-head" style={{ marginTop: 18 }}>Portfolio</h2>
          <Link href="/portfolio" className="themed-card" style={{
            display: "grid", gridTemplateColumns: "32px 1fr auto",
            alignItems: "center", gap: 10, padding: "12px 14px",
            textDecoration: "none",
          }}>
            <div style={{ fontSize: 22, lineHeight: 1 }}>🗂️</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Portfolio &amp; ventures</div>
              <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 2 }}>
                {activeVentureCount(entrepreneur)} active · {entrepreneur.ventures.length} total · personal wealth {money(entrepreneur.personalWealth, { short: true })}
              </div>
            </div>
            <span className="mono" style={{ fontSize: 14, color: "var(--color-ink-2)" }}>›</span>
          </Link>
        </>
      )}

      <h2 className="sec-head" style={{ marginTop: 18 }}>Theme</h2>
      <div className="themed-card" style={{ padding: 14 }}>
        <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--color-ink-2)" }}>
          Swap art direction without leaving the boardroom.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          {(["cartoonish", "pixel"] as const).map(t => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className="themed-card"
              style={{
                padding: 14,
                fontWeight: 700,
                background: theme === t ? "var(--color-accent)" : "var(--color-surface-2)",
                color: theme === t ? "#fff" : "var(--color-ink)",
                borderColor: theme === t ? "var(--color-accent)" : "var(--color-line)",
              }}
            >
              {t === "cartoonish" ? "Cartoonish" : "Pixel"}
              <div style={{ fontSize: 11, fontWeight: 500, marginTop: 4, opacity: 0.85 }}>
                {t === "cartoonish" ? "Paper, thick outlines, chunky shadows" : "Terminal green, pixel HQ"}
              </div>
            </button>
          ))}
        </div>
      </div>

      <h2 className="sec-head" style={{ marginTop: 18 }}>Save file</h2>
      <div className="themed-card" style={{ padding: 14 }}>
        <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--color-ink-2)" }}>
          Your progress auto-saves to this device (IndexedDB). Export a JSON backup — or load one someone else sent you.
        </p>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <button
            onClick={doExport}
            disabled={!entrepreneur}
            className="themed-card"
            style={{
              padding: 12, fontWeight: 700,
              background: entrepreneur ? "var(--color-accent)" : "var(--color-muted)",
              color: "#fff", opacity: entrepreneur ? 1 : 0.5, cursor: entrepreneur ? "pointer" : "not-allowed",
            }}
          >Export save</button>
          <button
            onClick={() => fileInput.current?.click()}
            className="themed-card"
            style={{ padding: 12, fontWeight: 700, background: "var(--color-surface-2)" }}
          >Import save</button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            style={{ display: "none" }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void doImportFile(f);
              e.target.value = "";
            }}
          />
        </div>
        {entrepreneur && (
          <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 10 }}>
            Current: {entrepreneur.founderName} · portfolio W{entrepreneur.week} · {entrepreneur.ventures.length} venture{entrepreneur.ventures.length === 1 ? "" : "s"}
          </div>
        )}
      </div>

      <h2 className="sec-head" style={{ marginTop: 18 }}>Danger zone</h2>
      <div className="themed-card" style={{ padding: 14 }}>
        <p style={{ margin: "0 0 10px", fontSize: 13, color: "var(--color-ink-2)" }}>
          Wipe your save and start a fresh run. This cannot be undone — export a backup first if you're attached.
        </p>
        {!confirmingReset ? (
          <button
            onClick={() => setConfirmingReset(true)}
            className="themed-card"
            style={{ padding: 12, fontWeight: 700, background: "var(--color-bad)", color: "#fff", width: "100%" }}
          >Reset everything</button>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            <button
              onClick={() => setConfirmingReset(false)}
              className="themed-card"
              style={{ padding: 12, fontWeight: 700, background: "var(--color-surface-2)" }}
            >Nevermind</button>
            <button
              onClick={doReset}
              className="themed-card"
              style={{ padding: 12, fontWeight: 700, background: "var(--color-bad)", color: "#fff" }}
            >Yes, wipe it</button>
          </div>
        )}
      </div>

      <h2 className="sec-head" style={{ marginTop: 18 }}>About</h2>
      <div className="themed-card" style={{ padding: 14 }}>
        <div style={{ fontWeight: 700, fontSize: 15 }}>Maverick Entrepreneur</div>
        <div className="mono" style={{ fontSize: 11, color: "var(--color-ink-2)", marginTop: 4 }}>
          Schema v{ENTREPRENEUR_SCHEMA_VERSION} · Playfully serious since 2026
        </div>
      </div>

      <ActiveTabBar />
    </main>
  );
}
