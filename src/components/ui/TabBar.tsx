import { Link, useLocation } from "react-router-dom";
import { Icon, type IconName } from "./Icon";

interface Tab {
  to: string;
  icon: IconName;
  label: string;
  center?: boolean;
}

const TABS: Tab[] = [
  { to: "/settings", icon: "gear", label: "Settings" },
  { to: "/empire", icon: "building", label: "Empire" },
  { to: "/", icon: "home", label: "Home", center: true },
  { to: "/people", icon: "users", label: "People" },
  { to: "/messages", icon: "message-circle", label: "Messages" },
];

export function TabBar() {
  const loc = useLocation();

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-20 h-20 bg-white/95 backdrop-blur-xl border-t border-line flex items-center justify-around px-4 max-w-[430px] mx-auto"
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
      aria-label="Primary navigation"
    >
      {TABS.map((tab) => {
        const isActive =
          tab.to === "/"
            ? loc.pathname === "/"
            : loc.pathname.startsWith(tab.to);
        if (tab.center) {
          return (
            <Link
              key={tab.to}
              to={tab.to}
              aria-label={tab.label}
              className="flex items-center justify-center w-14 h-14 bg-ink text-white rounded-full shadow-float"
            >
              <Icon name={tab.icon} size={26} strokeWidth={2.2} />
            </Link>
          );
        }
        return (
          <Link
            key={tab.to}
            to={tab.to}
            aria-label={tab.label}
            className={`flex items-center justify-center w-10 h-10 transition-colors ${
              isActive ? "text-ink" : "text-muted"
            }`}
          >
            <Icon name={tab.icon} size={24} strokeWidth={isActive ? 2.2 : 1.8} />
          </Link>
        );
      })}
    </nav>
  );
}
