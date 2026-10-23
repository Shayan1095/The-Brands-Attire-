"use client";

import { useEffect, useState } from "react";
import AdminIcon from "./icons";

/**
 * The bar that appears when orders are ticked in the list: print their slips and cards, a packing list,
 * or download the courier booking file. Works with the server-rendered table through `data-pick` checkboxes.
 */
export default function OrderPicker() {
  const [ids, setIds] = useState([]);

  useEffect(() => {
    const boxes = () => [...document.querySelectorAll("input[data-pick]")];
    const sync = () => {
      const on = boxes().filter((b) => b.checked).map((b) => b.value);
      setIds(on);
      const all = document.querySelector("input[data-pick-all]");
      if (all) { all.checked = on.length > 0 && on.length === boxes().length; all.indeterminate = on.length > 0 && on.length < boxes().length; }
      for (const b of boxes()) b.closest("tr")?.classList.toggle("is-picked", b.checked);
    };
    const onChange = (e) => {
      if (e.target.matches("input[data-pick-all]")) for (const b of boxes()) b.checked = e.target.checked;
      if (e.target.matches("input[data-pick], input[data-pick-all]")) sync();
    };
    document.addEventListener("change", onChange);
    sync();
    return () => document.removeEventListener("change", onChange);
  }, []);

  const clear = () => {
    for (const b of document.querySelectorAll("input[data-pick], input[data-pick-all]")) { b.checked = false; b.indeterminate = false; }
    for (const tr of document.querySelectorAll("tr.is-picked")) tr.classList.remove("is-picked");
    setIds([]);
  };
  const q = `id=${ids.join(",")}`;

  if (!ids.length) return null;
  return (
    <div className="picker" role="region" aria-label="Selected orders">
      <b>{ids.length} selected</b>
      <a className="btn btn--sm" href={`/admin/print?${q}&what=slips,cards`} target="_blank" rel="noopener"><AdminIcon name="print" /> Slips &amp; cards</a>
      <a className="btn btn--ghost btn--sm" href={`/admin/print?${q}&what=list`} target="_blank" rel="noopener">Packing list</a>
      <a className="btn btn--ghost btn--sm" href={`/admin/orders/courier-file?${q}`} download>Courier file</a>
      <button type="button" className="picker__x" onClick={clear} aria-label="Clear selection"><AdminIcon name="x" /></button>
    </div>
  );
}
