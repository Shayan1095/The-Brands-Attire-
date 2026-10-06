import { requirePerm } from "@/lib/auth";
import { listCategories } from "@/lib/catalog";
import { query } from "@/lib/db";
import ProductForm from "@/components/admin/ProductForm";

export const metadata = { title: "New product" };

export default async function NewProduct() {
  const viewer = await requirePerm("products");
  const [categories, [{ n }], types] = await Promise.all([
    listCategories({ all: true }),
    query("SELECT count(*)::int AS n FROM contacts WHERE email_opt_in OR whatsapp_opt_in"),
    query("SELECT DISTINCT product_type AS t FROM products WHERE product_type <> '' ORDER BY 1"),
  ]);
  return <ProductForm categories={categories.map(({ id, name }) => ({ id, name }))} subscribers={n} types={types.map((r) => r.t)} />;
}
