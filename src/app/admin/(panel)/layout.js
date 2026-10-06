import { requireAdmin } from "@/lib/auth";
import { query } from "@/lib/db";
import { getAlerts } from "@/lib/orders";
import { can } from "@/lib/format";
import Shell from "@/components/admin/Shell";

export default async function PanelLayout({ children }) {
  const admin = await requireAdmin();
  const [[counts], alerts] = await Promise.all([
    query(`
      SELECT (SELECT count(*)::int FROM orders WHERE status IN ('pending', 'confirmed', 'packed')) AS orders,
             (SELECT count(*)::int FROM messages WHERE status = 'manual') + (SELECT count(*)::int FROM contact_messages WHERE NOT is_read) AS messages,
             (SELECT count(*)::int FROM conversations WHERE status = 'human' AND unread > 0) AS chats`),
    getAlerts(admin),
  ]);

  return (
    <Shell
      admin={{ id: admin.id, name: admin.name, email: admin.email, role: admin.role, permissions: admin.permissions }}
      counts={counts}
      // people only see alerts for the tasks they are allowed to do
      alerts={alerts.filter((a) => can(admin, a.perm)).map(({ key, n, label, href, tone }) => ({ key, n, label, href, tone }))}
    >
      {children}
    </Shell>
  );
}
