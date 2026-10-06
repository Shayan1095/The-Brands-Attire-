import { redirect } from "next/navigation";
import { getAdmin } from "@/lib/auth";
import { LoginForm } from "@/components/admin/Widgets";

export const metadata = { title: "Sign in" };

export default async function Login() {
  if (await getAdmin()) redirect("/admin");
  return (
    <div className="login">
      <div className="login__art">
        <span aria-hidden>TBA</span>
        <h2>Run the store.<br /><em>Not the chores.</em></h2>
        <p>Orders, stock, offers and customer messages in one place, with the repetitive parts done for you.</p>
      </div>
      <div className="login__pane">
        <div className="card">
          <h1>The Brands<b>/</b>Attire</h1>
          <p className="sub">Sign in to manage your store.</p>
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
