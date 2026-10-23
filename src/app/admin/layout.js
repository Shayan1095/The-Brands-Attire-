import "@/styles/ui.css";
import "./admin.css";
import { fontVars } from "@/lib/fonts";

export const dynamic = "force-dynamic";
export const metadata = { title: { default: "Admin", template: "%s · Admin" }, robots: { index: false, follow: false } };

// before the first paint: dark mode and the slim sidebar as last chosen on this device (dark follows the
// device when never chosen), so the panel never flashes the wrong look
const boot = `try{var d=document.documentElement,t=localStorage.getItem("tba_adm_theme");d.dataset.theme=t||(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");if(localStorage.getItem("tba_adm_slim")==="1")d.dataset.slim="1"}catch(e){}`;

export default function AdminRoot({ children }) {
  return (
    <html lang="en" className={fontVars} suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: boot }} /></head>
      <body>{children}</body>
    </html>
  );
}
