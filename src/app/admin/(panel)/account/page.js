import { requireAdmin } from "@/lib/auth";
import ChangePasswordForm from "@/components/admin/ChangePasswordForm";

export const metadata = { title: "My account" };

/** Anyone signed in can change their own password here. */
export default async function AccountPage() {
  const admin = await requireAdmin();
  return (
    <>
      <div className="head">
        <div>
          <h1>My account</h1>
          <p>Signed in as <b>{admin.name || "Owner"}</b> ({admin.email}), {admin.role === "owner" ? "owner" : "staff"}.</p>
        </div>
      </div>
      <ChangePasswordForm />
    </>
  );
}
