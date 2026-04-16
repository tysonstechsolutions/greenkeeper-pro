import { Droplets } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";

export default function IrrigationPage() {
  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6">
      <PageHeader
        title="Irrigation"
        description="Zone management and schedules"
        icon={Droplets}
      />

      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6 text-center">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
              <Droplets className="w-8 h-8 text-primary" />
            </div>

            <h2 className="text-xl font-semibold mb-2">
              Irrigation Management &mdash; Coming Soon
            </h2>
            <p className="text-sm text-muted-foreground mb-6">
              We&apos;re building a full irrigation management system. Here&apos;s what&apos;s on the way:
            </p>

            <ul className="text-sm text-muted-foreground space-y-2 text-left">
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                Zone control &amp; scheduling
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                Flow monitoring
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                Smart weather-based adjustments
              </li>
              <li className="flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" />
                Pump station status
              </li>
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
