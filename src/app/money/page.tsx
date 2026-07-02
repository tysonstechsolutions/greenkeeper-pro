import { HubPage } from "@/components/layout/hub-page";
import { HUB_MONEY } from "@/lib/layout/app-catalog";

export default function MoneyPage() {
  return (
    <HubPage
      title={HUB_MONEY.label}
      description="Budgets, purchase requests, revenue, and assets — each area's finances stay separate."
      items={HUB_MONEY.children ?? []}
    />
  );
}
