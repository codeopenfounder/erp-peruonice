import * as faceapi from "@vladmandic/face-api";

let loaded = false;
let loading: Promise<void> | null = null;

/**
 * Load face-api models (TinyFaceDetector, FaceLandmark68, FaceRecognition).
 * Singleton — safe to call multiple times.
 */
export async function loadFaceModels(): Promise<void> {
  if (loaded) return;
  if (loading) return loading;

  loading = (async () => {
    const modelPath = "/models";
    await Promise.all([
      faceapi.nets.tinyFaceDetector.loadFromUri(modelPath),
      faceapi.nets.faceLandmark68Net.loadFromUri(modelPath),
      faceapi.nets.faceRecognitionNet.loadFromUri(modelPath),
    ]);
    loaded = true;
  })();

  return loading;
}

export function areModelsLoaded(): boolean {
  return loaded;
}
