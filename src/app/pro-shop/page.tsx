"use client";

import { WorkspaceLanding } from "@/components/layout/workspace-landing";
import { HUB_PRO_SHOP } from "@/lib/layout/app-catalog";

export default function ProShopPage() {
  return (
    <WorkspaceLanding
      title="Pro Shop"
      description="Staff schedule, duties, tournaments, and merchandise."
      area="pro_shop"
      workspaces={["pro_shop"]}
      items={HUB_PRO_SHOP.children ?? []}
    />
  );
}
