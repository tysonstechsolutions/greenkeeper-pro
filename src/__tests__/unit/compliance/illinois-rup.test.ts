import { describe, it, expect } from "vitest";
import {
  mapToILRupRecord,
  validateILRupRecord,
  IL_RUP_TOTAL_FIELDS,
  type ApplicatorProfile,
  type ILRupRecord,
} from "@/lib/compliance/illinois-rup";
import type {
  ChemicalApplication,
  ChemicalProduct,
} from "@/types/database";

// ── Test fixtures ───────────────────────────────────────────────────────────

function makeApplication(overrides: Partial<ChemicalApplication> = {}): ChemicalApplication {
  return {
    id: "app-1",
    product_id: "prod-1",
    applied_by: "user-1",
    applicator_license: "IL-12345",
    application_date: "2026-04-10",
    application_time: "08:30",
    end_time: "10:15",
    zone_ids: ["zone-green-1"],
    hole_numbers: [3],
    area_treated_sqft: 5000,
    application_rate: "2 oz/1000 sqft",
    total_amount_used: 10,
    method: "spray",
    weather_temp_f: 68,
    weather_wind_mph: 5,
    weather_wind_direction: "NW",
    weather_humidity: 65,
    weather_conditions: "Clear",
    target_pest: "Dollar Spot",
    rei_expires_at: null,
    notes: null,
    task_id: null,
    created_at: "2026-04-10T08:30:00Z",
    ...overrides,
  };
}

function makeProduct(overrides: Partial<ChemicalProduct> = {}): ChemicalProduct {
  return {
    id: "prod-1",
    product_name: "Banner MAXX II",
    manufacturer: "Syngenta",
    epa_registration: "100-1570",
    active_ingredient: "Propiconazole",
    product_type: "fungicide",
    unit_of_measure: "fl oz",
    current_inventory: 128,
    reorder_threshold: 32,
    cost_per_unit: 2.5,
    sds_storage_path: null,
    rei_hours: 24,
    signal_word: "caution",
    notes: null,
    is_active: true,
    created_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeProfile(overrides: Partial<ApplicatorProfile> = {}): ApplicatorProfile {
  return {
    full_name: "Tyson Bruce",
    certifications: [
      {
        name: "IL Pesticide Applicator",
        issued_date: "2024-01-15",
        expiry_date: "2027-01-15",
        license_number: "IL-67890",
      },
    ],
    ...overrides,
  };
}

// ── mapToILRupRecord ────────────────────────────────────────────────────────

describe("mapToILRupRecord", () => {
  it("maps a complete application to all IL RUP fields", () => {
    const record = mapToILRupRecord(makeApplication(), makeProduct(), makeProfile());

    expect(record.applicationDate).toBe("2026-04-10");
    expect(record.startTime).toBe("08:30");
    expect(record.endTime).toBe("10:15");
    expect(record.applicatorName).toBe("Tyson Bruce");
    expect(record.certificationNumber).toBe("IL-12345"); // from application.applicator_license
    expect(record.location).toContain("Hole #3");
    expect(record.location).toContain("Veterans Memorial Golf Course");
    expect(record.productName).toBe("Banner MAXX II");
    expect(record.epaRegNumber).toBe("100-1570");
    expect(record.totalAmount).toBe("10 fl oz");
    expect(record.applicationRate).toBe("2 oz/1000 sqft");
    expect(record.targetPest).toBe("Dollar Spot");
    expect(record.windSpeed).toBe("5 mph NW");
    expect(record.temperature).toBe("68\u00B0F");
  });

  it("falls back to profile certification when applicator_license is null", () => {
    const app = makeApplication({ applicator_license: null });
    const record = mapToILRupRecord(app, makeProduct(), makeProfile());

    expect(record.certificationNumber).toBe("IL-67890"); // from profile certifications
  });

  it("handles null product gracefully", () => {
    const record = mapToILRupRecord(makeApplication(), null, makeProfile());

    expect(record.productName).toBe("Unknown Product");
    expect(record.epaRegNumber).toBeNull();
    expect(record.totalAmount).toBe("10 units"); // falls back to 'units'
  });

  it("handles null applicator gracefully", () => {
    const app = makeApplication({ applicator_license: null });
    const record = mapToILRupRecord(app, makeProduct(), null);

    expect(record.applicatorName).toBe("Unknown Applicator");
    expect(record.certificationNumber).toBeNull();
  });

  it("formats multiple hole numbers correctly", () => {
    const app = makeApplication({ hole_numbers: [1, 3, 5] });
    const record = mapToILRupRecord(app, makeProduct(), makeProfile());

    expect(record.location).toContain("Holes #1, #3, #5");
  });

  it("uses zone count when no hole numbers are provided", () => {
    const app = makeApplication({ hole_numbers: null, zone_ids: ["z1", "z2", "z3"] });
    const record = mapToILRupRecord(app, makeProduct(), makeProfile());

    expect(record.location).toContain("3 zone(s)");
  });

  it("handles wind speed without direction", () => {
    const app = makeApplication({ weather_wind_direction: null });
    const record = mapToILRupRecord(app, makeProduct(), makeProfile());

    expect(record.windSpeed).toBe("5 mph");
  });
});

// ── validateILRupRecord ─────────────────────────────────────────────────────

describe("validateILRupRecord", () => {
  it("returns valid=true for a complete record", () => {
    const record = mapToILRupRecord(makeApplication(), makeProduct(), makeProfile());
    const result = validateILRupRecord(record);

    expect(result.valid).toBe(true);
    expect(result.missingFields).toHaveLength(0);
    expect(result.completedFields).toBe(result.totalFields);
  });

  it("returns valid=false with correct missing fields for incomplete record", () => {
    const app = makeApplication({
      applicator_license: null,
      weather_temp_f: null,
      weather_wind_mph: null,
    });
    const profile = makeProfile({ certifications: [] });
    const record = mapToILRupRecord(app, makeProduct(), profile);
    const result = validateILRupRecord(record);

    expect(result.valid).toBe(false);
    expect(result.missingFields).toContain("Certification Number");
    expect(result.missingFields).toContain("Temperature");
    expect(result.missingFields).toContain("Wind Speed & Direction");
    expect(result.missingFields).toHaveLength(3);
    expect(result.completedFields).toBe(IL_RUP_TOTAL_FIELDS - 3);
  });

  it("counts totalFields correctly", () => {
    const record = mapToILRupRecord(makeApplication(), makeProduct(), makeProfile());
    const result = validateILRupRecord(record);

    expect(result.totalFields).toBe(IL_RUP_TOTAL_FIELDS);
    expect(result.totalFields).toBe(13);
  });

  it("detects all missing fields on a minimal record", () => {
    const minimal: ILRupRecord = {
      applicationDate: "",
      startTime: null,
      endTime: null,
      applicatorName: "",
      certificationNumber: null,
      location: "",
      productName: "",
      epaRegNumber: null,
      totalAmount: "",
      applicationRate: "",
      targetPest: null,
      windSpeed: null,
      temperature: null,
    };
    const result = validateILRupRecord(minimal);

    expect(result.valid).toBe(false);
    expect(result.missingFields).toHaveLength(13);
    expect(result.completedFields).toBe(0);
  });

  it("treats whitespace-only strings as missing", () => {
    const record = mapToILRupRecord(makeApplication(), makeProduct(), makeProfile());
    record.targetPest = "   ";
    const result = validateILRupRecord(record);

    expect(result.missingFields).toContain("Target Pest");
  });
});
