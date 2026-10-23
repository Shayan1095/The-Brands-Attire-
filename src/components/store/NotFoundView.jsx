import Link from "next/link";
import { listProducts, listCategories, toCard } from "@/lib/catalog";
import ProductCard from "./ProductCard";
import { Icon } from "./icons";

/**
 * The shop's "not found" screen: wrong address (app/global-not-found.js) or a product / order that is gone
 * ((store)/not-found.js). An empty hanger, a search box (plain form: works before any JavaScript loads),
 * the collections, and a few pieces to carry on with.
 */
export default async function NotFoundView({ what = "page" }) {
  let picks = [], categories = [];
  try {
    const [all, cats] = await Promise.all([listProducts(), listCategories()]);
    picks = all.filter((p) => p.total_stock > 0).sort((a, b) => Number(b.is_featured) - Number(a.is_featured)).slice(0, 4).map(toCard);
    categories = cats.filter((c) => c.product_count > 0);
  } catch {
    // the screen must still show if the catalogue cannot be read
  }
  const gone = what === "product";

  return (
    <section className="nf">
      <div className="wrap nf__grid">
        <div className="nf__copy">
          <span className="eyebrow">Error 404 · {gone ? "Piece not found" : "Page not found"}</span>
          <h1 className="display nf__title">
            {gone ? <>This piece has <em>left the rail</em>.</> : <>Nothing on <em>this rail</em>.</>}
          </h1>
          <p className="nf__lede">
            {gone
              ? "It may have sold out for good or moved to a new address. Search for it, or see what is new in the shop."
              : "The link may be old or mistyped. Search the shop, or pick up from one of the collections below."}
          </p>

          <form action="/products" method="get" className="nf__search" role="search">
            <Icon name="search" />
            <input name="q" placeholder="Search jackets, tees, merino…" aria-label="Search the shop" autoComplete="off" enterKeyHint="search" />
            <button type="submit" className="btn">Search</button>
          </form>

          <div className="nf__links">
            {categories.map((c) => <Link key={c.id} href={`/products?category=${c.slug}`} className="srch__chip">{c.name}</Link>)}
            <Link href="/products?sale=1" className="srch__chip is-sale">Sale</Link>
            <Link href="/track" className="srch__chip">Track an order</Link>
            <Link href="/" className="srch__chip">Home</Link>
          </div>
        </div>

        {/* an empty hanger, swinging gently over a giant 404 */}
        <div className="nf__art" aria-hidden>
          <span className="nf__404">4<b>0</b>4</span>
          <svg className="nf__hanger" viewBox="0 0 240 180">
            <path d="M120 18c-10 0-17 7-17 16 0 8 6 12 12 15 4 2 5 4 5 8v6" />
            <path d="M120 63 22 140c-8 6-4 16 6 16h184c10 0 14-10 6-16L120 63z" />
          </svg>
        </div>
      </div>

      {picks.length > 0 && (
        <div className="wrap nf__picks">
          <header className="section__head">
            <div><span className="eyebrow">While you are here</span><h2>Just in</h2></div>
            <Link href="/products" className="link-arrow">Shop all</Link>
          </header>
          <div className="nf__cards">{picks.map((p) => <ProductCard key={p.id} p={p} reveal={false} />)}</div>
        </div>
      )}
    </section>
  );
}
