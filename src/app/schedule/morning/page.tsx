/**
 * /schedule/morning — retired in favor of the unified /schedule board's
 * "Suggest" action. This file is kept solely to preserve any external
 * bookmarks; it server-side redirects to /schedule.
 */
import { redirect } from "next/navigation";

export default function MorningRouteRedirectPage(): never {
  redirect("/schedule");
}
