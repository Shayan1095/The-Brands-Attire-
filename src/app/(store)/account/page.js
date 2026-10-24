import { redirect } from "next/navigation";
import { getSettings } from "@/lib/settings";
import { getCustomer, accountView } from "@/lib/accounts";
import AccountPanel from "@/components/store/AccountPanel";

export const metadata = { title: "My account", robots: { index: false } };

export default async function AccountPage() {
  const me = await getCustomer();
  if (!me) redirect("/account/login");
  const [view, { store }] = await Promise.all([accountView(me), getSettings()]);
  const first = (me.name || "").split(" ")[0];
  return (
    <section className="section acct">
      <div className="wrap">
        <div className="acct__top">
          <span className="eyebrow">My account</span>
          <h1 className="display">Hi{first ? `, ${first}` : ""}.</h1>
          <p>Your orders, codes and saved details at {store.name}.</p>
        </div>
        <AccountPanel
          tz={store.timezone}
          me={{ name: me.name || "", email: me.email || "", phone: me.phone || "", address: me.address || "", city: me.city || "", emailOffers: me.email_opt_in, whatsappOffers: me.whatsapp_opt_in }}
          view={{ ...view, orders: view.orders.map((o) => ({ ...o, created_at: o.created_at.toISOString?.() || o.created_at })), codes: view.codes.map((c) => ({ ...c, ends_at: c.ends_at ? (c.ends_at.toISOString?.() || c.ends_at) : null })) }}
        />
      </div>
    </section>
  );
}
