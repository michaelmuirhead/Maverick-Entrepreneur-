"use client";
import { useGame } from "@/game/store";
import { TabBar } from "./TabBar";
import { StudioTabBar } from "./StudioTabBar";

/**
 * Routes the bottom tab bar to the correct vertical-specific variant based on
 * the active venture's kind. SaaS ventures get the classic Products/Team/
 * Market/Finance nav; Game Studio ventures get Games/Team/Trends/Finance.
 *
 * Use this on shared routes that can be reached from either vertical (e.g.
 * `/settings`, `/portfolio`), so the player always sees the tab bar that
 * matches the venture they're actively running. Venture-specific pages (the
 * SaaS HQ at `/` or the Studio HQ at `/studio`) continue to import the
 * concrete tab bar directly since they're always rendered from within one
 * vertical.
 *
 * Falls back to the SaaS TabBar when no active venture is known — e.g. during
 * hydration or when the player has no ventures yet. That's a safe default
 * because the SaaS TabBar's routes are the most broadly-linked across the app.
 */
export function ActiveTabBar() {
  const activeStudioVenture = useGame(s => s.activeStudioVenture);
  if (activeStudioVenture) return <StudioTabBar />;
  return <TabBar />;
}
