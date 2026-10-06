import "./store.css";
import { fontVars } from "@/lib/fonts";
import { getSettings, siteUrl } from "@/lib/settings";
import { listCategories } from "@/lib/catalog";
import Script from "next/script";
import Shell from "@/components/store/Shell";

// stock and prices must always be live
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { store } = await getSettings();
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: store.name, template: `%s · ${store.name}` },
    description: store.tagline,
    openGraph: { siteName: store.name, type: "website" },
  };
}

// set the saved theme before first paint (no flash)
// also marks the page as script-enabled so animated content can start hidden; the timer is a safety net if scripts fail
const themeScript = `var d=document.documentElement;try{if(localStorage.getItem("tba_theme")==="dark")d.dataset.theme="dark"}catch(e){}d.dataset.js="1";setTimeout(function(){d.dataset.motion="1"},3500);`;

export default async function StoreLayout({ children }) {
  const [settings, categories] = await Promise.all([getSettings(), listCategories()]);
  const store = { ...settings.store, announcement: settings.announcement, shipping: settings.shipping, chat: settings.assistant.web_chat ? { name: settings.assistant.name, greeting: settings.assistant.greeting } : null };
  return (
    <html lang="en" className={fontVars} suppressHydrationWarning>
      <body>
        <Script id="tba-boot" strategy="beforeInteractive">{themeScript}</Script>
        <Shell store={store} categories={categories.map(({ id, name, slug }) => ({ id, name, slug }))}>
          {children}
        </Shell>
      </body>
    </html>
  );
}
