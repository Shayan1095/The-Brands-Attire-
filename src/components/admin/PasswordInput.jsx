"use client";

import { useState } from "react";

/** A password box with a show / hide eye. Takes the same props as an <input>. */
export default function PasswordInput(props) {
  const [shown, setShown] = useState(false);
  return (
    <span className="pw">
      <input {...props} type={shown ? "text" : "password"} />
      <button type="button" className="pw__eye" onClick={() => setShown((v) => !v)} aria-label={shown ? "Hide password" : "Show password"} aria-pressed={shown} title={shown ? "Hide password" : "Show password"}>
        {shown ? (
          <svg viewBox="0 0 24 24" aria-hidden><path d="M3 3l18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9.9 5.1A10.6 10.6 0 0 1 12 5c5 0 9 4.5 10 7a12.6 12.6 0 0 1-3 4.2M6.6 6.6C4.3 8 2.7 10.2 2 12c1 2.5 5 7 10 7a10.4 10.4 0 0 0 4.4-1" /></svg>
        ) : (
          <svg viewBox="0 0 24 24" aria-hidden><path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z" /><circle cx="12" cy="12" r="3" /></svg>
        )}
      </button>
    </span>
  );
}
