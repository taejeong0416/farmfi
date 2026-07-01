import { NextRequest, NextResponse } from "next/server";
import { uploadImage } from "@/lib/storage";
import { getServerSession } from "@/lib/auth";

const MAX_BYTES = 8 * 1024 * 1024; // 8MB

/**
 * 매직바이트로 실제 이미지 타입을 판별한다. 클라이언트가 보낸 Content-Type은
 * 위조 가능하므로 신뢰하지 않는다. SVG(텍스트 기반)는 바이너리 시그니처가 없어
 * 자동 거부되어 저장형 XSS를 차단한다. 반환: 허용 MIME 또는 null.
 */
function sniffImageMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47)
    return "image/png";
  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  // GIF: 47 49 46 38 (GIF8)
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x38)
    return "image/gif";
  // WEBP: RIFF....WEBP
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  )
    return "image/webp";
  return null;
}

export async function POST(request: NextRequest) {
  try {
    // 인증 필수 — 익명 스토리지 남용 방지. 신원은 세션(JWT)에서만.
    const session = await getServerSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const form = await request.formData();
    const file = form.get("file");

    if (!file || typeof file === "string") {
      return NextResponse.json(
        { error: "No file provided (field 'file')" },
        { status: 400 }
      );
    }

    if (file.size > MAX_BYTES) {
      return NextResponse.json(
        { error: "File exceeds 8MB limit" },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    // Defense in depth: re-check size after buffering.
    if (buffer.length > MAX_BYTES) {
      return NextResponse.json(
        { error: "File exceeds 8MB limit" },
        { status: 400 }
      );
    }

    // 매직바이트 검증 — 클라 Content-Type 불신뢰, SVG 등 비이미지 거부.
    const mime = sniffImageMime(buffer);
    if (!mime) {
      return NextResponse.json(
        { error: "Unsupported image type (png/jpeg/gif/webp only)" },
        { status: 400 }
      );
    }

    const filename =
      "name" in file && typeof file.name === "string" ? file.name : "upload";
    const result = await uploadImage(buffer, filename, mime);

    return NextResponse.json({ url: result.url, stub: result.stub ?? false });
  } catch (error) {
    console.error("POST /api/upload error:", error);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
