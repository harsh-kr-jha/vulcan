import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const source = request.nextUrl.searchParams.get("url")?.trim();
  if (!source) return NextResponse.json({ error: "Paste a Google Sheets URL first." }, { status: 400 });

  let parsed: URL;
  try {
    parsed = new URL(source);
  } catch {
    return NextResponse.json({ error: "Enter a valid Google Sheets URL." }, { status: 400 });
  }
  if (parsed.protocol !== "https:" || parsed.hostname !== "docs.google.com" || !parsed.pathname.startsWith("/spreadsheets/d/")) {
    return NextResponse.json({ error: "Only docs.google.com spreadsheet links are supported." }, { status: 400 });
  }
  const sheetId = parsed.pathname.split("/")[3];
  const gid = parsed.searchParams.get("gid")?.match(/^\d+$/)?.[0] ?? "0";
  const exportUrl = `https://docs.google.com/spreadsheets/d/${encodeURIComponent(sheetId)}/export?format=csv&gid=${gid}`;

  try {
    const response = await fetch(exportUrl, { cache: "no-store", redirect: "follow" });
    if (!response.ok) return NextResponse.json({ error: "Google did not return the sheet. Confirm link sharing is enabled." }, { status: 422 });
    const content = await response.text();
    if (!content.trim()) return NextResponse.json({ error: "The selected sheet is empty." }, { status: 422 });
    return new NextResponse(content, { headers: { "Content-Type": "text/csv; charset=utf-8", "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "The Google Sheet could not be reached. Try again shortly." }, { status: 502 });
  }
}
