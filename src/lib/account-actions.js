"use server";

import { revalidatePath } from "next/cache";
import { limit, allow, BUSY } from "./limits";
import { getCustomer, signUp, signIn, endSession, claimOrder, saveProfile, changePassword, sendReset, resetPassword, saveCart, publicCustomer } from "./accounts";

/* Customer account actions (public: every one is validated and rate-limited, see lib/accounts.js). */

export async function signupAction(input) {
  if (!(await limit("signup", 5, 3600))) return { error: BUSY };
  try {
    return await signUp(input || {});
  } catch (err) {
    console.error("[account] sign-up failed", err);
    return { error: "We could not create your account just now. Please try again in a moment." };
  }
}

export async function loginAction(input) {
  const login = String(input?.login || "").trim().toLowerCase().slice(0, 160);
  if (!(await allow(`cust-login:${login}`, 8, 900)) || !(await limit("cust-login", 30, 900))) return { error: "Too many attempts. Please wait 15 minutes." };
  return signIn(login, input?.password);
}

export async function logoutAction() {
  await endSession();
  return { ok: true };
}

export async function forgotAction(login) {
  if (!(await limit("reset", 5, 3600))) return { error: BUSY };
  return sendReset(login);
}

export async function resetAction(token, password) {
  if (!(await limit("reset-use", 10, 3600))) return { error: BUSY };
  return resetPassword(token, password);
}

/** "Add this order to my account" / "Set a password" on the order page. */
export async function claimOrderAction(token, password) {
  if (!(await limit("claim", 10, 3600))) return { error: BUSY };
  const res = await claimOrder(token, password);
  revalidatePath(`/order/${token}`);
  return res;
}

export async function profileAction(input) {
  const me = await getCustomer();
  if (!me) return { error: "Please sign in again." };
  return saveProfile(me, input);
}

export async function customerPasswordAction(current, next) {
  const me = await getCustomer();
  if (!me) return { error: "Please sign in again." };
  if (!(await allow(`cust-pw:${me.id}`, 8, 900))) return { error: "Too many attempts. Please wait 15 minutes." };
  return changePassword(me, current, next);
}

/** The signed-in customer's bag, kept on their account. */
export async function syncCartAction(items) {
  const me = await getCustomer();
  if (!me) return { ok: false };
  if (!(await limit("cart-sync", 120, 600))) return { ok: false };
  return saveCart(me, items);
}

/** Who is signed in (for the shop's header and checkout), or null. */
export async function meAction() {
  return publicCustomer(await getCustomer());
}

/** Turns a bag saved on the account ([{ variantId, qty }]) back into full bag items, with today's prices and stock. */
export async function restoreBagAction(items) {
  if (!(await limit("cart-restore", 60, 600))) return [];
  const { quoteCart } = await import("./orders");
  const quote = await quoteCart((Array.isArray(items) ? items : []).slice(0, 40));
  return quote.lines.filter((l) => l.stock > 0).map((l) => ({
    variantId: l.variantId, productId: l.productId, slug: l.slug, name: l.name, size: l.size, image: l.image,
    price: l.price, max: l.stock, qty: Math.min(l.qty, l.stock),
  }));
}
