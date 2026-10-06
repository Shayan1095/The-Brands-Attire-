import { runAutomations } from "@/lib/orders";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/*
  Scheduled housekeeping: confirmation reminders, auto-cancelling stale orders, sending queued messages.
  Vercel Cron calls this once a day (see vercel.json) and sends CRON_SECRET as a Bearer token.
  For more frequent runs on the free plan, point a free scheduler (cron-job.org, GitHub Actions)
  at /api/cron with the header  Authorization: Bearer <CRON_SECRET>
*/
export async function GET(request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  return Response.json(await runAutomations());
}
