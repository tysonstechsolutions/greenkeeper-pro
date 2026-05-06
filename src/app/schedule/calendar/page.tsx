/**
 * /schedule/calendar — retired in favor of the unified /schedule board.
 * Server-side redirect preserves any external bookmarks.
 */
import { redirect } from "next/navigation";

export default function ScheduleCalendarRedirectPage(): never {
  redirect("/schedule");
}
