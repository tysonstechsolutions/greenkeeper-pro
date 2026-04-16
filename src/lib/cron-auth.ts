/**
 * Shared cron job authentication utility.
 *
 * Validates that incoming requests carry the correct secret so that cron
 * endpoints are not callable by arbitrary callers in production.
 *
 * When `CRON_SECRET` is not configured (local dev) requests are allowed
 * through automatically.
 */
export function validateCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  // Allow in dev when no secret is configured
  if (!secret) return true;
  return request.headers.get("x-cron-secret") === secret;
}
