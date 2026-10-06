# The Brands Attire

Online store + store-management panel for a clothing brand, in one Next.js app.

- **Shop** (`/`): home, product listing with filters, product pages, cart, cash-on-delivery checkout, order confirmation page, order tracking, lookbook, contact.
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

Every change is written to `stock_movements` with its type, order and staff member. **Inventory → Insights & restock** turns the last 30 days of confirmed sales into fast/slow movers, days of stock left and a reorder quantity per size (see `src/lib/insights.js` for the formula).

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
