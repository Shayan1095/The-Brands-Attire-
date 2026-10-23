"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { markPrintedAction } from "@/lib/admin-actions";
import AdminIcon from "./icons";

const PARTS = [["slips", "Courier slips"], ["cards", "Thank-you cards"], ["list", "Packing list"]];

/**
 * The bar above the print preview (hidden on paper): what to print, the paper format, and what happens after.
 * Printing records the orders as printed and, if ticked, marks the confirmed ones as packed.
 */
export default function PrintToolbar({ ids, what, format, cardsOn, confirmed, printed }) {
  const [pack, setPack] = useState(confirmed > 0);
  const [done, setDone] = useState("");
  const printing = useRef(false);
  const base = `id=${ids.join(",")}`;
  const href = (patch) => {
    const w = patch.what ?? what;
    return `/admin/print?${base}&what=${w.join(",")}&format=${patch.format ?? format}`;
  };
  const toggle = (k) => href({ what: what.includes(k) ? what.filter((x) => x !== k) : [...what, k] });

  // after the print dialog closes (printed or not, browsers cannot tell us which), record it once
  useEffect(() => {
    const after = async () => {
      if (!printing.current) return;
      printing.current = false;
      if (!what.includes("slips")) return;
      const res = await markPrintedAction(ids, pack);
      setDone(res.error ? res.error : `Recorded as printed${res.packed ? `, ${res.packed} marked packed` : ""}.`);
    };
    window.addEventListener("afterprint", after);
    return () => window.removeEventListener("afterprint", after);
  }, [ids, pack, what]);

  const print = () => { printing.current = true; setDone(""); window.print(); };

  return (
    <div className="ptb">
      <div className="ptb__row">
        <Link href="/admin/orders" className="ptb__back"><AdminIcon name="arrow" /> Orders</Link>
        <b className="ptb__title">{ids.length} {ids.length === 1 ? "order" : "orders"}{printed ? <small> · {printed} printed before</small> : null}</b>
        <div className="ptb__chips" role="group" aria-label="What to print">
          {PARTS.filter(([k]) => k !== "cards" || cardsOn).map(([k, label]) => (
            <Link key={k} href={toggle(k)} className={what.includes(k) ? "on" : ""} aria-pressed={what.includes(k)}>
              <i aria-hidden>{what.includes(k) ? "✓" : ""}</i>{label}
            </Link>
          ))}
        </div>
        <div className="ptb__seg" role="group" aria-label="Paper">
          <Link href={href({ format: "a4" })} className={format === "a4" ? "on" : ""}>A4 sheet</Link>
          <Link href={href({ format: "thermal" })} className={format === "thermal" ? "on" : ""}>Label 4×6</Link>
        </div>
      </div>
      <div className="ptb__row">
        {confirmed > 0 && what.includes("slips") && (
          <label className="ptb__check"><input type="checkbox" checked={pack} onChange={(e) => setPack(e.target.checked)} /> Mark the {confirmed} confirmed {confirmed === 1 ? "order" : "orders"} as packed after printing</label>
        )}
        {done && <span className="ptb__done" role="status">{done}</span>}
        <span className="ptb__grow" />
        <a className="btn btn--ghost" href={`/admin/orders/courier-file?${base}`} download>Courier file (CSV)</a>
        <button className="btn" onClick={print} disabled={!ids.length}>Print</button>
      </div>
      <p className="ptb__hint">
        {format === "a4"
          ? "A4 paper, any printer: the courier slip on the top half, the thank-you card below. Cut along the dashed line."
          : "4×6 inch labels: set the printer to that paper size and no margins. Cards print on their own labels or card stock."}
        {" "}In the print dialog, turn off "Headers and footers".
      </p>
    </div>
  );
}
