import "./admin.css";
import { fontVars } from "@/lib/fonts";

export const dynamic = "force-dynamic";
export const metadata = { title: { default: "Admin", template: "%s · Admin" }, robots: { index: false, follow: false } };

export default function AdminRoot({ children }) {
  return (
    <html lang="en" className={fontVars}>
      <body>{children}</body>
    </html>
  );
}
