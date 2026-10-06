import { requirePerm } from "@/lib/auth";
import { query } from "@/lib/db";
import { listProducts } from "@/lib/catalog";
import { getSettings } from "@/lib/settings";
import { variantLabel } from "@/lib/format";
import ManualOrderForm from "@/components/admin/ManualOrderForm";

export const metadata = { title: "New order" };

export default async function NewOrder({ searchParams }) {
  const viewer = await requirePerm("orders");
  const { exchange } = await searchParams;
  const [products, staff, settings, [source]] = await Promise.all([
    listProducts(),
    query("SELECT id, name, email FROM admins WHERE is_active ORDER BY name"),
    getSettings(),
    exchange ? query("SELECT id, number, channel, customer_name, phone, email, address, city FROM orders WHERE id = $1", [Number(exchange) || 0]) : [],
  ]);

  return (
    <ManualOrderForm
      products={products.map((p) => ({
        id: p.id, name: p.name, image: p.images[0]?.thumb || null, price: p.final_price,
        variants: p.variants.map((v) => ({ id: v.id, label: variantLabel(v), stock: v.stock })),
      }))}
      staff={staff} me={viewer.id}
      currency={settings.store.currency} defaultShipping={Number(settings.shipping.fee) || 0} freeOver={Number(settings.shipping.free_over) || 0}
      exchange={source ? {
        id: source.id, number: source.number, channel: source.channel === "website" ? "whatsapp" : source.channel,
        name: source.customer_name, phone: source.phone === "0" ? "" : `+${source.phone}`, email: source.email || "", address: source.address, city: source.city,
      } : null}
    />
  );
}
