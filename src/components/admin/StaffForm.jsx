"use client";

import { useActionState, useState } from "react";
import { saveStaffAction } from "@/lib/admin-actions";
import { PERMISSIONS } from "@/lib/format";

/** Add or edit a staff account: who they are, what they may do, and whether they can sign in. */
export default function StaffForm({ person, isSelf, viewerIsOwner }) {
  const [state, action, pending] = useActionState(saveStaffAction, null);
  const p = person || { role: "staff", permissions: ["orders"], is_active: true };
  const [role, setRole] = useState(p.role);

  return (
    <form action={action}>
      {state?.error && <div className="note note--bad" role="alert">{state.error}</div>}
      {state?.ok && <div className="note note--ok" role="status">{state.message}</div>}
      {p.id && <input type="hidden" name="id" value={p.id} />}
      <div className="frow">
        <div className="field"><label>Name</label><input name="name" required defaultValue={p.name} /></div>
        <div className="field"><label>Email (used to sign in)</label><input name="email" type="email" required defaultValue={p.email} autoComplete="off" /></div>
      </div>
      <div className="frow">
        <div className="field">
          <label>{p.id ? "New password (leave empty to keep)" : "Password"}</label>
          <input name="password" type="password" minLength={8} required={!p.id} autoComplete="new-password" />
          <small>At least 8 characters. Share it with them privately.</small>
        </div>
        <div className="field">
          <label>Role</label>
          <select name="role" value={role} onChange={(e) => setRole(e.target.value)} disabled={isSelf || !viewerIsOwner}>
            <option value="staff">Staff: only the tasks ticked below</option>
            <option value="owner">Owner: everything</option>
          </select>
          {(isSelf || !viewerIsOwner) && <input type="hidden" name="role" value={role} />}
        </div>
      </div>

      {role === "staff" ? (
        <div className="field">
          <label>What can they do?</label>
          <div className="perms">
            {Object.entries(PERMISSIONS).map(([key, label]) => (
              <label key={key} className="check"><input type="checkbox" name={`perm_${key}`} defaultChecked={p.permissions?.includes(key)} /> <span>{label}</span></label>
            ))}
          </div>
          <small>Anything left unticked is hidden from their menu and blocked if they try to open it.</small>
        </div>
      ) : (
        <p className="sub">Owners can do everything, including managing staff and seeing sales figures.</p>
      )}

      {isSelf ? <input type="hidden" name="is_active" value="on" /> : (
        <label className="check"><input type="checkbox" name="is_active" defaultChecked={p.is_active} /> <span>Can sign in<small className="hint">Untick to block this person without deleting their history.</small></span></label>
      )}
      <button className="btn btn--sm" disabled={pending}>{pending ? "Saving…" : p.id ? "Save changes" : "Add staff member"}</button>
    </form>
  );
}
