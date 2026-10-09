import { redirect } from "next/navigation";

/** The Duty & Cleaning Log is now the History tab of Duty Ownership. */
export default function DutyLogRedirect() {
  redirect("/operations/duties?tab=history");
}
