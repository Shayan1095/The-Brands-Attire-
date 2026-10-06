import { requirePerm } from "@/lib/auth";
import { query } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { listCategories } from "@/lib/catalog";
import {
  toggleSaleAction, deleteSaleAction,
  saveCouponAction, toggleCouponAction, deleteCouponAction, saveSettingsAction,
} from "@/lib/admin-actions";
import { money, fmtDate } from "@/lib/format";
import { ConfirmButton } from "@/components/admin/Widgets";
import SaleForm from "@/components/admin/SaleForm";

export const metadata = { title: "Offers & sales" };

function saleState(s) {
  const now = new Date();
  if (!s.is_active) return ["Paused", ""];
  if (s.starts_at > now) return ["Scheduled", "info"];
  if (s.ends_at && s.ends_at < now) return ["Ended", ""];
  return ["Live", "ok"];
}

export default async function Offers({ searchParams }) {
  const viewer = await requirePerm("offers");
  const { error, saved } = await searchParams;
  const [sales, coupons, categories, products, settings, [{ n: subscribers }]] = await Promise.all([
    query("SELECT s.*, c.name AS category_name FROM sales s LEFT JOIN categories c ON c.id = s.category_id ORDER BY s.id DESC"),
    query("SELECT * FROM coupons ORDER BY id DESC"),
    listCategories({ all: true }),
    query(`SELECT p.id, p.name, p.status, COALESCE(c.name, 'No category') AS category,
                  (SELECT thumb_url FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.id LIMIT 1) AS image
           FROM products p LEFT JOIN categories c ON c.id = p.category_id
           WHERE p.status <> 'archived' ORDER BY c.sort_order NULLS LAST, c.name, p.name`),
    getSettings(),
    query("SELECT count(*)::int AS n FROM contacts WHERE email_opt_in OR whatsapp_opt_in"),
  ]);
  const tz = settings.store.timezone;
  const cur = settings.store.currency;
  const a = settings.announcement;

  return (
    <>
      <div className="head">
        <div><h1>Offers &amp; sales</h1><p>Run a sale, hand out discount codes and control the banner at the top of the shop.</p></div>
      </div>
      {error && <div className="note note--bad">{error}</div>}
      {saved && <div className="note note--ok">Saved.</div>}

      <div className="cols cols--even">
        <div>
          <div className="card">
            <h2>Start a sale</h2>
            <p className="sub">Prices drop automatically for the dates you pick and go back by themselves. No editing products one by one.</p>
            <SaleForm categories={categories.map(({ id, name }) => ({ id, name }))} products={products} subscribers={subscribers} />
          </div>

          <div className="card">
            <h2>Sales</h2>
            {sales.length ? (
              <div className="tablewrap" style={{ marginTop: 8 }}>
                <table className="table">
                  <thead><tr><th>Sale</th><th>Applies to</th><th>Dates</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {sales.map((s) => {
                      const [label, tone] = saleState(s);
                      return (
                        <tr key={s.id}>
                          <td><b>{s.name}</b><div className="dim">{s.percent}% off</div></td>
                          <td>{s.scope === "all" ? "Everything" : s.scope === "category" ? s.category_name : `${s.product_ids.length} products`}</td>
                          <td className="dim">{fmtDate(s.starts_at, tz, false)} → {s.ends_at ? fmtDate(s.ends_at, tz, false) : "open"}</td>
                          <td><span className={`pill ${tone}`}>{label}</span></td>
                          <td>
                            <div className="inline" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                              <form action={toggleSaleAction}><input type="hidden" name="id" value={s.id} /><button className="btn btn--ghost btn--sm">{s.is_active ? "Pause" : "Resume"}</button></form>
                              <form action={deleteSaleAction}><input type="hidden" name="id" value={s.id} /><ConfirmButton message={`Delete the sale “${s.name}”?`}>Delete</ConfirmButton></form>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <p className="dim">No sales yet.</p>}
          </div>
        </div>

        <div>
          <div className="card">
            <h2>Announcement bar</h2>
            <p className="sub">The black strip at the very top of every shop page.</p>
            <form action={saveSettingsAction}>
              <input type="hidden" name="_key" value="announcement" />
              <input type="hidden" name="_back" value="offers" />
              <div className="field"><label>Text</label><input name="text" defaultValue={a.text} /></div>
              <div className="field"><label>Link (optional)</label><input name="link" defaultValue={a.link} placeholder="/products?sale=1" /></div>
              <label className="check"><input type="checkbox" name="enabled" defaultChecked={a.enabled} /> Show the bar</label>
              <button className="btn btn--sm">Save bar</button>
            </form>
          </div>

          <div className="card">
            <h2>Discount codes</h2>
            <p className="sub">Customers type the code at checkout.</p>
            <form action={saveCouponAction}>
              <div className="frow">
                <div className="field"><label>Code</label><input name="code" required placeholder="EID15" style={{ textTransform: "uppercase" }} /></div>
                <div className="field"><label>Type</label><select name="type"><option value="percent">% off</option><option value="fixed">Fixed amount off</option></select></div>
                <div className="field"><label>Value</label><input name="value" type="number" min="1" required /></div>
              </div>
              <div className="frow">
                <div className="field"><label>Minimum order</label><input name="min_subtotal" type="number" min="0" defaultValue="0" /></div>
                <div className="field"><label>Max uses</label><input name="max_uses" type="number" min="1" placeholder="Unlimited" /></div>
                <div className="field"><label>Expires</label><input name="ends_at" type="date" /></div>
              </div>
              <button className="btn btn--sm">Save code</button>
            </form>
            {coupons.length > 0 && (
              <div className="tablewrap" style={{ marginTop: 16 }}>
                <table className="table">
                  <thead><tr><th>Code</th><th>Discount</th><th>Used</th><th>Status</th><th /></tr></thead>
                  <tbody>
                    {coupons.map((c) => (
                      <tr key={c.id}>
                        <td><b className="mono">{c.code}</b>{c.min_subtotal > 0 && <div className="dim">min {money(c.min_subtotal, cur)}</div>}</td>
                        <td>{c.type === "percent" ? `${c.value}%` : money(c.value, cur)}</td>
                        <td>{c.used_count}{c.max_uses ? ` / ${c.max_uses}` : ""}</td>
                        <td><span className={`pill ${c.is_active && !(c.ends_at && c.ends_at < new Date()) ? "ok" : ""}`}>{!c.is_active ? "Off" : c.ends_at && c.ends_at < new Date() ? "Expired" : "Active"}</span></td>
                        <td>
                          <div className="inline" style={{ justifyContent: "flex-end", flexWrap: "nowrap" }}>
                            <form action={toggleCouponAction}><input type="hidden" name="id" value={c.id} /><button className="btn btn--ghost btn--sm">{c.is_active ? "Turn off" : "Turn on"}</button></form>
                            <form action={deleteCouponAction}><input type="hidden" name="id" value={c.id} /><ConfirmButton message={`Delete the code ${c.code}?`}>Delete</ConfirmButton></form>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
