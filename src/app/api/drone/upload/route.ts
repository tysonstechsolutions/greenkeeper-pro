import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/drone/upload
 *
 * Accepts multipart/form-data with:
 *   - file (required)      — GeoTIFF, TIFF, PNG, or JPEG
 *   - preview (optional)   — PNG preview for TIFF/GeoTIFF files
 *   - flight_date (required) — ISO date string (YYYY-MM-DD)
 *   - band (optional)      — ndvi | ndre | thermal | rgb
 *   - source (optional)    — greensight | pix4d | dji | manual
 *   - notes (optional)
 *   - bbox (optional)      — JSON string: {"north":..., "south":..., "east":..., "west":...}
 *
 * Ensure a 'drone-flights' Supabase Storage bucket exists
 * (create via dashboard -> Storage -> New Bucket -> name: drone-flights, public: false).
 */

const BUCKET = "drone-flights";

const MANAGEMENT_ROLES = new Set([
  "super",
  "asst_super",
  "director",
  "foreman",
  "pro",
]);

// Map of mime-type / extension to category
function classifyFile(name: string, type: string): "tiff" | "image" | null {
  const lower = name.toLowerCase();
  if (
    lower.endsWith(".tif") ||
    lower.endsWith(".tiff") ||
    lower.endsWith(".geotiff") ||
    type === "image/tiff"
  ) {
    return "tiff";
  }
  if (
    lower.endsWith(".png") ||
    lower.endsWith(".jpg") ||
    lower.endsWith(".jpeg") ||
    type.startsWith("image/")
  ) {
    return "image";
  }
  return null;
}

function getExtension(name: string): string {
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "bin";
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    // Auth check
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Role check
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    if (!profile || !MANAGEMENT_ROLES.has(profile.role)) {
      return NextResponse.json(
        { error: "Insufficient permissions. Management or foreman role required." },
        { status: 403 }
      );
    }

    // Parse form data
    const formData = await request.formData();

    const file = formData.get("file") as File | null;
    const preview = formData.get("preview") as File | null;
    const flightDate = formData.get("flight_date") as string | null;
    const band = formData.get("band") as string | null;
    const source = formData.get("source") as string | null;
    const notes = formData.get("notes") as string | null;
    const bboxRaw = formData.get("bbox") as string | null;

    if (!file) {
      return NextResponse.json({ error: "file is required" }, { status: 400 });
    }
    if (!flightDate) {
      return NextResponse.json(
        { error: "flight_date is required" },
        { status: 400 }
      );
    }

    // Validate band
    const validBands = ["ndvi", "ndre", "thermal", "rgb"];
    if (band && !validBands.includes(band)) {
      return NextResponse.json(
        { error: `band must be one of: ${validBands.join(", ")}` },
        { status: 400 }
      );
    }

    // Classify main file
    const fileCategory = classifyFile(file.name, file.type);
    if (!fileCategory) {
      return NextResponse.json(
        { error: "Unsupported file type. Upload a GeoTIFF, TIFF, PNG, or JPEG." },
        { status: 400 }
      );
    }

    // Parse optional bbox
    let bbox: Record<string, number> | null = null;
    if (bboxRaw) {
      try {
        bbox = JSON.parse(bboxRaw);
      } catch {
        return NextResponse.json(
          { error: "bbox must be valid JSON" },
          { status: 400 }
        );
      }
    }

    // Generate storage paths
    const fileId = crypto.randomUUID();
    const ext = getExtension(file.name);
    const storagePath = `${flightDate}/${fileId}.${ext}`;

    // Upload main file to Supabase Storage
    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, fileBuffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return NextResponse.json(
        { error: `Storage upload failed: ${uploadError.message}` },
        { status: 500 }
      );
    }

    // Determine geotiff_path vs preview_png_path based on file type
    let geotiffPath: string | null = null;
    let previewPngPath: string | null = null;

    if (fileCategory === "tiff") {
      geotiffPath = storagePath;
    } else {
      // PNG or JPEG — treat as preview
      previewPngPath = storagePath;
    }

    // Upload optional preview file (for TIFF uploads)
    if (preview && fileCategory === "tiff") {
      const previewId = crypto.randomUUID();
      const previewExt = getExtension(preview.name);
      const previewPath = `${flightDate}/${previewId}.${previewExt}`;

      const previewBuffer = Buffer.from(await preview.arrayBuffer());
      const { error: previewUploadError } = await supabase.storage
        .from(BUCKET)
        .upload(previewPath, previewBuffer, {
          contentType: preview.type || "image/png",
          upsert: false,
        });

      if (previewUploadError) {
        console.error("Preview upload error:", previewUploadError);
        // Non-fatal — continue without preview
      } else {
        previewPngPath = previewPath;
      }
    }

    // Insert row into drone_flights table
    const { data: row, error: insertError } = await supabase
      .from("drone_flights")
      .insert({
        flight_date: flightDate,
        geotiff_path: geotiffPath,
        preview_png_path: previewPngPath,
        bbox: bbox,
        band: band || null,
        source: source || null,
        notes: notes || null,
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return NextResponse.json(
        { error: `Database insert failed: ${insertError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json(row, { status: 201 });
  } catch (err) {
    console.error("Drone upload error:", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
