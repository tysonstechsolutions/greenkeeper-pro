import { redirect } from "next/navigation";

/** My Day became My Duties — the GM's own work by day, week, month, quarter, year. */
export default function MyDayPage() {
  redirect("/my-duties");
}
