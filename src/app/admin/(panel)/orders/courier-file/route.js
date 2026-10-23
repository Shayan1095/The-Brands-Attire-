import { getAdmin } from "@/lib/auth";
import { can } from "@/lib/format";
import { courierCsv } from "@/lib/labels";

// The day's parcels as a booking sheet to upload to a courier's portal (Orders -> select -> Courier file).
export async function GET(request) {
  if (!can(await getAdmin(), "orders")) return new Response("Unauthorized", { status: 401 });
  const ids = new URL(request.url).searchParams.getAll("id").flatMap((v) => v.split(",")).map(Number).filter(Boolean);
  if (!ids.length) return new Response("Choose at least one order.", { status: 400 });
  const csv = await courierCsv(ids);
  const day = new Date().toISOString().slice(0, 10);
  return new Response(csv, {
    headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="courier-booking-${day}.csv"` },
  });
}
