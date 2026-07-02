import { HubPage } from "@/components/layout/hub-page";
import { HUB_PEOPLE } from "@/lib/layout/app-catalog";

export default function PeoplePage() {
  return (
    <HubPage
      title={HUB_PEOPLE.label}
      description="Staff, onboarding, and every federal form the app fills for you."
      items={HUB_PEOPLE.children ?? []}
    />
  );
}
