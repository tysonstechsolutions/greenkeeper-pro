import { redirect } from "next/navigation";

/** The canonical Phase 1A duty system is the only writable duty workflow. */
export default function LegacyDutiesRedirect() {
  redirect("/operations/duties");
}
