/**
 * EXIF Extraction Utilities
 *
 * Lightweight EXIF parser for extracting GPS coordinates and datetime
 * from JPEG images. Falls back to browser geolocation when EXIF GPS
 * is not available.
 */

export interface GPSCoordinates {
  lat: number;
  lng: number;
}

export interface ExifData {
  gps: GPSCoordinates | null;
  dateTime: Date | null;
}

// EXIF tag constants
const EXIF_START = 0xffe1;
const EXIF_HEADER = 0x45786966; // "Exif"
const TIFF_LITTLE_ENDIAN = 0x4949; // "II"
const TIFF_BIG_ENDIAN = 0x4d4d; // "MM"

// EXIF IFD tags
const TAG_EXIF_OFFSET = 0x8769;
const TAG_GPS_INFO_OFFSET = 0x8825;
const TAG_DATE_TIME_ORIGINAL = 0x9003;
const TAG_DATE_TIME_DIGITIZED = 0x9004;

// GPS tags
const TAG_GPS_LATITUDE_REF = 0x0001;
const TAG_GPS_LATITUDE = 0x0002;
const TAG_GPS_LONGITUDE_REF = 0x0003;
const TAG_GPS_LONGITUDE = 0x0004;

/**
 * Read bytes from a DataView
 */
function readString(dataView: DataView, offset: number, length: number): string {
  let str = "";
  for (let i = 0; i < length; i++) {
    const char = dataView.getUint8(offset + i);
    if (char === 0) break;
    str += String.fromCharCode(char);
  }
  return str;
}

/**
 * Convert GPS DMS (degrees, minutes, seconds) to decimal degrees
 */
function dmsToDecimal(degrees: number, minutes: number, seconds: number, ref: string): number {
  let decimal = degrees + minutes / 60 + seconds / 3600;
  if (ref === "S" || ref === "W") {
    decimal = -decimal;
  }
  return decimal;
}

/**
 * Read a rational value (two 32-bit integers as numerator/denominator)
 */
function readRational(dataView: DataView, offset: number, littleEndian: boolean): number {
  const numerator = dataView.getUint32(offset, littleEndian);
  const denominator = dataView.getUint32(offset + 4, littleEndian);
  return denominator !== 0 ? numerator / denominator : 0;
}

/**
 * Parse EXIF IFD entries
 */
function parseIFD(
  dataView: DataView,
  tiffOffset: number,
  ifdOffset: number,
  littleEndian: boolean
): Map<number, { type: number; count: number; valueOffset: number }> {
  const tags = new Map();
  const absoluteOffset = tiffOffset + ifdOffset;

  if (absoluteOffset + 2 > dataView.byteLength) return tags;

  const numEntries = dataView.getUint16(absoluteOffset, littleEndian);

  for (let i = 0; i < numEntries; i++) {
    const entryOffset = absoluteOffset + 2 + i * 12;
    if (entryOffset + 12 > dataView.byteLength) break;

    const tag = dataView.getUint16(entryOffset, littleEndian);
    const type = dataView.getUint16(entryOffset + 2, littleEndian);
    const count = dataView.getUint32(entryOffset + 4, littleEndian);

    // Value or offset to value
    let valueOffset = entryOffset + 8;

    // If value doesn't fit in 4 bytes, the entry contains an offset
    const typeSizes: Record<number, number> = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 7: 1, 9: 4, 10: 8 };
    const typeSize = typeSizes[type] || 1;
    if (count * typeSize > 4) {
      valueOffset = tiffOffset + dataView.getUint32(entryOffset + 8, littleEndian);
    }

    tags.set(tag, { type, count, valueOffset });
  }

  return tags;
}

/**
 * Extract GPS coordinates from EXIF data
 */
function extractGPSFromExif(
  dataView: DataView,
  tiffOffset: number,
  gpsOffset: number,
  littleEndian: boolean
): GPSCoordinates | null {
  const gpsTags = parseIFD(dataView, tiffOffset, gpsOffset, littleEndian);

  const latRef = gpsTags.get(TAG_GPS_LATITUDE_REF);
  const lat = gpsTags.get(TAG_GPS_LATITUDE);
  const lngRef = gpsTags.get(TAG_GPS_LONGITUDE_REF);
  const lng = gpsTags.get(TAG_GPS_LONGITUDE);

  if (!latRef || !lat || !lngRef || !lng) {
    return null;
  }

  try {
    const latRefStr = readString(dataView, latRef.valueOffset, 1);
    const lngRefStr = readString(dataView, lngRef.valueOffset, 1);

    const latDeg = readRational(dataView, lat.valueOffset, littleEndian);
    const latMin = readRational(dataView, lat.valueOffset + 8, littleEndian);
    const latSec = readRational(dataView, lat.valueOffset + 16, littleEndian);

    const lngDeg = readRational(dataView, lng.valueOffset, littleEndian);
    const lngMin = readRational(dataView, lng.valueOffset + 8, littleEndian);
    const lngSec = readRational(dataView, lng.valueOffset + 16, littleEndian);

    return {
      lat: dmsToDecimal(latDeg, latMin, latSec, latRefStr),
      lng: dmsToDecimal(lngDeg, lngMin, lngSec, lngRefStr),
    };
  } catch {
    return null;
  }
}

/**
 * Extract datetime from EXIF data
 */
function extractDateTimeFromExif(
  dataView: DataView,
  tiffOffset: number,
  exifOffset: number,
  littleEndian: boolean
): Date | null {
  const exifTags = parseIFD(dataView, tiffOffset, exifOffset, littleEndian);

  // Try DateTimeOriginal first, then DateTimeDigitized
  const dateTag = exifTags.get(TAG_DATE_TIME_ORIGINAL) || exifTags.get(TAG_DATE_TIME_DIGITIZED);

  if (!dateTag) {
    return null;
  }

  try {
    // Date format: "YYYY:MM:DD HH:MM:SS"
    const dateStr = readString(dataView, dateTag.valueOffset, 19);
    const [datePart, timePart] = dateStr.split(" ");
    if (!datePart || !timePart) return null;

    const [year, month, day] = datePart.split(":").map(Number);
    const [hour, minute, second] = timePart.split(":").map(Number);

    return new Date(year, month - 1, day, hour, minute, second);
  } catch {
    return null;
  }
}

/**
 * Parse EXIF data from a JPEG ArrayBuffer
 */
function parseExif(buffer: ArrayBuffer): ExifData {
  const dataView = new DataView(buffer);
  const result: ExifData = { gps: null, dateTime: null };

  // Check for JPEG SOI marker
  if (dataView.getUint16(0) !== 0xffd8) {
    return result;
  }

  // Find EXIF APP1 marker
  let offset = 2;
  while (offset < dataView.byteLength - 4) {
    const marker = dataView.getUint16(offset);

    if (marker === EXIF_START) {
      const length = dataView.getUint16(offset + 2);

      // Check for "Exif\0\0" header
      if (dataView.getUint32(offset + 4) === EXIF_HEADER) {
        const tiffOffset = offset + 10; // Start of TIFF header

        // Check byte order
        const byteOrder = dataView.getUint16(tiffOffset);
        const littleEndian = byteOrder === TIFF_LITTLE_ENDIAN;

        if (byteOrder !== TIFF_LITTLE_ENDIAN && byteOrder !== TIFF_BIG_ENDIAN) {
          return result;
        }

        // Get IFD0 offset
        const ifd0Offset = dataView.getUint32(tiffOffset + 4, littleEndian);
        const ifd0Tags = parseIFD(dataView, tiffOffset, ifd0Offset, littleEndian);

        // Get GPS IFD offset
        const gpsTag = ifd0Tags.get(TAG_GPS_INFO_OFFSET);
        if (gpsTag) {
          const gpsOffset = dataView.getUint32(gpsTag.valueOffset, littleEndian);
          result.gps = extractGPSFromExif(dataView, tiffOffset, gpsOffset, littleEndian);
        }

        // Get EXIF IFD offset for datetime
        const exifTag = ifd0Tags.get(TAG_EXIF_OFFSET);
        if (exifTag) {
          const exifOffset = dataView.getUint32(exifTag.valueOffset, littleEndian);
          result.dateTime = extractDateTimeFromExif(dataView, tiffOffset, exifOffset, littleEndian);
        }

        break;
      }

      offset += 2 + length;
    } else if ((marker & 0xff00) === 0xff00) {
      // Skip other markers
      const length = dataView.getUint16(offset + 2);
      offset += 2 + length;
    } else {
      break;
    }
  }

  return result;
}

/**
 * Extract GPS coordinates from a JPEG file's EXIF data
 *
 * @param file - The image file to extract GPS from
 * @returns GPS coordinates or null if not found
 */
export async function extractGPS(file: File): Promise<GPSCoordinates | null> {
  try {
    // Only process JPEG files
    if (!file.type.includes("jpeg") && !file.type.includes("jpg")) {
      return null;
    }

    // Read first 128KB which should contain EXIF data
    const slice = file.slice(0, 128 * 1024);
    const buffer = await slice.arrayBuffer();
    const exifData = parseExif(buffer);

    return exifData.gps;
  } catch (error) {
    console.error("Error extracting GPS from EXIF:", error);
    return null;
  }
}

/**
 * Extract datetime from a JPEG file's EXIF data
 *
 * @param file - The image file to extract datetime from
 * @returns Date when photo was taken or null if not found
 */
export async function extractDateTime(file: File): Promise<Date | null> {
  try {
    // Only process JPEG files
    if (!file.type.includes("jpeg") && !file.type.includes("jpg")) {
      return null;
    }

    // Read first 128KB which should contain EXIF data
    const slice = file.slice(0, 128 * 1024);
    const buffer = await slice.arrayBuffer();
    const exifData = parseExif(buffer);

    return exifData.dateTime;
  } catch (error) {
    console.error("Error extracting datetime from EXIF:", error);
    return null;
  }
}

/**
 * Extract all available EXIF data from a file
 *
 * @param file - The image file
 * @returns EXIF data object with gps and dateTime
 */
export async function extractExifData(file: File): Promise<ExifData> {
  try {
    // Only process JPEG files
    if (!file.type.includes("jpeg") && !file.type.includes("jpg")) {
      return { gps: null, dateTime: null };
    }

    // Read first 128KB which should contain EXIF data
    const slice = file.slice(0, 128 * 1024);
    const buffer = await slice.arrayBuffer();
    return parseExif(buffer);
  } catch (error) {
    console.error("Error extracting EXIF data:", error);
    return { gps: null, dateTime: null };
  }
}

/**
 * Get GPS coordinates from browser geolocation API
 *
 * @param options - Geolocation options
 * @returns GPS coordinates or null if denied/unavailable
 */
export async function getBrowserGeolocation(
  options?: PositionOptions
): Promise<GPSCoordinates | null> {
  if (!navigator.geolocation) {
    console.warn("Geolocation not supported by this browser");
    return null;
  }

  const defaultOptions: PositionOptions = {
    enableHighAccuracy: true,
    timeout: 10000,
    maximumAge: 60000, // Cache for 1 minute
    ...options,
  };

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        });
      },
      (error) => {
        console.warn("Geolocation error:", error.message);
        resolve(null);
      },
      defaultOptions
    );
  });
}

/**
 * Get GPS coordinates, trying EXIF first then falling back to browser geolocation
 *
 * @param file - The image file to check for EXIF GPS
 * @returns GPS coordinates from EXIF or browser, or null if unavailable
 */
export async function getGPSWithFallback(file: File): Promise<GPSCoordinates | null> {
  // Try EXIF first
  const exifGPS = await extractGPS(file);
  if (exifGPS) {
    return exifGPS;
  }

  // Fall back to browser geolocation
  return getBrowserGeolocation();
}
