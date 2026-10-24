import { redirect } from "next/navigation";
import { getSettings } from "@/lib/settings";
import { getCustomer } from "@/lib/accounts";
import AuthLayout from "@/components/store/AuthLayout";

export const metadata = { title: "Sign in", robots: { index: false } };

const safeNext = (n) => (typeof n === "string" && n.startsWith("/") && !n.startsWith("//") ? n : "/account");

export default async function LoginPage({ searchParams }) {
  const { next } = await searchParams;
  if (await getCustomer()) redirect(safeNext(next));
  const { store, crm } = await getSettings();
  return <AuthLayout store={store} percent={Number(crm.signup_percent) || 0} mode="login" next={safeNext(next)} />;
}
