"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Keeps an open order page current: while the order is still moving and the tab is visible, the page asks the
 * server again every minute (and as soon as the customer comes back to the tab), so "packed" or "on its way"
 * appears without a reload. Finished orders (delivered, cancelled, returned) are left alone.
 */
export default function OrderLive({ status }) {
  const router = useRouter();
  useEffect(() => {
    if (["delivered", "cancelled", "returned"].includes(status)) return;
    const refresh = () => document.visibilityState === "visible" && router.refresh();
    const t = setInterval(refresh, 60_000);
    document.addEventListener("visibilitychange", refresh);
    return () => { clearInterval(t); document.removeEventListener("visibilitychange", refresh); };
  }, [status, router]);
  return null;
}
