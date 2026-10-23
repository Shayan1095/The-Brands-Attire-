import Link from "next/link";
import { notFound } from "next/navigation";
import { getOrder } from "@/lib/orders";
import { getSettings } from "@/lib/settings";
import { query } from "@/lib/db";
import { loyaltyFor } from "@/lib/crm";
import { money } from "@/lib/format";
import FeedbackForm from "@/components/store/FeedbackForm";

export const metadata = { title: "How was your order?", robots: { index: false } };

// The page the "How was your order?" message links to: a rating, a few words, and the customer's points.
export default async function FeedbackPage({ params }) {
  const { token } = await params;
  const [order, settings] = await Promise.all([getOrder("token", token), getSettings()]);
  if (!order) notFound();
  const [[given], loyalty] = await Promise.all([
    query("SELECT rating, comment FROM feedback WHERE order_id = $1", [order.id]),
    loyaltyFor(order.contact_id),
  ]);
  const ready = ["shipped", "delivered", "returned"].includes(order.status); // shipped: the card in the parcel links here before staff mark it delivered
  const crm = settings.crm;

  return (
    <section className="section--tight fbk">
      <div className="wrap fbk__wrap">
        <div className="fbk__card">
          <span className="eyebrow">Order {order.number}</span>
          <h1 className="display fbk__title">How was <em>it?</em></h1>
          <ul className="fbk__items" aria-label="In this order">
            {order.items.slice(0, 4).map((i) => (
              <li key={i.id}>{i.image_url ? <img src={i.image_url} alt="" width="56" height="70" /> : <i />}<span>{i.name}<small>Size {i.size}</small></span></li>
            ))}
          </ul>
          {ready ? (
            <FeedbackForm token={order.token} given={given || null} first={order.customer_name.split(" ")[0]} />
          ) : (
            <p className="fbk__note">You can rate this order once it has been delivered. <Link href={`/order/${order.token}`} className="link-arrow">Follow your order</Link></p>
          )}
        </div>

        {loyalty && crm.points_per_100 > 0 && (
          <aside className="fbk__points">
            <span className="eyebrow">Your points</span>
            <b>{loyalty.points.toLocaleString("en-US")}</b>
            {crm.reward_points > 0 && (
              <>
                <span className="fbk__bar"><i style={{ "--p": Math.min(1, loyalty.points / crm.reward_points) }} /></span>
                <p>{loyalty.points >= crm.reward_points ? "Your next reward is on its way." : `${(crm.reward_points - loyalty.points).toLocaleString("en-US")} more for a ${money(crm.reward_value, settings.store.currency)} reward.`}</p>
              </>
            )}
            <small>You earn {crm.points_per_100} {crm.points_per_100 === 1 ? "point" : "points"} for every {money(100, settings.store.currency)} once an order is delivered.</small>
            {loyalty.codes.map((c) => <p key={c.code} className="fbk__code">Code <code>{c.code}</code> · {money(c.value, settings.store.currency)} off</p>)}
          </aside>
        )}
      </div>
    </section>
  );
}
