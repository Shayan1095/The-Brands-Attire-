import { getAdmin } from "@/lib/auth";
import { can } from "@/lib/format";
import { stockInsights } from "@/lib/insights";

// Restock list as CSV, ready to send to a supplier.
export async function GET() {
  if (!can(await getAdmin(), "inventory")) return new Response("Unauthorized", { status: 401 });
  const { restock } = await stockInsights();
  const cell = (v) => {
    let s = String(v ?? "");
    if (/^[=+\-@]/.test(s)) s = `'${s}`; // spreadsheets must not run a cell as a formula
    return `"${s.replace(/"/g, '""')}"`;
  };
  const rows = [
    ["Product", "Size", "SKU", "Available", "Reserved", "Sold 7 days", "Sold 30 days", "Days left", "Suggested order"],
    ...restock.map((v) => [v.name, v.label, v.sku, v.available, v.reserved, v.sold7, v.sold30, v.daysLeft ?? "", v.suggest]),
  ];
  return new Response("﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n"), {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": 'attachment; filename="restock-list.csv"' },
  });
}
