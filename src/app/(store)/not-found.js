import Link from "next/link";

export default function NotFound() {
  return (
    <div className="empty" style={{ paddingBlock: 140 }}>
      <h2>Page not found</h2>
      <p>The page or product you are looking for is no longer here.</p>
      <Link href="/products" className="btn">Back to the shop</Link>
    </div>
  );
}
