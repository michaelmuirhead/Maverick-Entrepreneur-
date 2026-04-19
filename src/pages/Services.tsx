import { Link } from "react-router-dom";
import { PageHeader, SectionHeader } from "@/components/ui/PageHeader";
import { Icon, IconChip, type ChipVariant, type IconName } from "@/components/ui/Icon";

// A single row in the Services hub. `status` drives the right-side badge:
//   - "live" — currently active in the game (e.g. Bank, real routes)
//   - "preview" — placeholder; tapping surfaces a "coming soon" style detail page
//   - "external" — opens an external link (future: Discord, GitHub)
type ServiceStatus = "live" | "preview" | "external";

interface ServiceEntry {
  icon: IconName;
  variant: ChipVariant;
  title: string;
  sub: string;
  to: string;
  status: ServiceStatus;
  badge?: string;
}

const CORE_SERVICES: ServiceEntry[] = [
  {
    icon: "bank",
    variant: "blue",
    title: "Bank",
    sub: "Banking & Loans",
    to: "/bank",
    status: "live",
  },
  {
    icon: "heart",
    variant: "pink",
    title: "Healthcare Insurance",
    sub: "Employee benefits · morale boost",
    to: "/services/healthcare",
    status: "preview",
  },
  {
    icon: "trending-up",
    variant: "blue",
    title: "Finance Manager",
    sub: "Analytics & investments",
    to: "/services/finance-manager",
    status: "preview",
  },
  {
    icon: "users",
    variant: "purple",
    title: "Hiring Agency",
    sub: "Staff recruitment & tier upgrades",
    to: "/services/hiring",
    status: "preview",
  },
  {
    icon: "megaphone",
    variant: "green",
    title: "Marketing Agency",
    sub: "Campaigns & brand work",
    to: "/services/marketing",
    status: "preview",
  },
  {
    icon: "graduation-cap",
    variant: "purple",
    title: "Education Centre",
    sub: "Qualifications & courses",
    to: "/services/education",
    status: "preview",
  },
];

const DISTRIBUTORS: ServiceEntry[] = [
  {
    icon: "truck",
    variant: "orange",
    title: "Vanguard Distribution",
    sub: "Essentials & basic retail",
    to: "/services/distributor/vanguard",
    status: "preview",
  },
  {
    icon: "star",
    variant: "yellow",
    title: "Aurum Supply Ltd",
    sub: "Premium & luxury goods",
    to: "/services/distributor/aurum",
    status: "preview",
    badge: "NEW",
  },
  {
    icon: "truck",
    variant: "green",
    title: "Everline Logistics",
    sub: "Food service & hospitality",
    to: "/services/distributor/everline",
    status: "preview",
  },
  {
    icon: "package",
    variant: "orange",
    title: "Harrison Trade & Co",
    sub: "Industrial & services",
    to: "/services/distributor/harrison",
    status: "preview",
  },
  {
    icon: "wrench",
    variant: "purple",
    title: "Atlas Industrial Supply",
    sub: "Construction materials",
    to: "/services/distributor/atlas",
    status: "preview",
  },
];

const OTHER_SERVICES: ServiceEntry[] = [
  {
    icon: "file",
    variant: "red",
    title: "Tax Office",
    sub: "Tax management",
    to: "/services/tax",
    status: "preview",
  },
  {
    icon: "car",
    variant: "blue",
    title: "Fleetline Motors",
    sub: "Vehicle dealership",
    to: "/services/vehicles",
    status: "preview",
  },
  {
    icon: "crown",
    variant: "yellow",
    title: "Prestige & Co.",
    sub: "Yachts, supercars & collectables",
    to: "/services/prestige",
    status: "preview",
    badge: "NEW",
  },
];

export function Services() {
  return (
    <>
      <PageHeader
        title="Services"
        subtitle="Banks, agencies, and the professionals who run your empire"
      />

      <SectionHeader
        icon="briefcase"
        variant="blue"
        title="Core Services"
        meta="Financial & operational"
      />
      <div className="space-y-2">
        {CORE_SERVICES.map((s) => (
          <ServiceRow key={s.to} entry={s} />
        ))}
      </div>

      <SectionHeader
        icon="package"
        variant="orange"
        title="Distributors"
        meta="Suppliers for retail & services"
      />
      <div className="space-y-2">
        {DISTRIBUTORS.map((s) => (
          <ServiceRow key={s.to} entry={s} />
        ))}
      </div>

      <SectionHeader
        icon="wrench"
        variant="purple"
        title="Other Services"
        meta="Tax, vehicles, prestige"
      />
      <div className="space-y-2">
        {OTHER_SERVICES.map((s) => (
          <ServiceRow key={s.to} entry={s} />
        ))}
      </div>

      <div className="h-6" />
    </>
  );
}

function ServiceRow({ entry }: { entry: ServiceEntry }) {
  return (
    <Link to={entry.to} className="list-card !rounded-tile">
      <IconChip icon={entry.icon} variant={entry.variant} round />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <div className="font-bold text-[15px] tracking-tight truncate">{entry.title}</div>
          {entry.badge && <span className="pill pill-new">{entry.badge}</span>}
        </div>
        <div className="text-[12px] text-muted mt-0.5">{entry.sub}</div>
      </div>
      {entry.status === "preview" && (
        <span className="pill pill-warn hidden">Preview</span>
      )}
      <Icon name="chevron-right" size={18} className="text-muted" />
    </Link>
  );
}
