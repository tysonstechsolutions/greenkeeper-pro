import { HubPage } from "@/components/layout/hub-page";
import { HUB_PROCUREMENT } from "@/lib/layout/app-catalog";

export default function ProcurementPage() {
  return (
    <HubPage
      title={HUB_PROCUREMENT.label}
      description="Purchase requests, audits, vendors, and the order list."
      items={HUB_PROCUREMENT.children ?? []}
    />
  );
}
