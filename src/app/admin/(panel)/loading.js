/** Shown at once while an admin page loads: the outline of a page instead of a frozen screen. */
export default function Loading() {
  return (
    <div className="askel" aria-busy="true" aria-label="Loading">
      <div className="askel__head"><i style={{ width: "34%" }} /><i style={{ width: "52%", height: 14 }} /></div>
      <div className="askel__row">{[0, 1, 2, 3].map((n) => <i key={n} />)}</div>
      <div className="askel__card">{[0, 1, 2, 3, 4, 5].map((n) => <i key={n} style={{ animationDelay: `${n * 80}ms` }} />)}</div>
    </div>
  );
}
