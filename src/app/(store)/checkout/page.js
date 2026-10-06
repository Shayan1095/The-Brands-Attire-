import { getSettings } from "@/lib/settings";
import Checkout from "@/components/store/Checkout";

export const metadata = { title: "Checkout", robots: { index: false } };

export default async function CheckoutPage() {
  const { orders, shipping } = await getSettings();
  return (
    <section className="section--tight">
      <div className="wrap">
        <ol className="co-steps" data-reveal aria-label="Checkout progress">
          <li className="done"><span>✓</span> Bag</li>
          <li className="now"><span>2</span> Details</li>
          <li><span>3</span> Confirm by message</li>
        </ol>
        <h1 className="co-title display" data-split>Almost <em>yours</em>.</h1>
        <Checkout policy={orders.policy} eta={shipping.eta} freeOver={Number(shipping.free_over) || 0} />
      </div>
    </section>
  );
}
