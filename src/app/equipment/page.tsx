import { redirect } from "next/navigation";

/** Equipment readiness is the Readiness tab of the Assets page now. */
export default function EquipmentRedirect() {
  redirect("/assets?tab=readiness");
}
