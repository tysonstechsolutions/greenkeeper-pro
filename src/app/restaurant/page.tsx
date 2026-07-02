"use client";

import { WorkspaceLanding } from "@/components/layout/workspace-landing";
import { HUB_RESTAURANT } from "@/lib/layout/app-catalog";

export default function RestaurantPage() {
  return (
    <WorkspaceLanding
      title="Restaurant"
      description="Food & beverage — Hot Dog Monday, US Foods ordering, cleaning logs, inventory counts."
      area="restaurant"
      workspaces={["restaurant"]}
      items={HUB_RESTAURANT.children ?? []}
    />
  );
}
