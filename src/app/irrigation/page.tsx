import { Droplets, Play, Pause } from "lucide-react";
import { PageHeader } from "@/components/ui/page-header";
import { Button } from "@/components/ui/button";

const mockZones = [
  { id: 1, name: "Green #1", status: "idle", lastRun: "Yesterday 4:00 AM", runtime: "12 min" },
  { id: 2, name: "Green #2", status: "running", lastRun: "Running now", runtime: "8/12 min" },
  { id: 3, name: "Fairway #1-3", status: "idle", lastRun: "Yesterday 3:30 AM", runtime: "25 min" },
  { id: 4, name: "Fairway #4-6", status: "scheduled", lastRun: "Scheduled 4:00 AM", runtime: "25 min" },
  { id: 5, name: "Practice Green", status: "idle", lastRun: "Mar 15 4:00 AM", runtime: "15 min" },
];

const statusConfig = {
  idle: { label: "Idle", color: "bg-muted text-muted-foreground" },
  running: { label: "Running", color: "bg-primary text-primary-foreground" },
  scheduled: { label: "Scheduled", color: "bg-accent text-accent-foreground" },
};

export default function IrrigationPage() {
  return (
    <div className="p-4 md:p-6 pb-24 md:pb-6">
      <PageHeader
        title="Irrigation"
        description="Zone management and schedules"
        icon={Droplets}
      >
        <Button variant="outline" size="sm">
          Rain Delay
        </Button>
        <Button size="sm">
          <Play className="w-4 h-4 mr-2" />
          Manual Run
        </Button>
      </PageHeader>

      {/* Active Status */}
      <div className="bg-primary/10 border border-primary/20 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-medium text-primary">Zone Running</p>
            <p className="text-sm text-muted-foreground">Green #2 - 8 of 12 minutes remaining</p>
          </div>
          <Button variant="outline" size="sm">
            <Pause className="w-4 h-4 mr-2" />
            Stop
          </Button>
        </div>
      </div>

      {/* Zone List */}
      <div className="space-y-3">
        {mockZones.map((zone) => {
          const status = statusConfig[zone.status as keyof typeof statusConfig];
          return (
            <div
              key={zone.id}
              className="bg-card rounded-lg border border-border p-4 hover:border-primary/50 transition-colors cursor-pointer"
            >
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-medium">{zone.name}</h3>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${status.color}`}>
                      {status.label}
                    </span>
                  </div>
                  <p className="text-sm text-muted-foreground">{zone.lastRun}</p>
                </div>
                <div className="text-right">
                  <p className="font-medium">{zone.runtime}</p>
                  <p className="text-sm text-muted-foreground">Runtime</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
