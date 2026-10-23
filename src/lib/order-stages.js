/*
  The five stages a customer sees for an order (shared by the order page and the track page).
  Admin statuses map onto them; "returned" and "cancelled" sit outside the line.
  [key, label, icon, timestamp column]
*/
export const STAGES = [
  ["placed", "Placed", "bag", "created_at"],
  ["confirmed", "Confirmed", "check", "confirmed_at"],
  ["packed", "Packed", "box", "packed_at"],
  ["shipped", "On its way", "truck", "shipped_at"],
  ["delivered", "Delivered", "pin", "delivered_at"],
];

const AT = { pending: 0, confirmed: 1, packed: 2, shipped: 3, delivered: 4 };

/** Index of the stage an order is at, or -1 when it was cancelled / returned. */
export const stageOf = (status) => (status in AT ? AT[status] : -1);
