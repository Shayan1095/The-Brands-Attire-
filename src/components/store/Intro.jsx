/*
  The intro shown on a visitor's first page of a visit: the wordmark rises letter by letter, the red slash
  cuts in, a line runs along the bottom, then the whole screen lifts away to reveal the page.

  It is plain HTML + CSS sent with the page (no JavaScript needed to draw it), so it is on screen from the very
  first paint. The boot script in (store)/layout.js decides whether to show it (html[data-intro]) and when to
  lift it: after at least ~1.4 s, once the page has loaded, and never later than ~2.4 s.
  Once per browser session; ?intro=1 shows it again (for checking it).
*/
export default function Intro({ name, tagline }) {
  const words = name.toUpperCase().split(/\s+/).filter(Boolean);
  const head = words.length > 1 ? words.slice(0, -1).join(" ") : "";
  const tail = words.at(-1) || "";
  let i = 0;
  const letters = (text) => Array.from(text).map((ch) => (
    <span key={i} className="intro__ch" style={{ "--i": i++ }}>{ch === " " ? " " : ch}</span>
  ));
  return (
    <div className="intro" aria-hidden>
      <div className="intro__inner">
        <div className="intro__mark">
          {head && <span className="intro__word">{letters(head)}</span>}
          {head && <span className="intro__slash" style={{ "--i": i++ }}>/</span>}
          <span className="intro__word">{letters(tail)}</span>
        </div>
        <div className="intro__meta">
          {tagline && <span className="intro__tag">{tagline}</span>}
          <span className="intro__pct" />
        </div>
      </div>
      <i className="intro__bar" />
    </div>
  );
}
