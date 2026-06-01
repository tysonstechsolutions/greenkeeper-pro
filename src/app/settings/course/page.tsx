"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Database, Save, Loader2, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { RoleGuard, ADMIN_ROLES } from "@/components/auth/role-guard";

export default function CourseSettingsPage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  // Course settings state
  const [courseName, setCourseName] = useState("Veterans Memorial Golf Course");
  const [courseAddress, setCourseAddress] = useState("Great Lakes, IL");
  const [holeCount, setHoleCount] = useState("18");
  const [acreage, setAcreage] = useState("150");
  const [latitude, setLatitude] = useState("42.3095");
  const [longitude, setLongitude] = useState("-87.8475");

  const handleSave = async () => {
    setSaving(true);
    // TODO: Save course settings to database
    await new Promise(resolve => setTimeout(resolve, 500));
    setSaving(false);
    router.back();
  };

  return (
    <RoleGuard allowedRoles={ADMIN_ROLES}>
      <div className="p-4 md:p-6 pb-24">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-xl font-semibold">Course Setup</h1>
            <p className="text-sm text-muted-foreground">Course info, zones, holes</p>
          </div>
        </div>

        <div className="max-w-md space-y-6">
          {/* Basic Info */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Database className="w-4 h-4" />
                Course Information
              </CardTitle>
              <CardDescription>Basic details about your course</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="courseName">Course Name</Label>
                <Input
                  id="courseName"
                  value={courseName}
                  onChange={(e) => setCourseName(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="courseAddress">Address / Location</Label>
                <Input
                  id="courseAddress"
                  value={courseAddress}
                  onChange={(e) => setCourseAddress(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="holeCount">Number of Holes</Label>
                  <Input
                    id="holeCount"
                    type="number"
                    inputMode="numeric"
                    value={holeCount}
                    onChange={(e) => setHoleCount(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="acreage">Total Acreage</Label>
                  <Input
                    id="acreage"
                    type="number"
                    inputMode="decimal"
                    value={acreage}
                    onChange={(e) => setAcreage(e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Location */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <MapPin className="w-4 h-4" />
                Map Location
              </CardTitle>
              <CardDescription>Coordinates for weather and map features</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="latitude">Latitude</Label>
                  <Input
                    id="latitude"
                    type="number"
                    inputMode="decimal"
                    step="0.0001"
                    value={latitude}
                    onChange={(e) => setLatitude(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="longitude">Longitude</Label>
                  <Input
                    id="longitude"
                    type="number"
                    inputMode="decimal"
                    step="0.0001"
                    value={longitude}
                    onChange={(e) => setLongitude(e.target.value)}
                  />
                </div>
              </div>
              <p className="text-xs text-muted-foreground">
                These coordinates are used for weather forecasts and the course map.
              </p>
            </CardContent>
          </Card>

          {/* Save Button */}
          <Button onClick={handleSave} disabled={saving} className="w-full">
            {saving ? (
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Settings
          </Button>
        </div>
      </div>
    </RoleGuard>
  );
}
