"use client";

import { motion } from "motion/react";

const EASE = [0.16, 1, 0.3, 1];

/**
 * "Look closer": the product's other photos as an editorial spread, each with a short fact as its caption
 * (fabric, where it is made, fit...). Only shown when the product has more than one photo: the facts themselves
 * live in the panels beside the buy button, so nothing is said twice, and no photo is repeated.
 *
 * rows = [{ label, value }]  short facts used as captions;  images = [{ url, thumb }]
 */
export default function DetailStory({ name, rows, images }) {
  const extra = images.slice(1, 4);
  if (!extra.length) return null;
  // short facts read well as captions; long ones (delivery text) stay in the panels
  const captions = rows.filter((r) => String(r.value).length <= 70);

  return (
    <section className="section lcl" aria-label={`${name}: more photos`}>
      <div className="wrap">
        <div className="lcl__head">
          <span className="eyebrow" data-reveal>Look closer</span>
          <h2 className="display" data-split>The {name}, <em>up close</em></h2>
        </div>
        <div className={`lcl__grid lcl__grid--${extra.length}`} data-lenis-prevent>
          {extra.map((im, i) => {
            const cap = captions[i];
            return (
              <motion.figure
                key={im.url} className="lcl__shot"
                initial={{ opacity: 0, y: 40 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true, margin: "0px 0px -10% 0px" }}
                transition={{ duration: 0.8, ease: EASE, delay: i * 0.08 }}
              >
                <img src={im.url} alt={`${name}, ${cap ? cap.label.toLowerCase() : `photo ${i + 2}`}`} width="1200" height="1500" loading="lazy" decoding="async" />
                {cap && (
                  <figcaption>
                    <span>{cap.label}</span>
                    <b>{cap.value}</b>
                  </figcaption>
                )}
              </motion.figure>
            );
          })}
        </div>
      </div>
    </section>
  );
}
