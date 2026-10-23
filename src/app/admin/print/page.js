import { requirePerm } from "@/lib/auth";
import { query } from "@/lib/db";
import { printData, barcodeSvg, qrSvg, trackUrl, localPhone } from "@/lib/labels";
import { money, fmtDate } from "@/lib/format";
import PrintToolbar from "@/components/admin/PrintToolbar";
import "./print.css";

export const metadata = { title: "Print" };

const WHAT = ["slips", "cards", "list"];

/**
 * Slips, thank-you cards and a packing list for the chosen orders, laid out for the printer
 * (A4: slip on the top half, card on the bottom; thermal: one 4x6 label each). See lib/labels.js.
 *   ?id=12&id=13 (or id=12,13)   the orders
 *   ?ready=1                      every confirmed or packed order not printed yet
 *   ?what=slips,cards,list        what to print (default: slips and cards)
 *   ?format=a4|thermal            overrides Settings for this print
 */
export default async function PrintPage({ searchParams }) {
  await requirePerm("orders");
  const sp = await searchParams;
  const asList = (v) => (Array.isArray(v) ? v : v ? [v] : []).flatMap((x) => String(x).split(","));
  let ids = asList(sp.id).map(Number).filter(Boolean);
  if (sp.ready) {
    const rows = await query("SELECT id FROM orders WHERE status IN ('confirmed', 'packed') AND printed_at IS NULL ORDER BY id LIMIT 200");
    ids = rows.map((r) => r.id);
  }
  const what = new Set(asList(sp.what).filter((w) => WHAT.includes(w)));
  if (!what.size) { what.add("slips"); what.add("cards"); }

  const { settings, orders } = await printData(ids, { cards: what.has("cards") });
  const { labels, store } = settings;
  const format = ["a4", "thermal"].includes(sp.format) ? sp.format : labels.format === "thermal" ? "thermal" : "a4";
  if (!labels.card) what.delete("cards");
  const tz = store.timezone;
  const fmt = (n) => money(n, store.currency);
  const from = (labels.return_address || store.address || "").trim();
  const fromPhone = localPhone(String(store.phone || store.whatsapp || "").replace(/\D/g, ""), store.country_code);

  // QR codes for the tracking page, one per order (the card's QR codes come from printData)
  const trackQr = Object.fromEntries(await Promise.all(orders.map(async (o) => [o.id, await qrSvg(trackUrl(o.ref))])));

  const slip = (o) => {
    const cod = o.channel === "store" || o.payment_method !== "cod" ? 0 : o.total;
    return (
      <section className="slip" key={`s${o.id}`}>
        <header className="slip__head">
          <b className="slip__brand">{store.name}</b>
          <span className="slip__meta">{o.number} · {fmtDate(o.created_at, tz, false)}</span>
        </header>
        {o.swap && <div className="slip__swap">EXCHANGE · Deliver this and COLLECT: {o.swap.pieces}</div>}
        <div className="slip__body">
          <div className="slip__to">
            <small>Deliver to</small>
            <b className="slip__name">{o.customer_name}</b>
            <p className="slip__addr">{o.address}</p>
            <p className="slip__city">{o.city}</p>
            {o.phone !== "0" && <p className="slip__phone">{localPhone(o.phone, store.country_code)}</p>}
          </div>
          <div className="slip__cod">
            <small>{cod ? "Collect cash" : "Amount to collect"}</small>
            <b>{cod ? fmt(cod) : "PAID"}</b>
            <span>{o.pieces} {o.pieces === 1 ? "piece" : "pieces"}{labels.weight_kg ? ` · ${labels.weight_kg} kg` : ""}</span>
          </div>
        </div>
        <div className="slip__code">
          <div className="slip__bar">
            <div className="slip__barsvg" dangerouslySetInnerHTML={{ __html: barcodeSvg(o.ref) }} />
            <span>{o.ref}</span>
          </div>
          <div className="slip__qr"><i dangerouslySetInnerHTML={{ __html: trackQr[o.id] }} /><small>Track</small></div>
        </div>
        <div className="slip__write">
          <span>Courier <i>{o.courier || ""}</i></span>
          <span>CN <i>{o.tracking_number || ""}</i></span>
        </div>
        {labels.caution && <div className="slip__caution">{labels.caution}</div>}
        <footer className="slip__from">
          <span><small>From</small> <b>{store.name}</b>{from ? ` · ${from}` : ""}{fromPhone ? ` · ${fromPhone}` : ""}</span>
          {labels.open_policy && <em>{labels.open_policy}</em>}
        </footer>
      </section>
    );
  };

  const card = (o) => {
    const c = o.card;
    if (!c) return null;
    return (
      <section className={`tcard tcard--${c.kind}`} key={`c${o.id}`}>
        <div className="tcard__main">
          <span className="tcard__brand">{store.name}</span>
          <h2 className="tcard__title">{c.title}</h2>
          <p className="tcard__body">{c.body}</p>
          {c.note && <p className="tcard__body">{c.note}</p>}
          {c.care && <p className="tcard__care"><b>Care</b>{c.care}</p>}
          <p className="tcard__sign">{c.sign}</p>
        </div>
        <aside className="tcard__side">
          {c.points && (
            <div className="tcard__points">
              <b>+{c.points.earn} points</b>
              <span>
                {c.points.goal
                  ? c.points.left ? `${c.points.left} more to a ${c.points.reward} reward` : `That makes a ${c.points.reward} reward. It arrives by message.`
                  : `${c.points.after} points in total`}
              </span>
              {c.points.goal > 0 && <i style={{ "--p": Math.min(1, c.points.after / c.points.goal) }} />}
            </div>
          )}
          {c.code && (
            <div className="tcard__code">
              <small>Your next order</small>
              <b>{c.code.code}</b>
              <span>{c.code.value}{c.code.days ? `, valid ${c.code.days} days` : ""} · just for you</span>
            </div>
          )}
          <div className="tcard__qrs">
            {c.qrs.map((q) => (
              <figure key={q.key}>
                <i dangerouslySetInnerHTML={{ __html: q.svg }} />
                <figcaption><b>{q.label}</b><small>{q.sub}</small></figcaption>
              </figure>
            ))}
          </div>
        </aside>
      </section>
    );
  };

  // the packing list: what to pull from the shelves, then each parcel's contents
  const pick = new Map();
  for (const o of orders) for (const i of o.items) {
    const k = `${i.name}|${i.size}`;
    pick.set(k, { name: i.name, size: i.size, image: i.image_url, qty: (pick.get(k)?.qty || 0) + i.qty });
  }
  const pieces = orders.reduce((s, o) => s + o.pieces, 0);

  // sheets: on A4 the slip and the card share a page; on thermal each is its own label
  const sheets = [];
  for (const o of orders) {
    const parts = [what.has("slips") && slip(o), what.has("cards") && card(o)].filter(Boolean);
    if (format === "a4") sheets.push(<div className="sheet sheet--a4" key={o.id}>{parts}</div>);
    else parts.forEach((p, i) => sheets.push(<div className="sheet sheet--label" key={`${o.id}-${i}`}>{p}</div>));
  }

  return (
    <div className={`prt prt--${format}`}>
      <PrintToolbar
        ids={orders.map((o) => o.id)} what={[...what]} format={format} cardsOn={labels.card}
        confirmed={orders.filter((o) => o.status === "confirmed").length}
        printed={orders.filter((o) => o.printed_at).length}
      />
      {!orders.length && <p className="prt__empty">No orders to print. Choose orders on the Orders page, or everything confirmed is already printed.</p>}

      {what.has("list") && orders.length > 0 && (
        <div className="sheet sheet--list">
          <header className="plist__head">
            <h1>Packing list</h1>
            <span>{fmtDate(new Date(), tz)} · {orders.length} {orders.length === 1 ? "order" : "orders"} · {pieces} {pieces === 1 ? "piece" : "pieces"}</span>
          </header>
          <h2>Pull from the shelves</h2>
          <table className="plist__pick">
            <tbody>
              {[...pick.values()].sort((a, b) => a.name.localeCompare(b.name) || a.size.localeCompare(b.size)).map((p) => (
                <tr key={`${p.name}|${p.size}`}>
                  <td className="plist__box" aria-hidden />
                  <td>{p.image ? <img src={p.image} alt="" /> : null}</td>
                  <td><b>{p.name}</b></td>
                  <td>Size <b>{p.size}</b></td>
                  <td className="plist__qty">× {p.qty}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <h2>Each parcel</h2>
          <div className="plist__orders">
            {orders.map((o) => (
              <div className="plist__order" key={o.id}>
                <div className="plist__ohead">
                  <span className="plist__box" aria-hidden />
                  <b>{o.number}</b><span>{o.customer_name} · {o.city}</span><code>{o.ref}</code>
                </div>
                {o.swap && <p className="plist__swap">Exchange: the rider collects {o.swap.pieces}</p>}
                <ul>{o.items.map((i) => <li key={i.id}>{i.name} · <b>{i.size}</b> × {i.qty}</li>)}</ul>
                {o.notes && <p className="plist__note">Note: {o.notes}</p>}
              </div>
            ))}
          </div>
        </div>
      )}
      {(what.has("slips") || what.has("cards")) && sheets}
    </div>
  );
}
