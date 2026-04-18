/**
 * drone-upload — Deno edge function port of /api/drone/upload.
 *
 * Accepts multipart/form-data:
 *   - file (required)        — GeoTIFF, TIFF, PNG, or JPEG
 *   - preview (optional)     — PNG preview for TIFF/GeoTIFF
 *   - flight_date (required) — YYYY-MM-DD
 *   - band (optional)        — ndvi | ndre | thermal | rgb
 *   - source (optional)      — greensight | pix4d | dji | manual
 *   - notes (optional)
 *   - bbox (optional)        — JSON string {"north":..., "south":..., "east":..., "west":...}
 *
 * Uploads the file(s) to the `drone-flights` Storage bucket under
 * <flight_date>/<uuid>.<ext>, then inserts a row into `drone_flights`.
 *
 * Auth: signed-in user in one of the MANAGEMENT_ROLES.
 *
 * ⚠ Size limits: Supabase Edge Functions cap request bodies around 10 MB
 * (and TIFFs from modern multispectral cameras are often 100 MB+).  For
 * large files, the client should switch to a direct-to-Storage upload and
 * then call this function with just the storage paths — but the current
 * port preserves the existing interface so the useDroneFlights hook works
 * unchanged.
 *
 * Deploy:  supabase functions deploy drone-upload
 *          (you'll also want to bump the function's body limit in the
 *           dashboard → Edge Functions → Settings if you plan to upload
 *           large TIFFs through it.)
 */
import { handleCors, jsonError, jsonResponse } from "../_shared/cors.ts";
import { getUser, getUserClient } from "../_shared/supabase.ts";

const BUCKET = "drone-flights";

const MANAGEMENT_ROLES = new Set([
  "super",
  "asst_super",
  "director",
  "foreman",
  "pro",
]);

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
  return parts.length > 1 ? (parts.pop() as string).toLowerCase() : "bin";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors();

  if (req.method === "GET") {
    // Health check
    return jsonResponse({ healthy: true, bucket: BUCKET });
  }

  if (req.method !== "POST") {
    return jsonError("Method not allowed", 405);
  }

  try {
    const user = await getUser(req);
    if (!user) return jsonError("Unauthorized", 401);

    const supabase = getUserClient(req);

    // Role check
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single();

    const role = (profile as { role?: string } | null)?.role;
    if (!role || !MANAGEMENT_ROLES.has(role)) {
      return jsonError(
        "Insufficient permissions. Management or foreman role required.",
        403,
      );
    }

    // Parse multipart form
    let formData: FormData;
    try {
      formData = await req.formData();
    } catch (err) {
      console.error("formData parse failed:", err);
      return jsonError(
        "Expected multipart/form-data. Did you set Content-Type correctly?",
        400,
      );
    }

    const file = formData.get("file");
    const preview = formData.get("preview");
    const flightDate = formData.get("flight_date");
    const band = formData.get("band");
    const source = formData.get("source");
    const notes = formData.get("notes");
    const bboxRaw = formData.get("bbox");

    if (!(file instanceof File)) {
      return jsonError("file is required", 400);
    }
    if (typeof flightDate !== "string" || !flightDate) {
      return jsonError("flight_date is required", 400);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(flightDate)) {
      return jsonError("flight_date must be YYYY-MM-DD", 400);
    }

    const validBands = ["ndvi", "ndre", "thermal", "rgb"];
    if (typeof band === "string" && band && !validBands.includes(band)) {
      return jsonError(
        `band must be one of: ${validBands.join(", ")}`,
        400,
      );
    }

    const fileCategory = classifyFile(file.name, file.type);
    if (!fileCategory) {
      return jsonError(
        "Unsupported file type. Upload a GeoTIFF, TIFF, PNG, or JPEG.",
        400,
      );
    }

    let bbox: Record<string, number> | null = null;
    if (typeof bboxRaw === "string" && bboxRaw) {
      try {
        bbox = JSON.parse(bboxRaw);
      } catch {
        return jsonError("bbox must be valid JSON", 400);
      }
    }

    // Upload main file
    const fileId = crypto.randomUUID();
    const ext = getExtension(file.name);
    const storagePath = `${flightDate}/${fileId}.${ext}`;
    const fileBytes = new Uint8Array(await file.arrayBuffer());

    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(storagePath, fileBytes, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });

    if (uploadError) {
      console.error("Storage upload error:", uploadError);
      return jsonError(`Storage upload failed: ${uploadError.message}`, 500);
    }

    let geotiffPath: string | null = null;
    let previewPngPath: string | null = null;

    if (fileCategory === "tiff") {
      geotiffPath = storagePath;
    } else {
      previewPngPath = storagePath;
    }

    // Optional preview
    if (preview instanceof File && fileCategory === "tiff") {
      const previewId = crypto.randomUUID();
      const previewExt = getExtension(preview.name);
      const previewPath = `${flightDate}/${previewId}.${previewExt}`;
      const previewBytes = new Uint8Array(await preview.arrayBuffer());

      const { error: previewUploadError } = await supabase.storage
        .from(BUCKET)
        .upload(previewPath, previewBytes, {
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

    // Insert row
    const { data: row, error: insertError } = await supabase
      .from("drone_flights")
      .insert({
        flight_date: flightDate,
        geotiff_path: geotiffPath,
        preview_png_path: previewPngPath,
        bbox: bbox,
        band: typeof band === "string" ? band || null : null,
        source: typeof source === "string" ? source || null : null,
        notes: typeof notes === "string" ? notes || null : null,
        uploaded_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Insert error:", insertError);
      return jsonError(`Database insert failed: ${insertError.message}`, 500);
    }

    return jsonResponse(row, 201);
  } catch (err) {
    console.error("Drone upload error:", err);
    return jsonError("Internal server error", 500);
  }
});
