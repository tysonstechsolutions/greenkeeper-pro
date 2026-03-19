/**
 * Supabase Storage Utilities for Photo Management
 *
 * SETUP INSTRUCTIONS:
 * 1. Go to Supabase Dashboard → Storage
 * 2. Create a new bucket named "photos"
 * 3. Set the bucket to PUBLIC (for CDN access)
 * 4. Add the following RLS policies:
 *
 *    -- Allow authenticated users to upload to their own folder
 *    CREATE POLICY "Users can upload photos"
 *    ON storage.objects FOR INSERT
 *    TO authenticated
 *    WITH CHECK (bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text);
 *
 *    -- Allow authenticated users to read all photos
 *    CREATE POLICY "Users can read photos"
 *    ON storage.objects FOR SELECT
 *    TO authenticated
 *    USING (bucket_id = 'photos');
 *
 *    -- Allow authenticated users to delete their own photos
 *    CREATE POLICY "Users can delete own photos"
 *    ON storage.objects FOR DELETE
 *    TO authenticated
 *    USING (bucket_id = 'photos' AND (storage.foldername(name))[1] = auth.uid()::text);
 *
 *    -- Allow public read access (for CDN URLs)
 *    CREATE POLICY "Public read access"
 *    ON storage.objects FOR SELECT
 *    TO public
 *    USING (bucket_id = 'photos');
 */

import { createClient } from "./client";

const BUCKET_NAME = "photos";

/**
 * Generate a unique filename with UUID
 */
function generateUniqueFilename(ext: string): string {
  const uuid = crypto.randomUUID();
  return `${uuid}.${ext}`;
}

/**
 * Get the storage path for a photo
 * Format: {userId}/{year}/{month}/{filename}
 */
function getStoragePath(userId: string, filename: string): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  return `${userId}/${year}/${month}/${filename}`;
}

/**
 * Get file extension from File or filename
 */
function getFileExtension(file: File | string): string {
  const name = typeof file === "string" ? file : file.name;
  const parts = name.split(".");
  return parts.length > 1 ? parts.pop()!.toLowerCase() : "jpg";
}

export interface UploadResult {
  storagePath: string;
  publicUrl: string;
}

/**
 * Upload a photo file to Supabase Storage
 *
 * @param file - The file to upload
 * @param userId - The user's ID (used for folder organization)
 * @returns Object containing storagePath and publicUrl
 */
export async function uploadPhoto(
  file: File,
  userId: string
): Promise<UploadResult> {
  const supabase = createClient();
  const ext = getFileExtension(file);
  const filename = generateUniqueFilename(ext);
  const storagePath = getStoragePath(userId, filename);

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storagePath, file, {
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    console.error("Error uploading photo:", error);
    throw new Error(`Failed to upload photo: ${error.message}`);
  }

  const publicUrl = getPublicUrl(storagePath);

  return { storagePath, publicUrl };
}

/**
 * Upload a photo from a Blob (e.g., from camera capture)
 *
 * @param blob - The blob to upload
 * @param userId - The user's ID
 * @param ext - File extension (e.g., "jpg", "png")
 * @returns Object containing storagePath and publicUrl
 */
export async function uploadPhotoFromBlob(
  blob: Blob,
  userId: string,
  ext: string = "jpg"
): Promise<UploadResult> {
  const supabase = createClient();
  const filename = generateUniqueFilename(ext);
  const storagePath = getStoragePath(userId, filename);

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storagePath, blob, {
      contentType: `image/${ext === "jpg" ? "jpeg" : ext}`,
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    console.error("Error uploading blob:", error);
    throw new Error(`Failed to upload photo: ${error.message}`);
  }

  const publicUrl = getPublicUrl(storagePath);

  return { storagePath, publicUrl };
}

/**
 * Generate a thumbnail from an image file using canvas
 *
 * @param file - The image file to resize
 * @param maxWidth - Maximum width of the thumbnail (default: 400)
 * @returns Resized image as a Blob
 */
export async function generateThumbnail(
  file: File | Blob,
  maxWidth: number = 400
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      // Calculate new dimensions maintaining aspect ratio
      let width = img.width;
      let height = img.height;

      if (width > maxWidth) {
        height = (height * maxWidth) / width;
        width = maxWidth;
      }

      // Create canvas and draw resized image
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      ctx.drawImage(img, 0, 0, width, height);

      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Failed to create thumbnail blob"));
          }
        },
        "image/jpeg",
        0.8 // 80% quality for thumbnails
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image for thumbnail generation"));
    };

    img.src = url;
  });
}

/**
 * Upload a thumbnail to storage
 *
 * @param blob - The thumbnail blob
 * @param userId - The user's ID
 * @returns Object containing storagePath and publicUrl
 */
export async function uploadThumbnail(
  blob: Blob,
  userId: string
): Promise<UploadResult> {
  const supabase = createClient();
  const filename = `thumb_${generateUniqueFilename("jpg")}`;
  const storagePath = getStoragePath(userId, filename);

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .upload(storagePath, blob, {
      contentType: "image/jpeg",
      cacheControl: "3600",
      upsert: false,
    });

  if (error) {
    console.error("Error uploading thumbnail:", error);
    throw new Error(`Failed to upload thumbnail: ${error.message}`);
  }

  const publicUrl = getPublicUrl(storagePath);

  return { storagePath, publicUrl };
}

/**
 * Delete a photo from storage
 *
 * @param storagePath - The path to the file in storage
 */
export async function deletePhoto(storagePath: string): Promise<void> {
  const supabase = createClient();

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove([storagePath]);

  if (error) {
    console.error("Error deleting photo:", error);
    throw new Error(`Failed to delete photo: ${error.message}`);
  }
}

/**
 * Delete multiple photos from storage
 *
 * @param storagePaths - Array of paths to delete
 */
export async function deletePhotos(storagePaths: string[]): Promise<void> {
  if (storagePaths.length === 0) return;

  const supabase = createClient();

  const { error } = await supabase.storage
    .from(BUCKET_NAME)
    .remove(storagePaths);

  if (error) {
    console.error("Error deleting photos:", error);
    throw new Error(`Failed to delete photos: ${error.message}`);
  }
}

/**
 * Get the public CDN URL for a storage path
 *
 * @param storagePath - The path to the file in storage
 * @returns Public URL for the file
 */
export function getPublicUrl(storagePath: string): string {
  const supabase = createClient();

  const { data } = supabase.storage
    .from(BUCKET_NAME)
    .getPublicUrl(storagePath);

  return data.publicUrl;
}

/**
 * Add a timestamp overlay to an image using canvas
 *
 * @param file - The image file
 * @param timestamp - Optional custom timestamp (defaults to now)
 * @returns New image blob with timestamp overlay
 */
export async function addTimestampOverlay(
  file: File | Blob,
  timestamp?: Date
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;

      const ctx = canvas.getContext("2d");
      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      // Draw original image
      ctx.drawImage(img, 0, 0);

      // Format timestamp
      const date = timestamp || new Date();
      const dateStr = date.toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
      });
      const timeStr = date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
      });
      const text = `${dateStr} ${timeStr}`;

      // Calculate font size based on image width
      const fontSize = Math.max(16, Math.floor(img.width / 30));
      ctx.font = `${fontSize}px sans-serif`;

      // Measure text
      const textMetrics = ctx.measureText(text);
      const textWidth = textMetrics.width;
      const textHeight = fontSize;
      const padding = 8;

      // Draw semi-transparent background strip
      const bgHeight = textHeight + padding * 2;
      const bgY = img.height - bgHeight;
      ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
      ctx.fillRect(img.width - textWidth - padding * 2, bgY, textWidth + padding * 2, bgHeight);

      // Draw white text
      ctx.fillStyle = "white";
      ctx.textBaseline = "bottom";
      ctx.fillText(
        text,
        img.width - textWidth - padding,
        img.height - padding
      );

      // Convert to blob
      canvas.toBlob(
        (blob) => {
          if (blob) {
            resolve(blob);
          } else {
            reject(new Error("Failed to create timestamped image blob"));
          }
        },
        "image/jpeg",
        0.92
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Failed to load image for timestamp overlay"));
    };

    img.src = url;
  });
}
