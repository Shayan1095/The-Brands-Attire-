"use client";

import { motion } from "motion/react";

// Re-mounts on every navigation: a soft cross-fade between pages.
// Opacity only - a transform here would break pinned and sticky sections inside.
export default function Template({ children }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: "easeOut" }}>
      {children}
    </motion.div>
  );
}
