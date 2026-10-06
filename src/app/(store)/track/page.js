import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { heroBanner } from "@/lib/banners";
import { waLink } from "@/lib/format";
import { TrackForm, RecentOrders } from "@/components/store/Track";
import { PageHero, Marquee, HERO_IMAGES } from "@/components/store/ui";
import { Icon } from "@/components/store/icons";

export const metadata = { title: "Track your order" };

export default async function TrackPage() {
  const [banner, { store, shipping, orders }] = await Promise.all([heroBanner("track", HERO_IMAGES.track), getSettings()]);

  const stages = [
    ["bag", "Placed", "We have your order and are holding the items for you. A confirmation link is on its way by WhatsApp and email."],
    ["check", "Confirmed", `You confirmed from your link, so we start packing. From here the order can no longer be cancelled.${orders.auto_cancel_hours > 0 ? ` Unconfirmed orders are released after ${orders.auto_cancel_hours} hours.` : ""}`],
    ["truck", "Shipped", `Handed to the courier. We send you the courier name and tracking number. Delivery takes ${shipping.eta}.`],
    ["pin", "Delivered", "At your door. Pay the rider in cash. If something is not right, you have 7 days to exchange it."],
  ];

  return (
    <>
      <PageHero
        tall ticker={["Live order status", "Placed", "Confirmed", "Shipped", "Delivered", `Delivery in ${shipping.eta}`]}
        crumbs={[["Track order"]]} title="Where is my" accent="order?" ghost="Tracking" image={banner}
        text="Enter your order number and phone to see exactly where your parcel is, live."
      >
        <TrackForm />
      </PageHero>

      <RecentOrders />

      {/* what each stage means */}
      <section className="section">
        <div className="wrap">
          <div className="section__head">
            <div><span className="eyebrow" data-reveal>The journey</span><h2 data-split>Four stages, door to door</h2></div>
            <Link href="/policies#confirmation" className="link-arrow" data-reveal>Why we ask you to confirm</Link>
          </div>
          <div className="stages">
            <span className="stages__line" aria-hidden><i data-grow /></span>
            {stages.map(([icon, title, text], i) => (
              <div className="stage" key={title} data-reveal>
                <span className="stage__dot"><Icon name={icon} /></span>
                <span className="stage__num">Stage {String(i + 1).padStart(2, "0")}</span>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* stuck? */}
      <section className="section section--ink">
        <div className="wrap help">
          <div>
            <span className="eyebrow" style={{ color: "var(--signal)" }} data-reveal>Stuck?</span>
            <h2 className="display" data-split>Cannot find your order number?</h2>
          </div>
          <div className="help__side">
            <ul className="help__list" data-reveal>
              <li><Icon name="chat" /><div><b>Check WhatsApp</b><span>Look for our message sent right after you ordered. The number starts with TBA-.</span></div></li>
              <li><Icon name="mail" /><div><b>Check your email</b><span>Search for “{store.name}”. It may be in Promotions or Spam.</span></div></li>
              <li><Icon name="phone" /><div><b>Use the same phone</b><span>Enter the number you gave at checkout, with or without the leading 0.</span></div></li>
            </ul>
            <div className="hero__cta" data-reveal>
              {store.whatsapp && (
                <a className="btn btn--light" href={waLink(store.whatsapp, "Hi, I need help finding my order.")} target="_blank" rel="noopener noreferrer">Ask us on WhatsApp <span aria-hidden>→</span></a>
              )}
              <Link href="/contact" className="btn btn--outline-light">Contact us</Link>
            </div>
          </div>
        </div>
      </section>

      <Marquee className="marquee--band" items={["Cash on delivery", "Confirm before we ship", `Delivery in ${shipping.eta}`, "Easy 7-day exchange"]} />
    </>
  );
}
