import * as faceapi from "@vladmandic/face-api";
import { loadFaceModels } from "./loader";

export interface FaceExtractionSuccess {
  success: true;
  descriptor: number[];
  box: { x: number; y: number; width: number; height: number };
  score: number;
}

export interface FaceExtractionError {
  success: false;
  error: "no_face" | "load_error";
  message: string;
}

export type FaceExtractionResult = FaceExtractionSuccess | FaceExtractionError;

const detectorOptions = new faceapi.TinyFaceDetectorOptions({
  inputSize: 320,
  scoreThreshold: 0.5,
});

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Error al cargar imagen"));
    img.src = src;
  });
}

/**
 * Extract a 128-dim face descriptor from an image URL.
 * Loads models on first call. Picks the highest-score face if multiple detected.
 */
export async function extractDescriptorFromUrl(
  imageUrl: string,
): Promise<FaceExtractionResult> {
  try {
    await loadFaceModels();
  } catch {
    return {
      success: false,
      error: "load_error",
      message: "Error al cargar modelos de reconocimiento facial",
    };
  }

  try {
    const img = await loadImage(imageUrl);

    const detections = await faceapi
      .detectAllFaces(img, detectorOptions)
      .withFaceLandmarks()
      .withFaceDescriptors();

    if (detections.length === 0) {
      return {
        success: false,
        error: "no_face",
        message: "No se detectó un rostro en la imagen",
      };
    }

    // Pick the detection with the highest confidence score
    const best = detections.reduce((a, b) =>
      a.detection.score > b.detection.score ? a : b,
    );

    const { x, y, width, height } = best.detection.box;

    return {
      success: true,
      descriptor: Array.from(best.descriptor),
      box: { x, y, width, height },
      score: best.detection.score,
    };
  } catch {
    return {
      success: false,
      error: "no_face",
      message: "Error al procesar la imagen para detección facial",
    };
  }
}

/**
 * Extract a face descriptor from a File object (e.g., from a file input).
 */
export async function extractDescriptorFromFile(
  file: File,
): Promise<FaceExtractionResult> {
  const url = URL.createObjectURL(file);
  try {
    return await extractDescriptorFromUrl(url);
  } finally {
    URL.revokeObjectURL(url);
  }
}
