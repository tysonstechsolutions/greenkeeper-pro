import { redirect } from "next/navigation";

/** Old "Shop Duties" link. Duties live on Duty Ownership now. */
export default function LegacyDutiesRedirect() {
  redirect("/operations/duties");
}
