"use client";

import { useEffect, useState } from "react";
import { cardsByIdAction } from "@/lib/store-actions";
import { useStore } from "../Shell";
import ProductRail from "./ProductRail";

/** Products this visitor looked at before (kept in their browser), shown with live prices and stock. */
export default function RecentlyViewed({ currentId }) {
  const { viewed, loaded } = useStore();
  const [items, setItems] = useState([]);
  const ids = viewed.filter((id) => id !== currentId).slice(0, 10);
  const key = ids.join(",");

  useEffect(() => {
    if (!loaded || !key) return;
    let live = true;
    cardsByIdAction(key.split(",").map(Number)).then((list) => live && setItems(list)).catch(() => {});
    return () => { live = false; };
  }, [key, loaded]);

  // the rail mounts after the page's scroll animations were set up, so ask them to pick it up
  useEffect(() => {
    if (items.length) window.dispatchEvent(new Event("tba:motion"));
  }, [items.length]);

  if (!items.length) return null;
  return <ProductRail id="recent" eyebrow="Pick up where you left off" title="Recently viewed" items={items} />;
}
