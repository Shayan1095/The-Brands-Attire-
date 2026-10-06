"use client";

import { useMemo, useState } from "react";

/** Rounds a maximum up to a clean axis top: 1, 2, 2.5, 5 or 10 times a power of ten. */
function niceMax(value) {
  if (value <= 0) return 100;
  const pow = 10 ** Math.floor(Math.log10(value));
  return [1, 2, 2.5, 5, 10].map((m) => m * pow).find((v) => v >= value);
}

/**
 * Daily sales as columns. One series, so no legend: the card title names it.
 * `days` = [{ label, total, orders }] oldest first. Hover (or focus) a column for its figures;
 * every value is also in the table under the chart.
 */
export default function SalesChart({ days, currency }) {
  const [range, setRange] = useState(30);
  const [active, setActive] = useState(null);
  const shown = useMemo(() => days.slice(-range), [days, range]);
  const top = niceMax(Math.max(...shown.map((d) => d.total)));
  const fmt = (n) => `${currency} ${Number(n).toLocaleString("en-US")}`;
  const short = (n) => (n >= 1000 ? `${(n / 1000).toLocaleString("en-US", { maximumFractionDigits: 1 })}k` : String(n));
  const ticks = [0, 0.5, 1];

  return (
    <div className="chart">
      <div className="inline" style={{ justifyContent: "space-between" }}>
        <span className="dim">{fmt(shown.reduce((s, d) => s + d.total, 0))} from {shown.reduce((s, d) => s + d.orders, 0)} orders</span>
        <div className="seg" role="group" aria-label="Period">
          {[7, 14, 30].map((n) => <button key={n} className={range === n ? "active" : ""} onClick={() => setRange(n)} aria-pressed={range === n}>{n} days</button>)}
        </div>
      </div>

      <div className="chart__plot" style={{ marginTop: 16 }}>
        <div className="chart__y" aria-hidden>
          {ticks.map((t) => <span key={t} style={{ bottom: `${t * 100}%` }}>{short(top * t)}</span>)}
        </div>
        <div className="chart__area" role="img" aria-label={`Daily sales for the last ${range} days`} onMouseLeave={() => setActive(null)}>
          {ticks.slice(1).map((t) => <i key={t} className="chart__grid" style={{ bottom: `${t * 100}%` }} />)}
          {shown.map((d, i) => (
            <div
              key={d.label} className={`chart__col ${d.total ? "" : "zero"} ${active === i ? "on" : ""}`} tabIndex={0}
              onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)} onBlur={() => setActive(null)}
            >
              <i style={{ height: `${Math.max(1, (d.total / top) * 100)}%`, animationDelay: `${i * 12}ms` }} />
              {active === i && (
                <div className="chart__tip" style={i > shown.length / 2 ? { right: 0 } : { left: 0 }}>
                  <small>{d.label}</small>
                  <b>{fmt(d.total)}</b>
                  <small>{d.orders} {d.orders === 1 ? "order" : "orders"}</small>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
      <div className="chart__x" aria-hidden>
        <span>{shown[0].label}</span><span>{shown[Math.floor(shown.length / 2)].label}</span><span>Today</span>
      </div>

      <details className="chart__table">
        <summary>View as table</summary>
        <div className="tablewrap">
          <table className="table">
            <thead><tr><th>Day</th><th className="num">Orders</th><th className="num">Sales</th></tr></thead>
            <tbody>{[...shown].reverse().map((d) => <tr key={d.label}><td>{d.label}</td><td className="num">{d.orders}</td><td className="num">{fmt(d.total)}</td></tr>)}</tbody>
          </table>
        </div>
      </details>
    </div>
  );
}
