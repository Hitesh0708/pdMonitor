/**
 * DEV-ONLY token provider.
 *
 * Returns the `IOSENSE_BEARER_TOKEN` from `.env.local` so the client auth hook
 * has a fallback during local development. Returns 404 in production — the JWT
 * is never bundled into client code, and prod always uses the platform's
 * `?token=` SSO exchange instead.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return new Response(null, { status: 404 });
  }
  return Response.json({ token: process.env.IOSENSE_BEARER_TOKEN ?? "" });
}
