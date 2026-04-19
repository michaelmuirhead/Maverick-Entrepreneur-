import { type ReactNode } from "react";
import { StatusBar } from "./StatusBar";
import { TabBar } from "./TabBar";

// Wraps every screen: phone-first container, status bar at top, tab bar at bottom,
// scrollable body in the middle.
export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-shell">
      <StatusBar />
      <main className="px-5 pt-2">{children}</main>
      <TabBar />
    </div>
  );
}
