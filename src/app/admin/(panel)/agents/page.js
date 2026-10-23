import { requirePerm } from "@/lib/auth";
import { query } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { buildBriefing, AGENTS } from "@/lib/agents";
import { aiStatus } from "@/lib/ai";
import { fmtDate, money } from "@/lib/format";
import AgentsBoard from "@/components/admin/AgentsBoard";

export const metadata = { title: "Agents" };

export default async function AgentsPage({ searchParams }) {
  await requirePerm("agents");
  const { view = "open" } = await searchParams;
  const settings = await getSettings();
  const tz = settings.store.timezone;
  const status = ["open", "done", "dismissed"].includes(view) ? view : "open";

  const [tasks, counts, runs, lastRuns, [brief], live] = await Promise.all([
    query(
      `SELECT t.*, o.number AS order_number, o.status AS order_status, p.name AS product_name, k.number AS case_number, k.status AS case_status, a.name AS decided_name
       FROM agent_tasks t
       LEFT JOIN orders o ON t.ref_type = 'order' AND o.id = t.ref_id
       LEFT JOIN products p ON t.ref_type = 'product' AND p.id = t.ref_id
       LEFT JOIN cases k ON t.ref_type = 'case' AND k.id = t.ref_id
       LEFT JOIN admins a ON a.id = t.decided_by
       WHERE t.status = $1
       ORDER BY ${status === "open" ? "CASE t.severity WHEN 'bad' THEN 0 WHEN 'warn' THEN 1 ELSE 2 END," : ""} t.id DESC LIMIT 100`,
      [status]
    ),
    query("SELECT status, agent, count(*)::int AS n FROM agent_tasks GROUP BY status, agent"),
    query("SELECT agent, trigger, ok, summary, created_at FROM agent_runs WHERE agent <> 'briefing' OR NOT ok ORDER BY id DESC LIMIT 8"),
    query("SELECT DISTINCT ON (agent) agent, ok, summary, created_at FROM agent_runs ORDER BY agent, id DESC"),
    query("SELECT summary, created_at FROM agent_runs WHERE agent = 'briefing' AND ok ORDER BY id DESC LIMIT 1"),
    buildBriefing(settings),
  ]);
  const ai = await aiStatus();

  const n = (st, agent) => counts.filter((c) => c.status === st && (!agent || c.agent === agent)).reduce((s, c) => s + c.n, 0);
  const last = Object.fromEntries(lastRuns.map((r) => [r.agent, { ok: r.ok, summary: r.summary, when: fmtDate(r.created_at, tz) }]));

  return (
    <AgentsBoard
      view={status}
      settings={settings.agents}
      currency={settings.store.currency}
      counts={{ open: n("open"), done: n("done"), dismissed: n("dismissed"), byAgent: Object.fromEntries(Object.keys(AGENTS).map((k) => [k, n("open", k)])) }}
      ai={ai}
      last={last}
      tasks={tasks.map((t) => ({
        id: t.id, agent: t.agent, kind: t.kind, title: t.title, detail: t.detail, severity: t.severity, data: t.data,
        ref: t.ref_type === "order" && t.ref_id ? { href: `/admin/orders/${t.ref_id}`, label: `Open ${t.order_number}`, status: t.order_status }
          : t.ref_type === "case" && t.ref_id ? { href: `/admin/returns/${t.ref_id}`, label: `Open ${t.case_number}`, status: t.case_status }
          : t.ref_type === "product" && t.ref_id ? (t.agent === "restock" ? { href: "/admin/inventory/insights", label: "Restock list" } : t.kind === "feature" ? { href: "/admin/showcase", label: "Open Showcase" } : { href: `/admin/products/${t.ref_id}`, label: "Edit product" })
          : t.kind === "showcase_clean" ? { href: "/admin/showcase", label: "Open Showcase" }
          : t.ref_type === "customer" && t.ref_id ? { href: `/admin/customers/${t.ref_id}`, label: "Open customer" }
          : t.kind === "faq_suggest" ? { href: "/admin/assistant#answers", label: "Saved answers" }
          : t.agent === "writer" ? { href: `/admin/campaigns?draft=${t.id}`, label: "Preview in Campaigns" } : null,
        total: t.data?.total ? money(t.data.total, settings.store.currency) : null,
        when: fmtDate(t.created_at, tz), decided: t.decided_at ? `${t.decided_name || "System"} · ${fmtDate(t.decided_at, tz)}` : null, note: t.note,
      }))}
      runs={runs.map((r) => ({ agent: r.agent, trigger: r.trigger, ok: r.ok, summary: r.summary, when: fmtDate(r.created_at, tz) }))}
      briefing={{ live, sent: brief ? { text: brief.summary, when: fmtDate(brief.created_at, tz) } : null }}
    />
  );
}
