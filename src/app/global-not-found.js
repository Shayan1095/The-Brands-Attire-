import StoreLayout from "./(store)/layout";
import NotFoundView from "@/components/store/NotFoundView";

/*
  Any address that matches no route at all. The shop and the admin each have their own root layout, so
  Next.js needs this separate page (next.config.mjs: experimental.globalNotFound); it is wrapped in the
  shop's own layout so a mistyped link still shows the header, bag, theme and footer.
*/
export const metadata = { title: "Page not found", robots: { index: false } };

export default function GlobalNotFound() {
  return (
    <StoreLayout>
      <NotFoundView />
    </StoreLayout>
  );
}
