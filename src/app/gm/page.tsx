import { redirect } from "next/navigation";

/** The GM Dashboard merged into the Money hub (alerts, financial watch, PR counts). */
export default function GmRedirect() {
  redirect("/money");
}
