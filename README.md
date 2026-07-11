# The Brands Attire

A modern, bold-editorial e-commerce front end for a clothing brand spanning three "worlds" — **Luxury**, **Everyday**, and **Tech**.

Built as a fast, dependency-free static site (HTML + CSS + vanilla JS) with a shared design system, working cart, search, and a single-product page.

## Pages

| Page | File | Description |
|---|---|---|
| Home | `index.html` | Hero, three worlds, product rail, editorial split, newsletter |
| Products | `products.html` | Full listing with category + sale filters |
| Product detail | `product.html` | Gallery, sizes, size guide, quantity, recommendations |
| Gallery | `gallery.html` | Masonry lookbook with world filters |
| Contact | `contact.html` | Contact form + business info |
| Login / Sign up | `login.html` | Toggle tabs, social buttons |

## Features

- **Shared design system** — color tokens, type scale, spacing in `shared.css`
- **Shared JS** — nav, footer, cart drawer, search overlay, product data in `shared.js`
- **Persistent cart** — saved in `localStorage`, survives page navigation
- **Live search** — filters across name, world, fabric, origin, description
- **Single product page** — image gallery, size selector, size guide modal, quantity, fabric/care accordions
- **Responsive** — mobile menu, fluid grids, touch-friendly
- **Dark mode toggle** — persists across pages
- **Accessibility** — keyboard nav, focus states, reduced-motion support

## Tech stack

- HTML5
- CSS3 (custom properties, grid, `clamp()` fluid type)
- Vanilla JavaScript (no frameworks, no build step)

## Run it

No build step. Just open `index.html` in a browser.

## Design tokens

| Token | Value | Use |
|---|---|---|
| Ink | `#0A0A0A` | Primary text, dark sections |
| Paper | `#F4F1EC` | Background |
| Bone | `#E8E2D8` | Cards, dividers |
| Signal | `#E10600` | Accent, CTAs, sale |
| Muted | `#6B6B6B` | Secondary text |

Type: **Anton** (display) · **Inter** (body) · **JetBrains Mono** (prices/specs).

## Project structure

```
.
├── index.html          # Home
├── products.html       # Product listing
├── product.html        # Single product (PDP)
├── gallery.html        # Lookbook
├── contact.html        # Contact
├── login.html          # Auth
├── shared.css          # Design system + all styles
├── shared.js           # Product data, cart, nav, search
└── style-tile.html     # Original style tile (v1 demo)
```

## Status

Front-end complete. Backend (database, auth, payments, admin) planned — see roadmap.

## License

© 2026 The Brands Attire. All rights reserved.
