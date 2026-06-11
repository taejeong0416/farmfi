// base64 시그니처로 이미지 media type 판별 (AI Vision API에 정확한 타입 전달용)
export type ImageMediaType = "image/jpeg" | "image/png" | "image/webp" | "image/gif";

export function detectImageMediaType(base64: string): ImageMediaType {
  if (base64.startsWith("/9j/")) return "image/jpeg";
  if (base64.startsWith("iVBOR")) return "image/png";
  if (base64.startsWith("UklGR")) return "image/webp";
  if (base64.startsWith("R0lGOD")) return "image/gif";
  return "image/png";
}
