import { get } from "@vercel/blob";
import { NextRequest, NextResponse } from "next/server";
import { accessError, requireStoreAccess } from "@/lib/server-auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const pathname = request.nextUrl.searchParams.get("pathname");
  const download = request.nextUrl.searchParams.get("download") === "1";
  if (!pathname || !pathname.startsWith("order-confirmations/")) {
    return NextResponse.json({ error: "Ugyldig filsti." }, { status: 400 });
  }

  const storeId = pathname.split("/")[1] || "";
  try {
    await requireStoreAccess(request, storeId);
  } catch (error) {
    const response = accessError(error);
    return NextResponse.json({ error: response.error }, { status: response.status });
  }

  const result = await get(pathname, { access: "private" });
  if (!result) return NextResponse.json({ error: "Filen finnes ikke." }, { status: 404 });

  const fileName = pathname.split("/").pop() || "ordrebekreftelse.pdf";
  return new NextResponse(result.stream, {
    headers: {
      "Content-Type": result.blob.contentType || "application/pdf",
      "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${fileName.replace(/\"/g, "")}"`,
      "Cache-Control": "private, max-age=300",
    },
  });
}
