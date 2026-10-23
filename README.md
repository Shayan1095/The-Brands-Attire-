# The Brands Attire

Online store + store-management panel for a clothing brand, in one Next.js app.

- **Shop** (`/`): home, product listing (collection switcher, filter drawer with price slider, quick view), product pages, cart, cash-on-delivery checkout, order confirmation page, order tracking, lookbook, contact.
- **Admin** (`/admin`): products, photo processing, inventory, categories, sales and discount codes, orders, customers, campaigns, automated email / WhatsApp messages, settings.

Stack: Next.js (App Router, Node.js) · Postgres · sharp · nodemailer. No paid services required.

## Run it locally

```bash
npm install
cp .env.example .env.local   # then set AUTH_SECRET and ADMIN_PASSWORD
npm run dev
```

Open http://localhost:3000 (shop) and http://localhost:3000/admin (panel; sign in with `ADMIN_EMAIL` / `ADMIN_PASSWORD` from `.env.local`).

No database install is needed: without `DATABASE_URL` the app uses an embedded Postgres stored in `./.data` and loads 12 demo products. Delete `./.data` to start fresh.

**If `.env.local` holds your production values** (live `DATABASE_URL`, SMTP, WhatsApp), `npm run dev` works on the live store and sends real messages. For testing use:

```bash
npm run dev:local
```

It uses the embedded database in `./.data` and sends no email or WhatsApp, so test orders never reach the live shop or real customers. Avoid `npm run build` locally for the same reason: it migrates the database in `DATABASE_URL` first. Use `LOCAL_DB=1 npx next build` to check that the code compiles.

**To judge speed, use the production preview**, not the dev server (development builds are several times slower):

```bash
npm run preview:local
```

It builds the site exactly as it runs live (into its own `.next-preview` folder, so it is safe while a dev server is running) and serves it on http://localhost:3005, still on the local database with no messages sent.

### Lite motion mode

On devices where the browser draws without the graphics card (older laptops, budget phones) or with very little memory, the site switches itself to a lighter mode: native scrolling instead of smooth-scroll inertia, no scroll-linked parallax or zooms, the "MEAN IT" section shown in its finished state, and no constantly running decorative animations. Reveals, the new-arrivals card deal and hover effects stay. Detection runs in the boot script in `src/app/(store)/layout.js`; add `?motion=lite` or `?motion=full` to any address to force a mode for that visit.

### Touch and transitions

- **Product cards**: tapping a photo opens the product with the photo growing into the product page (View Transitions API; a normal page change where unsupported, in lite mode and with reduced motion). On the shop grid, cards show every photo: move the mouse across, or swipe on phones. A double tap on a phone saves the piece.
- **Phones**: "Add to bag" on a card opens a size sheet that can be pulled down to close; the shop page has a filter / sort / layout bar at the bottom and its filter panel is also a pull-down sheet.
- **Shop page**: the collection bar slides away while scrolling down and returns on scrolling up; more products load by themselves near the end; on desktop every other column drifts slightly against the scroll.
- A back-to-top button with a reading-progress ring appears on long pages.
- **Intro**: on the first page of a visit the wordmark rises in and the screen lifts away (about 1.5 s, 0.9 s in lite mode, never more than about 2.4 s; skipped for reduced motion). Plain HTML + CSS in `components/store/Intro.jsx`, timed by the boot script in `(store)/layout.js`. Add `?intro=1` to any address to see it again.
- **Speed**: the menu links load their pages ahead while on screen and product cards load the product page as soon as the pointer rests on them (these pages are dynamic, so Next.js would otherwise fetch nothing until the tap). Catalogue reads are shared within one page render (React `cache` in `lib/catalog.js`).
- **Page loading**: a red line runs along the top when an inside link is tapped, and if the next page takes a moment a shimmering outline of it (shop, product, gallery or plain page) covers the old one (`NavLoading.jsx`). Route `loading.js` files are deliberately not used: they wrap pages in Suspense, which lets the scroll animations start before a page has hydrated.
- **Search** (header icon, or `/` / Ctrl+K anywhere): every word must match, best matches first (name > collection > colour > fabric > description), typos corrected from the shop's own words, closest pieces shown when nothing matches every word. Logic in `src/lib/search.js`; recent searches stay in the visitor's browser.
- **Bag**: a sheet (right on desktop, bottom on phones) with free-delivery progress, swipe-to-remove with undo, and "complete the look" suggestions (`bagPicksAction`).
- **Checkout**: fields are checked as they are typed (same rules as the server), city suggestions for Pakistan (store country code 92; other countries just type), three short steps on phones with the total pinned at the bottom, and an optional "remember my details" kept only in the customer's browser (`tba_details`). Only a discount code the server accepted is sent with the order.

## Deploy on Vercel (free)

1. Push this repository to GitHub and import it in Vercel.
2. **Database**: in the Vercel project, Storage → add **Neon** (Postgres, free tier). It sets `DATABASE_URL` for you.
3. **Images**: Storage → add **Blob**. It sets `BLOB_READ_WRITE_TOKEN`.
4. **Environment variables** (Project → Settings → Environment Variables):

   | Variable | What to put |
   |---|---|
   | `AUTH_SECRET` | long random string |
   | `ADMIN_EMAIL`, `ADMIN_PASSWORD` | your admin login (created on first deploy) |
   | `SITE_URL` | `https://your-domain` (used in message links) |
   | `CRON_SECRET` | any random string |
   | `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `EMAIL_FROM`, `OWNER_EMAIL` | email sending, see below |
   | `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID` | optional, see below |

5. Deploy. Every build runs `scripts/migrate.mjs`, which creates/updates the tables and the first admin account.

### Email (free)

Any SMTP account works. Simplest: a Gmail account with an [app password](https://myaccount.google.com/apppasswords): `SMTP_HOST=smtp.gmail.com`, `SMTP_PORT=465`, `SMTP_USER=you@gmail.com`, `SMTP_PASS=<app password>` (about 500 emails/day). Brevo's free SMTP (300/day) also works.

### WhatsApp

- **Free mode (default)**: every WhatsApp message is written automatically and listed in Admin → Messages. One click opens WhatsApp with the text ready to send.
- **Fully automatic**: create a WhatsApp Cloud API app at Meta, set `WHATSAPP_TOKEN` and `WHATSAPP_PHONE_ID`, get message templates approved, and enter each template name in Admin → Automations. Meta charges per business-initiated message; this part is not free.

### Scheduled jobs

Confirmation reminders, auto-cancelling unconfirmed orders and sending queued messages run:
- once a day through Vercel Cron (`vercel.json`; the free plan allows daily crons only),
- every time you open the admin dashboard,
- as often as you like if you point a free scheduler (cron-job.org, GitHub Actions) at `/api/cron` with the header `Authorization: Bearer <CRON_SECRET>`.

## How orders work

1. Customer checks out (cash on delivery). Stock is reserved immediately.
2. They get an email + WhatsApp message with a link to **confirm**. The policy is shown at checkout and again before confirming: a confirmed order cannot be cancelled. Before confirming they can cancel themselves.
3. Not confirmed? A reminder goes out after 12 h and the order is released after 48 h (both adjustable in Settings); stock returns automatically.
4. Confirmed orders appear under "ready to ship". Marking shipped / delivered notifies the customer.

## Order management

Orders from every channel live in one list. Website orders arrive by themselves; staff enter WhatsApp, Instagram, phone and walk-in orders from **Orders → New order**.

- **Statuses:** awaiting confirmation → confirmed → packed → dispatched → delivered, plus returned and cancelled.
- **Duplicates:** two open orders from the same phone that share an item and were placed within the duplicate window (Settings) are flagged on both.
- **Staff:** the owner adds staff under **Staff** and ticks the tasks each may do (see `PERMISSIONS` in `src/lib/format.js`). Pages and actions both check the permission; anything else is hidden and blocked.
- **Alerts:** the bell in the top bar lists what needs attention (assigned to you, duplicates, late to dispatch or deliver, low stock...). It is worked out on each page load.
- **History:** every order keeps an activity log, and each customer has a profile with all their orders.
- **Panel comforts:** dark mode (moon button; follows the device until chosen) and a slim icons-only sidebar (**Ctrl + \\**) are remembered per device. A red line runs along the top while a page opens, and an outline of the page shows if it takes a moment. On phones a tab bar sits at the bottom and lists turn into cards; a whole row opens its order or product.

## Protection against abuse

The shop's public actions are open endpoints, so anything a script could abuse is limited per visitor (src/lib/limits.js, counts kept in the `rate_limits` table, no extra service):

- **Personal codes** (store credit, loyalty rewards, the code on a thank-you card) only work for the phone number or email they were made for. One-time codes cannot be used twice, even by two orders at the same moment.
- **Code guessing:** 20 tries per visitor every 10 minutes.
- **Fake orders holding stock:** at most `max_qty` pieces of one size per order (Settings → Orders, default 5), `max_pending` unconfirmed orders per phone (default 3), and 6 orders per visitor an hour.
- **Chat:** 6 new chats per visitor an hour, 40 messages per 10 minutes. Team alerts for chats waiting for a person are capped at 15 an hour (the chats still wait in the Inbox).
- **Newsletter:** an email address is only added after its owner taps the confirmation link (double opt-in). Sign-ups, stock alerts, the contact form and order tracking are rate-limited too.
- **Admin login:** 8 tries per account every 15 minutes, kept in the database so it holds on Vercel.
- **Bot check on checkout (optional, free):** Cloudflare Turnstile. Set `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `TURNSTILE_SECRET_KEY` (Cloudflare dashboard → Turnstile → Add widget) and checkout asks "are you a person?", usually without the customer doing anything. Without the keys checkout works as before.
- **Unconfirmed orders** release their stock after `auto_cancel_hours` (Settings → Orders, default 12).
- **The assistant's scope:** it only discusses products, sizes, stock, prices, orders, delivery, payment and exchanges. Questions about passwords, keys, admin or staff details, other customers or the shop's private numbers get a fixed refusal before any answer is made, with or without an AI model.

## Changing or cancelling after confirming

For `change_hours` after confirming (Settings → Orders, default 12; 0 = off), and until staff mark the order packed, the customer's order page shows **Change my order** and **Cancel this order**:
- switch to another size of the same piece, change quantities (up to `max_qty`), remove a piece, or update the delivery address and note;
- stock moves at once (the old size goes back, the new one is taken), prices stay as ordered, delivery and any code's discount are worked out again;
- the customer gets the new summary and the owner an alert ("Tell me when a customer changes a confirmed order"); the change is logged on the order;
- staff see "the customer can still change this until …" on the order; marking it packed ends the window. After the window, changes and cancelling are refused by the server, not only hidden.
- **AI:** a fit tip written by the AI (from customers' own words) always waits for approval, even in Auto mode. If the AI is slow or down, customers get the built-in answers within 15 seconds (`AI_CHAT_BUDGET_MS`), and a failing model is skipped for 5 minutes.

## Parcel slips, thank-you cards and tracking numbers

- **Our own tracking number**: every confirmed order gets one (e.g. `TBA-7K3Q-M9X2`). It is on the slip as a barcode and a QR and in the dispatch message, and it works on `/track` (no phone needed) and `/track/<number>`. That page shows the parcel's progress only (no name, address or items), so a courier or a neighbour can check it safely. The courier and their own consignment number are chosen at dispatch; the customer can track with either.
- **Printing** (Orders): **Print N parcels** prints every confirmed order not printed yet; or tick orders in the list for **Slips & cards**, **Packing list** or **Courier file**. The print page lets you add or remove slips, cards and the packing list, and switch between **A4** (slip on the top half, card below, cut line) and **4×6 labels** for a thermal printer. After printing, the orders are recorded as printed and, if ticked, confirmed ones are marked packed.
- **The slip** has what a courier needs: name, address, city and phone in large print, the cash to collect (or PAID), pieces, the tracking barcode and QR, blank lines for the courier and CN, your caution line, the return address and an optional opening policy. A swap-at-the-door exchange carries a black "EXCHANGE: collect …" banner.
- **The thank-you card** is written for each customer: a first order, a returning customer ("your 4th order"), a VIP or an exchange each get their own words. It shows the points the order earns and how far that is from a reward, a care tip for the piece, a QR to get new arrivals and sales in one tap (`/updates/<link>`), a QR to rate the order, and a one-time code for their next order, made just for them.
- **Packing list**: what to pull from the shelves (each size totalled, with photos), then each parcel's contents with tick boxes.
- **Courier file**: a CSV in the columns courier portals accept for bulk booking (consignee, phone, address, city, pieces, weight, COD amount, contents, instructions).
- Everything is set in Settings → Parcel slips & thank-you cards. The barcode and QR codes are drawn on your own server, so nothing here costs anything.

## Returns, exchanges and complaints

Customers start them from their own order page once it has shipped ("Return or exchange" / "Report a problem"); staff can start one from any order (**Start a return or exchange**) for customers who phone or message. Each request gets a number (RMA-1001...) and moves through:

**Waiting for review → Approved, arrange pickup → Pickup booked → Collected, to settle → Resolved** (or **Declined**). A complaint can be settled straight away.

**The customer never posts anything.** Once a request is approved, staff book the pickup on the request page: **Our rider** or a **Courier company** (name, day, booking number), and the customer is messaged who is coming and when.

- **Swap at the door** (exchanges): one visit. Booking it creates the replacement order straight away, so the new size is held from stock. The rider delivers it and brings the old piece back. Marking that order **delivered** puts the old piece back in stock and closes the exchange by itself. If the swap order is cancelled or refused, the request goes back to "arrange pickup".
- **Collect first**: the rider only collects. Staff mark it **collected** with each piece's condition, then settle (replacement, refund or store credit).
- **Exchange delivery fee** (Settings → Returns & exchanges): added to the replacement order when the customer chose the swap (size, changed mind). Faulty or wrong items are always free; 0 = always free. **Who usually collects** pre-fills the pickup form.
- **Handled by**: give a request to a staff member with the Returns permission; they are emailed a link, and a swap order is assigned to them too.
- A piece that went back into stock but turns out damaged can still be written off from the request ("It came back damaged").

- **Rules** (Settings → Returns & exchanges): how many days after delivery, whether exchanges and refunds are allowed for any reason, and whether sale items can come back. Faulty, wrong or not-as-described items are always accepted inside the window. Staff may go outside the rules; the request is then marked "Outside the rules".
- **Stock**: the new size is taken when the replacement order is created; the old piece comes back when the swap is delivered or when staff mark it collected and say, per piece, whether it goes back on the shelf or is written off as damaged (both are logged in Inventory).
- **Settling**: an exchange creates a replacement order with the sizes asked for (free, apart from any exchange fee) (confirmed, ready to pack); a return is settled with a recorded refund (method and reference) or a one-time store-credit code for the customer; anything can also close with no further action.
- **Messages**: the customer is told at each step and the owner gets an alert for new requests (Automations → Returns). The bell and the morning briefing list requests to review, pickups to arrange, collected pieces to settle and complaints open too long.
- Staff need the **Returns** permission. The logic lives in `src/lib/cases.js`.

## Loyalty, customer groups and feedback

- **Points**: customers earn points on every delivered order (Settings → Loyalty, e.g. 1 point per Rs. 100). Enough points turn into a one-time reward code by themselves, and subscribed customers are told. Points are taken back when an order is returned or a return is refunded. Checkout shows the points an order will earn; the order page shows the balance, progress to the next reward and any personal codes (rewards, store credit).
- **Groups**: every customer is placed in a group from their orders: VIP, repeat, new, at risk, lost, or subscriber who never ordered. Customers lists them with points and value; a customer's page shows their points history, codes, ratings and returns, and staff can add or remove points or hand out a reward. Campaigns can be sent to one group (or to people who bought from a collection before).
- **Feedback**: a few days after delivery customers get a "How was your order?" link (`/feedback/<order link>`) to rate it from one to five stars. A low rating with a note opens a complaint in Returns, so a person follows it up.
- **Come-back reminders**: subscribed customers who have not ordered for a while get a short message with new pieces from the collections they buy from.
- All of it runs from the daily scheduled job (and whenever the dashboard is opened); each part can be switched off by setting its number to 0. The logic is in `src/lib/crm.js`.

## Agents

**Admin → Agents** holds small workers that watch the shop and suggest what to do. Nothing changes without a person: each suggestion is approved ("Checked, it's fine", "Marked as ordered") or dismissed, and everything they do is logged. They work from the shop's own data with plain rules, so they cost nothing to run. Each has an on/off switch and its own settings on the same page.

- **Daily briefing**: from the hour you choose (store time), a summary of yesterday's sales, what needs doing today and what the other agents found. It is shown on the Agents page and emailed to the owner (Automations → "Morning briefing").
- **Order guard**: the moment an order is placed it gets a cash-on-delivery risk score (0-100) from refused or cancelled orders on that number, flagged customers, duplicates, several orders in a day, a high-value first order and very short addresses, minus credit for orders delivered and paid before. From the "call first" score it becomes a suggestion; from the "advance" score it says to ask for an advance or decline. The score and reasons also show on the order and as a badge in the orders list.
- **Restock**: reuses the Inventory → Insights maths to warn, once a week per product, when sizes will run out within the warning window plus supplier lead time, and when customers are waiting for a sold-out size. Suggestions close themselves when they are no longer needed.

- **Returns triage**: every new return, exchange or complaint is looked at straight away against your rules, the stock of the sizes asked for and the customer's history. It suggests approve, decline or a closer look, with the message to the customer ready (editable). Approving it on the Agents page decides the request and tells the customer. In Auto mode (off by default) clear in-rule requests are approved by themselves; declines always wait for you. The suggestion also shows on the request page.
- **Marketing writer**: once a day it looks for a campaign moment (new pieces this week, a sale that started without an announcement, customers drifting away) and drafts the campaign for the right group. "Open in Campaigns" fills the campaign form in; nothing is sent until you press Send.
- **Catalogue checker**: once a day it finds products with no or one photo, a missing or thin description, no collection, no sizes, a "was" price that is not higher, or everything sold out with no sales, and drafts a description from the product's own details. "Save description" puts it on the product.
- **Inbox drafts**: "Draft a reply" in the Inbox fills the reply box with the assistant's answer (or a polite holding reply when it cannot answer). It is never sent by itself.

- **Merchandiser**: once a day it suggests a clear-out sale for pieces that have not sold in 30 days (choose the % and how many days, then "Start the sale"; the Marketing writer then offers to announce it), removes sold-out or hidden pieces from hand-picked Showcase sections, and points out a best seller the Showcase is not featuring.
- **Feedback analyst**: once a day it reads returns and ratings per product. Repeated size exchanges become a **fit tip** ("Runs small: most customers went one size up"), worked out from what customers wrote; "Publish fit tip" shows it above the sizes on the product page (it can also be edited in the product form). Repeated quality complaints and low average ratings are flagged for you.
- **Chat assistant and returns**: when a customer asks the website chat or WhatsApp to exchange or return something, the assistant finds their order (order number and phone, or their WhatsApp number) and sends the link to the returns section of their order page. It never approves anything itself.
- **Auto mode** (each off by default, in that agent's Settings): Returns triage may approve clear in-rule requests, Catalogue checker may save a description for a product that has none, Merchandiser may clean sold-out pieces out of the Showcase, Feedback analyst may publish fit tips. Sales, declines and anything sent to customers always wait for you.

**AI writing (optional, free):** add `GEMINI_API_KEY` (free at aistudio.google.com) or `GROQ_API_KEY` (free at console.groq.com) to the environment and the agents polish their messages, campaigns and descriptions with it. Decisions stay rule-based. Without a key everything works with built-in wording. A daily limit (Agents page, default 100 calls) keeps it inside the free tier.

They run from the daily scheduled job and whenever the dashboard is opened (each at most every few hours; the briefing once a day), and the guard also runs on every new order. "Run now" runs one straight away. Staff need the **Agents** permission. The code is in `src/lib/agents.js`.

## New order (WhatsApp, Instagram, calls, counter sales)

**Orders → New order** is built for speed: pick the channel, find pieces in a photo grid and tap a size to add it, and type the phone number (a returning customer is recognised, with their saved address one tap away, and possible duplicates are flagged). The ticket on the right stays in view with the lines, discount, delivery, what happens next (send a confirmation link, already confirmed, or paid and handed over at the counter) and one button that shows the total. On phones the total and the button stay pinned at the bottom.

## Stock model

Each size (and optional colour) has two numbers: `stock` (physically on hand) and `reserved` (promised to orders the customer has not confirmed). The shop sells `stock - reserved`.

| Event | Effect |
|---|---|
| Order placed, not yet confirmed | reserved + qty |
| Order confirmed (or entered by staff as confirmed / walk-in) | stock − qty, reservation released |
| Unconfirmed order cancelled or expired | reservation released |
| Confirmed order cancelled | stock + qty |
| Returned in good condition | stock + qty |
| Returned damaged | logged as a write-off, stock unchanged |

**Inventory** lists every product on one line with each size and how many can still be sold (amber = low, red = sold out); the boxes at the top filter to low, sold out or sizes customers are waiting for. Tap a product to open its panel: set the number on the shelf for each size with − / +, pick why it changed (a delivery, a recount, damaged, lost...; only reasons that fit the direction are offered) and save all sizes at once. Stock can never be set below what unconfirmed orders hold.

Every change is written to `stock_movements` with its type, order and staff member (the product panel shows its latest changes; the full log folds away under the list). **Inventory → Insights & restock** turns the last 30 days of confirmed sales into fast/slow movers, days of stock left and a reorder quantity per size (see `src/lib/insights.js` for the formula).

## Assistant, shared inbox and WhatsApp

- **One assistant, two channels.** `src/lib/assistant.js` answers customers on the website chat and on WhatsApp. It only states facts from the live catalogue (stock = on hand - reserved), the orders table, the store settings and the owner's saved answers. When none of those covers a question it says so and hands the chat to staff.
- **Free by default.** With no API key it uses built-in matching (product names, sizes, colours, budgets, order tracking, policies; English and common Roman Urdu). Add `GEMINI_API_KEY` or `GROQ_API_KEY` (free tiers) or `ANTHROPIC_API_KEY` and the same facts are given to the model as tools, so it can converse naturally but still cannot invent stock. If the model fails, the built-in answers take over.
- **Orders are private.** On WhatsApp an order is looked up by the sender's own number. On the website chat the customer must give the order number and the phone used at checkout.
- **Shared inbox** (Admin -> Inbox): every chat, who is handling it, take over / hand back / close / assign, saved answers one click away, the customer's orders beside the chat. Chats that need a person show in the alerts bell and are emailed to the owner.
- **Control** (Admin -> Assistant): on/off, name, greeting, words that call a person at once, how many unanswered questions before a handoff, saved answers, a test box, and the list of real questions it could not answer.
- **WhatsApp webhook**: `/api/whatsapp`. Set `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`; in Meta's dashboard enter the webhook URL and verify token and subscribe to "messages". Requests without a valid signature are refused.
- **24-hour rule.** WhatsApp allows free-form replies only within 24 hours of the customer's last message. Inside that window order updates are sent as plain text automatically; outside it they need an approved template (see Automations) or one-click sending.
- **Unfinished checkouts.** When a customer types a phone number at checkout and leaves the contact box ticked, the checkout is remembered. One reminder is prepared after the configured hours, listing only items still in stock. Reminders are created when the scheduled job runs (see Scheduled jobs).

## Photo standard

Any uploaded product photo is auto-rotated, cropped to 4:5 (smart crop or fit with background), resized to 1200×1500 plus a 600×750 thumbnail, and saved as WebP. See `src/lib/images.js`.

## Showcase (what the shop features)

**Admin → Showcase** decides what the storefront sections show. Each one is **Automatic** (the shop's own rule) or **Hand-picked**: your products, in your order (drag or use the arrows), each with the photo you choose.

- **Sections:** New arrivals (home stack and phone carousel), Sale picks, You may also like (product pages), Complete the look (bag), While you wait (order page), Shop the lookbook (gallery).
- **Safety net:** hand-picked products that sell out, are archived or (in Sale picks) are no longer reduced are skipped. With "Fill empty places automatically" on, the section is topped up from the automatic choices.
- **Photos:** replace the home banner, the "Mean it" photo and the lookbook photo with your own uploads; "Use original" puts the built-in one back. The home banner photo is the same one as Settings → Home page banner.
- **Gallery:** per collection, keep the automatic photos (up to 3 per piece) or choose and order them yourself; the first is the chapter's cover.

Everything is saved as one `showcase` setting (see `src/lib/showcase.js`), so no database change is needed. Staff need the Banners permission.

## Banners (hero photos)

Admin → Banners manages the home slideshow and the big photo on each inner page. Uploads are not cropped; their shape decides where they are used: wide photos on desktop, tall photos on phones, square-ish on both (the owner can override). Each home slide can carry its own headline, text and button. The moving text strip is in Admin → Settings.

## Motion

Lenis (smooth scroll), GSAP ScrollTrigger/SplitText (scroll-linked effects) and Motion (UI transitions). Pages opt in with `data-*` attributes documented at the top of `src/components/store/Motion.jsx`. Everything is skipped for visitors who prefer reduced motion.

## Project layout

```
db/                 schema + demo seed (shared by the app and the migrate script)
scripts/migrate.mjs applies the schema on deploy
src/lib/            database, auth, catalogue + pricing, orders, notifications, images
src/app/(store)/    the shop
src/app/admin/      the admin panel
src/app/api/cron/   scheduled housekeeping
src/components/     store + admin UI components
legacy/             the original static HTML site (reference only, safe to delete)
```
