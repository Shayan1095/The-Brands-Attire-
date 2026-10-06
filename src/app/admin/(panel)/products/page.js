import { requirePerm } from "@/lib/auth";
import Link from "next/link";
import { listAllProducts } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { money } from "@/lib/format";

export const metadata = { title: "Products" };

const TONE = { active: "ok", draft: "warn", archived: "" };

export default async function Products({ searchParams }) {
  const viewer = await requirePerm("products");
  const { status } = await searchParams;
  const [all, settings] = await Promise.all([listAllProducts(), getSettings()]);
  const products = status ? all.filter((p) => p.status === status) : all;
  const fmt = (n) => money(n, settings.store.currency);
  const count = (s) => all.filter((p) => p.status === s).length;

  return (
    <>
      <div className="head">
        <div><h1>Products</h1><p>{all.length} products in your catalogue.</p></div>
        <div className="head__actions"><Link href="/admin/products/new" className="btn">+ Add product</Link></div>
      </div>
      <div className="tabs">
        <Link href="/admin/products" className={!status ? "active" : ""}>All ({all.length})</Link>
        {["active", "draft", "archived"].map((s) => (
          <Link key={s} href={`/admin/products?status=${s}`} className={status === s ? "active" : ""}>{s[0].toUpperCase() + s.slice(1)} ({count(s)})</Link>
        ))}
      </div>
      <div className="card">
        {products.length ? (
          <div className="tablewrap" style={{ marginTop: -20 }}>
            <table className="table">
              <thead><tr><th>Product</th><th>Status</th><th>Sizes in stock</th><th className="num">Stock</th><th className="num">Price</th></tr></thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id}>
                    <td>
                      <Link href={`/admin/products/${p.id}`} className="cell-prod">
                        {p.images[0] ? <img src={p.images[0].thumb} alt="" /> : <img alt="" />}
                        <span><b>{p.name}</b><small>{p.category_name || "No category"}</small></span>
                      </Link>
                    </td>
                    <td><span className={`pill ${TONE[p.status]}`}>{p.status}</span></td>
                    <td className="dim">{p.variants.filter((v) => v.stock > 0).map((v) => v.size).join(" · ") || "None"}</td>
                    <td className="num">{p.total_stock === 0 ? <span className="pill bad">Sold out</span> : p.total_stock}</td>
                    <td className="num">
                      {fmt(p.final_price)}
                      {p.off > 0 && <div className="dim"><s>{fmt(p.original_price)}</s> −{p.off}%</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="empty">No products here yet. <Link href="/admin/products/new" className="link">Add your first product</Link>.</p>}
      </div>
    </>
  );
}
