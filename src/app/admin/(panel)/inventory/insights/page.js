import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { stockInsights } from "@/lib/insights";
import { can } from "@/lib/format";

export const metadata = { title: "Stock insights" };

export default async function Insights() {
  const viewer = await requirePerm("inventory");
  const d = await stockInsights();
  const topFast = Math.max(1, ...d.fast.map((p) => p.sold30));
  const topSlow = Math.max(1, ...d.slow.map((p) => p.available));
  const productHref = (id) => (can(viewer, "products") ? `/admin/products/${id}` : null);
  const Name = ({ id, children }) => (productHref(id) ? <Link href={productHref(id)} className="link">{children}</Link> : <span>{children}</span>);

  return (
    <>
      <div className="head">
        <div>
          <h1>Stock insights</h1>
          <p>What is selling, what is stuck, what will run out, and how much to reorder. Based on the last 30 days of confirmed orders, weighted towards the last 7.</p>
        </div>
        <div className="head__actions">
          <a href="/admin/inventory/insights/export" className="btn btn--ghost">Download restock list (CSV)</a>
        </div>
      </div>
      <div className="tabs">
        <Link href="/admin/inventory">Stock</Link>
        <Link href="/admin/inventory/insights" className="active">Insights &amp; restock</Link>
      </div>

      <div className="kpis">
        <div className="kpi"><span className="kpi__label">Units to reorder</span><div className="kpi__value">{d.totals.toOrder}</div><div className="kpi__foot">Across {d.restock.length} sizes</div></div>
        <div className="kpi"><span className="kpi__label">Running out soon</span><div className="kpi__value">{d.runningOut.length}</div><div className="kpi__foot">Sizes gone before a delivery could arrive</div></div>
        <div className="kpi"><span className="kpi__label">Units not moving</span><div className="kpi__value">{d.totals.stuck}</div><div className="kpi__foot">In products with no sale in 30 days</div></div>
        <div className="kpi"><span className="kpi__label">Returned / damaged / lost</span><div className="kpi__value">{(d.losses.return || 0)} / {(d.losses.damaged || 0)} / {(d.losses.lost || 0)}</div><div className="kpi__foot">Units, last 30 days</div></div>
      </div>

      <div className="note note--info">
        <span>
          Reorder amounts assume a supplier takes <b>{d.lead} days</b> and that each order should last <b>{d.cover} days</b>; change both in Settings → Stock planning.{" "}
          {d.hasHistory
            ? <>Demand is scaled by <b>×{d.factor.toFixed(2)}</b> because this period last year sold {d.factor >= 1 ? "more" : "less"} than the month before it.</>
            : <>Seasonal adjustment switches on by itself once the shop has sales from this time last year.</>}
        </span>
      </div>

      <div className="card">
        <h2>Restock suggestions</h2>
        <p className="sub">Most urgent first. “Days left” is how long current stock lasts at the recent sales rate.</p>
        {d.restock.length ? (
          <div className="tablewrap">
            <table className="table">
              <thead><tr><th>Product</th><th>Size</th><th className="num">Available</th><th className="num">Sold 7d</th><th className="num">Sold 30d</th><th className="num">Per week</th><th>Days left</th><th className="num">Suggested order</th></tr></thead>
              <tbody>
                {d.restock.map((v) => (
                  <tr key={v.id}>
                    <td><div className="cell-prod"><img src={v.image || undefined} alt="" /><span><b><Name id={v.productId}>{v.name}</Name></b><small>{v.category}</small></span></div></td>
                    <td>{v.label}</td>
                    <td className="num">{v.available}{v.reserved > 0 && <div className="dim">{v.reserved} reserved</div>}</td>
                    <td className="num">{v.sold7}</td>
                    <td className="num">{v.sold30}</td>
                    <td className="num">{v.perWeek}</td>
                    <td>{v.available === 0 ? <span className="pill bad">Sold out</span> : v.urgent ? <span className="pill bad">{v.daysLeft} days</span> : <span className="pill warn">{v.daysLeft} days</span>}</td>
                    <td className="num"><b>{v.suggest}</b> <span className="dim">units</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="empty">Nothing needs reordering yet. Suggestions appear once confirmed orders start coming in.</p>}
      </div>

      <div className="cols cols--even" style={{ marginTop: 16 }}>
        <div className="card">
          <h2>Fast sellers</h2>
          <p className="sub">Units sold in 30 days, and the share of available stock that sold.</p>
          {d.fast.length ? (
            <div className="hbars">
              {d.fast.map((p) => (
                <div className="hbar" key={p.id}>
                  <span className="hbar__label"><Name id={p.id}>{p.name}</Name></span>
                  <span className="hbar__value">{p.sold30} <span className="dim" style={{ fontWeight: 400 }}>· {p.sellThrough}% sold · {p.available} left</span></span>
                  <span className="hbar__track"><i style={{ width: `${(p.sold30 / topFast) * 100}%` }} /></span>
                </div>
              ))}
            </div>
          ) : <p className="dim">No confirmed sales in the last 30 days.</p>}
        </div>
        <div className="card">
          <h2>Slow movers</h2>
          <p className="sub">In stock but not one sale in 30 days. Candidates for a sale or a campaign.</p>
          {d.slow.length ? (
            <div className="hbars">
              {d.slow.map((p) => (
                <div className="hbar" key={p.id}>
                  <span className="hbar__label"><Name id={p.id}>{p.name}</Name></span>
                  <span className="hbar__value">{p.available} <span className="dim" style={{ fontWeight: 400 }}>units sitting</span></span>
                  <span className="hbar__track"><i style={{ width: `${(p.available / topSlow) * 100}%` }} /></span>
                </div>
              ))}
            </div>
          ) : <p className="dim">Everything in stock has sold at least once this month.</p>}
          {d.slow.length > 0 && can(viewer, "offers") && <Link href="/admin/offers" className="btn btn--ghost btn--sm" style={{ marginTop: 14 }}>Start a sale on these</Link>}
        </div>
      </div>
    </>
  );
}
