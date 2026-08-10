import { put } from "@vercel/blob";
import { NextResponse } from "next/server";
import { parseMoelvenText } from "@/lib/moelven-parser";

export const runtime = "nodejs";
export const maxDuration = 30;

function safeSegment(value: string) {
  return value.replace(/[^a-zA-Z0-9æøåÆØÅ._-]+/g, "-").replace(/-+/g, "-");
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const sentOrderId = String(formData.get("sentOrderId") || "ukjent-ordre");
    const storeId = String(formData.get("storeId") || "ukjent-varehus");
    const year = String(formData.get("year") || "ukjent-år");
    const week = String(formData.get("week") || "ukjent-uke");
    const lagerOrderNumber = String(formData.get("lagerOrderNumber") || "ukjent");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "PDF-fil mangler." }, { status: 400 });
    }
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      return NextResponse.json({ error: "Kun PDF-filer kan lastes opp." }, { status: 400 });
    }
    if (file.size > 4_000_000) {
      return NextResponse.json({ error: "PDF-en er større enn 4 MB." }, { status: 400 });
    }

    const rawText = String(formData.get("rawText") || "").trim();
    if (!rawText) {
      return NextResponse.json({ error: "PDF-teksten mangler. Last siden på nytt og prøv igjen." }, { status: 400 });
    }

    const bytes = new Uint8Array(await file.arrayBuffer());
    const parsed = parseMoelvenText(rawText);

    if (!parsed.lines.length) {
      return NextResponse.json({ error: "Fant ingen Moelven-varelinjer i PDF-en." }, { status: 422 });
    }

    const pathname = [
      "order-confirmations",
      safeSegment(storeId),
      safeSegment(year),
      `uke-${safeSegment(week)}`,
      `lagerordre-${safeSegment(lagerOrderNumber)}`,
      `${safeSegment(sentOrderId)}-${Date.now()}-${safeSegment(file.name)}`,
    ].join("/");

    const blob = await put(pathname, bytes, {
      access: "private",
      contentType: "application/pdf",
      addRandomSuffix: false,
    });

    return NextResponse.json({
      file: {
        pathname: blob.pathname,
        url: blob.url,
        fileName: file.name,
        size: file.size,
        contentType: "application/pdf",
      },
      parsed: { ...parsed, rawText: undefined },
    });
  } catch (error) {
    console.error("Moelven upload failed", error);
    const message = error instanceof Error ? error.message : "Ukjent serverfeil";
    return NextResponse.json({ error: `Kunne ikke lagre ordrebekreftelsen: ${message}` }, { status: 500 });
  }
}
