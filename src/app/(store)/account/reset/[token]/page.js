import ResetPassword from "@/components/store/ResetPassword";

export const metadata = { title: "Choose a new password", robots: { index: false } };

export default async function ResetPage({ params }) {
  const { token } = await params;
  return (
    <section className="section acct acct--auth">
      <div className="wrap acct__narrow">
        <span className="eyebrow">Your account</span>
        <h1 className="display">New <em>password</em>.</h1>
        <ResetPassword token={token} />
      </div>
    </section>
  );
}
