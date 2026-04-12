/**
 * Illinois Restricted Use Pesticide (RUP) Application Record Mapper
 *
 * Per 415 ILCS 60 / 8 IAC 250, Illinois requires 11 specific fields
 * for every restricted-use pesticide application. This module maps
 * existing chemical_applications data into the state-mandated structure
 * and validates completeness.
 */

import type {
  ChemicalApplication,
  ChemicalProduct,
  Profile,
} from "@/types/database";

// ── IL RUP Record (matches state form fields) ──────────────────────────────

export interface ILRupRecord {
  /** 1. Date of application */
  applicationDate: string;
  /** 2a. Start time of application */
  startTime: string | null;
  /** 2b. End time of application */
  endTime: string | null;
  /** 3. Applicator name */
  applicatorName: string;
  /** 3b. IL Dept of Agriculture certification/license number */
  certificationNumber: string | null;
  /** 4. Location of application (site, zone, hole) */
  location: string;
  /** 5a. Product name */
  productName: string;
  /** 5b. EPA Registration Number */
  epaRegNumber: string | null;
  /** 6. Total amount of pesticide applied */
  totalAmount: string;
  /** 7. Rate of application */
  applicationRate: string;
  /** 8. Target pest */
  targetPest: string | null;
  /** 9. Wind speed and direction */
  windSpeed: string | null;
  /** 10. Temperature at time of application */
  temperature: string | null;
}

// ── Required field labels (for validation messages) ─────────────────────────

const REQUIRED_FIELD_LABELS: { key: keyof ILRupRecord; label: string }[] = [
  { key: "applicationDate", label: "Date of Application" },
  { key: "startTime", label: "Start Time" },
  { key: "endTime", label: "End Time" },
  { key: "applicatorName", label: "Applicator Name" },
  { key: "certificationNumber", label: "Certification Number" },
  { key: "location", label: "Application Location" },
  { key: "productName", label: "Product Name" },
  { key: "epaRegNumber", label: "EPA Registration Number" },
  { key: "totalAmount", label: "Total Amount Applied" },
  { key: "applicationRate", label: "Application Rate" },
  { key: "targetPest", label: "Target Pest" },
  { key: "windSpeed", label: "Wind Speed & Direction" },
  { key: "temperature", label: "Temperature" },
];

export const IL_RUP_TOTAL_FIELDS = REQUIRED_FIELD_LABELS.length;

// ── Mapper ──────────────────────────────────────────────────────────────────

/**
 * Map a chemical application row (with joined product + applicator profile)
 * into the Illinois RUP record structure.
 */
export function mapToILRupRecord(
  application: ChemicalApplication,
  product: ChemicalProduct | null,
  applicator: Profile | null,
  courseName: string = "Veterans Memorial Golf Course"
): ILRupRecord {
  // Build location string from zone_ids and hole_numbers
  const parts: string[] = [];
  if (application.hole_numbers && application.hole_numbers.length > 0) {
    const nums = application.hole_numbers.sort((a, b) => a - b);
    parts.push(nums.length === 1 ? `Hole #${nums[0]}` : `Holes #${nums.join(", #")}`);
  }
  if (parts.length === 0 && application.zone_ids && application.zone_ids.length > 0) {
    parts.push(`${application.zone_ids.length} zone(s)`);
  }
  parts.push(courseName);
  const location = parts.join(", ");

  // Build total amount string
  const totalAmount =
    application.total_amount_used != null
      ? `${application.total_amount_used} ${product?.unit_of_measure || "units"}`
      : "";

  // Build application rate string
  const applicationRate = application.application_rate || "";

  // Build wind string
  let windSpeed: string | null = null;
  if (application.weather_wind_mph != null) {
    windSpeed = `${application.weather_wind_mph} mph`;
    if (application.weather_wind_direction) {
      windSpeed += ` ${application.weather_wind_direction}`;
    }
  }

  // Temperature
  const temperature =
    application.weather_temp_f != null ? `${application.weather_temp_f}\u00B0F` : null;

  // Certification number — look for an IL pesticide applicator cert in the
  // applicator's certifications array, or fall back to the per-application
  // applicator_license field.
  let certificationNumber: string | null = application.applicator_license || null;
  if (!certificationNumber && applicator?.certifications) {
    const cert = applicator.certifications.find(
      (c) =>
        c.license_number &&
        (c.name.toLowerCase().includes("pesticide") ||
          c.name.toLowerCase().includes("applicator") ||
          c.name.toLowerCase().includes("rup"))
    );
    if (cert?.license_number) {
      certificationNumber = cert.license_number;
    }
  }

  return {
    applicationDate: application.application_date,
    startTime: application.application_time || null,
    endTime: application.end_time || null,
    applicatorName: applicator?.full_name || "Unknown Applicator",
    certificationNumber,
    location,
    productName: product?.product_name || "Unknown Product",
    epaRegNumber: product?.epa_registration || null,
    totalAmount,
    applicationRate,
    targetPest: application.target_pest || null,
    windSpeed,
    temperature,
  };
}

// ── Validator ───────────────────────────────────────────────────────────────

export interface ILRupValidationResult {
  valid: boolean;
  completedFields: number;
  totalFields: number;
  missingFields: string[];
}

/**
 * Validate an IL RUP record for completeness.
 * Returns which of the 13 form fields are missing or empty.
 */
export function validateILRupRecord(record: ILRupRecord): ILRupValidationResult {
  const missingFields: string[] = [];

  for (const { key, label } of REQUIRED_FIELD_LABELS) {
    const value = record[key];
    if (value === null || value === undefined || String(value).trim() === "") {
      missingFields.push(label);
    }
  }

  const completedFields = REQUIRED_FIELD_LABELS.length - missingFields.length;

  return {
    valid: missingFields.length === 0,
    completedFields,
    totalFields: REQUIRED_FIELD_LABELS.length,
    missingFields,
  };
}
