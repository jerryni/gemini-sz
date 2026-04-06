const TWO_MIB = 2 * 1024 * 1024;
/** Align with D1 single-column limit in lib/db.ts (base64 is ~4/3 of binary). */
const D1_SAFE_BASE64_CHARS = 1_900_000;
const MAX_BINARY_BYTES = Math.min(TWO_MIB, Math.floor((D1_SAFE_BASE64_CHARS * 3) / 4));

const blobToBase64 = (blob: Blob) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Unexpected FileReader result."));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("FileReader failed."));
    reader.readAsDataURL(blob);
  });

const canvasToJpegBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
          return;
        }
        reject(new Error("Canvas toBlob returned null."));
      },
      "image/jpeg",
      quality
    );
  });

type CompressedImagePayload = {
  mimeType: string;
  data: string;
  previewBlob: Blob;
};

/**
 * JPEG re-encode + scale down until under ~2MiB raw (and D1-safe base64).
 */
export async function compressImageFileForUpload(file: File): Promise<CompressedImagePayload> {
  let bitmap: ImageBitmap;

  try {
    bitmap = await createImageBitmap(file);
  } catch {
    if (file.size <= MAX_BINARY_BYTES) {
      const data = await blobToBase64(file);
      if (data.length <= D1_SAFE_BASE64_CHARS) {
        return { mimeType: file.type || "application/octet-stream", data, previewBlob: file };
      }
    }
    throw new Error("无法读取或压缩此图片，请使用 JPEG、PNG 或 WebP。");
  }

  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");

  if (!ctx) {
    bitmap.close();
    throw new Error("浏览器不支持画布压缩。");
  }

  try {
    let maxSide = Math.min(4096, Math.max(bitmap.width, bitmap.height));
    let bestBlob: Blob | null = null;

    while (maxSide >= 128) {
      const scale = maxSide / Math.max(bitmap.width, bitmap.height);
      const width = Math.max(1, Math.round(bitmap.width * scale));
      const height = Math.max(1, Math.round(bitmap.height * scale));
      canvas.width = width;
      canvas.height = height;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(bitmap, 0, 0, width, height);

      for (let quality = 0.9; quality >= 0.42; quality -= 0.06) {
        const blob = await canvasToJpegBlob(canvas, quality);
        if (!bestBlob || blob.size < bestBlob.size) {
          bestBlob = blob;
        }
        if (blob.size <= MAX_BINARY_BYTES) {
          const data = await blobToBase64(blob);
          if (data.length <= D1_SAFE_BASE64_CHARS) {
            return { mimeType: "image/jpeg", data, previewBlob: blob };
          }
        }
      }

      maxSide = Math.floor(maxSide * 0.82);
    }

    if (bestBlob) {
      const data = await blobToBase64(bestBlob);
      if (data.length <= D1_SAFE_BASE64_CHARS) {
        return { mimeType: "image/jpeg", data, previewBlob: bestBlob };
      }
    }

    throw new Error("图片仍过大，请换一张较小的图。");
  } finally {
    bitmap.close();
  }
}
