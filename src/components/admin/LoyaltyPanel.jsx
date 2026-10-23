"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { adjustPointsAction, issueRewardAction } from "@/lib/admin-actions";

/**
 * A customer's loyalty: points with progress to the next reward, their personal codes (rewards, store credit),
 * the points history, and staff controls to correct points or hand out a reward now.
 */
export default function LoyaltyPanel({ id, points, enabled, rewardPoints, rewardValue, ledger, codes }) {
  const router = useRouter();
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const progress = rewardPoints > 0 ? Math.min(1, points / rewardPoints) : 0;

  const run = async (fn, ok) => {
    setBusy(true); setMsg(null);
    const res = await fn().catch(() => ({ error: "Something went wrong. Please try again." }));
    setBusy(false);
    if (res?.error) return setMsg({ bad: true, text: res.error });
    setMsg({ text: ok(res) });
    setAmount(""); setReason("");
    router.refresh();
  };

  return (
    <div className="card loyal">
      <div className="loyal__top">
        <div>
          <span className="loyal__label">Loyalty points</span>
          <b className="loyal__points">{points.toLocaleString("en-US")}</b>
        </div>
        {enabled && rewardPoints > 0 && (
          <button type="button" className="btn btn--sm" disabled={busy || points < rewardPoints} onClick={() => run(() => issueRewardAction(id), (r) => `Reward code ${r.code} created.`)}
            title={points < rewardPoints ? `Needs ${rewardPoints} points` : "Turn points into a reward code now"}>
            Give {rewardValue} reward
          </button>
        )}
      </div>
      {enabled && rewardPoints > 0 && (
        <>
          <span className="loyal__bar"><i style={{ "--p": progress }} /></span>
          <p className="sub" style={{ margin: "6px 0 0" }}>
            {points >= rewardPoints ? "Enough for a reward: it is created by itself on their next delivered order, or press the button." : `${(rewardPoints - points).toLocaleString("en-US")} more points for a ${rewardValue} reward.`}
          </p>
        </>
      )}
      {!enabled && <p className="sub" style={{ margin: "6px 0 0" }}>Points are switched off. Turn them on in Settings → Loyalty.</p>}
      {msg && <div className={`note ${msg.bad ? "note--bad" : "note--ok"}`} style={{ margin: "12px 0 0" }}>{msg.text}</div>}

      {codes.length > 0 && (
        <>
          <span className="sc__label">Their codes</span>
          <ul className="loyal__codes">
            {codes.map((c) => <li key={c.code}><code>{c.code}</code><span>{c.value} · {c.note || "Personal code"}</span><small className={c.state === "Used" || c.state === "Expired" ? "dim" : ""}>{c.state}</small></li>)}
          </ul>
        </>
      )}

      {ledger.length > 0 && (
        <>
          <span className="sc__label">Points history</span>
          <ul className="loyal__ledger">
            {ledger.map((l, i) => <li key={i}><b className={l.points > 0 ? "up" : "down"}>{l.points > 0 ? `+${l.points}` : l.points}</b><span>{l.reason}</span><small>{l.when}</small></li>)}
          </ul>
        </>
      )}

      <details className="fold">
        <summary>Add or take away points</summary>
        <div className="frow">
          <div className="field" style={{ margin: 0 }}><label>Points</label><input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="50 or -50" /></div>
          <div className="field" style={{ margin: 0 }}><label>Why</label><input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Birthday gift, correction…" maxLength={120} /></div>
        </div>
        <button type="button" className="btn btn--ghost btn--sm" style={{ marginTop: 10 }} disabled={busy || !amount} onClick={() => run(() => adjustPointsAction(id, amount, reason), () => "Points updated.")}>Save</button>
      </details>
    </div>
  );
}
