import { requirePerm } from "@/lib/auth";
import { listAllProducts, listCategories, listProducts } from "@/lib/catalog";
import { getSettings, DEFAULT_SETTINGS } from "@/lib/settings";
import { query } from "@/lib/db";
import { SHOWCASE_SECTIONS } from "@/lib/showcase-sections";
import ShowcaseEditor from "@/components/admin/ShowcaseEditor";

export const metadata = { title: "Showcase" };

// the built-in photos, shown as "Original" until the owner uploads their own
const ORIGINAL = {
  ethos: "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=900&q=72",
  look: "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=72",
  hero: DEFAULT_SETTINGS.hero.image,
};

export default async function ShowcasePage() {
  await requirePerm("banners");
  const [all, live, categories, settings, [lastOrder]] = await Promise.all([
    listAllProducts(), listProducts(), listCategories(), getSettings(),
    query("SELECT token FROM orders WHERE phone <> '0' ORDER BY id DESC LIMIT 1"),
  ]);
  const sc = settings.showcase || {};

  const products = all.map((p) => ({
    id: p.id, name: p.name, category: p.category_name || "No category", status: p.status,
    stock: p.total_stock, off: p.off, image: p.images[0]?.thumb || null,
    images: p.images.map((i) => ({ id: i.id, thumb: i.thumb })),
  }));

  // what the automatic rule shows right now, so the owner starts from what customers see
  const ids = (list, n) => list.slice(0, n).map((p) => p.id);
  const previews = {
    arrivals: ids(live, SHOWCASE_SECTIONS.arrivals.max),
    sale: ids(live.filter((p) => p.off > 0), SHOWCASE_SECTIONS.sale.max),
    waiting: ids([...live].sort((a, b) => Number(b.is_featured) - Number(a.is_featured)).filter((p) => p.total_stock > 0), SHOWCASE_SECTIONS.waiting.max),
    lookbook: ids(live.filter((p) => p.images.length), SHOWCASE_SECTIONS.lookbook.max),
  };

  // gallery chapters: every photo of the collection's live pieces; automatic shows up to 3 per piece
  const chapter = (slug, name, items) => ({
    slug, name,
    photos: items.flatMap((p) => p.images.map((i, n) => ({ id: i.id, thumb: i.thumb, product: p.name, auto: n < 3 }))),
  });
  const chapters = categories
    .map((c) => chapter(c.slug, c.name, live.filter((p) => p.category_id === c.id)))
    .concat([chapter("more", "More (no collection)", live.filter((p) => !categories.some((c) => c.id === p.category_id)))])
    .filter((c) => c.photos.length);

  const sections = {};
  for (const key of Object.keys(SHOWCASE_SECTIONS)) {
    const s = sc.sections?.[key];
    sections[key] = { mode: s?.mode === "pick" ? "pick" : "auto", fill: s?.fill !== false, items: s?.items || [] };
  }
  const initial = {
    sections,
    photos: { hero: settings.hero.image === DEFAULT_SETTINGS.hero.image ? "" : settings.hero.image, ethos: sc.photos?.ethos || "", look: sc.photos?.look || "" },
    gallery: sc.gallery || {},
  };

  // where "Show me on the shop" opens each page (a real product and the latest order stand in for "any")
  const pages = {
    home: "/", lookbook: "/lookbook", bag: "/products",
    product: live[0] ? `/products/${live[0].slug}` : null,
    order: lastOrder ? `/order/${lastOrder.token}` : null,
  };

  return <ShowcaseEditor initial={initial} products={products} previews={previews} chapters={chapters} originals={ORIGINAL} pages={pages} />;
}
