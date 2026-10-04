export const dynamic = "force-dynamic";

/**
 * Health check. The app is fully Firebase-backed (project: cafe-review7);
 * there is no server-side database to probe.
 */
export async function GET() {
  return Response.json({ ok: true, backend: "firebase", project: "cafe-review7" });
}
