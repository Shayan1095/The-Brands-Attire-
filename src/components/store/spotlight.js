import { SHOWCASE_SECTIONS, SHOWCASE_PHOTOS } from "@/lib/showcase-sections";

/*
  "Show me on the shop" from Admin -> Showcase opens a page with ?showcase=<section>. This finds that section
  (the copy actually on screen: the home arrivals are a stack on computers and a carousel on phones), glides to it
  and outlines it for a few seconds with a label, so the editor sees exactly what their changes affect.
  Sections are marked in the markup with data-showcase="...".
*/
const NAMES = {
  ...Object.fromEntries(Object.entries(SHOWCASE_SECTIONS).map(([k, s]) => [k, s.label])),
  ...Object.fromEntries(Object.entries(SHOWCASE_PHOTOS).map(([k, s]) => [`photo-${k}`, s.label])),
  gallery: "Gallery photos",
};

const visible = (el) => el.getClientRects().length > 0 && getComputedStyle(el).visibility !== "hidden";

export function spotlight(key) {
  if (!NAMES[key]) return () => {};
  let stop = false, timer = 0;
  const started = Date.now();

  const find = () => {
    if (stop) return;
    const el = [...document.querySelectorAll(`[data-showcase="${key}"]`)].find(visible);
    // wait for the page (and the intro, if any) to settle; give up quietly after a while
    if (!el || document.documentElement.dataset.intro || document.readyState !== "complete") {
      if (Date.now() - started < 8000) timer = setTimeout(find, 150);
      return;
    }
    const inDrawer = el.closest("[data-vaul-drawer], [role=dialog]");
    // the scroll effects measure the page once it has loaded and jump to the top while they do, which can
    // cut a glide short: check where the section ended up and go again (a few times at most)
    const glide = (tries) => {
      if (stop) return;
      const off = el.getBoundingClientRect().top - 90;
      if (Math.abs(off) < 120 || tries > 3) return;
      const y = off + window.scrollY;
      if (window.__lenis) window.__lenis.scrollTo(y, { duration: tries ? 0.8 : 1.4, force: true });
      else window.scrollTo({ top: y, behavior: "smooth" });
      setTimeout(() => glide(tries + 1), tries ? 1000 : 1600);
    };
    if (inDrawer) el.scrollIntoView({ block: "center", behavior: "smooth" });
    else glide(0);

    const label = document.createElement("div");
    label.className = "sc-spot-label";
    label.setAttribute("role", "status");
    label.innerHTML = `<b></b><span>This is the section you are editing in Showcase</span>`;
    label.querySelector("b").textContent = NAMES[key];
    document.body.appendChild(label);
    timer = setTimeout(() => {
      el.classList.add("sc-spot");
      timer = setTimeout(() => {
        el.classList.remove("sc-spot");
        label.classList.add("is-out");
        timer = setTimeout(() => label.remove(), 500);
      }, 6500);
    }, inDrawer ? 300 : 1300);
  };
  find();
  return () => { stop = true; clearTimeout(timer); document.querySelectorAll(".sc-spot").forEach((e) => e.classList.remove("sc-spot")); document.querySelectorAll(".sc-spot-label").forEach((e) => e.remove()); };
}
