import { requirePerm } from "@/lib/auth";
import { notFound } from "next/navigation";
import { getProductById, listCategories } from "@/lib/catalog";
import { query } from "@/lib/db";
import ProductForm from "@/components/admin/ProductForm";

export const metadata = { title: "Edit product" };

export default async function EditProduct({ params }) {
  const viewer = await requirePerm("products");
  const { id } = await params;
  const [product, categories, [{ n }], types] = await Promise.all([
    getProductById(Number(id) || 0),
    listCategories({ all: true }),
    query("SELECT count(*)::int AS n FROM contacts WHERE email_opt_in OR whatsapp_opt_in"),
    query("SELECT DISTINCT product_type AS t FROM products WHERE product_type <> '' ORDER BY 1"),
  ]);
  if (!product) notFound();
  // plain data only: dates cannot cross into a client component as Date objects safely
  const plain = JSON.parse(JSON.stringify(product));
  return <ProductForm key={product.updated_at} product={plain} categories={categories.map(({ id, name }) => ({ id, name }))} subscribers={n} types={types.map((r) => r.t)} />;
}
