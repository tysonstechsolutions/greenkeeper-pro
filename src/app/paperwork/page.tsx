import { HubPage } from "@/components/layout/hub-page";
import { HUB_PAPERWORK } from "@/lib/layout/app-catalog";

export default function PaperworkPage() {
  return (
    <HubPage
      title={HUB_PAPERWORK.label}
      description="Forms, work orders, and compliance paperwork in one place."
      items={HUB_PAPERWORK.children ?? []}
    />
  );
}
