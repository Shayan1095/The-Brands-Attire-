/*
  The storefront sections the owner can curate in Admin -> Showcase, and the fixed photos they can replace.
  Shared by the admin editor (browser) and lib/showcase.js (server), so it holds no secrets and no database code.
  `max` is how many products the section shows; `auto` says what it shows when left on Automatic.
*/
export const SHOWCASE_SECTIONS = {
  arrivals: {
    page: "home",
    label: "New arrivals",
    where: "Home page: the card stack on computers and the moving carousel on phones",
    auto: "The 10 newest products",
    max: 10,
  },
  sale: {
    page: "home",
    label: "Sale picks",
    where: "Home page: the cards beside the sale offer",
    auto: "The first 4 products on sale",
    note: "Only products with a sale price appear here; others are skipped until they are reduced.",
    max: 4,
  },
  related: {
    page: "product",
    label: "You may also like",
    where: "Every product page, under the product",
    auto: "Pieces from the same collection, topped up with featured ones",
    note: "The product being viewed is never shown in its own row.",
    max: 10,
  },
  bag: {
    page: "bag",
    label: "Complete the look",
    where: "The bag (cart) drawer, under the items",
    auto: "In-stock pieces from the same collections as the bag",
    note: "The bag shows 3 at a time and skips anything already in it, so pick a few extra.",
    max: 8,
  },
  waiting: {
    page: "order",
    label: "While you wait",
    where: "The customer's order page, after they order",
    auto: "Featured pieces the customer did not order",
    max: 10,
  },
  lookbook: {
    page: "lookbook",
    label: "Shop the lookbook",
    where: "Gallery page: the row of products under the photos",
    auto: "The first 12 products that have photos",
    max: 12,
  },
};

export const SHOWCASE_PHOTOS = {
  hero: { label: "Home banner", where: "Top of the home page, when no slideshow photos are uploaded in Banners", shape: "Wide photo, at least 2000px across" },
  ethos: { label: "“Mean it” photo", where: "Home page: the photo seen through the giant MEAN IT letters", shape: "Wide or square photo, at least 1800px across" },
  look: { label: "Lookbook photo", where: "Home page: the photo that grows to full width before the sign-up", shape: "Wide photo, at least 2000px across" },
};

/*
  The shop's pages, top to bottom, for the little page map in the editor. A block's key matches the
  data-showcase mark on the page (empty = a part of the page that Showcase does not change).
*/
export const SHOWCASE_PAGES = {
  home: {
    label: "Home page",
    blocks: [["photo-hero", "Banner"], ["", "Delivery & payment strip"], ["", "Collections"], ["arrivals", "New arrivals"], ["photo-ethos", "“Mean it” photo"], ["sale", "Sale"], ["photo-look", "Lookbook photo"], ["", "Sign up"]],
  },
  product: { label: "Product pages", blocks: [["", "Photos, sizes, add to bag"], ["", "Product story"], ["related", "You may also like"], ["", "Recently viewed"]] },
  bag: { label: "Bag", blocks: [["", "Free delivery bar"], ["", "Items in the bag"], ["bag", "Complete the look"], ["", "Total and checkout"]] },
  order: { label: "Order page", blocks: [["", "Order status"], ["", "Progress"], ["", "Items and details"], ["waiting", "While you wait"]] },
  lookbook: { label: "Gallery page", blocks: [["", "Gallery cover"], ["", "Chapter list"], ["gallery", "Photo chapters"], ["lookbook", "Shop the lookbook"], ["", "Sign up"]] },
};
