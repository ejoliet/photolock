import type { Box } from "../core/types";

export interface DetectFacesOptions {
  modelPath?: string;
  wasmPath?: string;
}

const FACE_BOX_PADDING = 0.1;

// AIDEV-NOTE: Q4 default — MediaPipe's FilesetResolver fetches the wasm and
// model files by URL, which the single-file build's `connect-src 'none'` CSP
// forbids. Inlining would need a custom loader; untested. See DEVELOPER.md.
export async function detectFaces(
  imageData: ImageData,
  opts?: DetectFacesOptions,
): Promise<Box[]> {
  if (import.meta.env.PHOTOLOCK_SINGLEFILE === "true") {
    throw new Error("Face detection is hosted-build only (Q4 default)");
  }

  const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");

  const wasmPath = opts?.wasmPath ?? `${import.meta.env.BASE_URL}wasm/mediapipe`;
  const modelPath =
    opts?.modelPath ?? `${import.meta.env.BASE_URL}models/blaze_face_short_range.tflite`;

  const fileset = await FilesetResolver.forVisionTasks(wasmPath);
  const detector = await FaceDetector.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: modelPath },
    runningMode: "IMAGE",
  });

  try {
    const result = detector.detect(imageData);
    const boxes: Box[] = [];
    for (const detection of result.detections) {
      const bb = detection.boundingBox;
      if (!bb) continue;
      const padX = bb.width * FACE_BOX_PADDING;
      const padY = bb.height * FACE_BOX_PADDING;
      boxes.push({
        x: bb.originX - padX,
        y: bb.originY - padY,
        w: bb.width + padX * 2,
        h: bb.height + padY * 2,
        source: "auto",
      });
    }
    return boxes;
  } finally {
    detector.close();
  }
}
