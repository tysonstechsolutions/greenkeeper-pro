import { HubPage } from "@/components/layout/hub-page";
import { HUB_LIBRARY } from "@/lib/layout/app-catalog";

export default function LibraryPage() {
  return (
    <HubPage
      title={HUB_LIBRARY.label}
      description="Knowledge base, saved documents, onboarding & SOPs, and the AI answer library — one shelf."
      items={HUB_LIBRARY.children ?? []}
    />
  );
}
