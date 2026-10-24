import { redirect } from "next/navigation";
import { getSettings } from "@/lib/settings";
import { getCustomer } from "@/lib/accounts";
import AuthLayout from "@/components/store/AuthLayout";

export const metadata = { title: "Create your account", robots: { index: false } };

export default async function SignupPage({ searchParams }) {
  const { next } = await searchParams;
  const safe = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/account";
  const me = await getCustomer();
  // signing up signs you in, which reloads this page: an account made a moment ago keeps its welcome screen
  // (with the code); anyone else already signed in goes straight on
  const justMade = me?.account_at && Date.now() - new Date(me.account_at).getTime() < 5 * 60 * 1000;
  if (me && !justMade) redirect(safe);
  const { store, crm } = await getSettings();
  return <AuthLayout store={store} percent={Number(crm.signup_percent) || 0} mode="signup" next={safe} signedIn={Boolean(me)} />;
}
