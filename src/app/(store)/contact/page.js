import Link from "next/link";
import { getSettings } from "@/lib/settings";
import { money, waLink } from "@/lib/format";
import { heroBanner } from "@/lib/banners";
import ContactForm from "@/components/store/ContactForm";
import { Icon } from "@/components/store/icons";
import { PageHero, Marquee, HERO_IMAGES } from "@/components/store/ui";

export const metadata = { title: "Contact" };

export default async function Contact() {
  const [{ store, shipping, orders }, banner] = await Promise.all([getSettings(), heroBanner("contact", HERO_IMAGES.contact)]);
  const fmt = (n) => money(n, store.currency);

  // the quick ways in; only the ones the store has filled in under Admin -> Settings
  const channels = [
    store.whatsapp && { icon: "whatsapp", tone: "wa", label: "WhatsApp", value: `+${store.whatsapp}`, note: "Fastest · usually within the hour", cta: "Start a chat", href: waLink(store.whatsapp, `Hi ${store.name}, I have a question.`), external: true },
    store.email && { icon: "mail", label: "Email", value: store.email, note: "Reply within 24 hours", cta: "Write to us", href: `mailto:${store.email}` },
    store.phone && { icon: "phone", label: "Call", value: store.phone, note: store.hours, cta: "Call now", href: `tel:${store.phone.replace(/[^\d+]/g, "")}` },
    { icon: "truck", label: "Track an order", value: "Live order status", note: "Order number + your phone", cta: "Track it", href: "/track" },
    { icon: "refresh", label: "Exchanges", value: "Within 7 days", note: "How exchanges and returns work", cta: "Read the policy", href: "/policies" },
  ].filter(Boolean).slice(0, 4);

  // answers to what people ask most, kept in step with the store's settings
  const faqs = [
    ["How long does delivery take?", `Orders arrive in ${shipping.eta}, nationwide. Delivery costs ${fmt(shipping.fee)}${shipping.free_over > 0 ? ` and is free on orders over ${fmt(shipping.free_over)}` : ""}.`],
    ["How do I pay?", "Cash on delivery. You pay the rider when your parcel arrives; nothing is charged when you place the order."],
    ["Why do I need to confirm my order?", `After checkout we send a confirmation link by WhatsApp and email, and we dispatch as soon as you confirm. ${orders.policy}`],
    ["Can I cancel?", `Yes, any time before you confirm, from your order link. ${orders.auto_cancel_hours > 0 ? `Orders left unconfirmed for ${orders.auto_cancel_hours} hours are released automatically.` : ""}`],
    ["Can I exchange an item?", orders.returns],
    ["Which size should I choose?", "Every product page has a size guide. Between sizes, go down for a fitted look and up for a relaxed one, or message us your measurements and we will suggest a size."],
  ];
  const socials = [["Instagram", store.instagram], ["Facebook", store.facebook], ["WhatsApp", store.whatsapp && waLink(store.whatsapp)]].filter(([, url]) => url);

  return (
    <>
      <PageHero
        tall ticker={["We reply within 24 hours", "WhatsApp is fastest", "Order help", "Sizing advice", "Exchanges"]}
        crumbs={[["Contact"]]} title="Talk" accent="to us." ghost="Hello" image={banner}
        text="Questions about an order, sizing or anything else. We read everything and reply within 24 hours."
        meta={[["24h", "Reply time"], ["7 days", "Exchange"]]}
      />

      {/* 1. quick ways in */}
      <section className="section">
        <div className="wrap">
          <div className="section__head">
            <div><span className="eyebrow" data-reveal>The quick ways</span><h2 data-split>Pick how you want to reach us</h2></div>
          </div>
          <div className="channels">
            {channels.map((c, i) => {
              const inner = (
                <>
                  <span className="channel__num">/ {String(i + 1).padStart(2, "0")}</span>
                  <span className="channel__icon"><Icon name={c.icon} /></span>
                  <span className="channel__label">{c.label}</span>
                  <b className="channel__value">{c.value}</b>
                  <span className="channel__note">{c.note}</span>
                  <span className="channel__cta">{c.cta} <Icon name="arrow" /></span>
                </>
              );
              return c.external || !c.href.startsWith("/")
                ? <a key={c.label} className={`channel ${c.tone ? `channel--${c.tone}` : ""}`} href={c.href} target={c.external ? "_blank" : undefined} rel={c.external ? "noopener noreferrer" : undefined} data-reveal>{inner}</a>
                : <Link key={c.label} className="channel" href={c.href} data-reveal>{inner}</Link>;
            })}
          </div>
        </div>
      </section>

      {/* 2. write to us */}
      <section className="section section--bone">
        <div className="wrap write">
          <div className="write__intro">
            <span className="eyebrow" data-reveal>Write to us</span>
            <h2 className="display" data-split>Tell us what you <em>need</em>.</h2>
            <p data-reveal>Three short steps. The more detail you give, the faster we can sort it out in one reply.</p>
            <ul className="write__facts" data-reveal>
              <li><Icon name="clock" /><div><b>Reply within 24 hours</b><span>{store.hours}</span></div></li>
              <li><Icon name="check" /><div><b>A real person answers</b><span>No bots, no ticket numbers</span></div></li>
              <li><Icon name="truck" /><div><b>Have an order number?</b><span>Add it and we find your parcel at once</span></div></li>
            </ul>
          </div>
          <div className="write__form" data-reveal>
            <ContactForm whatsapp={store.whatsapp} />
          </div>
        </div>
      </section>

      {/* 3. answers before you ask */}
      <section className="section">
        <div className="wrap faq">
          <div className="faq__intro">
            <span className="eyebrow" data-reveal>Before you write</span>
            <h2 className="display" data-split>Quick answers</h2>
            <p className="muted" data-reveal>Most questions are about delivery, payment and exchanges. The short versions are here; the full text is on the policies page.</p>
            <Link href="/policies" className="link-arrow" data-reveal>Read all policies</Link>
          </div>
          <div className="faq__list">
            {faqs.map(([q, a], i) => (
              <details className="faq__item" key={q} name="faq" open={i === 0} data-reveal>
                <summary><span>{String(i + 1).padStart(2, "0")}</span>{q}<i aria-hidden /></summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* 4. where and when */}
      <section className="section section--ink visit">
        <div className="wrap">
          <span className="eyebrow" style={{ color: "var(--signal)" }} data-reveal>Where and when</span>
          <p className="manifesto__text" data-scrub-text>
            Made with care. Delivered to <em>every city</em>. Answered by people who know the clothes.
          </p>
          <div className="visit__grid" data-reveal>
            <div><span className="label">Hours</span><b>{store.hours || "Every day"}</b></div>
            <div><span className="label">Find us</span><b>{store.address || "Online, delivering nationwide"}</b></div>
            <div>
              <span className="label">Follow</span>
              <b className="visit__links">
                {socials.length ? socials.map(([name, url]) => <a key={name} href={url} target="_blank" rel="noopener noreferrer">{name}</a>) : "Coming soon"}
              </b>
            </div>
          </div>
        </div>
      </section>

      <Marquee className="marquee--band" items={["Cash on delivery", "Reply within 24 hours", "Easy 7-day exchange", "Nationwide delivery"]} />
    </>
  );
}
