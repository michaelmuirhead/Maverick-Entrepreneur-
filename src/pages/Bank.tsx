import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useGame } from "@/app/store/useGame";
import { formatMoney, formatDailyMoney, DAYS_PER_MONTH, totalDays } from "@/engine/simulation";
import { maxSecuredBorrowing } from "@/engine/realEstate";
import { SECURED_RATE_ANNUAL } from "@/data/realEstate";
import { Icon, IconChip } from "@/components/ui/Icon";

// Unsecured loan rate — roughly 2x secured rate since no collateral
const UNSECURED_APR = 0.096;

export function Bank() {
  const navigate = useNavigate();
  const state = useGame();
  const {
    cash,
    debt,
    properties,
    securedDebt,
    monthlyReports,
    companies,
    month,
    dayInMonth,
    takeLoan,
    repayDebt,
  } = state;

  const [loanAmount, setLoanAmount] = useState(50000);
  const [feedback, setFeedback] = useState<string | null>(null);

  const creditLimit = maxSecuredBorrowing(properties);
  const availableSecured = Math.max(0, creditLimit - securedDebt);

  const weeklyDelta = (() => {
    const recent = monthlyReports.slice(-1);
    if (recent.length === 0) return 0;
    // Approximate weekly as monthly / 4
    return Math.round(recent[0].cashDelta / 4);
  })();

  const totalDailyProfit = companies.reduce(
    (sum, c) => sum + c.locations.reduce((s, l) => s + l.monthlyProfit, 0),
    0
  );
  const currentDay = totalDays(month, dayInMonth);

  return (
    <div className="-mx-5">
      <div className="px-5">
        {/* Back + header row */}
        <div className="flex items-center gap-3 mt-3 mb-5">
          <button
            onClick={() => navigate("/services")}
            className="w-9 h-9 rounded-full bg-surface flex items-center justify-center flex-shrink-0"
            aria-label="Back"
          >
            <Icon name="arrow-left" size={16} strokeWidth={2.5} />
          </button>
          <IconChip icon="bank" variant="blue" />
          <div className="flex-1 min-w-0">
            <h1 className="text-[22px] font-extrabold tracking-tight leading-none">Bank</h1>
            <div className="text-[12px] text-muted">Banking & Loans</div>
          </div>
        </div>

        {feedback && (
          <div className="card-flat mb-3 text-sm italic text-ink2 fade-up">{feedback}</div>
        )}

        {/* Balance hero */}
        <div
          className="rounded-card p-5 mb-3 text-white"
          style={{ background: "linear-gradient(135deg, #3b82f6 0%, #1e40af 100%)" }}
        >
          <div className="text-[11px] font-semibold opacity-85 uppercase tracking-wider">
            Current Balance
          </div>
          <div className="text-[36px] font-extrabold tracking-tight leading-tight mt-1">
            ${cash.toLocaleString()}
          </div>
          {weeklyDelta !== 0 && (
            <div className="text-[13px] opacity-85 font-medium mt-0.5">
              {weeklyDelta >= 0 ? "↑" : "↓"} ${Math.abs(weeklyDelta).toLocaleString()} this week
            </div>
          )}
          {totalDailyProfit > 0 && (
            <div className="text-[12px] opacity-80 font-medium mt-0.5">
              ~${formatDailyMoney(totalDailyProfit).toLocaleString()}/day from {companies.length}{" "}
              business{companies.length === 1 ? "" : "es"}
            </div>
          )}
        </div>

        {/* Debt summary */}
        <div className="grid grid-cols-2 gap-2.5 mb-4">
          <div className="bg-surface rounded-tile p-3.5">
            <div className="text-[11px] text-muted font-semibold uppercase tracking-wide">
              Unsecured Debt
            </div>
            <div className={`text-[20px] font-extrabold mt-1 leading-none ${debt > 0 ? "text-red" : "text-ink"}`}>
              ${debt.toLocaleString()}
            </div>
            <div className="text-[11px] text-muted font-medium mt-0.5">
              {(UNSECURED_APR * 100).toFixed(1)}% APR
            </div>
          </div>
          <div className="bg-surface rounded-tile p-3.5">
            <div className="text-[11px] text-muted font-semibold uppercase tracking-wide">
              Secured (RE)
            </div>
            <div className={`text-[20px] font-extrabold mt-1 leading-none ${securedDebt > 0 ? "text-red" : "text-ink"}`}>
              ${securedDebt.toLocaleString()}
            </div>
            <div className="text-[11px] text-muted font-medium mt-0.5">
              {(SECURED_RATE_ANNUAL * 100).toFixed(1)}% APR
            </div>
          </div>
        </div>

        {/* Unsecured loan */}
        <div className="flex items-center gap-2.5 mt-6 mb-3">
          <IconChip icon="plus" variant="blue" size="sm" />
          <h2 className="text-[18px] font-extrabold tracking-tight">Take a Loan</h2>
        </div>
        <div className="card-flat mb-3">
          <p className="text-[12px] text-ink2 leading-snug mb-3">
            Unsecured credit, no collateral required, higher rate. For large amounts,
            consider the secured line via Real Estate.
          </p>
          <input
            type="range"
            min={10000}
            max={500000}
            step={5000}
            value={loanAmount}
            onChange={(e) => setLoanAmount(Number(e.target.value))}
            className="w-full accent-blue"
          />
          <div className="flex items-baseline justify-between mt-1">
            <span className="text-[11px] text-muted font-semibold uppercase tracking-wide">
              Amount
            </span>
            <span className="text-[22px] font-extrabold">{formatMoney(loanAmount)}</span>
          </div>
          <div className="text-[11px] text-muted mt-0.5">
            Monthly interest at {(UNSECURED_APR * 100).toFixed(1)}% APR:{" "}
            <span className="font-bold text-red">
              -{formatMoney(Math.round((loanAmount * UNSECURED_APR) / 12))}
            </span>
          </div>
          <button
            onClick={() => {
              takeLoan(loanAmount);
              setFeedback(`Drew ${formatMoney(loanAmount)} against your name. Cash in the account.`);
            }}
            className="btn-secondary mt-3 !py-2.5"
          >
            Draw {formatMoney(loanAmount)}
          </button>
        </div>

        {/* Repay */}
        {debt > 0 && (
          <>
            <div className="flex items-center gap-2.5 mt-4 mb-3">
              <IconChip icon="trending-down" variant="green" size="sm" />
              <h2 className="text-[18px] font-extrabold tracking-tight">Repay Debt</h2>
            </div>
            <div className="card-flat">
              <p className="text-[12px] text-ink2 leading-snug mb-3">
                You owe {formatMoney(debt)}. Pay it down to reduce monthly interest drag.
              </p>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    const amount = Math.min(25000, debt, cash);
                    repayDebt(amount);
                    setFeedback(`Paid down ${formatMoney(amount)}.`);
                  }}
                  disabled={cash < Math.min(25000, debt)}
                  className="btn-outline !py-2.5 disabled:opacity-40"
                >
                  Repay $25K
                </button>
                <button
                  onClick={() => {
                    const amount = Math.min(debt, cash);
                    repayDebt(amount);
                    setFeedback(`Paid down ${formatMoney(amount)}.`);
                  }}
                  disabled={cash < debt}
                  className="btn-secondary !py-2.5 disabled:opacity-40"
                >
                  Repay all
                </button>
              </div>
            </div>
          </>
        )}

        {/* Credit line summary */}
        {creditLimit > 0 && (
          <>
            <div className="flex items-center gap-2.5 mt-6 mb-3">
              <IconChip icon="shield" variant="purple" size="sm" />
              <h2 className="text-[18px] font-extrabold tracking-tight">
                Secured Credit Line
              </h2>
            </div>
            <button
              onClick={() => navigate("/real-estate")}
              className="list-card !rounded-tile w-full"
            >
              <IconChip icon="building-2" variant="purple" round />
              <div className="flex-1 min-w-0 text-left">
                <div className="font-bold text-[14px]">
                  {formatMoney(availableSecured)} available
                </div>
                <div className="text-[11px] text-muted mt-0.5">
                  Backed by {properties.length} propert
                  {properties.length === 1 ? "y" : "ies"} ·{" "}
                  {(SECURED_RATE_ANNUAL * 100).toFixed(1)}% APR
                </div>
              </div>
              <Icon name="chevron-right" size={18} className="text-muted" />
            </button>
          </>
        )}

        {/* Recent activity */}
        <div className="flex items-center gap-2.5 mt-6 mb-3">
          <IconChip icon="trending-up" variant="blue" size="sm" />
          <h2 className="text-[18px] font-extrabold tracking-tight">Recent Activity</h2>
        </div>
        {monthlyReports.length === 0 ? (
          <div className="card-flat text-center text-muted text-[13px] italic py-6">
            No activity yet. Simulate days to see monthly reports.
          </div>
        ) : (
          <div className="card-flat !p-0 px-4">
            {monthlyReports.slice(-5).reverse().map((r, idx, arr) => {
              const daysAgo = Math.max(
                0,
                currentDay - (r.month + 1) * DAYS_PER_MONTH
              );
              return (
                <div
                  key={r.month}
                  className={`flex gap-3 py-3 ${
                    idx < arr.length - 1 ? "border-b border-line" : ""
                  }`}
                >
                  <IconChip
                    icon={r.cashDelta >= 0 ? "arrow-up" : "arrow-down"}
                    variant={r.cashDelta >= 0 ? "green" : "red"}
                    size="sm"
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-bold text-[14px] leading-tight truncate">
                        {r.headline}
                      </div>
                      <div className="text-[12px] text-muted font-medium whitespace-nowrap">
                        {daysAgo === 0 ? "today" : `${daysAgo}d`}
                      </div>
                    </div>
                    <div className="text-[13px] text-ink2 mt-0.5 leading-snug">
                      Revenue {formatMoney(r.revenue)} · Profit{" "}
                      <span
                        className={r.profit >= 0 ? "text-green" : "text-red"}
                      >
                        {r.profit >= 0 ? "+" : ""}
                        {formatMoney(r.profit)}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="h-6" />
      </div>
    </div>
  );
}
