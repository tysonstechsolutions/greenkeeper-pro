import { redirect } from "next/navigation";

/** Today is now the unified Operations Command Center, not a competing engine. */
export default function TodayPage() {
  redirect("/operations");
}
