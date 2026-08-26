import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  PROJECT_DOCUMENTS,
  isDocumentSlug,
} from "@/lib/project-document-list";
import { buildProjectDocument } from "@/lib/project-documents";

// 폰트 임베드에 node:fs를 쓰므로 edge가 아니라 node 런타임이어야 한다.
export const runtime = "nodejs";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; slug: string }> },
) {
  try {
    const { id, slug } = await params;

    if (!isDocumentSlug(slug)) {
      return NextResponse.json({ error: "Unknown document" }, { status: 404 });
    }

    const project = await prisma.project.findUnique({
      where: { id },
      include: {
        escrow: true,
        milestones: { orderBy: { seq: "asc" } },
      },
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const bytes = await buildProjectDocument(slug, project);
    const meta = PROJECT_DOCUMENTS.find((d) => d.slug === slug)!;
    // 파일명이 한글이라 filename*(RFC 5987)로 준다. 안 그러면 브라우저가 깨뜨린다.
    const filename = encodeURIComponent(`${project.name} - ${meta.name}.pdf`);

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        // inline — 새 탭에서 바로 열리고, 거기서 저장할 수 있다.
        "Content-Disposition": `inline; filename*=UTF-8''${filename}`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    console.error("GET /api/projects/[id]/documents/[slug] error:", error);
    return NextResponse.json(
      { error: "Failed to build document" },
      { status: 500 },
    );
  }
}
