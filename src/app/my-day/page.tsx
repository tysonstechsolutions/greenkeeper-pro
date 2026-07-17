import { redirect } from "next/navigation";

/** My Day is the personal adapter over the same canonical operational work. */
export default function MyDayPage() {
  redirect("/operations?view=mine");
}
