import Link from "next/link";

/*
  The gallery's cover: a moodboard wall of real gallery photos in four columns that drift at different
  speeds as you scroll (Motion.jsx, [data-speed], desktop and normal mode only), with the title on top.
  Built from the product photos, so it changes by itself as the catalogue does.
*/
const SPEEDS = ["-0.08", "0.07", "-0.12", "0.1"];

export default function GalleryCover({ photos, frames, pieces, chapters }) {
  // fill four columns, repeating photos when the catalogue is small
  const pool = photos.length ? photos : [];
  const columns = SPEEDS.map((_, c) => Array.from({ length: 5 }, (_, i) => pool[(c * 5 + i * 3 + c) % Math.max(1, pool.length)]).filter(Boolean));

  return (
    <section className="gcover" aria-label="The lookbook">
      <div className="gcover__wall" aria-hidden>
        {columns.map((col, ci) => (
          <div key={ci} className={`gcover__col gcover__col--${ci}`} data-speed={SPEEDS[ci]}>
            {col.map((src, i) => (
              <span key={i} className="gcover__tile">
                <img src={src} alt="" loading={i < 2 ? "eager" : "lazy"} decoding="async" />
              </span>
            ))}
          </div>
        ))}
      </div>
      <div className="gcover__shade" aria-hidden />

      <div className="wrap gcover__content">
        <div className="crumbs" data-reveal><Link href="/">Home</Link> / Gallery</div>
        <span className="eyebrow gcover__eyebrow" data-reveal><span className="hero__pulse" /> The season, frame by frame</span>
        <h1 className="gcover__title" data-split>The <em>lookbook</em></h1>
        <div className="gcover__row" data-reveal>
          <p>Every piece, shot close and styled simply. Open any frame to zoom in, pick your size and add it to your bag.</p>
          <dl className="gcover__meta">
            <div><dt>Frames</dt><dd>{frames}</dd></div>
            <div><dt>Pieces</dt><dd>{pieces}</dd></div>
            <div><dt>Chapters</dt><dd>{chapters}</dd></div>
          </dl>
        </div>
      </div>
      <span className="gcover__cue" aria-hidden><i /> Scroll</span>
    </section>
  );
}
