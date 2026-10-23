import Link from "next/link";

/*
  The ethos, option B: a giant "MEAN IT" with a photo showing only through the letters.
  The section holds while you scroll; the letters zoom in (centred on the stroke of the "I") until the
  inside of that letter fills the screen and the whole photo is revealed, then the sentence fades in.

  How the "photo inside the letters" works: a near-black layer with white letters sits on top of the
  photo with mix-blend-mode: multiply. Black hides the photo, white lets it through untouched.
  The animation lives in Motion.jsx ([data-ethosb]). Without it (reduced motion, no JavaScript) the
  section simply shows the photo with the sentence over it.
*/

const PHOTO = (w) => `https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=${w}&q=72`;

export default function EthosReveal({ tagline, photo }) {
  return (
    <section className="ethosb" data-ethosb data-showcase="photo-ethos" aria-label="The ethos">
      <div className="ethosb__pin" data-ethosb-pin>
        <div className="ethosb__photo" data-ethosb-photo aria-hidden>
          {/* fetched early but at low priority: the letters must never be empty when the section arrives */}
          <img
            src={photo || PHOTO(2200)} srcSet={photo ? undefined : `${PHOTO(900)} 900w, ${PHOTO(1500)} 1500w, ${PHOTO(2200)} 2200w`} sizes="100vw"
            alt="" loading="eager" fetchPriority="low" decoding="async"
          />
        </div>

        <div className="ethosb__knock" data-ethosb-knock aria-hidden>
          <span className="ethosb__word">
            MEAN <span data-ethosb-anchor>I</span>T
          </span>
        </div>

        <div className="ethosb__scrim" data-ethosb-copy aria-hidden />
        <div className="wrap ethosb__copy">
          <span className="eyebrow ethosb__eyebrow" data-ethosb-copy>The ethos</span>
          <h2 className="ethosb__title" data-ethosb-copy>We make clothes for people who <em>mean it.</em></h2>
          <p className="ethosb__lede" data-ethosb-copy>Cut with intent. Finished by hand. Priced without the theatre.</p>
          <div className="ethosb__row" data-ethosb-copy>
            <span>{tagline}</span>
            <Link href="/lookbook" className="link-arrow">See how it is worn</Link>
          </div>
        </div>
      </div>
    </section>
  );
}
