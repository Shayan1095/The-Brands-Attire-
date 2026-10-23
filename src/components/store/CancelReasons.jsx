"use client";

import { CANCEL_REASONS } from "@/lib/format";

/**
 * "Why are you cancelling?" inside the cancel window on the order page. Optional, one tap; the reason is kept on
 * the order for the owner's weekly report (Feedback analyst).
 */
export default function CancelReasons({ value, onChange }) {
  return (
    <fieldset className="cxr">
      <legend>Why are you cancelling? <small>(optional, it helps us improve)</small></legend>
      <div className="cxr__list">
        {Object.entries(CANCEL_REASONS).map(([code, label]) => (
          <button key={code} type="button" className={`cxr__chip ${value === code ? "is-on" : ""}`} aria-pressed={value === code} onClick={() => onChange(value === code ? "" : code)}>
            {label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
