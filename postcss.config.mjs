// Tailwind CSS (for shadcn/ui and React Bits components) + vendor prefixes.
// A custom PostCSS config replaces Next's built-in one, so autoprefixer is listed here to keep
// Safari prefixes (user-select, text-size-adjust...) in the hand-written store.css / admin.css.
// The Tailwind plugin only changes files that use Tailwind (src/styles/ui.css); others pass through.
export default {
  plugins: {
    "@tailwindcss/postcss": {},
    autoprefixer: {},
  },
};
