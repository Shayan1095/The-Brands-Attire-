import { UnsubscribeButton } from "@/components/store/Forms";

export const metadata = { title: "Unsubscribe", robots: { index: false } };

export default async function Unsubscribe({ params }) {
  const { token } = await params;
  return (
    <section className="section">
      <div className="wrap narrow center">
        <h1 className="h-display">Unsubscribe</h1>
        <p className="muted" style={{ marginBottom: 24 }}>Stop receiving new-arrival and offer messages from us.</p>
        <UnsubscribeButton token={token} />
      </div>
    </section>
  );
}
