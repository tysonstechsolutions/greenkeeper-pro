/**
 * Shared types for the on-device turf disease classifier.
 *
 * These types are used by the classifier engine (`ondevice-classifier.ts`),
 * the SmartDiagnosis UI component, and any future ONNX model integration.
 */

// ── Label file schema (mirrors public/models/turf-disease-v1/labels.json) ────

export interface TurfClassLabel {
  id: number;
  name: string;
  display: string;
  description: string;
}

export interface TurfLabelsManifest {
  version: string;
  classes: TurfClassLabel[];
  model_file: string;
  input_size: [number, number];
  model_status: "placeholder" | "ready";
}

// ── Classification result ────────────────────────────────────────────────────

export interface ClassificationPrediction {
  classId: number;
  className: string;
  displayName: string;
  confidence: number; // 0-1
  description: string;
}

export interface ClassificationResult {
  predictions: ClassificationPrediction[];
  source: "on-device" | "cloud" | "fallback";
  processingTimeMs: number;
}

// ── SmartDiagnosis component props ───────────────────────────────────────────

export interface SmartDiagnosisProps {
  imageBase64: string | null;
  onDiagnosisSelect?: (diagnosis: {
    className: string;
    displayName: string;
    confidence: number;
  }) => void;
}
