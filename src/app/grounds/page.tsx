import { HubPage } from "@/components/layout/hub-page";
import { HUB_COURSE } from "@/lib/layout/app-catalog";

export default function GroundsPage() {
  return (
    <HubPage
      title={HUB_COURSE.label}
      description="Course map and grounds — pin and track issues by location."
      items={HUB_COURSE.children ?? []}
    />
  );
}
