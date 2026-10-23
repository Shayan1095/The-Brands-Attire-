import "@/styles/ui.css";
import "./store.css";
import { fontVars } from "@/lib/fonts";
import { getSettings, siteUrl } from "@/lib/settings";
import { listCategories } from "@/lib/catalog";
import Shell from "@/components/store/Shell";
import Intro from "@/components/store/Intro";

// stock and prices must always be live
export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const { store } = await getSettings();
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: store.name, template: `%s · ${store.name}` },
    description: store.tagline,
    openGraph: { siteName: store.name, type: "website" },
    // a large picture when the link is shared (WhatsApp, Facebook, X...): see opengraph-image.js
    twitter: { card: "summary_large_image" },
  };
}

// set the saved theme before first paint (no flash)
// also marks the page as script-enabled so animated content can start hidden; the timer is a safety net if scripts fail
// lite mode: on devices where the browser draws without the graphics card (old laptops, budget phones),
// or with very little memory, the heavy scroll effects are switched off (see Motion.jsx and store.css).
// ?motion=lite / ?motion=full forces a mode for the visit (handy for testing).
const liteScript = `try{var q=/[?&]motion=(lite|full)/.exec(location.search);if(q)sessionStorage.setItem("tba_motion",q[1]);var f=sessionStorage.getItem("tba_motion"),lite=false;if(f)lite=f==="lite";else{var c=document.createElement("canvas"),g=c.getContext("webgl")||c.getContext("experimental-webgl");if(!g)lite=true;else{var x=g.getExtension("WEBGL_debug_renderer_info"),r=x?String(g.getParameter(x.UNMASKED_RENDERER_WEBGL)):"";if(/swiftshader|basic render|llvmpipe|software/i.test(r))lite=true;var l=g.getExtension("WEBGL_lose_context");if(l)l.loseContext()}if((navigator.deviceMemory||8)<=2)lite=true}if(lite)d.dataset.lite="1"}catch(e){}`;
// intro (components/store/Intro.jsx): first page of a visit only (never when opened from Admin -> Showcase), at least ~1.4 s (0.9 s in lite mode), lifted once the
// page's first big photo is on screen (or the page has loaded), never later than ~3.2 s; ?intro=1 forces it. Reduced-motion visitors do not get it.
const introScript = `try{var force=/[?&]intro=1/.test(location.search),seen=sessionStorage.getItem("tba_intro");if((force||!seen)&&!/[?&]showcase=/.test(location.search)&&!matchMedia("(prefers-reduced-motion: reduce)").matches){sessionStorage.setItem("tba_intro","1");d.dataset.intro="1";var t0=Date.now(),min=d.dataset.lite?900:1400,gone=false,lift=function(){if(gone)return;gone=true;d.dataset.intro="out";setTimeout(function(){delete d.dataset.intro},1000)},first=function(){var i=document.querySelector("[data-hero] img,.hero__img,.gcover img,.shero img,.page-hero img");return document.readyState==="complete"||(i&&i.complete&&i.naturalWidth>0)},check=function(){if(gone)return;var t=Date.now()-t0;if(t>=3200||(t>=min&&first()))lift();else setTimeout(check,120)};setTimeout(check,min)}}catch(e){}`;
const themeScript = `var d=document.documentElement;try{if(localStorage.getItem("tba_theme")==="dark")d.dataset.theme="dark"}catch(e){}d.dataset.js="1";${liteScript}${introScript}setTimeout(function(){d.dataset.motion="1"},3500);`;

export default async function StoreLayout({ children }) {
  const [settings, categories] = await Promise.all([getSettings(), listCategories()]);
  const store = { ...settings.store, announcement: settings.announcement, shipping: settings.shipping, chat: settings.assistant.web_chat ? { name: settings.assistant.name, greeting: settings.assistant.greeting } : null };
  return (
    <html lang="en" className={fontVars} suppressHydrationWarning>
      {/* a plain inline script in <head>: it runs while the page is still arriving, before anything is drawn, so the
          intro, the saved theme and lite mode are right from the first frame. (next/script's beforeInteractive
          waits for the site's JavaScript to download, which on a phone showed the page first, then the intro late.) */}
      <head>
        <script id="tba-boot" dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>
        <Intro name={store.name} tagline={store.tagline} />
        <Shell store={store} categories={categories.map(({ id, name, slug, image_url, product_count }) => ({ id, name, slug, image: image_url, count: product_count }))}>
          {children}
        </Shell>
      </body>
    </html>
  );
}
