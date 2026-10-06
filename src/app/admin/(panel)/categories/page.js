import { requirePerm } from "@/lib/auth";
import { listCategories } from "@/lib/catalog";
import { deleteCategoryAction } from "@/lib/admin-actions";
import { CategoryForm, ConfirmButton } from "@/components/admin/Widgets";

export const metadata = { title: "Categories" };

export default async function Categories() {
  const viewer = await requirePerm("products");
  const categories = await listCategories({ all: true });
  return (
    <>
      <div className="head">
        <div><h1>Categories</h1><p>Group your products. Categories appear on the home page, in the shop filters and in the footer.</p></div>
      </div>
      <div className="cols cols--even">
        <div>
          {categories.map((c) => (
            <div className="card" key={c.id}>
              <div className="inline" style={{ justifyContent: "space-between", marginBottom: 12 }}>
                <h2>{c.name} <span className="dim">· {c.product_count} active products</span></h2>
                <form action={deleteCategoryAction}>
                  <input type="hidden" name="id" value={c.id} />
                  <ConfirmButton message={`Delete the category “${c.name}”? Its products are kept and become uncategorised.`}>Delete</ConfirmButton>
                </form>
              </div>
              <CategoryForm category={{ id: c.id, name: c.name, description: c.description, image_url: c.image_url, sort_order: c.sort_order, is_active: c.is_active, icon: c.icon }} />
            </div>
          ))}
          {!categories.length && <div className="card"><p className="empty">No categories yet. Add your first one on the right.</p></div>}
        </div>
        <div>
          <div className="card">
            <h2>Add a category</h2>
            <p className="sub">For example: Men, Women, Winter, Eid collection.</p>
            <CategoryForm />
          </div>
        </div>
      </div>
    </>
  );
}
