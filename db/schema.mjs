// Database schema. Idempotent: safe to run on every deploy.
// Money is stored as whole integers in the store currency (e.g. rupees).
export const SCHEMA = /* sql */ `
CREATE TABLE IF NOT EXISTS settings (
  key   text PRIMARY KEY,
  value jsonb NOT NULL
);

CREATE TABLE IF NOT EXISTS admins (
  id            serial PRIMARY KEY,
  email         text UNIQUE NOT NULL,
  name          text NOT NULL DEFAULT '',
  password_hash text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS categories (
  id          serial PRIMARY KEY,
  name        text NOT NULL,
  slug        text UNIQUE NOT NULL,
  description text NOT NULL DEFAULT '',
  image_url   text,
  sort_order  int NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- emblem shown on the shop's collection rail ('' = pick one from the name)
ALTER TABLE categories ADD COLUMN IF NOT EXISTS icon text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS products (
  id                  serial PRIMARY KEY,
  name                text NOT NULL,
  slug                text UNIQUE NOT NULL,
  description         text NOT NULL DEFAULT '',
  category_id         int REFERENCES categories(id) ON DELETE SET NULL,
  price               int NOT NULL CHECK (price >= 0),
  compare_at_price    int,
  status              text NOT NULL DEFAULT 'draft',   -- draft | active | archived
  badge               text,
  fabric              text NOT NULL DEFAULT '',
  care                text NOT NULL DEFAULT '',
  origin              text NOT NULL DEFAULT '',
  is_featured         boolean NOT NULL DEFAULT false,
  low_stock_threshold int NOT NULL DEFAULT 3,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  published_at        timestamptz,
  announced_at        timestamptz
);
CREATE INDEX IF NOT EXISTS products_status_idx ON products(status);
-- what kind of garment it is (Shirt, Trouser, Jacket...); used to group stock in the admin
ALTER TABLE products ADD COLUMN IF NOT EXISTS product_type text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS product_images (
  id         serial PRIMARY KEY,
  product_id int NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  url        text NOT NULL,
  thumb_url  text NOT NULL,
  sort_order int NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS product_images_product_idx ON product_images(product_id);

CREATE TABLE IF NOT EXISTS variants (
  id         serial PRIMARY KEY,
  product_id int NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  size       text NOT NULL,
  sku        text NOT NULL DEFAULT '',
  stock      int NOT NULL DEFAULT 0 CHECK (stock >= 0),
  sort_order int NOT NULL DEFAULT 0,
  UNIQUE (product_id, size)
);

CREATE TABLE IF NOT EXISTS stock_movements (
  id         serial PRIMARY KEY,
  variant_id int NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  delta      int NOT NULL,
  reason     text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sales (
  id           serial PRIMARY KEY,
  name         text NOT NULL,
  percent      int NOT NULL CHECK (percent BETWEEN 1 AND 95),
  scope        text NOT NULL DEFAULT 'all',            -- all | category | products
  category_id  int REFERENCES categories(id) ON DELETE CASCADE,
  product_ids  int[] NOT NULL DEFAULT '{}',
  starts_at    timestamptz NOT NULL DEFAULT now(),
  ends_at      timestamptz,
  is_active    boolean NOT NULL DEFAULT true,
  announced_at timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS coupons (
  id           serial PRIMARY KEY,
  code         text UNIQUE NOT NULL,
  type         text NOT NULL DEFAULT 'percent',        -- percent | fixed
  value        int NOT NULL CHECK (value > 0),
  min_subtotal int NOT NULL DEFAULT 0,
  max_uses     int,
  used_count   int NOT NULL DEFAULT 0,
  ends_at      timestamptz,
  is_active    boolean NOT NULL DEFAULT true,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Everyone the store can talk to: buyers and newsletter subscribers.
CREATE TABLE IF NOT EXISTS contacts (
  id              serial PRIMARY KEY,
  name            text NOT NULL DEFAULT '',
  email           text,
  phone           text,
  city            text NOT NULL DEFAULT '',
  email_opt_in    boolean NOT NULL DEFAULT false,
  whatsapp_opt_in boolean NOT NULL DEFAULT false,
  token           text UNIQUE NOT NULL,
  source          text NOT NULL DEFAULT '',
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS contacts_email_idx ON contacts (lower(email)) WHERE email IS NOT NULL;
CREATE INDEX IF NOT EXISTS contacts_phone_idx ON contacts (phone);

CREATE TABLE IF NOT EXISTS orders (
  id               serial PRIMARY KEY,
  number           text UNIQUE,
  token            text UNIQUE NOT NULL,
  contact_id       int REFERENCES contacts(id) ON DELETE SET NULL,
  status           text NOT NULL DEFAULT 'pending',    -- pending | confirmed | shipped | delivered | cancelled
  customer_name    text NOT NULL,
  email            text,
  phone            text NOT NULL,
  address          text NOT NULL,
  city             text NOT NULL,
  notes            text NOT NULL DEFAULT '',
  subtotal         int NOT NULL,
  discount         int NOT NULL DEFAULT 0,
  shipping         int NOT NULL DEFAULT 0,
  total            int NOT NULL,
  coupon_code      text,
  payment_method   text NOT NULL DEFAULT 'cod',
  courier          text NOT NULL DEFAULT '',
  tracking_number  text NOT NULL DEFAULT '',
  confirmed_by     text,
  cancel_reason    text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  confirmed_at     timestamptz,
  shipped_at       timestamptz,
  delivered_at     timestamptz,
  cancelled_at     timestamptz,
  reminder_sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS orders_status_idx ON orders(status, created_at);

CREATE TABLE IF NOT EXISTS order_items (
  id         serial PRIMARY KEY,
  order_id   int NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id int REFERENCES products(id) ON DELETE SET NULL,
  variant_id int REFERENCES variants(id) ON DELETE SET NULL,
  name       text NOT NULL,
  size       text NOT NULL,
  image_url  text,
  unit_price int NOT NULL,
  qty        int NOT NULL CHECK (qty > 0)
);
CREATE INDEX IF NOT EXISTS order_items_order_idx ON order_items(order_id);

CREATE TABLE IF NOT EXISTS campaigns (
  id         serial PRIMARY KEY,
  name       text NOT NULL,
  kind       text NOT NULL DEFAULT 'custom',           -- custom | new_arrival | sale
  subject    text NOT NULL DEFAULT '',
  body       text NOT NULL,
  channels   text[] NOT NULL DEFAULT '{}',
  recipients int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Outbox + log of every email / WhatsApp message.
CREATE TABLE IF NOT EXISTS messages (
  id          serial PRIMARY KEY,
  channel     text NOT NULL,                           -- email | whatsapp
  recipient   text NOT NULL,
  contact_id  int REFERENCES contacts(id) ON DELETE SET NULL,
  kind        text NOT NULL,
  subject     text NOT NULL DEFAULT '',
  body        text NOT NULL,
  meta        jsonb NOT NULL DEFAULT '{}',
  order_id    int REFERENCES orders(id) ON DELETE CASCADE,
  campaign_id int REFERENCES campaigns(id) ON DELETE CASCADE,
  status      text NOT NULL DEFAULT 'queued',          -- queued | sending | sent | failed | manual | skipped
  error       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  sent_at     timestamptz
);
CREATE INDEX IF NOT EXISTS messages_status_idx ON messages(status, id);
CREATE INDEX IF NOT EXISTS messages_order_idx ON messages(order_id);

CREATE TABLE IF NOT EXISTS stock_alerts (
  id          serial PRIMARY KEY,
  variant_id  int NOT NULL REFERENCES variants(id) ON DELETE CASCADE,
  email       text,
  phone       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  notified_at timestamptz
);

-- Hero / banner photos. "placement" is the page they belong to; "device" says which screens may show them.
CREATE TABLE IF NOT EXISTS banners (
  id          serial PRIMARY KEY,
  placement   text NOT NULL DEFAULT 'home',           -- home | shop | sale | lookbook | contact | track | policies
  image_url   text NOT NULL,
  width       int NOT NULL DEFAULT 0,
  height      int NOT NULL DEFAULT 0,
  auto_device text NOT NULL DEFAULT 'both',           -- what the upload detector decided
  device      text NOT NULL DEFAULT 'both',           -- desktop | mobile | both (owner can override)
  eyebrow     text NOT NULL DEFAULT '',
  title       text NOT NULL DEFAULT '',
  subtitle    text NOT NULL DEFAULT '',
  cta_text    text NOT NULL DEFAULT '',
  cta_link    text NOT NULL DEFAULT '',
  sort_order  int NOT NULL DEFAULT 0,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS banners_placement_idx ON banners(placement, sort_order);

CREATE TABLE IF NOT EXISTS contact_messages (
  id         serial PRIMARY KEY,
  name       text NOT NULL,
  email      text NOT NULL DEFAULT '',
  phone      text NOT NULL DEFAULT '',
  topic      text NOT NULL DEFAULT '',
  message    text NOT NULL,
  is_read    boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ===== staff, order management and stock model (added later; safe to re-run) =====

-- staff accounts: the owner can do everything, staff only what their permissions list
ALTER TABLE admins ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'owner';          -- owner | staff
ALTER TABLE admins ADD COLUMN IF NOT EXISTS permissions text[] NOT NULL DEFAULT '{}';
ALTER TABLE admins ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

-- orders from every channel, who is handling them, and the extra fulfilment stages
ALTER TABLE orders ADD COLUMN IF NOT EXISTS channel text NOT NULL DEFAULT 'website';     -- website | whatsapp | instagram | phone | store | other
ALTER TABLE orders ADD COLUMN IF NOT EXISTS assigned_to int REFERENCES admins(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS created_by int REFERENCES admins(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS exchange_of int REFERENCES orders(id) ON DELETE SET NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS stock_deducted boolean NOT NULL DEFAULT false; -- false = items only reserved so far
ALTER TABLE orders ADD COLUMN IF NOT EXISTS packed_at timestamptz;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS returned_at timestamptz;

-- who did what to an order, and when
CREATE TABLE IF NOT EXISTS order_events (
  id         serial PRIMARY KEY,
  order_id   int NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  admin_id   int REFERENCES admins(id) ON DELETE SET NULL,
  actor      text NOT NULL DEFAULT 'system',           -- staff name, 'customer' or 'system'
  type       text NOT NULL,                            -- created | status | assigned | note
  note       text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS order_events_order_idx ON order_events(order_id);
CREATE INDEX IF NOT EXISTS orders_phone_idx ON orders(phone);
-- orders placed before reservations existed had their stock taken at checkout
UPDATE orders SET stock_deducted = true WHERE NOT stock_deducted AND status <> 'cancelled'
  AND NOT EXISTS (SELECT 1 FROM order_events e WHERE e.order_id = orders.id);

-- stock: "stock" is what is physically on hand, "reserved" is promised to unconfirmed orders.
-- What customers can buy = stock - reserved. Colour is optional ('' = product has no colours).
ALTER TABLE variants ADD COLUMN IF NOT EXISTS reserved int NOT NULL DEFAULT 0;
ALTER TABLE variants ADD COLUMN IF NOT EXISTS color text NOT NULL DEFAULT '';
ALTER TABLE variants DROP CONSTRAINT IF EXISTS variants_product_id_size_key;
CREATE UNIQUE INDEX IF NOT EXISTS variants_product_size_color_idx ON variants(product_id, size, color);

-- structured stock log: why it moved, for which order, by whom
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS type text NOT NULL DEFAULT 'adjust';  -- sale | cancel | return | damaged | supplier | count | lost | found | adjust
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS qty int NOT NULL DEFAULT 0;            -- units involved (damaged items move 0 stock but count here)
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS order_id int REFERENCES orders(id) ON DELETE SET NULL;
ALTER TABLE stock_movements ADD COLUMN IF NOT EXISTS admin_id int REFERENCES admins(id) ON DELETE SET NULL;

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notes text NOT NULL DEFAULT '';
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS is_flagged boolean NOT NULL DEFAULT false;

-- ===== assistant, shared inbox and unfinished checkouts (added later; safe to re-run) =====

-- one thread per customer per channel. "bot" = the assistant answers, "human" = staff took over or were asked for
CREATE TABLE IF NOT EXISTS conversations (
  id              serial PRIMARY KEY,
  channel         text NOT NULL DEFAULT 'web',         -- web | whatsapp
  token           text NOT NULL UNIQUE,                -- secret key the website chat uses to read its own thread
  phone           text,
  name            text NOT NULL DEFAULT '',
  status          text NOT NULL DEFAULT 'bot',         -- bot | human | closed
  assigned_to     int REFERENCES admins(id) ON DELETE SET NULL,
  handoff_reason  text NOT NULL DEFAULT '',
  unread          int NOT NULL DEFAULT 0,              -- customer messages staff have not seen
  misses          int NOT NULL DEFAULT 0,              -- questions in a row the assistant could not answer
  context         jsonb NOT NULL DEFAULT '{}',         -- what the chat is about (last product, waiting for an order number...)
  last_text       text NOT NULL DEFAULT '',
  last_at         timestamptz NOT NULL DEFAULT now(),
  last_inbound_at timestamptz,                         -- WhatsApp only allows free replies for 24h after this
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS conversations_wa_idx ON conversations(phone) WHERE channel = 'whatsapp';
CREATE INDEX IF NOT EXISTS conversations_status_idx ON conversations(status, last_at);

CREATE TABLE IF NOT EXISTS chat_messages (
  id              serial PRIMARY KEY,
  conversation_id int NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  sender          text NOT NULL,                       -- customer | bot | staff | system
  admin_id        int REFERENCES admins(id) ON DELETE SET NULL,
  body            text NOT NULL,
  meta            jsonb NOT NULL DEFAULT '{}',         -- products shown, how it was answered, "miss" on unanswered questions
  wa_id           text UNIQUE,                         -- WhatsApp's message id, so a repeated webhook is stored once
  status          text NOT NULL DEFAULT 'sent',        -- sent | failed
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS chat_messages_conv_idx ON chat_messages(conversation_id, id);

-- the owner's own questions and answers; the assistant uses these before anything else
CREATE TABLE IF NOT EXISTS faqs (
  id         serial PRIMARY KEY,
  question   text NOT NULL,
  answer     text NOT NULL,
  keywords   text NOT NULL DEFAULT '',                 -- comma separated words or phrases that should trigger this answer
  is_active  boolean NOT NULL DEFAULT true,
  hits       int NOT NULL DEFAULT 0,
  sort_order int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- a checkout someone started but did not finish; only kept when they agreed to be contacted
CREATE TABLE IF NOT EXISTS checkouts (
  id          serial PRIMARY KEY,
  phone       text NOT NULL UNIQUE,
  name        text NOT NULL DEFAULT '',
  email       text,
  items       jsonb NOT NULL DEFAULT '[]',             -- [{ variantId, name, size, qty }]
  total       int NOT NULL DEFAULT 0,
  reminded_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ===== returns, exchanges, complaints and customer retention (added later; safe to re-run) =====

-- the price before a sale, when the item was bought discounted (used by the "sale items are final" rule)
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS was_price int;

-- one return, exchange or complaint. Items and stock only move when staff record what came back.
CREATE TABLE IF NOT EXISTS cases (
  id               serial PRIMARY KEY,
  number           text UNIQUE,                        -- RMA-1001
  order_id         int REFERENCES orders(id) ON DELETE CASCADE,
  contact_id       int REFERENCES contacts(id) ON DELETE SET NULL,
  type             text NOT NULL,                      -- exchange | return | complaint
  reason           text NOT NULL,                      -- see CASE_REASONS in lib/format.js
  details          text NOT NULL DEFAULT '',
  status           text NOT NULL DEFAULT 'requested',  -- requested | approved | in_transit | received | resolved | rejected
  source           text NOT NULL DEFAULT 'customer',   -- customer | staff | feedback
  eligible         boolean NOT NULL DEFAULT true,      -- false = staff accepted it outside the rules
  staff_note       text NOT NULL DEFAULT '',           -- shown to the customer with the decision
  resolution       text NOT NULL DEFAULT '',           -- exchange | refund | credit | none
  refund_amount    int NOT NULL DEFAULT 0,
  refund_status    text NOT NULL DEFAULT 'none',       -- none | pending | paid
  refund_method    text NOT NULL DEFAULT '',
  refund_ref       text NOT NULL DEFAULT '',
  refunded_at      timestamptz,
  return_courier   text NOT NULL DEFAULT '',
  return_tracking  text NOT NULL DEFAULT '',
  exchange_order_id int REFERENCES orders(id) ON DELETE SET NULL,
  credit_code      text NOT NULL DEFAULT '',
  assigned_to      int REFERENCES admins(id) ON DELETE SET NULL,
  created_by       int REFERENCES admins(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  decided_at       timestamptz,
  received_at      timestamptz,
  resolved_at      timestamptz
);
CREATE INDEX IF NOT EXISTS cases_status_idx ON cases(status, created_at);
CREATE INDEX IF NOT EXISTS cases_order_idx ON cases(order_id);

CREATE TABLE IF NOT EXISTS case_items (
  id              serial PRIMARY KEY,
  case_id         int NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  order_item_id   int REFERENCES order_items(id) ON DELETE SET NULL,
  product_id      int REFERENCES products(id) ON DELETE SET NULL,
  variant_id      int REFERENCES variants(id) ON DELETE SET NULL,
  name            text NOT NULL,
  size            text NOT NULL,
  unit_price      int NOT NULL DEFAULT 0,
  qty             int NOT NULL CHECK (qty > 0),
  want_variant_id int REFERENCES variants(id) ON DELETE SET NULL,  -- exchange: the size / colour wanted instead
  want_size       text NOT NULL DEFAULT '',
  condition       text NOT NULL DEFAULT ''             -- after inspection: restock | damaged
);
CREATE INDEX IF NOT EXISTS case_items_case_idx ON case_items(case_id);

CREATE TABLE IF NOT EXISTS case_events (
  id         serial PRIMARY KEY,
  case_id    int NOT NULL REFERENCES cases(id) ON DELETE CASCADE,
  admin_id   int REFERENCES admins(id) ON DELETE SET NULL,
  actor      text NOT NULL DEFAULT 'system',
  note       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS case_events_case_idx ON case_events(case_id);

-- loyalty points: the balance lives on the contact, every change is a ledger row
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS points int NOT NULL DEFAULT 0;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS reorder_reminded_at timestamptz;
CREATE TABLE IF NOT EXISTS loyalty_ledger (
  id         serial PRIMARY KEY,
  contact_id int NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  order_id   int REFERENCES orders(id) ON DELETE SET NULL,
  points     int NOT NULL,
  reason     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loyalty_contact_idx ON loyalty_ledger(contact_id, id);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS points_awarded int NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS feedback_sent_at timestamptz;
-- a code made for one person: a loyalty reward or store credit from a return
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS contact_id int REFERENCES contacts(id) ON DELETE CASCADE;
ALTER TABLE coupons ADD COLUMN IF NOT EXISTS note text NOT NULL DEFAULT '';

CREATE TABLE IF NOT EXISTS feedback (
  id         serial PRIMARY KEY,
  order_id   int NOT NULL UNIQUE REFERENCES orders(id) ON DELETE CASCADE,
  contact_id int REFERENCES contacts(id) ON DELETE SET NULL,
  rating     int NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment    text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- who a campaign was aimed at ('' = every subscriber)
ALTER TABLE campaigns ADD COLUMN IF NOT EXISTS audience text NOT NULL DEFAULT '';
`;
