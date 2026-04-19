"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";

export type ThemeName = "cartoonish" | "pixel";
const STORAGE_KEY = "maverick.theme";
const DEFAULT_THEME: ThemeName = "cartoonish";

type Ctx = { theme: ThemeName; setTheme: (t: ThemeName) => void; toggle: () => void };
const ThemeCtx = createContext<Ctx>({ theme: DEFAULT_THEME, setTheme: () => {}, toggle: () => {} });

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeName>(DEFAULT_THEME);

  // Hydrate from localStorage on mount.
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY) as ThemeName | null;
      if (stored === "cartoonish" || stored === "pixel") setThemeState(stored);
    } catch {
      /* localStorage unavailable — stick with default */
    }
  }, []);

  // Apply to the root element whenever theme changes.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
  }, [theme]);

  const setTheme = useCallback((t: ThemeName) => {
    setThemeState(t);
    try { localStorage.setItem(STORAGE_KEY, t); } catch {}
  }, []);

  const toggle = useCallback(
    () => setTheme(theme === "cartoonish" ? "pixel" : "cartoonish"),
    [theme, setTheme]
  );

  return <ThemeCtx.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}
