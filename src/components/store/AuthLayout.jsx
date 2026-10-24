import AccountAuth from "./AccountAuth";

/** The sign-in / create-account page: why an account helps, beside the form. */
export default function AuthLayout({ store, percent, mode, next, signedIn = false }) {
  return (
    <section className="section acct acct--auth">
      <div className="wrap acct__authgrid">
        <div className="acct__intro">
          <span className="eyebrow">{store.name} account</span>
          <h1 className="display">{mode === "signup" ? <>Join and get <em>{percent > 0 ? `${percent}% off` : "more"}</em>.</> : <>Welcome <em>back</em>.</>}</h1>
          <ul className="acct__perks">
            <li><b>Your bag on every device</b><span>Start on your phone, finish on your laptop.</span></li>
            <li><b>Orders in one place</b><span>Track, change, exchange or return in a tap. The chat knows your orders too.</span></li>
            <li><b>Faster checkout</b><span>Your details are filled in for you.</span></li>
            {percent > 0 && <li><b>{percent}% off your first order</b><span>A one-time code the moment you sign up.</span></li>}
          </ul>
          <p className="fine">Accounts are optional. You can always order as a guest.</p>
        </div>
        <AccountAuth mode={mode} next={next} percent={percent} storeName={store.name} signedIn={signedIn} />
      </div>
    </section>
  );
}
