import Link from "next/link";
import { Icon } from "../icons";

/*
  Shop by category as expanding panels: the panel under the pointer (or keyboard focus) opens wide,
  the others fold into slim strips with their name running vertically. Pure CSS, so it needs no
  JavaScript and works with any number of categories. Phones get a stack of full-width tiles.
  `onPick(slug)` (optional) handles the click instead of navigating: the products page switches collection in place.
*/
export default function CategoryPanels({ categories, onPick }) {
  return (
    <div className="panels" style={{ "--n": categories.length }}>
      {categories.map((c, i) => (
        <Link key={c.id} href={`/products?category=${c.slug}`} className="panel" data-clip onClick={onPick ? (e) => { e.preventDefault(); onPick(c.slug); } : undefined}>
          <span className="panel__img" data-parallax-box>
            {c.image_url && <img src={c.image_url} alt="" loading="lazy" decoding="async" data-parallax />}
          </span>
          <span className="panel__num">/ {String(i + 1).padStart(2, "0")}</span>
          <span className="panel__strip" aria-hidden>{c.name}</span>
          <span className="panel__body">
            <span className="panel__count">{c.product_count} {c.product_count === 1 ? "piece" : "pieces"}</span>
            <span className="panel__name">{c.name}</span>
            {c.description && <span className="panel__desc">{c.description}</span>}
            <span className="panel__cta">Shop {c.name} <Icon name="arrow" /></span>
          </span>
        </Link>
      ))}
    </div>
  );
}
