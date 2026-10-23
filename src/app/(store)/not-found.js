import NotFoundView from "@/components/store/NotFoundView";

export const metadata = { title: "Not found", robots: { index: false } };

// a product, order or page inside the shop that called notFound()
export default function NotFound() {
  return <NotFoundView />;
}
