import { useState } from "react";
import { useGame } from "@/app/store/useGame";
import { CITY_MAP } from "@/data/cities";
import { PROPERTY_KIND_INFO, SECURED_RATE_ANNUAL } from "@/data/realEstate";
import {
  computePropertyCashFlow,
  totalRealEstateCashDelta,
  totalCollateralValue,
  maxSecuredBorrowing,
} from "@/engine/realEstate";
import { formatMoney, formatDailyMoney } from "@/engine/simulation";
import { PageHeader, SectionHeader } from "@/components/ui/PageHeader";
import { Icon, IconChip, type ChipVariant, type IconName } from "@/components/ui/Icon";
import type { Property, PropertyListing, PropertyKind } from "@/types";

type Tab = "portfolio" | "marketplace" | "credit";

export function RealEstate() {
  const state = useGame();
  const {
    properties,
    propertyListings,
    cash,
    securedDebt,
    companies,
    purchaseProperty,
    sellProperty,
    leaseOut,
    occupyProperty,
    borrowSecured,
    repaySecured,
  } = state;

  const [tab, setTab] = useState<Tab>("portfolio");
  const [feedback, setFeedback] = useState<string | null>(null);
  const [openDrawer, setOpenDrawer] = useState<string | null>(null);
  const [borrowAmount, setBorrowAmount] = useState(50000);

  const { net: netRECashflow } = totalRealEstateCashDelta(properties);
  const collateral = totalCollateralValue(properties);
  const creditLimit = maxSecuredBorrowing(properties);
  const availableCredit = Math.max(0, creditLimit - securedDebt);
  const portfolioValue = properties.reduce((s, p) => s + p.currentValue, 0);

  return (
    <>
      <PageHeader
        title="Real Estate"
        subtitle="Your properties, the marketplace, and credit line"
        rightSlot={
          <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-chip font-bold text-sm bg-purple-soft text-purple">
            <Icon name="building-2" size={14} strokeWidth={2.2} />
            {properties.length}
          </span>
        }
      />

      {feedback && (
        <div className="card-flat mb-4 text-sm italic text-ink2 fade-up">{feedback}</div>
      )}

      {/* Summary */}
      <div className="grid grid-cols-2 gap-2.5 mb-4">
        <SummaryCard
          label="Portfolio Value"
          value={formatMoney(portfolioValue)}
          subValue={`${properties.length} propert${properties.length === 1 ? "y" : "ies"}`}
        />
        <SummaryCard
          label="Monthly Net"
          value={`$${netRECashflow.toLocaleString()}`}
          valueTone={netRECashflow >= 0 ? "green" : "red"}
          subValue={`~$${formatDailyMoney(netRECashflow).toLocaleString()}/day`}
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-0 bg-surface p-1 rounded-tile mb-4">
        <TabBtn label={`Portfolio (${properties.length})`} active={tab === "portfolio"} onClick={() => setTab("portfolio")} />
        <TabBtn label={`Market (${propertyListings.length})`} active={tab === "marketplace"} onClick={() => setTab("marketplace")} />
        <TabBtn label="Credit" active={tab === "credit"} onClick={() => setTab("credit")} />
      </div>

      {/* ====== Portfolio tab ====== */}
      {tab === "portfolio" && (
        <>
          {properties.length === 0 ? (
            <div className="card-flat text-center py-10">
              <div className="w-14 h-14 rounded-full bg-purple-soft text-purple mx-auto mb-3 flex items-center justify-center">
                <Icon name="building-2" size={26} />
              </div>
              <div className="font-bold text-[15px]">No properties yet</div>
              <div className="text-[12px] text-muted mt-1 px-4">
                Browse the Market tab to find your first.
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {properties.map((p) => (
                <PropertyCard
                  key={p.id}
                  property={p}
                  openDrawer={openDrawer}
                  setOpenDrawer={setOpenDrawer}
                  companies={companies}
                  onSell={() => {
                    const r = sellProperty(p.id);
                    setFeedback(r.message);
                    setOpenDrawer(null);
                  }}
                  onLease={() => {
                    const r = leaseOut(p.id);
                    setFeedback(r.message);
                    setOpenDrawer(null);
                  }}
                  onOccupy={() => {
                    const r = occupyProperty(p.id);
                    setFeedback(r.message);
                    setOpenDrawer(null);
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ====== Marketplace tab ====== */}
      {tab === "marketplace" && (
        <>
          {propertyListings.length === 0 ? (
            <div className="card-flat text-center py-10">
              <div className="font-bold text-[15px]">Market quiet</div>
              <div className="text-[12px] text-muted mt-1 px-4">
                Listings refresh monthly. Advance days to see new ones.
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {propertyListings.map((l) => (
                <ListingCard
                  key={l.id}
                  listing={l}
                  cash={cash}
                  openDrawer={openDrawer}
                  setOpenDrawer={setOpenDrawer}
                  onPurchase={() => {
                    const r = purchaseProperty(l.id);
                    setFeedback(r.message);
                    setOpenDrawer(null);
                  }}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* ====== Credit tab ====== */}
      {tab === "credit" && (
        <CreditTab
          collateral={collateral}
          creditLimit={creditLimit}
          availableCredit={availableCredit}
          securedDebt={securedDebt}
          cash={cash}
          borrowAmount={borrowAmount}
          setBorrowAmount={setBorrowAmount}
          onBorrow={() => {
            const r = borrowSecured(borrowAmount);
            setFeedback(r.message);
          }}
          onRepay={(amount) => {
            const r = repaySecured(amount);
            setFeedback(r.message);
          }}
        />
      )}

      <div className="h-6" />
    </>
  );
}

// ==================== Subcomponents ====================

function TabBtn({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 py-2.5 rounded-chip font-semibold text-[12px] transition-all ${
        active ? "bg-purple text-white shadow-sm" : "text-ink2"
      }`}
    >
      {label}
    </button>
  );
}

function SummaryCard({
  label,
  value,
  valueTone,
  subValue,
}: {
  label: string;
  value: string;
  valueTone?: "green" | "red";
  subValue: string;
}) {
  return (
    <div className="bg-surface rounded-tile p-3.5">
      <div className="text-[11px] text-muted font-semibold uppercase tracking-wide">{label}</div>
      <div
        className={`text-[22px] font-extrabold mt-1 leading-none tracking-tight ${
          valueTone === "green" ? "text-green" : valueTone === "red" ? "text-red" : ""
        }`}
      >
        {value}
      </div>
      <div className="text-[11px] text-muted mt-0.5 font-medium">{subValue}</div>
    </div>
  );
}

function PropertyCard({
  property,
  openDrawer,
  setOpenDrawer,
  companies,
  onSell,
  onLease,
  onOccupy,
}: {
  property: Property;
  openDrawer: string | null;
  setOpenDrawer: (id: string | null) => void;
  companies: { id: string; industry: string }[];
  onSell: () => void;
  onLease: () => void;
  onOccupy: () => void;
}) {
  const city = CITY_MAP[property.cityId];
  const meta = PROPERTY_KIND_INFO[property.kind];
  const cashflow = computePropertyCashFlow(property);
  const cashflowNet = cashflow.monthlyIncome - cashflow.monthlyMaintenance;
  const { icon, variant } = kindInfo(property.kind);
  const isOpen = openDrawer === property.id;

  const usageLabel = (() => {
    switch (property.usage.kind) {
      case "leased":
        return `Leased · $${property.usage.monthlyRent.toLocaleString()}/mo`;
      case "occupied":
        return "Occupied by your business";
      case "vacant":
        return "Vacant";
      case "speculative":
        return "Holding for value";
      case "trophy":
        return "Prestige asset";
    }
  })();

  const usagePill = (() => {
    switch (property.usage.kind) {
      case "leased":
        return <span className="pill !bg-green-soft !text-green">Leased</span>;
      case "occupied":
        return <span className="pill !bg-blue-soft !text-blue">Occupied</span>;
      case "vacant":
        return <span className="pill pill-warn">Vacant</span>;
      case "speculative":
        return <span className="pill !bg-purple-soft !text-purple">Land</span>;
      case "trophy":
        return <span className="pill !bg-yellow-soft !text-yellow-deep">Trophy</span>;
    }
  })();

  return (
    <div>
      <button onClick={() => setOpenDrawer(isOpen ? null : property.id)} className="list-card !rounded-tile w-full text-left">
        <IconChip icon={icon} variant={variant} round />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="font-bold text-[14px] leading-tight truncate">{property.name}</div>
            {usagePill}
          </div>
          <div className="text-[11px] text-muted font-medium mt-0.5">
            {city?.name ?? property.cityId} · {meta?.label ?? property.kind}
          </div>
          <div className="text-[12px] text-ink2 mt-0.5">{usageLabel}</div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className="font-bold text-[13px]">{formatMoney(property.currentValue)}</div>
          <div
            className={`text-[11px] font-semibold ${
              cashflowNet >= 0 ? "text-green" : "text-red"
            }`}
          >
            {cashflowNet >= 0 ? "+" : ""}${cashflowNet.toLocaleString()}/mo
          </div>
        </div>
      </button>

      {isOpen && (
        <div className="p-4 bg-surface2 rounded-tile mt-1.5 fade-up">
          <div className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-1">
            Actions
          </div>
          <div className="space-y-2">
            {property.usage.kind === "vacant" && (
              <button onClick={onLease} className="btn-secondary !py-2.5 !text-[12px]">
                Lease to external tenant
              </button>
            )}
            {property.usage.kind === "vacant" && companies.length > 0 && (
              <button onClick={onOccupy} className="btn-outline w-full !py-2.5 !text-[12px]">
                Occupy with your business
              </button>
            )}
            {property.usage.kind === "leased" && !property.usage.external && (
              <div className="text-[12px] text-muted italic p-2">
                Currently leased to your own company.
              </div>
            )}
            <button
              onClick={onSell}
              className="w-full py-2.5 px-3 rounded-chip font-bold text-[12px] bg-red text-white"
            >
              Sell for {formatMoney(Math.round(property.currentValue * 0.95))}
            </button>
            <button onClick={() => setOpenDrawer(null)} className="btn-outline w-full !py-2 !text-[12px]">
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function ListingCard({
  listing,
  cash,
  openDrawer,
  setOpenDrawer,
  onPurchase,
}: {
  listing: PropertyListing;
  cash: number;
  openDrawer: string | null;
  setOpenDrawer: (id: string | null) => void;
  onPurchase: () => void;
}) {
  const city = CITY_MAP[listing.cityId];
  const meta = PROPERTY_KIND_INFO[listing.kind];
  const { icon, variant } = kindInfo(listing.kind);
  const isOpen = openDrawer === listing.id;
  const canAfford = cash >= listing.price;

  const categoryPill = (() => {
    switch (listing.category) {
      case "income":
        return <span className="pill !bg-green-soft !text-green">Income</span>;
      case "operational":
        return <span className="pill !bg-blue-soft !text-blue">Operational</span>;
      case "speculative":
        return <span className="pill !bg-purple-soft !text-purple">Speculative</span>;
      case "prestige":
        return <span className="pill !bg-yellow-soft !text-yellow-deep">Prestige</span>;
    }
  })();

  return (
    <div>
      <button onClick={() => setOpenDrawer(isOpen ? null : listing.id)} className="list-card !rounded-tile w-full text-left">
        <IconChip icon={icon} variant={variant} round />
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="font-bold text-[14px] leading-tight truncate">{listing.name}</div>
            {categoryPill}
          </div>
          <div className="text-[11px] text-muted font-medium mt-0.5">
            {city?.name ?? listing.cityId} · {meta?.label ?? listing.kind}
          </div>
          <div className="text-[12px] text-ink2 italic mt-1 line-clamp-2">{listing.hook}</div>
        </div>
        <div className="text-right flex-shrink-0">
          <div className={`font-extrabold text-[14px] ${canAfford ? "text-ink" : "text-red"}`}>
            {formatMoney(listing.price)}
          </div>
        </div>
      </button>

      {isOpen && (
        <div className="p-4 bg-surface2 rounded-tile mt-1.5 fade-up">
          <div className="grid grid-cols-2 gap-2 text-[11px] mb-3">
            <div>
              <div className="text-muted font-semibold uppercase tracking-wide">Appreciation</div>
              <div className="font-bold">
                {(listing.appreciationRate * 100).toFixed(1)}%/yr
              </div>
            </div>
            <div>
              <div className="text-muted font-semibold uppercase tracking-wide">Maintenance</div>
              <div className="font-bold text-red">
                -{formatMoney(listing.monthlyMaintenance)}/mo
              </div>
            </div>
            {listing.passiveMonthlyRent !== undefined && (
              <div>
                <div className="text-muted font-semibold uppercase tracking-wide">
                  Rent potential
                </div>
                <div className="font-bold text-green">
                  +{formatMoney(listing.passiveMonthlyRent)}/mo
                </div>
              </div>
            )}
            {listing.operationalSavings !== undefined && (
              <div>
                <div className="text-muted font-semibold uppercase tracking-wide">
                  Rent savings
                </div>
                <div className="font-bold text-green">
                  +{formatMoney(listing.operationalSavings)}/mo
                </div>
              </div>
            )}
          </div>
          <button
            onClick={onPurchase}
            disabled={!canAfford}
            className="btn-secondary !py-2.5 !text-[12px] disabled:opacity-40"
          >
            {canAfford ? `Purchase · ${formatMoney(listing.price)}` : "Insufficient cash"}
          </button>
          <button onClick={() => setOpenDrawer(null)} className="btn-outline w-full mt-2 !py-2 !text-[12px]">
            Close
          </button>
        </div>
      )}
    </div>
  );
}

function CreditTab({
  collateral,
  creditLimit,
  availableCredit,
  securedDebt,
  cash,
  borrowAmount,
  setBorrowAmount,
  onBorrow,
  onRepay,
}: {
  collateral: number;
  creditLimit: number;
  availableCredit: number;
  securedDebt: number;
  cash: number;
  borrowAmount: number;
  setBorrowAmount: (n: number) => void;
  onBorrow: () => void;
  onRepay: (amount: number) => void;
}) {
  const utilization = creditLimit > 0 ? (securedDebt / creditLimit) * 100 : 0;
  const canBorrow = borrowAmount > 0 && borrowAmount <= availableCredit;
  const canRepayFull = securedDebt > 0 && cash >= securedDebt;

  return (
    <>
      <div className="bg-gradient-to-br from-purple to-[#5b21b6] text-white rounded-card p-5 mb-3">
        <div className="text-[11px] font-semibold opacity-85 uppercase tracking-wider">
          Secured Credit Line
        </div>
        <div className="text-[32px] font-extrabold tracking-tight leading-tight mt-1">
          {formatMoney(availableCredit)}
        </div>
        <div className="text-[13px] opacity-85 font-medium">
          available of {formatMoney(creditLimit)} · {(SECURED_RATE_ANNUAL * 100).toFixed(1)}% APR
        </div>

        <div className="h-2 bg-white/20 rounded-full mt-4 overflow-hidden">
          <div
            className="h-full bg-white rounded-full"
            style={{ width: `${Math.min(100, utilization)}%` }}
          />
        </div>
        <div className="flex justify-between mt-1 text-[11px] opacity-85 font-medium">
          <span>Used: {formatMoney(securedDebt)}</span>
          <span>{utilization.toFixed(0)}% utilized</span>
        </div>
      </div>

      <div className="card-flat mb-3">
        <div className="text-[11px] font-semibold text-muted uppercase tracking-wide">
          Collateral Base
        </div>
        <div className="text-[18px] font-extrabold mt-1">{formatMoney(collateral)}</div>
        <p className="text-[12px] text-ink2 mt-1 leading-snug">
          Your credit limit is typically ~60% of your total property value. Buy more real estate
          to expand the line.
        </p>
      </div>

      {availableCredit > 0 && (
        <div className="card-flat mb-3">
          <div className="font-bold text-[15px] mb-2">Borrow</div>
          <input
            type="range"
            min={10000}
            max={Math.max(10000, availableCredit)}
            step={5000}
            value={Math.min(borrowAmount, availableCredit)}
            onChange={(e) => setBorrowAmount(Number(e.target.value))}
            className="w-full accent-purple"
          />
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-[11px] text-muted font-semibold uppercase tracking-wide">
              Amount
            </span>
            <span className="text-[22px] font-extrabold">{formatMoney(borrowAmount)}</span>
          </div>
          <button
            onClick={onBorrow}
            disabled={!canBorrow}
            className="btn-secondary mt-3 !py-2.5 disabled:opacity-40"
          >
            Draw {formatMoney(borrowAmount)}
          </button>
        </div>
      )}

      {securedDebt > 0 && (
        <div className="card-flat">
          <div className="font-bold text-[15px] mb-2">Repay</div>
          <p className="text-[12px] text-ink2 mb-3 leading-snug">
            You owe {formatMoney(securedDebt)}. Repayments reduce monthly interest.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => onRepay(Math.min(25000, securedDebt, cash))}
              disabled={cash < Math.min(25000, securedDebt)}
              className="btn-outline !py-2.5 disabled:opacity-40"
            >
              Repay $25K
            </button>
            <button
              onClick={() => onRepay(Math.min(securedDebt, cash))}
              disabled={!canRepayFull}
              className="btn-secondary !py-2.5 disabled:opacity-40"
            >
              Repay all
            </button>
          </div>
        </div>
      )}
    </>
  );
}

// ==================== Property kind → icon/variant ====================

interface KindInfo {
  icon: IconName;
  variant: ChipVariant;
}

function kindInfo(kind: PropertyKind): KindInfo {
  const map: Record<PropertyKind, KindInfo> = {
    office: { icon: "briefcase", variant: "blue" },
    retail: { icon: "cart", variant: "green" },
    industrial: { icon: "factory", variant: "orange" },
    apartment: { icon: "building", variant: "purple" },
    land: { icon: "map", variant: "yellow" },
    penthouse: { icon: "crown", variant: "yellow" },
    vineyard: { icon: "sparkle", variant: "green" },
    townhouse: { icon: "home", variant: "pink" },
  };
  return map[kind] ?? { icon: "building", variant: "surface" };
}
