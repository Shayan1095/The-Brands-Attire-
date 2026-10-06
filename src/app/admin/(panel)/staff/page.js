import { requirePerm } from "@/lib/auth";
import { query } from "@/lib/db";
import { PERMISSIONS } from "@/lib/format";
import StaffForm from "@/components/admin/StaffForm";

export const metadata = { title: "Staff" };

export default async function Staff() {
  const viewer = await requirePerm("staff");
  const people = await query(
    `SELECT a.id, a.name, a.email, a.role, a.permissions, a.is_active,
            (SELECT count(*)::int FROM orders o WHERE o.assigned_to = a.id AND o.status IN ('pending', 'confirmed', 'packed')) AS open_orders
     FROM admins a ORDER BY (a.role = 'owner') DESC, a.name`
  );

  return (
    <>
      <div className="head">
        <div><h1>Staff</h1><p>Give each person their own sign-in and choose exactly what they can do. Changes apply the next time they open a page.</p></div>
      </div>
      <div className="cols cols--even">
        <div>
          {people.map((p) => (
            <details className="card person" key={p.id} open={people.length <= 2}>
              <summary>
                <span className="person__avatar">{(p.name || p.email).charAt(0).toUpperCase()}</span>
                <span className="person__who"><b>{p.name || "Unnamed"}{p.id === viewer.id && " (you)"}</b><small>{p.email}</small></span>
                <span className={`pill ${p.role === "owner" ? "info" : ""}`}>{p.role === "owner" ? "Owner" : `${p.permissions.length} of ${Object.keys(PERMISSIONS).length} tasks`}</span>
                {!p.is_active && <span className="pill bad">Blocked</span>}
                {p.open_orders > 0 && <span className="pill warn">{p.open_orders} open orders</span>}
              </summary>
              <div style={{ marginTop: 16 }}>
                <StaffForm person={p} isSelf={p.id === viewer.id} viewerIsOwner={viewer.role === "owner"} />
              </div>
            </details>
          ))}
        </div>
        <div>
          <div className="card">
            <h2>Add a staff member</h2>
            <p className="sub">For example, someone who packs orders gets “Orders” and “Inventory” only.</p>
            <StaffForm viewerIsOwner={viewer.role === "owner"} />
          </div>
        </div>
      </div>
    </>
  );
}
