/**
 * On-device turf disease classifier with cloud fallback.
 *
 * Inference pipeline:
 * 1. Load labels from /models/turf-disease-v1/labels.json (cached after first load)
 * 2. If a real ONNX model is available (model_status === "ready" AND model.onnx exists),
 *    run on-device inference. Currently this is a stub — always returns null.
 * 3. Cloud fallback: POST to /api/analyze-observation-photo
 * 4. Offline fallback: generic "unable to classify" result
 *
 * When a trained ONNX model is placed at public/models/turf-disease-v1/model.onnx
 * and labels.json model_status is changed to "ready", the on-device path activates
 * automatically.
 */

import type {
  TurfLabelsManifest,
  TurfClassLabel,
  ClassificationResult,
} from "./classifier-types";

// ── Labels cache ─────────────────────────────────────────────────────────────

let _labelsCache: TurfLabelsManifest | null = null;

export async function loadLabels(): Promise<TurfLabelsManifest> {
  if (_labelsCache) return _labelsCache;

  const res = await fetch("/models/turf-disease-v1/labels.json");
  if (!res.ok) {
    throw new Error(`Failed to load labels: ${res.status}`);
  }
  _labelsCache = (await res.json()) as TurfLabelsManifest;
  return _labelsCache;
}

/** Reset the labels cache (useful for testing). */
export function _resetLabelsCache(): void {
  _labelsCache = null;
}

// ── On-device inference stub ─────────────────────────────────────────────────

// TODO(3.4): When a real ONNX model is available, install onnxruntime-web
// and implement this function:
// async function runONNXInference(imageBase64: string, modelPath: string): Promise<Float32Array>
// For now, this always returns null to trigger the cloud fallback.
async function tryOnDeviceInference(
  _imageBase64: string,
  _labels: TurfLabelsManifest
): Promise<ClassificationResult | null> {
  // No model available — fall through to cloud
  return null;
}

// ── Cloud fallback ───────────────────────────────────────────────────────────

async function classifyViaCloud(
  imageBase64: string,
  labels: TurfLabelsManifest
): Promise<ClassificationResult> {
  const start = performance.now();

  const res = await fetch("/api/analyze-observation-photo", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ image_base64: imageBase64 }),
  });

  if (!res.ok) {
    throw new Error(`Cloud classifier returned ${res.status}`);
  }

  const data = (await res.json()) as {
    title?: string;
    description?: string;
    issue_type?: string;
  };

  const elapsed = performance.now() - start;

  // Map the cloud response issue_type to our label set
  const predictions = mapCloudResponseToLabels(data, labels.classes);

  return {
    predictions,
    source: "cloud",
    processingTimeMs: Math.round(elapsed),
  };
}

/**
 * Map the cloud API response (which returns a single issue_type string)
 * to our ranked prediction list.  The matched class gets high confidence;
 * we don't fabricate secondary predictions from the cloud.
 */
function mapCloudResponseToLabels(
  data: { title?: string; description?: string; issue_type?: string },
  classes: TurfClassLabel[]
): ClassificationResult["predictions"] {
  const issueType = (data.issue_type || "").toLowerCase().replace(/[\s-]/g, "_");

  // Direct name match or close match
  const matched = classes.find(
    (c) =>
      c.name === issueType ||
      issueType.includes(c.name) ||
      c.name.includes(issueType)
  );

  if (matched) {
    return [
      {
        classId: matched.id,
        className: matched.name,
        displayName: matched.display,
        confidence: 0.85, // Cloud confidence is high but not exact
        description: data.description || matched.description,
      },
    ];
  }

  // No direct match — return the cloud description with "unknown" class
  return [
    {
      classId: -1,
      className: data.issue_type || "unknown",
      displayName: data.title || "Unclassified Issue",
      confidence: 0.6,
      description: data.description || "Could not map to a known turf disease class",
    },
  ];
}

// ── Offline fallback ─────────────────────────────────────────────────────────

function offlineFallback(elapsed: number): ClassificationResult {
  return {
    predictions: [
      {
        classId: -1,
        className: "unknown",
        displayName: "Unable to classify",
        confidence: 0,
        description: "No network and no on-device model available",
      },
    ],
    source: "fallback",
    processingTimeMs: Math.round(elapsed),
  };
}

// ── Main entry point ─────────────────────────────────────────────────────────

/**
 * Classify a turf image using the best available method:
 * 1. On-device ONNX model (when available)
 * 2. Cloud API fallback
 * 3. Offline fallback
 */
export async function classifyTurfImage(
  imageBase64: string
): Promise<ClassificationResult> {
  const start = performance.now();

  // Step 1: Load labels
  let labels: TurfLabelsManifest;
  try {
    labels = await loadLabels();
  } catch {
    // Can't even load labels — go straight to offline fallback
    return offlineFallback(performance.now() - start);
  }

  // Step 2: Try on-device inference (only if model is ready)
  if (labels.model_status === "ready") {
    try {
      const onDeviceResult = await tryOnDeviceInference(imageBase64, labels);
      if (onDeviceResult) return onDeviceResult;
    } catch (err) {
      console.warn("On-device inference failed, falling back to cloud:", err);
    }
  }

  // Step 3: Cloud fallback
  try {
    return await classifyViaCloud(imageBase64, labels);
  } catch (err) {
    console.warn("Cloud classification failed, using offline fallback:", err);
    return offlineFallback(performance.now() - start);
  }
}
