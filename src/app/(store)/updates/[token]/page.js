import Link from "next/link";
import { query } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import JoinUpdates from "@/components/store/JoinUpdates";

export const metadata = { title: "Get first dibs", robots: { index: false } };

// The QR on the thank-you card in every parcel lands here (lib/labels.js): one tap to hear about new pieces and sales.
export default async function Updates({ params, searchParams }) {
  const { token } = await params;
  // from the confirmation email: it is the email address that is being confirmed
  const confirmEmail = (await searchParams)?.confirm === "email";
  const [rows, { store }] = await Promise.all([
    /^[\w-]{6,128}$/.test(token) ? query("SELECT name, email, phone, email_opt_in, whatsapp_opt_in FROM contacts WHERE token = $1", [token]) : [],
    getSettings(),
  ]);
  const c = rows[0];
  const first = c?.name ? c.name.split(" ")[0] : "";
  const on = Boolean(c && (confirmEmail ? c.email_opt_in : c.email_opt_in || c.whatsapp_opt_in));
  const via = c ? [c.phone && "WhatsApp", c.email && "email"].filter(Boolean).join(" and ") : "";

  return (
    <section className="section prefs-page">
      <div className="wrap prefs-page__grid">
        <div className="prefs-page__intro">
          <span className="eyebrow">New arrivals and sales</span>
          <h1 className="display">{on ? <>You are <em>on the list</em>.</> : <>Get <em>first dibs</em>.</>}</h1>
          <p>
            {c
              ? `${first ? `Hi ${first}. ` : ""}New arrivals, restocks of sold-out sizes and sales from ${store.name}, ${on ? "already coming to you" : `sent to you by ${via}`}. A few messages a month, never more, and you can stop any time.`
              : `This link is incomplete. You can still get new arrivals and sales by signing up at the bottom of any page on ${store.name}.`}
          </p>
        </div>
        <div className="prefs-page__card">
          {c ? (
            <JoinUpdates token={token} already={on} via={via} />
          ) : (
            <div className="prefs__done">
              <h2 className="display">Still want in?</h2>
              <p>Pop your email or WhatsApp number into the sign-up at the foot of the shop.</p>
              <div className="prefs__actions"><Link href="/products" className="btn">Shop new arrivals</Link></div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
