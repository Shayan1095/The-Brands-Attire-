import Link from "next/link";
import { requirePerm } from "@/lib/auth";
import { query } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { fmtDate, variantLabel } from "@/lib/format";
import InventoryBoard from "@/components/admin/InventoryBoard";
import StockAdjust from "@/components/admin/StockAdjust";

export const metadata = { title: "Inventory" };

const TYPE_LABEL = { sale: "Sold", cancel: "Order cancelled", return: "Returned to stock", damaged: "Damaged", supplier: "Supplier delivery", count: "Recount", lost: "Lost", found: "Found", adjust: "Adjustment" };

export default async function Inventory({ searchParams }) {
  await requirePerm("inventory");
  const { log } = await searchParams;
  const [rows, moves, settings] = await Promise.all([
    query(
      `SELECT v.id, v.size, v.color, v.sku, v.stock, v.reserved, p.id AS product_id, p.name, p.status, p.product_type, p.low_stock_threshold AS low_at,
              COALESCE(c.name, '') AS category,
              (SELECT thumb_url FROM product_images i WHERE i.product_id = p.id ORDER BY i.sort_order, i.id LIMIT 1) AS image,
              (SELECT count(*)::int FROM stock_alerts a WHERE a.variant_id = v.id AND a.notified_at IS NULL) AS waiting
       FROM variants v JOIN products p ON p.id = v.product_id LEFT JOIN categories c ON c.id = p.category_id
       WHERE p.status <> 'archived'
       ORDER BY p.name, v.sort_order, v.id`
    ),
    query(
      `SELECT m.id, m.delta, m.qty, m.type, m.reason, m.created_at, v.size, v.color, p.name, a.name AS staff, o.number, m.order_id
       FROM stock_movements m JOIN variants v ON v.id = m.variant_id JOIN products p ON p.id = v.product_id
       LEFT JOIN admins a ON a.id = m.admin_id LEFT JOIN orders o ON o.id = m.order_id
       ${TYPE_LABEL[log] ? "WHERE m.type = $1" : ""}
       ORDER BY m.id DESC LIMIT 40`,
      TYPE_LABEL[log] ? [log] : []
    ),
    getSettings(),
  ]);

  // one entry per product, sizes nested inside
  const products = [];
  for (const r of rows) {
    let p = products.at(-1);
    if (!p || p.id !== r.product_id) {
      p = { id: r.product_id, name: r.name, image: r.image, status: r.status, category: r.category, type: r.product_type, lowAt: r.low_at, variants: [] };
      products.push(p);
    }
    p.variants.push({ id: r.id, size: variantLabel(r), sku: r.sku, stock: r.stock, reserved: r.reserved, waiting: r.waiting });
  }

  return (
    <>
      <div className="head">
        <div>
          <h1>Inventory</h1>
          <p>Every product on one line with all its sizes. The box is what is physically on hand; type a new number and press Enter to recount.</p>
        </div>
      </div>
      <div className="tabs">
        <Link href="/admin/inventory" className="active">Stock</Link>
        <Link href="/admin/inventory/insights">Insights &amp; restock</Link>
      </div>

      {products.length ? <InventoryBoard products={products} /> : <div className="card"><p className="empty">No products yet. Add a product first.</p></div>}

      <div className="cols" style={{ marginTop: 16 }}>
        <div className="card">
          <div className="card__head">
            <h2>Stock movement log</h2>
            <div className="filters" style={{ margin: 0 }}>
              <Link href="/admin/inventory" className={!TYPE_LABEL[log] ? "active" : ""}>All</Link>
              {["sale", "return", "damaged", "supplier", "count"].map((t) => <Link key={t} href={`/admin/inventory?log=${t}`} className={log === t ? "active" : ""}>{TYPE_LABEL[t]}</Link>)}
            </div>
          </div>
          {moves.length ? (
            <div className="tablewrap" style={{ marginTop: 8 }}>
              <table className="table">
                <thead><tr><th>When</th><th>Product</th><th>What happened</th><th>By</th><th className="num">Stock change</th></tr></thead>
                <tbody>
                  {moves.map((m) => (
                    <tr key={m.id}>
                      <td className="dim">{fmtDate(m.created_at, settings.store.timezone)}</td>
                      <td>{m.name}<div className="dim">{variantLabel(m)}</div></td>
                      <td>
                        {TYPE_LABEL[m.type] || m.type}
                        <div className="dim">{m.order_id ? <Link href={`/admin/orders/${m.order_id}`} className="link">{m.number}</Link> : m.reason}</div>
                      </td>
                      <td className="dim">{m.staff || "System"}</td>
                      <td className="num"><b>{m.delta > 0 ? `+${m.delta}` : m.delta}</b>{m.type === "damaged" && m.delta === 0 && <div className="dim">{m.qty} written off</div>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="dim" style={{ marginTop: 8 }}>No stock changes recorded{TYPE_LABEL[log] ? " of this kind" : ""} yet.</p>}
        </div>
        <div className="card">
          <h2>Record a stock change</h2>
          <p className="sub">A supplier delivery, damaged or lost pieces, or a recount. Every change is logged with your name.</p>
          <StockAdjust products={products.map((p) => ({ id: p.id, name: p.name, variants: p.variants.map((v) => ({ id: v.id, size: v.size, stock: v.stock })) }))} />
        </div>
      </div>
    </>
  );
}
