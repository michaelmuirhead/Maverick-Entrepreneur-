import { Routes, Route, Navigate } from "react-router-dom";
import { useGame } from "@/app/store/useGame";
import { AppShell } from "@/components/ui/AppShell";
import { SuccessionModal } from "@/components/ui/SuccessionModal";
import { FounderCreation } from "@/pages/FounderCreation";
import { DynastyEnded } from "@/pages/DynastyEnded";
import { Home } from "@/pages/Home";
import { Empire } from "@/pages/Empire";
import { BusinessDetail } from "@/pages/BusinessDetail";
import { People } from "@/pages/People";
import { Messages } from "@/pages/Messages";
import { Settings } from "@/pages/Settings";
import { RealEstate } from "@/pages/RealEstate";
import { Services } from "@/pages/Services";
import { Bank } from "@/pages/Bank";
import { Icon } from "@/components/ui/Icon";

// Temporary placeholder until the page is rebuilt in the new theme.
// Each unbuilt route renders this so the tab bar still works and the user
// can navigate without hitting a blank screen.
function ComingSoon({ name }: { name: string }) {
  return (
    <div className="mt-2">
      <h1 className="text-[34px] font-extrabold tracking-tight leading-none">{name}</h1>
      <p className="text-[15px] text-ink2 mt-2">
        This screen is being rebuilt in the new design. Check back shortly.
      </p>
      <div className="card-flat mt-6 text-center py-12">
        <div className="w-16 h-16 rounded-full bg-blue-soft text-blue mx-auto mb-3 flex items-center justify-center">
          <Icon name="sparkle" size={28} />
        </div>
        <div className="font-bold text-[16px]">Under construction</div>
        <div className="text-[13px] text-muted mt-1 px-4">
          The engine is running. The paint is drying.
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const started = useGame((s) => s.started);
  const dynastyEnded = useGame((s) => s.dynastyEnded);

  if (!started) {
    return <FounderCreation />;
  }

  // Dynasty has ended (no eligible heir inherited) — full-screen takeover
  if (dynastyEnded) {
    return <DynastyEnded />;
  }

  return (
    <>
      <AppShell>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/empire" element={<Empire />} />
          <Route path="/business/:id" element={<BusinessDetail />} />
          <Route path="/people" element={<People />} />
          <Route path="/messages" element={<Messages />} />
          <Route path="/settings" element={<Settings />} />
          <Route path="/services" element={<Services />} />
          <Route path="/services/*" element={<ComingSoon name="Service" />} />
          <Route path="/bank" element={<Bank />} />
          <Route path="/real-estate" element={<RealEstate />} />
          <Route path="/succession" element={<Navigate to="/people" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
      {/* Blocking full-screen modal when a succession is pending */}
      <SuccessionModal />
    </>
  );
}
