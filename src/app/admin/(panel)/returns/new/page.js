import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePerm } from "@/lib/auth";
import { getOrder } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import { caseOptions } from "@/lib/cases";
import { fmtDate } from "@/lib/format";
import CaseForm from "@/components/admin/CaseForm";

export const metadata = { title: "New return" };

export default async function NewCase({ searchParams }) {
  await requirePerm("returns");
  const { order: orderId } = await searchParams;
  const [order, settings] = await Promise.all([getOrder("id", Number(orderId) || 0), getSettings()]);
  if (!order) notFound();
  const options = await caseOptions(order, settings);
  const tz = settings.store.timezone;
  const warning = options.open ? "" : order.status === "delivered"
    ? `The ${options.window}-day window ended on ${fmtDate(options.until, tz, false)}. You can still open it; it will be marked as outside the rules.`
    : "This order has not been delivered yet. You can still open a request; it will be marked as outside the rules.";

  return (
    <>
      <div className="head">
        <div>
          <h1>New return</h1>
          <p>For order <Link href={`/admin/orders/${order.id}`} className="link">{order.number}</Link> · {order.customer_name}{order.delivered_at ? ` · delivered ${fmtDate(order.delivered_at, tz, false)}` : ""}. The customer gets the same messages as if they had asked themselves.</p>
        </div>
      </div>
      <div style={{ maxWidth: 760 }}>
        <CaseForm orderId={order.id} options={options} warning={warning} />
      </div>
    </>
  );
}
