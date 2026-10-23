import { Icon } from "../icons";

/*
  "What you'll get": a phone showing the store's WhatsApp chat, built from real data
  (the newest product and the sale running now), so it never shows something the shop does not sell.
  The messages pop in one by one, after a typing indicator, when the phone scrolls into view;
  that sequence lives in Motion.jsx ([data-chat]).
*/
export default function ChatPreview({ storeName, product, sale, fmt }) {
  const initial = storeName.replace(/^the\s+/i, "").charAt(0).toUpperCase();
  return (
    <div className="phone" data-chat aria-label={`Example of the WhatsApp updates from ${storeName}`} role="img">
      <div className="phone__frame">
        <span className="phone__notch" aria-hidden />
        <header className="phone__head">
          <span className="phone__back" aria-hidden><Icon name="arrow" /></span>
          <span className="phone__avatar" aria-hidden>{initial}</span>
          <div className="phone__who">
            <b>{storeName} <i className="phone__verified" aria-hidden><Icon name="check" /></i></b>
            <small>online</small>
          </div>
        </header>

        <div className="phone__chat">
          <span className="phone__day">Today</span>

          {product && (
            <div className="bubble-in bubble-in--card" data-chat-msg>
              {/* eager: the bubble starts hidden, and a lazy photo would arrive after the message pops in */}
              {product.image && <img src={product.image} alt="" decoding="async" />}
              <div className="bubble-in__body">
                <small>Just landed ✦</small>
                <b>{product.name}</b>
                <span>{fmt(product.price)}{product.was ? <s>{fmt(product.was)}</s> : null}</span>
              </div>
              <span className="bubble-in__btn"><Icon name="bag" /> View in shop</span>
              <time>now</time>
            </div>
          )}

          {sale && (
            <div className="bubble-in" data-chat-msg>
              <b>{sale.name} is live</b> Up to {sale.off}% off, already taken off the prices. It will not last long.
              <time>now <i className="bubble-in__ticks" aria-hidden>✓✓</i></time>
            </div>
          )}

          <div className="bubble-in" data-chat-msg>
            Cash on delivery as always. Tap the link to see the full drop.
            <time>now <i className="bubble-in__ticks" aria-hidden>✓✓</i></time>
          </div>

          <span className="phone__typing" data-chat-typing aria-hidden><i /><i /><i /></span>
        </div>

        <footer className="phone__bar" aria-hidden>
          <span>Message</span>
          <i><Icon name="send" /></i>
        </footer>
      </div>
    </div>
  );
}
