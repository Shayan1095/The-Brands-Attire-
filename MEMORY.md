# MEMORY.md — The Brands Attire (ZCodeProject)

_Last updated: 2026-07-17 17:10 GMT+5_

---

## Project Overview

**Name:** The Brands Attire  
**Type:** Premium clothing e-commerce frontend (static site)  
**Tagline:** "Wear like you mean it."  
**Tagline (alt):** "Three worlds. One point of view."  
**Status:** Front-end complete — static HTML/CSS/JS only. Backend (database, auth, payments, admin) planned.

---

## Three Worlds (Product Categories)

| World | Vibe | Pieces | Key Products |
|-------|------|--------|--------------|
| **Luxury** | Refined · Considered | 4 | Merino Overcoat, Cashmere Crewneck, Wool Tailored Trouser, Silk Blend Shirt |
| **Everyday** | Essentials · Lived-in | 4 | Heavyweight Tee, Relaxed Selvedge Jean, Loopback Hoodie, Cotton Chino |
| **Tech** | Performance · Engineered | 4 | Tech Shell Jacket, Compression Legging, Puffer Vest, Performance Shorts |

**Total products:** 12 (4 per world)

---

## Tech Stack

- **HTML5** — Semantic markup, no framework
- **CSS3** — Custom properties (design tokens), CSS Grid, `clamp()` fluid type, `columns` masonry
- **Vanilla JavaScript (ES6+)** — No build step, no bundler, no dependencies
- **Fonts:** Google Fonts — Anton (display), Inter (body), JetBrains Mono (mono/prices), Playfair Display (search)
- **Images:** Unsplash (placeholder URLs)
- **Icons:** Inline SVG
- **Storage:** `localStorage` for cart & theme persistence

---

## File Structure

```
ZCodeProject/
├── index.html          # Home — Hero, Three Worlds, New Arrivals rail, Editorial split, Newsletter
├── products.html       # Product listing with category + sale filters
├── product.html        # Single product (PDP) — gallery, sizes, size guide modal, qty, wishlist, accordions
├── gallery.html        # Masonry lookbook with world filters
├── contact.html        # Contact form + business info
├── login.html          # Auth — toggle tabs, social buttons
├── shared.css          # Design system + all styles
├── shared.js           # Product data, cart, nav, footer, drawer, search, card template
├── style-tile.html     # Original style tile (v1 demo)
├── favicon.png         # 870KB — needs optimization
├── PROJECT_CONTEXT.md.txt
├── README.md
├── all_tasks.patch
├── change log.md.txt
└── ... (various .txt fragment files)
```

---

## Design Tokens (from `shared.css:1-60`)

| Token | Value | Use |
|-------|-------|-----|
| `--ink` | `#0A0A0A` | Primary text, dark sections |
| `--paper` | `#F4F1EC` | Background |
| `--bone` | `#E8E2D8` | Cards, dividers |
| `--signal` | `#E10600` | Accent, CTAs, sale (red) |
| `--signal-soft` | `rgba(225,6,0,.12)` | Hover backgrounds |
| `--muted` | `#6B6B6B` | Secondary text |
| `--line` | `rgba(10,10,10,.12)` | Borders, dividers |

**Dark/Tech theme** (`[data-theme="tech"]`): Inverts ink/paper/bone, adjusts muted/line.

**Typography:**
- `--font-display`: "Anton" — headlines, hero
- `--font-body`: "Inter" — body copy
- `--font-mono`: "JetBrains Mono" — prices, specs, UI labels
- `--font-search`: "Playfair Display" — search input

**Fluid Type Scale:**
- `--t-hero`: `clamp(3rem, 11vw, 10rem)`
- `--t-h1`: `clamp(2.25rem, 5.5vw, 4.5rem)`
- `--t-h2`: `clamp(1.75rem, 3vw, 2.75rem)`
- `--t-h3`: `1.5rem`
- `--t-body`: `1.0625rem`
- `--t-sm`: `.875rem`
- `--t-xs`: `.75rem`

**Spacing Scale:** `--s-1` (4px) through `--s-10` (128px)

**Motion:** `--ease`: `cubic-bezier(.16,1,.3,1)`, `--dur`: `320ms`

**Product Card Dimensions (fixed):**
- `--card-w`: 300px
- `--card-h`: 480px
- `--card-img`: 360px (75%)
- `--card-body`: 120px (25%)

---

## Product Data Structure (`shared.js:1-400`)

```js
{
  id: Number,
  name: String,
  world: "luxury" | "everyday" | "tech",
  price: Number,        // current price
  was: Number,          // original price (0 = no sale)
  tag: String|null,     // "New" | "Sale" | null
  img: String,          // main image (Unsplash URL)
  images: String[4],    // 4 angle variations of same product
  desc: String,         // product description
  fabric: String,       // material composition
  care: String,         // care instructions
  origin: String,       // manufacturing origin
  sizes: String[],      // available sizes
  soldout: String[]     // sold-out sizes
}
```

**Normalization:** Each product's `images` array is generated from its base `img` URL with different crop parameters (front, detail, wide, tight) so thumbnails always show the same garment.

---

## Cart System (`shared.js:400-440`)

- **Storage key:** `tba_cart_v3`
- **Structure:** Array of `{ id: Number, size: String|null, qty: Number }`
- **Persistence:** `localStorage` — survives page navigation/refresh
- **Functions:** `saveCart()`, `renderCart()`, `addToCart(id, size)`, `openDrawer()`, `closeDrawer()`
- **Drawer:** Slides from right, shows items with image/name/size/qty/price, remove button, subtotal, checkout button (demo)

---

## Shared JS Architecture (`shared.js`)

**Exports (global):**
- `PRODUCTS` — array of 12 products
- `cart` — cart array
- `cardHTML(product)` — returns product card HTML string
- `addToCart(id, size)` — adds to cart, opens drawer, shows toast
- `toast(msg)` — bottom-center toast notification
- `openDrawer()`, `closeDrawer()` — cart drawer
- `openSearch()`, `closeSearch()`, `renderSearch(query)` — search overlay
- `initPage(active)` — injects nav/footer/drawer/search, wires events, starts IntersectionObserver for reveals

**Builders (called by `initPage`):**
- `buildNav(active)` — sticky glassmorphism nav, burger menu, search/bag/theme buttons
- `buildFooter()` — 4-column footer with links, copyright
- `buildDrawer()` — scrim + drawer + theme toggle + toast container
- `buildSearch()` — full-screen search overlay with input, chips, results grid

**Event Delegation (global):**
- `[data-add]` — add to cart from card overlay
- `[data-wish]` — wishlist toggle on card
- View Transitions API for same-origin navigation

---

## Pages Detail

### `index.html` — Home
- Hero: full-screen background, animated title "Wear *like* you mean it.", pulse indicator, CTA
- Three Worlds: 3 cards linking to filtered products.html
- New Arrivals: horizontal rail (8 products, scroll-snap)
- Editorial Split: 50/50 image + copy, links to gallery
- Newsletter: email capture form (demo toast)

### `products.html` — Product Listing
- Page hero with breadcrumb
- Toolbar: filter chips (All, Luxury, Everyday, Tech, Sale) + count
- Responsive grid: `repeat(auto-fill, minmax(300px, 1fr))`
- URL sync: `?filter=luxury|everyday|tech|sale|all`
- Empty state handling

### `product.html` — PDP (Single Product)
- Breadcrumb
- Gallery: main image (max 520px) + 4 thumbnails, crossfade on switch
- Info: category tag, name, price (sale styling), description
- Size selector: pills, disabled for soldout, active state
- Size Guide button → modal with measurement table
- Quantity stepper (1–10)
- Add to bag (requires size) + wishlist heart
- Accordions: Description, Fabric & Care, Shipping & Returns
- Recommendations rail: 4 products from same world

### `gallery.html` — Lookbook
- Page hero
- Filter chips (All, Luxury, Everyday, Tech)
- CSS columns masonry (3/2/1 cols responsive)
- Hover captions with campaign title + description
- CTA to products.html

### `contact.html` — Contact
- Page hero
- Two-column: form (name, email, topic select, message) + info cards (email, phone, address, hours)
- FAQ box with link to login for order tracking

### `login.html` — Auth
- Split layout: editorial aside (left, desktop only) + form card (right)
- Tabs: Log in / Sign up (toggle forms)
- Social buttons: Google, Apple (demo toasts)
- Switch links at bottom

---

## Key CSS Components (`shared.css`)

| Component | Selector | Notes |
|-----------|----------|-------|
| Nav | `.nav`, `.nav__inner`, `.brand`, `.nav__links`, `.icon-btn` | Sticky, glassmorphism, mobile drawer |
| Buttons | `.btn`, `.btn--ghost`, `.btn--block` | Mono font, uppercase, hover lift + shadow |
| Product Card | `.card`, `.card__media`, `.card__body`, `.card__add`, `.card__wish` | Fixed 300×480, hover zoom, overlay add-to-bag |
| Product Grid | `.grid`, `.rail` | Grid: auto-fill; Rail: horizontal scroll-snap |
| PDP | `.pdp`, `.pdp__gallery`, `.pdp__main`, `.pdp__thumbs`, `.sizes`, `.qty`, `.acc` | Sticky info, crossfade gallery, accordion |
| Search | `.search-overlay`, `.search-input`, `.search-results` | Full-screen, Playfair Display input |
| Cart Drawer | `.scrim`, `.drawer`, `.drawer__items`, `.item` | Right slide, scrim, persistent |
| Reveal | `.reveal`, `.reveal.in` | IntersectionObserver, stagger delays |
| Touch Active | `@media (hover: none)` | `:active` states mirror `:hover` |

---

## Implemented Features Checklist

- [x] Responsive navigation (desktop + mobile drawer)
- [x] Sticky glassmorphism nav with theme toggle
- [x] Hero section with animated entrance
- [x] Three Worlds category cards
- [x] Product cards (fixed dimensions, hover zoom, add-to-bag overlay, wishlist)
- [x] Horizontal product rail (home)
- [x] Responsive product grid (listing)
- [x] Category + Sale filters (URL-synced)
- [x] Full PDP: gallery crossfade, size picker, qty, size guide modal, accordions
- [x] Persistent cart drawer (localStorage, size-aware)
- [x] Full-screen search overlay (live filter, chips, results)
- [x] Masonry gallery (CSS columns)
- [x] Contact form + info grid
- [x] Login/Signup tabs + social buttons
- [x] Dark mode (Tech theme) toggle + persistence
- [x] View Transitions API page navigation
- [x] Scroll reveal animations with stagger
- [x] Touch active states (`@media (hover: none)`)
- [x] Reduced motion support (`prefers-reduced-motion`)
- [x] Accessibility: keyboard nav, focus states, ARIA labels, semantic HTML

---

## Coding Rules (from `PROJECT_CONTEXT.md.txt`)

1. **Never break existing functionality.**
2. **Reuse existing CSS where possible.**
3. **Maintain responsive design.**
4. **Avoid unnecessary libraries.**
5. **Keep code clean and readable.**
6. **Do not delete features unless requested.**

---

## Git Workflow

```bash
git add .
git commit -m "Describe changes"
git push origin main
```

---

## Agent Instructions (from `PROJECT_CONTEXT.md.txt`)

Before editing:
1. Read this file (MEMORY.md) and PROJECT_CONTEXT.md.txt
2. Inspect existing code
3. Modify only what is necessary
4. Explain significant changes

---

## Known Issues / Tech Debt

| Issue | Location | Priority |
|-------|----------|----------|
| Favicon 870KB PNG → optimize to WebP/AVIF <50KB | `favicon.png` | High |
| Unsplash images — no control, no srcset, no local hosting | All HTML | Medium |
| No build step (minify, hash, critical CSS) | — | Medium |
| Cart not synced across devices | `shared.js` | Low |
| Wishlist not persisted | `shared.js` | Low |
| Search index only client-side (fine for 12 products) | `shared.js` | Low |
| No SEO schema.org Product markup | `product.html` | Medium |
| No PWA manifest / service worker | — | Low |
| Form submissions are demo toasts only | `contact.html`, `login.html` | High (for backend) |

---

## Next Steps / Roadmap

1. **Backend Integration**
   - Database (products, users, orders)
   - Auth (JWT, OAuth Google/Apple)
   - Payments (Stripe)
   - Admin CMS (product CRUD, order management)

2. **Image Optimization**
   - Replace favicon with optimized WebP/AVIF
   - Self-host product images with srcset (multiple widths)
   - Add blur placeholders / LQIP

3. **Build Pipeline**
   - Vite/esbuild for minification, hashing, critical CSS extraction
   - HTML minification

4. **SEO & Analytics**
   - schema.org Product / BreadcrumbList / WebSite JSON-LD
   - Meta tags (Open Graph, Twitter Card)
   - Sitemap.xml, robots.txt
   - Analytics (Plausible/GA4)

5. **PWA**
   - manifest.json
   - Service worker (cache-first for static, network-first for API)

6. **Enhanced UX**
   - Cross-device cart sync (backend)
   - Real wishlist persistence
   - Recently viewed products
   - Size recommendation quiz

---

## Memory Maintenance

- **This file** (`ZCodeProject/MEMORY.md`) = project-specific memory
- **Workspace root** (`MEMORY.md`) = session/agent memory + quick project reference
- Update **both** when significant work happens
- Read **both** at session start

---

## Related Files

- `PROJECT_CONTEXT.md.txt` — Original project brief + agent instructions
- `README.md` — Public-facing project description
- `shared.css` — Complete design system + component styles
- `shared.js` — Complete shared logic (data, cart, UI builders, interactions)
- `all_tasks.patch` — Historical patch set of improvements
- `change log.md.txt` — High-level changelog