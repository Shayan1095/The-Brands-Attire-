import { getAdmin } from "@/lib/auth";
import { can } from "@/lib/format";
import { query } from "@/lib/db";

// CSV download of every contact (opens in Excel / Google Sheets).
export async function GET() {
  if (!can(await getAdmin(), "customers")) return new Response("Unauthorized", { status: 401 });
  const rows = await query(
    `SELECT c.name, c.email, c.phone, c.city, c.email_opt_in, c.whatsapp_opt_in, c.source, c.created_at,
            (SELECT count(*)::int FROM orders o WHERE o.contact_id = c.id) AS orders
     FROM contacts c ORDER BY c.id`
  );
  // quote every cell; prefix formula-looking cells so spreadsheets do not execute them
  const cell = (v) => {
    let s = v instanceof Date ? v.toISOString() : String(v ?? "");
    if (/^[=+\-@]/.test(s)) s = `'${s}`;
    return `"${s.replace(/"/g, '""')}"`;
  };
  const header = ["Name", "Email", "Phone", "City", "Email opt-in", "WhatsApp opt-in", "Source", "Joined", "Orders"];
  const csv = [header, ...rows.map((r) => Object.values(r))].map((r) => r.map(cell).join(",")).join("\r\n");
  return new Response("﻿" + csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="customers.csv"' },
  });
}
