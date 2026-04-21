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
    case "channel":
      return reference_id ? `/messages?channel=${reference_id}` : "/messages";
    case "equipment":
      return reference_id ? `/equipment/view?id=${reference_id}` : "/equipment";
    case "time_off_request":
      return "/schedule/time-off";
    default:
      return "/dashboard";
  }
}
