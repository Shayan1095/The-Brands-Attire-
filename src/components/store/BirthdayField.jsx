"use client";

import { useState, useTransition } from "react";
import { saveBirthdayAction } from "@/lib/store-actions";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** Optional birthday (day and month only) on the updates page, for a birthday wish from the shop. */
export default function BirthdayField({ token, initial }) {
  const [month, setMonth] = useState(initial ? String(Number(initial.slice(0, 2))) : "");
  const [day, setDay] = useState(initial ? String(Number(initial.slice(3, 5))) : "");
  const [state, setState] = useState(initial ? "saved" : "");
  const [pending, start] = useTransition();
  const days = month ? new Date(2024, Number(month), 0).getDate() : 31; // 2024: February has 29

  const save = () =>
    start(async () => {
      const res = await saveBirthdayAction(token, Number(month), Number(day));
      setState(res?.error ? res.error : "saved");
    });

  return (
    <div className="bday">
      <b>Your birthday <small>(optional)</small></b>
      <p>We will send you a little something on the day. Only the day and month, never the year.</p>
      <div className="bday__row">
        <select className="input" value={day} onChange={(e) => { setDay(e.target.value); setState(""); }} aria-label="Day">
          <option value="">Day</option>
          {Array.from({ length: days }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
        </select>
        <select className="input" value={month} onChange={(e) => { setMonth(e.target.value); setState(""); }} aria-label="Month">
          <option value="">Month</option>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
        <button type="button" className="btn btn--ghost" disabled={pending || !day || !month || state === "saved"} onClick={save}>
          {pending ? <span className="spinner" aria-hidden /> : state === "saved" ? "Saved" : "Save"}
        </button>
      </div>
      {state && state !== "saved" && <p className="form-error" role="alert">{state}</p>}
    </div>
  );
}
