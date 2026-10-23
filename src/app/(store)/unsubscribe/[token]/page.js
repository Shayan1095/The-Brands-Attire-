import Link from "next/link";
import { query } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import Preferences from "@/components/store/Preferences";

export const metadata = { title: "Message preferences", robots: { index: false } };

/** "ali.khan@gmail.com" -> "a***n@gmail.com", so the person can recognise the address without it being exposed. */
const maskEmail = (e) => {
  const [user, domain] = String(e).split("@");
  if (!domain) return "***";
  return `${user[0]}${user.length > 2 ? "***" : "*"}${user.length > 2 ? user.at(-1) : ""}@${domain}`;
};
/** "923001234567" -> "+92 300 *** **67" */
const maskPhone = (p) => {
  const d = String(p).replace(/\D/g, "");
  return d.length < 6 ? "***" : `+${d.slice(0, 2)} ${d.slice(2, 5)} *** **${d.slice(-2)}`;
};

// The link in every offer email / WhatsApp message lands here (lib/notify.js unsubscribe_url).
export default async function MessagePreferences({ params }) {
  const { token } = await params;
  const [rows, { store }] = await Promise.all([
    /^[\w-]{6,128}$/.test(token) ? query("SELECT name, email, phone, email_opt_in, whatsapp_opt_in FROM contacts WHERE token = $1", [token]) : [],
    getSettings(),
  ]);
  const c = rows[0];

  return (
    <section className="section prefs-page">
      <div className="wrap prefs-page__grid">
        <div className="prefs-page__intro">
          <span className="eyebrow">Message preferences</span>
          <h1 className="display">{c ? <>Your inbox, <em>your call</em>.</> : <>This link has <em>expired</em>.</>}</h1>
          <p>
            {c
              ? `${c.name ? `Hi ${c.name.split(" ")[0]}. ` : ""}Choose how ${store.name} may contact you about new pieces and offers. Changes take effect straight away.`
              : `We could not find these preferences. The link may be old or incomplete. Use the unsubscribe link in the most recent message from ${store.name}, or message us and we will take you off the list.`}
          </p>
        </div>

        <div className="prefs-page__card">
          {c ? (
            <Preferences
              token={token} storeName={store.name}
              contact={{ email: c.email ? maskEmail(c.email) : null, phone: c.phone ? maskPhone(c.phone) : null, emailOn: c.email_opt_in, whatsappOn: c.whatsapp_opt_in }}
            />
          ) : (
            <div className="prefs__done">
              <h2 className="display">Need a hand?</h2>
              <p>Tell us the email or number you would like removed and we will do it for you.</p>
              <div className="prefs__actions">
                <Link href="/contact" className="btn">Contact us</Link>
                <Link href="/" className="link-arrow">Back to the shop</Link>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
