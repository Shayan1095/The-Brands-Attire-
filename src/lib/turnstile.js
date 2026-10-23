import "server-only";

/*
  Cloudflare Turnstile: a free, privacy-friendly "are you a person?" check on checkout, so scripts cannot place
  fake orders that hold stock. Usually invisible to real customers.

  Optional: set NEXT_PUBLIC_TURNSTILE_SITE_KEY and TURNSTILE_SECRET_KEY (Cloudflare dashboard -> Turnstile ->
  Add widget). Without them checkout works exactly as before (the rate limits in lib/limits.js still apply).
*/

export const turnstileOn = () => Boolean(process.env.TURNSTILE_SECRET_KEY && process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);

/** Checks the token the widget gave the browser. Returns true for a real person (or when Turnstile is off). */
export async function humanCheck(token, ip) {
  if (!turnstileOn()) return true;
  if (!token) return false;
  try {
    const body = new URLSearchParams({ secret: process.env.TURNSTILE_SECRET_KEY, response: String(token) });
    if (ip && ip !== "local") body.append("remoteip", ip);
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", { method: "POST", body, signal: AbortSignal.timeout(8000) });
    const data = await res.json();
    return Boolean(data.success);
  } catch (err) {
    // Cloudflare unreachable: let the customer through rather than lose a real order (rate limits still apply)
    console.error("[turnstile]", err.message);
    return true;
  }
}
