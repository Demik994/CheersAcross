const MAX_DIMENSION = 1600;
const JPEG_QUALITY = 0.85;

async function loadImage(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      // "from-image" poštuje EXIF rotaciju (slike s mobitela znaju biti okrenute)
      return await createImageBitmap(file, { imageOrientation: "from-image" });
    } catch {
      // stariji Safari — idemo preko <img>
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Smanji fotografiju na max 1600px i spremi kao JPEG.
 * Fotke s mobitela imaju 3–10 MB — ovako upload traje sekundu
 * umjesto pola minute na mobilnom internetu, a tekstura je lakša za GPU.
 */
export async function compressImage(file: File): Promise<Blob> {
  const source = await loadImage(file);
  const scale = Math.min(1, MAX_DIMENSION / Math.max(source.width, source.height));
  const width = Math.round(source.width * scale);
  const height = Math.round(source.height * scale);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Preglednik ne podržava obradu slike");
  ctx.drawImage(source, 0, 0, width, height);
  if ("close" in source) source.close();

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Obrada slike nije uspjela"))),
      "image/jpeg",
      JPEG_QUALITY,
    );
  });
}
