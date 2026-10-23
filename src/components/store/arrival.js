/** "3-5 working days" -> the dates the parcel should arrive between (Sundays are not working days). */
export function arrival(eta, from = new Date()) {
  const m = String(eta).match(/(\d+)\s*(?:-|–|to)\s*(\d+)/) || String(eta).match(/(\d+)/);
  if (!m) return null;
  const add = (days) => {
    const d = new Date(from);
    for (let left = days; left > 0;) { d.setDate(d.getDate() + 1); if (d.getDay() !== 0) left--; }
    return d.toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
  };
  const lo = Number(m[1]), hi = Number(m[2] || m[1]);
  return lo === hi ? add(lo) : `${add(lo)} – ${add(hi)}`;
}
