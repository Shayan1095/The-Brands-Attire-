import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { money, waLink } from "@/lib/format";
import { heroBanner } from "@/lib/banners";
import { PageHero, Marquee, HERO_IMAGES } from "@/components/store/ui";
import PolicyNav from "@/components/store/PolicyNav";
import { Icon } from "@/components/store/icons";

export const metadata = { title: "Shipping, returns & order policy" };

export default async function Policies() {
  const [{ shipping, orders, store }, banner] = await Promise.all([getSettings(), heroBanner("policies", HERO_IMAGES.policies)]);
  const fmt = (n) => money(n, store.currency);
  const freeOver = Number(shipping.free_over) > 0;

  // the numbers people look for first
  const glance = [
    ["truck", shipping.eta, "Delivery time", "Nationwide"],
    ["tag", Number(shipping.fee) > 0 ? fmt(shipping.fee) : "Free", "Delivery fee", freeOver ? `Free over ${fmt(shipping.free_over)}` : "Flat rate"],
    ["cash", "COD", "Payment", "Pay the rider in cash"],
    ["refresh", "7 days", "Exchange window", "From the day it arrives"],
  ];

  /*
    Each section: id (also the #anchor other pages link to), icon, title, the one-line version,
    paragraphs, and optional bullet points. Delivery, confirmation and exchange wording comes from
    Admin -> Settings so it changes here when the owner changes it there.
  */
  const sections = [
    {
      id: "delivery", icon: "truck", title: "Delivery",
      short: `Everywhere in the country, in ${shipping.eta}.`,
      body: [
        `We deliver nationwide in ${shipping.eta} from the day your order is dispatched. Delivery costs ${fmt(shipping.fee)}${freeOver ? `, and is free on orders over ${fmt(shipping.free_over)}` : ""}.`,
        "We dispatch as soon as you confirm your order. When it leaves us you get a message with the courier's name and a tracking number, and you can follow it any time on the Track order page.",
      ],
      points: ["Please keep your phone on: the rider calls before arriving.", "If you miss the delivery, the courier tries again; tell us if you need a different day."],
    },
    {
      id: "confirmation", icon: "check", title: "Order confirmation",
      short: "We ship only after you confirm. After that, the order is final.",
      body: [
        "Right after you place an order we send you a confirmation link by WhatsApp and email. Your items are reserved from that moment, and we dispatch as soon as you confirm.",
        orders.policy,
        ...(orders.auto_cancel_hours > 0 ? [`Orders that are not confirmed within ${orders.auto_cancel_hours} hours are released automatically so the items can go back on sale.${orders.reminder_hours > 0 ? ` We send one reminder after ${orders.reminder_hours} hours.` : ""}`] : []),
      ],
      flow: [["Place", "Items reserved"], ["Confirm", "From your link"], ["Dispatch", "Now final"]],
    },
    {
      id: "cancellation", icon: "close", title: "Cancelling an order",
      short: "Free and instant, as long as you have not confirmed yet.",
      body: [
        "Changed your mind? Open your order link and cancel it yourself before confirming. There is no charge and nothing to explain.",
        "Once an order is confirmed it is packed and handed to the courier, so it can no longer be cancelled. If something is wrong when it arrives, use the exchange policy below.",
      ],
      points: ["Before confirming: cancel from your order link.", "After confirming: no cancellation, but exchange applies."],
    },
    {
      id: "exchange", icon: "refresh", title: "Exchanges & returns",
      short: "7 days to exchange, unworn and with tags.",
      body: [orders.returns],
      points: ["Message us on WhatsApp with your order number.", "Keep the item unworn, unwashed and with its tags.", "Tell us the size or piece you would like instead."],
    },
    {
      id: "payment", icon: "cash", title: "Payment",
      short: "Cash on delivery. Nothing is charged when you order.",
      body: [
        "All orders are cash on delivery: you pay the rider when the parcel is in your hands. We never ask for card details or advance payment.",
        "The amount to pay is the total shown at checkout and in your confirmation message, including delivery. Please have the exact amount ready if you can.",
      ],
    },
    {
      id: "privacy", icon: "mail", title: "Your details",
      short: "Used to deliver your order. Offers only if you asked for them.",
      body: [
        "We use your name, phone number, address and email to deliver your order and to send you updates about it. We do not sell or share your details with anyone except the courier delivering your parcel.",
        "If you ticked the box for new arrivals and offers, we may message you about them by WhatsApp or email. Every email has an unsubscribe link, and you can ask us to stop at any time.",
      ],
    },
  ];

  return (
    <>
      <PageHero
        tall ticker={glance.map(([, value, label]) => `${label}: ${value}`)}
        crumbs={[["Policies"]]} title="Good to" accent="know" ghost="Policies" image={banner}
        text="Delivery, order confirmation, exchanges and payment, in plain words. No small print."
        meta={[[shipping.eta, "Delivery"], ["COD", "Payment"]]}
      />

      {/* 1. at a glance */}
      <section className="section">
        <div className="wrap">
          <div className="section__head">
            <div><span className="eyebrow" data-reveal>At a glance</span><h2 data-split>The short version</h2></div>
          </div>
          <div className="glance">
            {glance.map(([icon, value, label, note]) => (
              <div className="glance__item" key={label} data-reveal>
                <Icon name={icon} />
                <b className={`display ${String(value).length > 8 ? "long" : ""}`}>{value}</b>
                <span>{label}</span>
                <small>{note}</small>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 2. the full text, with a contents list that follows you */}
      <section className="section section--bone">
        <div className="wrap policy">
          <PolicyNav items={sections.map(({ id, title }) => ({ id, label: title }))} />
          <div className="policy__body">
            {sections.map((s, i) => (
              <article className="pcard" id={s.id} key={s.id} data-reveal>
                <header>
                  <span className="pcard__icon"><Icon name={s.icon} /></span>
                  <div>
                    <span className="eyebrow">Section {String(i + 1).padStart(2, "0")}</span>
                    <h2 className="display">{s.title}</h2>
                  </div>
                </header>
                <p className="pcard__short"><b>In short:</b> {s.short}</p>
                {s.flow && (
                  <ol className="pflow" aria-label="How confirmation works">
                    {s.flow.map(([step, note], k) => <li key={step}><i>{k + 1}</i><b>{step}</b><span>{note}</span></li>)}
                  </ol>
                )}
                {s.body.map((p, k) => <p key={k}>{p}</p>)}
                {s.points && (
                  <ul className="pcard__points">
                    {s.points.map((p) => <li key={p}><Icon name="check" />{p}</li>)}
                  </ul>
                )}
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* 3. still unsure */}
      <section className="section section--ink">
        <div className="wrap help">
          <div>
            <span className="eyebrow" style={{ color: "var(--signal)" }} data-reveal>Still unsure?</span>
            <h2 className="display" data-split>Ask a person, not a page.</h2>
          </div>
          <div className="help__side">
            <p className="muted" data-reveal>If your situation is not covered here, message us. We would rather sort it out with you than point you at a rule.</p>
            <div className="hero__cta" data-reveal>
              {store.whatsapp && <a className="btn btn--light" href={waLink(store.whatsapp, "Hi, I have a question about your policies.")} target="_blank" rel="noopener noreferrer">Ask on WhatsApp <span aria-hidden>→</span></a>}
              <Link href="/contact" className="btn btn--outline-light">Contact us</Link>
              <Link href="/track" className="btn btn--outline-light">Track an order</Link>
            </div>
          </div>
        </div>
      </section>

      <Marquee className="marquee--band" items={["Cash on delivery", "Confirm before we ship", `Delivery in ${shipping.eta}`, "Easy 7-day exchange"]} />
    </>
  );
}
