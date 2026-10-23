"use client";

import { useState } from "react";
import { motion } from "motion/react";

// Re-mounts on every navigation: a soft cross-fade between pages.
// Opacity only - a transform here would break pinned and sticky sections inside.
// After a link tap the red loading line first runs to the end (NavLoading.jsx), then the page fades in.
const FINISH = 0.3; // a touch longer than the line (NavLoading FINISH = 240 ms), so the page starts once it is full

export default function Template({ children }) {
  const [afterLine] = useState(() => typeof window !== "undefined" && Boolean(window.__tbaNav));
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3, ease: "easeOut", delay: afterLine ? FINISH : 0 }}>
      {children}
    </motion.div>
  );
}
