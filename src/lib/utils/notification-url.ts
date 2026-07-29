/**
 * Shared helper to map a notification's reference_type/reference_id to the
 * correct in-app route. Used by:
 *  - src/components/layout/header.tsx (notification dropdown click)
 *  - src/app/notifications/page.tsx (notifications list click)
 *  - src/lib/hooks/useNotifications.ts (web push mirror URL)
 *
 * Keeping this in one place avoids divergence between the in-app click handler
 * and the push-notification click target (the push target used to 404 because
 * reference_type "task" was being mapped to /task/:id instead of /tasks/:id).
 */
export function notificationToUrl(notification: {
  reference_type: string | null;
  reference_id: string | null;
}): string {
  const { reference_type, reference_id } = notification;

  switch (reference_type) {
    case "task":
      return reference_id ? `/tasks/view?id=${reference_id}` : "/tasks";
    case "equipment":
      return reference_id ? `/equipment/view?id=${reference_id}` : "/assets";
    // The standalone request page was removed with the unused /schedule board
    // (2026-07-29). Time off is handled on the staff schedule now, so that is
    // where the notification lands.
    case "time_off_request":
      return "/pro-shop-schedule";
    default:
      return "/dashboard";
  }
}
