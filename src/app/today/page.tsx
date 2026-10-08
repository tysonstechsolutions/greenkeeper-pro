import { redirect } from "next/navigation";

/** "Today" is the first tab of My Duties. */
export default function TodayPage() {
  redirect("/my-duties");
}
