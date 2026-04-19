/** Shared number formatters. */

export function money(n: number, opts?: { short?: boolean; sign?: boolean }): string {
  const short = opts?.short ?? false;
  const sign = opts?.sign ?? false;
  const abs = Math.abs(n);
  let body: string;
  if (short && abs >= 1_000_000) body = `$${(n / 1_000_000).toFixed(abs >= 10_000_000 ? 0 : 1)}M`;
  else if (short && abs >= 1_000) body = `$${(n / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  else body = `$${Math.round(n).toLocaleString()}`;
  if (sign && n > 0) body = `+${body}`;
  return body;
}

export function pct(n: number, digits = 1): string {
  return `${(n * 100).toFixed(digits)}%`;
}

export function weekLabel(week: number): string {
  const year = 1 + Math.floor(week / 52);
  const w = (week % 52) + 1;
  return `Y${year} · W${w}`;
}

export function quarterLabel(week: number): string {
  const year = 1 + Math.floor(week / 52);
  const q = ((Math.floor((week % 52) / 13)) % 4) + 1;
  return `Y${year} · Q${q}`;
}
