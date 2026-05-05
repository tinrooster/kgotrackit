const DEFAULT_MAX_DIMENSION = 1600;
const DEFAULT_TARGET_BYTES = 1_800_000;
const MIN_JPEG_QUALITY = 0.35;

interface NormalizeImageOptions {
  maxDimension?: number;
  targetBytes?: number;
}

export function estimateDataUrlBytes(dataUrl: string): number {
  const base64 = dataUrl.split(",")[1] ?? "";
  return Math.ceil((base64.length * 3) / 4);
}

export async function normalizeImageFileToDataUrl(
  file: File,
  options: NormalizeImageOptions = {},
): Promise<string> {
  const { maxDimension = DEFAULT_MAX_DIMENSION, targetBytes = DEFAULT_TARGET_BYTES } = options;
  const rawDataUrl = await readFileAsDataUrl(file);
  const image = await loadDataUrlImage(rawDataUrl);

  const canvas = document.createElement("canvas");
  const { width, height } = fitIntoBounds(image.width, image.height, maxDimension);
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return rawDataUrl;
  }
  ctx.drawImage(image, 0, 0, width, height);

  let quality = 0.9;
  let normalized = canvas.toDataURL("image/jpeg", quality);
  while (estimateDataUrlBytes(normalized) > targetBytes && quality > MIN_JPEG_QUALITY) {
    quality -= 0.07;
    normalized = canvas.toDataURL("image/jpeg", quality);
  }

  return normalized;
}

function fitIntoBounds(sourceWidth: number, sourceHeight: number, maxDimension: number) {
  if (sourceWidth <= maxDimension && sourceHeight <= maxDimension) {
    return { width: sourceWidth, height: sourceHeight };
  }
  if (sourceWidth >= sourceHeight) {
    const ratio = maxDimension / sourceWidth;
    return {
      width: maxDimension,
      height: Math.max(1, Math.round(sourceHeight * ratio)),
    };
  }
  const ratio = maxDimension / sourceHeight;
  return {
    width: Math.max(1, Math.round(sourceWidth * ratio)),
    height: maxDimension,
  };
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read image file."));
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  });
}

function loadDataUrlImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not decode image."));
    image.src = dataUrl;
  });
}
