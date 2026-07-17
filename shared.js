/* ============================================================
   THE BRANDS ATTIRE — Shared JS  (v3)
   Exposes: PRODUCTS, cart, cardHTML, addToCart, toast,
   openDrawer, closeDrawer, initPage, openSearch, closeSearch.
   ============================================================ */

/* ---------- PRODUCT DATA (enhanced) ---------- */
const PRODUCTS = [
  { id:1, name:"Merino Overcoat",      world:"luxury",   price:1250, was:0,    tag:"New",
    img:"https://images.unsplash.com/photo-1539533018447-63fcce2678e3?auto=format&fit=crop&w=900&q=80",
    images:[
      "https://images.unsplash.com/photo-1539533018447-63fcce2678e3?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1490481651871-ab68de25d43d?auto=format&fit=crop&w=900&q=80"
    ],
    desc:"A timeless overcoat cut from deadstock merino wool, finished by hand in a workshop that's been crafting outerwear since 1962. Relaxed shoulders, single-breasted, fully lined.",
    fabric:"100% deadstock merino wool",
    care:"Dry clean only. Store on a wide hanger.",
    origin:"Hand-finished in Portugal",
    sizes:["XS","S","M","L","XL"],
    soldout:["XS"] },

  { id:2, name:"Cashmere Crewneck",    world:"luxury",   price:640,  was:0,    tag:null,
    img:"https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?auto=format&fit=crop&w=900&q=80",
    images:[
      "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80"
    ],
    desc:"Pure grade-A cashmere knit to a heavyweight 12-gauge. A refined crewneck that drapes softly and holds its shape season after season.",
    fabric:"100% grade-A Mongolian cashmere",
    care:"Hand wash cold, dry flat. Or dry clean.",
    origin:"Knitted in Scotland",
    sizes:["XS","S","M","L","XL"],
    soldout:[] },

  { id:3, name:"Heavyweight Tee",      world:"everyday", price:90,   was:0,    tag:null,
    img:"https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80",
    images:[
      "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1506629905877-52cf447c2415?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&w=900&q=80"
    ],
    desc:"Our everyday essential, built from 280gsm organic cotton with a boxy, lived-in fit from day one. Pre-shrunk and garment dyed.",
    fabric:"100% organic cotton, 280gsm",
    care:"Machine wash cold, tumble dry low.",
    origin:"Cut and sewn in Portugal",
    sizes:["XS","S","M","L","XL","XXL"],
    soldout:["XXL"] },

  { id:4, name:"Relaxed Selvedge Jean",world:"everyday", price:220,  was:280,  tag:"Sale",
    img:"https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&w=900&q=80",
    images:[
      "https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=900&q=80"
    ],
    desc:"Japanese 14oz selvedge denim, sanforized for a clean break-in. Mid-rise with a relaxed taper through the leg. Raw, rigid, ready to age with you.",
    fabric:"100% Japanese selvedge cotton, 14oz",
    care:"Wash inside-out, cold. Hang dry.",
    origin:"Woven in Okayama, Japan",
    sizes:["28","30","32","34","36","38"],
    soldout:["28","38"] },

  { id:5, name:"Tech Shell Jacket",    world:"tech",     price:480,  was:0,    tag:"New",
    img:"https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=900&q=80",
    images:[
      "https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1506629905877-52cf447c2415?auto=format&fit=crop&w=900&q=80"
    ],
    desc:"A 3-layer waterproof shell engineered for movement. Taped seams, laser-cut ventilation, and an articulated fit that doesn't flap in the wind. Packable into its own chest pocket.",
    fabric:"3-layer ripstop nylon, 20K/20K membrane",
    care:"Wipe clean. Do not iron. Re-proof seasonally.",
    origin:"Engineered in Vietnam",
    sizes:["S","M","L","XL"],
    soldout:[] },

  { id:6, name:"Compression Legging",  world:"tech",     price:160,  was:0,    tag:null,
    img:"https://images.unsplash.com/photo-1506629905877-52cf447c2415?auto=format&fit=crop&w=900&q=80",
    images:[
      "https://images.unsplash.com/photo-1506629905877-52cf447c2415?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&w=900&q=80"
    ],
    desc:"Graduated compression from ankle to waist, mapped to support the major muscle groups. Moisture-wicking, four-way stretch, flatlock seams that disappear under layers.",
    fabric:"72% nylon, 28% elastane, recycled yarn",
    care:"Machine wash cold. Do not fabric softener.",
    origin:"Made in Sri Lanka",
    sizes:["XS","S","M","L","XL"],
    soldout:["XS"] },

  { id:7, name:"Wool Tailored Trouser",world:"luxury",   price:560,  was:0,    tag:null,
    img:"https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&w=900&q=80",
    images:[
      "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=900&q=80"
    ],
    desc:"A fluid, single-pleat trouser in Italian virgin wool. Tailored through the thigh, tapered to a clean break. Half-lined for structure without bulk.",
    fabric:"100% Italian virgin wool, 240gsm",
    care:"Dry clean recommended.",
    origin:"Tailored in Italy",
    sizes:["28","30","32","34","36","38"],
    soldout:["30"] },

  { id:8, name:"Loopback Hoodie",      world:"everyday", price:140,  was:0,    tag:null,
    img:"https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=900&q=80",
    images:[
      "https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1556905055-8f358a7a47b2?auto=format&fit=crop&w=900&q=80"
    ],
    desc:"Classic loopback jersey, brushed on the inside for warmth. A relaxed, true-to-size fit with a double-layer hood and flat drawcords.",
    fabric:"100% loopback cotton, 380gsm",
    care:"Machine wash cold, inside-out.",
    origin:"Cut and sewn in Portugal",
    sizes:["S","M","L","XL","XXL"],
    soldout:[] },

  { id:9, name:"Puffer Vest",          world:"tech",     price:320,  was:0,    tag:null,
    img:"https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&w=900&q=80",
    images:[
      "https://images.unsplash.com/photo-1591047139829-d91aecb6caea?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1506629905877-52cf447c2415?auto=format&fit=crop&w=900&q=80"
    ],
    desc:"850-fill responsibly-sourced down in a ripstop shell. Warms the core without restricting the arms. Two-way zip, snap pockets, packs into a stuff sack.",
    fabric:"Ripstop nylon shell, 850-fill down",
    care:"Machine wash cold, tennis ball in dryer to reloft.",
    origin:"Made in Vietnam",
    sizes:["S","M","L","XL"],
    soldout:[] },

  { id:10,name:"Silk Blend Shirt",     world:"luxury",   price:380,  was:450,  tag:"Sale",
    img:"https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=900&q=80",
    images:[
      "https://images.unsplash.com/photo-1602810318383-e386cc2a3ccf?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1620799140408-edc6dcb6d633?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1483985988355-763728e1935b?auto=format&fit=crop&w=900&q=80"
    ],
    desc:"A fluid shirt woven from a silk-cotton blend that catches the light. Camp collar, relaxed body, mother-of-pearl buttons. Equally at home tucked or loose.",
    fabric:"55% silk, 45% cotton",
    care:"Dry clean, or hand wash cold.",
    origin:"Woven in Como, Italy",
    sizes:["S","M","L","XL"],
    soldout:["S"] },

  { id:11,name:"Cotton Chino",         world:"everyday", price:120,  was:0,    tag:null,
    img:"https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&w=900&q=80",
    images:[
      "https://images.unsplash.com/photo-1473966968600-fa801b869a1a?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1542272604-787c3835535d?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1556821840-3a63f95609a7?auto=format&fit=crop&w=900&q=80"
    ],
    desc:"A versatile chino in garment-dyed stretch twill. Slim through the thigh, clean taper, sits comfortably at the natural waist. Breaks in beautifully.",
    fabric:"98% cotton, 2% elastane twill",
    care:"Machine wash cold, hang dry.",
    origin:"Cut and sewn in Portugal",
    sizes:["28","30","32","34","36","38"],
    soldout:["36"] },

  { id:12,name:"Performance Shorts",   world:"tech",     price:95,   was:0,    tag:null,
    img:"https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80",
    images:[
      "https://images.unsplash.com/photo-1521572163474-6864f9cf17ab?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1506629905877-52cf447c2415?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1551028719-00167b16eac5?auto=format&fit=crop&w=900&q=80",
      "https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=900&q=80"
    ],
    desc:"7-inch inseam run shorts with a built-in liner, drop-in pockets, and a hidden zip pocket for your phone. Light, fast, doesn't ride up.",
    fabric:"Recycled polyester, 4-way stretch",
    care:"Machine wash cold, hang dry.",
    origin:"Made in Sri Lanka",
    sizes:["S","M","L","XL"],
    soldout:[] },
];

/* ---------- NORMALIZE: 4 angle variations of the SAME product ---------- */
/* Each product gets 4 crops of its own base photo so thumbnails always
   show the same garment, not random different items. */
PRODUCTS.forEach(p => {
  const base = p.img.split("?")[0]; // strip query for clean rebuilding
  p.images = [
    `${base}?auto=format&fit=crop&w=900&q=80`,               // front
    `${base}?auto=format&fit=crop&w=900&q=80&crop=entropy`,   // detail/texture
    `${base}?auto=format&fit=crop&w=1200&q=80&crop=entropy`,  // wider editorial
    `${base}?auto=format&fit=crop&w=600&q=80`,                // tight crop
  ];
});

/* ---------- CART (persists in localStorage, supports size) ---------- */
const CART_KEY = "tba_cart";
let cart = JSON.parse(localStorage.getItem(CART_KEY) || "[]");

function saveCart(){ localStorage.setItem(CART_KEY, JSON.stringify(cart)); }
const money = n => "$" + n.toLocaleString();

/* ---------- NAV + FOOTER + DRAWER + SEARCH BUILDERS ---------- */
function buildNav(active){
  const themeToggleHTML = `
    <button class="icon-btn theme-toggle-btn" id="themeToggle" aria-label="Toggle theme">
      <svg class="theme-icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
      <svg class="theme-icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
    </button>`;
  const mobileThemeToggleHTML = `
    <button class="theme-toggle-btn" id="themeToggleMobile" aria-label="Toggle theme" style="width:100%;justify-content:center;margin-top:var(--s-3);padding:12px var(--s-3);border-radius:var(--radius);border:1px solid var(--line);display:none;">
      <svg class="theme-icon-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
      <svg class="theme-icon-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>
    </button>`;
  return `
  <nav class="nav">
    <div class="wrap nav__inner">
      <a class="brand" href="index.html">THE BRANDS<b>/</b>ATTIRE</a>
      <button class="icon-btn nav__burger" id="burger" aria-label="Menu">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M3 12h18M3 18h18"/></svg>
      </button>
      <div class="nav__links" id="navLinks">
        <a href="index.html" class="${active==='home'?'active':''}">Home</a>
        <a href="products.html" class="${active==='products'?'active':''}">Products</a>
        <a href="gallery.html" class="${active==='gallery'?'active':''}">Gallery</a>
        <a href="contact.html" class="${active==='contact'?'active':''}">Contact</a>
        <a href="login.html" class="${active==='login'?'active':''}">Account</a>
        ${mobileThemeToggleHTML}
      </div>
      <div class="nav__right">
        <button class="icon-btn" id="searchBtn" aria-label="Search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
        </button>
        <button class="icon-btn" id="bagBtn" aria-label="Open bag">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
          <span class="bag-count" id="bagCount">0</span>
        </button>
        ${themeToggleHTML}
      </div>
    </div>
  </nav>`;
}

function buildFooter(){
  return `
  <footer>
    <div class="wrap footer-grid">
      <div>
        <div class="big">THE BRANDS<span style="color:var(--signal)">/</span>ATTIRE</div>
        <p style="color:rgba(244,241,236,.6); max-width:34ch; margin-top:12px;">One point of view, three worlds. Luxury, everyday and tech — under a single bold frame.</p>
      </div>
      <div><h4>Shop</h4><ul><li><a href="products.html">All Products</a></li><li><a href="products.html?filter=luxury">Luxury</a></li><li><a href="products.html?filter=everyday">Everyday</a></li><li><a href="products.html?filter=tech">Tech</a></li><li><a href="products.html?filter=sale">Sale</a></li></ul></div>
      <div><h4>Help</h4><ul><li><a href="contact.html">Shipping</a></li><li><a href="contact.html">Returns</a></li><li><a href="contact.html">Size Guide</a></li><li><a href="contact.html">Track Order</a></li></ul></div>
      <div><h4>Co.</h4><ul><li><a href="gallery.html">Lookbook</a></li><li><a href="contact.html">Stockists</a></li><li><a href="contact.html">Careers</a></li><li><a href="#">Instagram</a></li><li><a href="#">Facebook</a></li></ul></div>
    </div>
    <div class="copyright"><div class="wrap"><span>© 2026 THE BRANDS ATTIRE</span><span>STYLE TILE · v3.0</span></div></div>
  </footer>`;
}

function buildDrawer(){
  return `
  <div class="scrim" id="scrim"></div>
  <aside class="drawer" id="drawer" aria-label="Shopping bag">
    <div class="drawer__head">
      <h3>Your bag</h3>
      <button class="icon-btn" id="closeDrawer" aria-label="Close">✕</button>
    </div>
    <div class="drawer__items" id="drawerItems"></div>
    <div class="drawer__foot">
      <div class="drawer__total"><span class="eyebrow">Subtotal</span><b class="mono" id="subtotal">$0</b></div>
      <button class="btn btn--block" onclick="toast('Checkout is a demo')">Checkout <span class="arrow">→</span></button>
      <span class="mono" style="font-size:var(--t-xs); color:var(--muted); text-align:center;">Shipping & taxes at checkout</span>
    </div>
  </aside>
  <a class="whatsapp-float" id="whatsappFloat" href="https://wa.me/03467227218" target="_blank" rel="noopener noreferrer" aria-label="Contact us on WhatsApp">
    <button class="whatsapp-btn">
      <span class="whatsapp-svg-container">
        <svg viewBox="0 0 448 512" fill="white" height="1.6em" xmlns="http://www.w3.org/2000/svg">
          <path d="M380.9 97.1C339 55.1 283.2 32 223.9 32c-122.4 0-222 99.6-222 222 0 39.1 10.2 77.3 29.6 111L0 480l117.7-30.9c32.4 17.7 68.9 27 106.1 27h.1c122.3 0 224.1-99.6 224.1-222 0-59.3-25.2-115-67.1-157zm-157 341.6c-33.2 0-65.7-8.9-94-25.7l-6.7-4-69.8 18.3L72 359.2l-4.4-7c-18.5-29.4-28.2-63.3-28.2-98.2 0-101.7 82.8-184.5 184.6-184.5 49.3 0 95.6 19.2 130.4 54.1 34.8 34.9 56.2 81.2 56.1 130.5 0 101.8-84.9 184.6-186.6 184.6zm101.2-138.2c-5.5-2.8-32.8-16.2-37.9-18-5.1-1.9-8.8-2.8-12.5 2.8-3.7 5.6-14.3 18-17.6 21.8-3.2 3.7-6.5 4.2-12 1.4-32.6-16.3-54-29.1-75.5-66-5.7-9.8 5.7-9.1 16.3-30.3 1.8-3.7 .9-6.9-.5-9.7-1.4-2.8-12.5-30.1-17.1-41.2-4.5-10.8-9.1-9.3-12.5-9.5-3.2-.2-6.9-.2-10.6-.2-3.7 0-9.7 1.4-14.8 6.9-5.1 5.6-19.4 19-19.4 46.3 0 27.3 19.9 53.7 22.6 57.4 2.8 3.7 39.1 59.7 94.8 83.8 35.2 15.2 49 16.5 66.6 13.9 10.7-1.6 32.8-13.4 37.4-26.4 4.6-13 4.6-24.1 3.2-26.4-1.3-2.5-5-3.9-10.5-6.6z"></path>
        </svg>
      </span>
      <span class="whatsapp-bg"></span>
    </button>
  </a>
  <div class="toast" id="toast"></div>`;
}

function buildSearch(){
  return `
  <div class="search-overlay" id="searchOverlay">
    <button class="search-close" id="searchClose" aria-label="Close search">✕</button>
    <div class="search-bar">
      <input type="text" id="searchInput" class="search-input" placeholder="Search products, worlds, materials…" autocomplete="off" />
    </div>
    <div class="search-hint">Try: merino, tech, overcoat, sale, japan</div>
    <div class="search-chips" id="searchChips">
      <span class="search-chip" data-q="luxury">Luxury</span>
      <span class="search-chip" data-q="everyday">Everyday</span>
      <span class="search-chip" data-q="tech">Tech</span>
      <span class="search-chip" data-q="wool">Wool</span>
      <span class="search-chip" data-q="cotton">Cotton</span>
      <span class="search-chip" data-q="sale">Sale</span>
    </div>
    <div class="search-results" id="searchResults"></div>
  </div>`;
}

/* ---------- RENDER CART ---------- */
function renderCart(){
  const el = document.getElementById("drawerItems");
  if(!el) return;
  if(!cart.length){
    el.innerHTML = `<div class="drawer__empty">Your bag is empty</div>`;
  } else {
    el.innerHTML = cart.map(ci => {
      const p = PRODUCTS.find(x=>x.id===ci.id);
      if(!p) return "";
      return `
        <div class="item">
          <img src="${p.img}" alt="${p.name}"/>
          <div>
            <h4>${p.name}</h4>
            <span class="mono">${p.world} · ${ci.size||"—"} · qty ${ci.qty}</span>
          </div>
          <div style="text-align:right;">
            <div class="price">${money(p.price*ci.qty)}</div>
            <button class="rm" data-rm="${ci.id}-${ci.size||''}">remove</button>
          </div>
        </div>`;
    }).join("");
  }
  const subtotal = cart.reduce((s,ci)=> s + (PRODUCTS.find(x=>x.id===ci.id)?.price||0)*ci.qty, 0);
  const sub = document.getElementById("subtotal"); if(sub) sub.textContent = money(subtotal);
  const count = document.getElementById("bagCount"); if(count) count.textContent = cart.reduce((s,ci)=>s+ci.qty,0);
}

/* ---------- DRAWER OPEN/CLOSE ---------- */
function openDrawer(){
  document.getElementById("drawer")?.classList.add("open");
  document.getElementById("scrim")?.classList.add("open");
  document.body.style.overflow = "hidden";
}
function closeDrawer(){
  document.getElementById("drawer")?.classList.remove("open");
  document.getElementById("scrim")?.classList.remove("open");
  document.body.style.overflow = "";
}

/* ---------- SEARCH OPEN/CLOSE ---------- */
function openSearch(){
  const ov = document.getElementById("searchOverlay");
  if(!ov) return;
  ov.classList.add("open");
  document.body.style.overflow = "hidden";
  setTimeout(()=> document.getElementById("searchInput")?.focus(), 50);
  renderSearch("");
}
function closeSearch(){
  document.getElementById("searchOverlay")?.classList.remove("open");
  document.body.style.overflow = "";
}

/* ---------- UTIL: HTML ESCAPE ---------- */
function escapeHtml(str){
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

/* ---------- SEARCH LOGIC ---------- */
function renderSearch(q){
  const wrap = document.getElementById("searchResults");
  if(!wrap) return;
  const query = (q||"").trim().toLowerCase();
  let results;

  if(!query){
    results = PRODUCTS;
  } else {
    results = PRODUCTS.filter(p => {
      const hay = `${p.name} ${p.world} ${p.fabric} ${p.origin} ${p.desc} ${p.tag||""}`.toLowerCase();
      const isSale = query==="sale" && p.was>0;
      return hay.includes(query) || isSale;
    });
  }

  if(!results.length){
    wrap.innerHTML = `<div class="search-empty">No results for "${escapeHtml(q)}"</div>`;
    return;
  }
  wrap.innerHTML = results.map(p => `
    <a class="search-result" href="product.html?id=${p.id}">
      <img src="${p.img}" alt="${p.name}"/>
      <div class="meta">
        <h4>${p.name}</h4>
        <span class="mono">${p.world}</span>
        <div class="price">${money(p.price)}${p.was?` <span style="color:var(--muted); text-decoration:line-through; font-size:.85em">${money(p.was)}</span>`:""}</div>
      </div>
    </a>`).join("");
}

/* ---------- ADD TO CART (supports size) ---------- */
function addToCart(id, size){
  size = size || null;
  const ex = cart.find(c=>c.id===id && c.size===size);
  ex ? ex.qty++ : cart.push({id, size, qty:1});
  saveCart(); renderCart(); openDrawer();
  const p = PRODUCTS.find(x=>x.id===id);
  toast(`Added: ${p?.name || "item"}${size?` · ${size}`:""}`);
}

/* ---------- TOAST ---------- */
let toastTimer;
function toast(msg){
  const t = document.getElementById("toast"); if(!t) return;
  t.textContent = msg; t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>t.classList.remove("show"), 2200);
}

/* ---------- CARD TEMPLATE (reference-style, my theme) ---------- */
function cardHTML(p){
  return `
  <article class="card" data-world="${p.world}">
    <div class="card__media">
      <a href="product.html?id=${p.id}" aria-label="${p.name}">
        <img src="${p.img}" alt="${p.name}" loading="lazy"/>
      </a>
      ${p.tag ? `<span class="card__tag ${p.tag==='Sale'?'card__tag--sale':''}">${p.tag}</span>` : ""}
      <button class="card__wish" data-wish="${p.id}" aria-label="Wishlist">♡</button>
      <button class="card__add" data-add="${p.id}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><path d="M3 6h18"/><path d="M16 10a4 4 0 0 1-8 0"/></svg>
        Add to bag
      </button>
    </div>
    <div class="card__body">
      <div class="card__head">
        <div class="card__accent"></div>
        <span class="card__world">${p.world}</span>
        <span class="card__name">${p.name}</span>
      </div>
      <div class="card__foot">
        <div class="card__price">
          <span class="now ${p.was?'sale':''}">${money(p.price)}</span>
          ${p.was?`<span class="was">${money(p.was)}</span>`:""}
        </div>
        <a class="card__details" href="product.html?id=${p.id}">
          Details
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M5 12h14M13 6l6 6-6 6"/></svg>
        </a>
      </div>
    </div>
  </article>`;
}

/* ---------- GLOBAL WIRING (called on every page) ---------- */
function initPage(active){
  // inject nav + footer + drawer + search
  document.getElementById("site-nav").innerHTML    = buildNav(active);
  document.getElementById("site-footer").innerHTML = buildFooter();
  document.getElementById("site-drawer").innerHTML = buildDrawer();
  const searchHost = document.getElementById("site-search");
  if(searchHost) searchHost.innerHTML = buildSearch();

  renderCart();

  // bag open
  document.getElementById("bagBtn").addEventListener("click", openDrawer);
  document.getElementById("closeDrawer").addEventListener("click", closeDrawer);
  document.getElementById("scrim").addEventListener("click", closeDrawer);
  document.addEventListener("keyup", e=>{
    if(e.key==="Escape"){ closeDrawer(); closeSearch(); }
  });

  // search
  document.getElementById("searchBtn")?.addEventListener("click", openSearch);
  document.getElementById("searchClose")?.addEventListener("click", closeSearch);
  document.getElementById("searchOverlay")?.addEventListener("click", e=>{
    if(e.target.id === "searchOverlay") closeSearch();
  });
  document.getElementById("searchInput")?.addEventListener("input", e=> renderSearch(e.target.value));
  document.getElementById("searchChips")?.addEventListener("click", e=>{
    const c = e.target.closest("[data-q]");
    if(c){
      const inp = document.getElementById("searchInput");
      inp.value = c.dataset.q;
      renderSearch(c.dataset.q);
      inp.focus();
    }
  });

  // burger
  document.getElementById("burger").addEventListener("click", ()=>{
    document.getElementById("navLinks").classList.toggle("open");
  });

  // remove from cart (delegated, key = id-size)
  document.getElementById("drawerItems").addEventListener("click", e=>{
    const rm = e.target.closest("[data-rm]");
    if(rm){
      const [id, size] = rm.dataset.rm.split("-");
      cart = cart.filter(c => !(c.id===+id && (c.size||"")===(size||"")));
      saveCart(); renderCart();
    }
  });

  // theme toggle
  const root = document.documentElement;
  const themeToggles = document.querySelectorAll(".theme-toggle-btn");
  const themeSun = document.querySelectorAll(".theme-icon-sun");
  const themeMoon = document.querySelectorAll(".theme-icon-moon");
  if(localStorage.getItem("tba_theme")==="tech") root.dataset.theme = "tech";
  themeToggles.forEach((toggle, index) => {
    toggle.addEventListener("click", ()=>{
      const next = root.dataset.theme === "tech" ? "paper" : "tech";
      root.dataset.theme = next;
      localStorage.setItem("tba_theme", next);
      const isTech = next === "tech";
      themeSun.forEach(s => s.style.opacity = isTech ? "0" : "1");
      themeMoon.forEach(m => m.style.opacity = isTech ? "1" : "0");
      themeSun.forEach(s => s.style.transform = isTech ? "rotate(90deg) scale(0.8)" : "rotate(0) scale(1)");
      themeMoon.forEach(m => m.style.transform = isTech ? "rotate(0) scale(1)" : "rotate(-90deg) scale(0.8)");
    });
 } );

  // scroll reveal
  const io = new IntersectionObserver((entries)=>
    entries.forEach(en=>{
      if(en.isIntersecting){
        const siblings = Array.from(en.target.parentElement.querySelectorAll(".reveal"));
        const idx = siblings.indexOf(en.target);
        if (idx >= 0) en.target.style.transitionDelay = `${idx * 80}ms`;
        en.target.classList.add("in");
        io.unobserve(en.target);
      }
    })
  , { threshold:.12 });
  document.querySelectorAll(".reveal").forEach(el=>io.observe(el));
}

/* ---------- GLOBAL CLICK DELEGATION (wishlist + add-to-cart on cards) ---------- */
document.addEventListener("click", e=>{
  // add to bag (from card overlay button)
  const add = e.target.closest("[data-add]");
  if(add){
    e.preventDefault();
    addToCart(+add.dataset.add);
    return;
  }
  // wishlist toggle
  const wish = e.target.closest("[data-wish]");
  if(wish){
    e.preventDefault();
    wish.classList.toggle("active");
    wish.textContent = wish.classList.contains("active") ? "♥" : "♡";
  }
});

/* ---------- VIEW TRANSITIONS ---------- */
if (document.startViewTransition) {
  document.addEventListener("click", e => {
    const link = e.target.closest("a[href]");
    if (!link) return;
    const href = link.getAttribute("href");
    if (!href) return;
    if (href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) return;
    try {
      const url = new URL(href, location.origin);
      if (url.origin !== location.origin) {
        link.setAttribute("rel", "noopener noreferrer");
        return;
      }
    } catch { return; }
    e.preventDefault();
    document.startViewTransition(() => { location.href = href; });
  });
}