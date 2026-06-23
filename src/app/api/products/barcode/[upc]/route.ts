import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { rateLimit, getRateLimitHeaders } from "@/lib/rate-limit";

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ upc: string }> }
) {
  const ip = getClientIp(request);
  const rl = rateLimit(`barcode:${ip}`, 60, 60_000);
  const rlHeaders = getRateLimitHeaders(rl);

  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests" },
      { status: 429, headers: rlHeaders }
    );
  }

  const { upc } = await params;

  if (!upc || !/^\d{8,14}$/.test(upc)) {
    return NextResponse.json(
      { success: false, error: "Invalid UPC format" },
      { status: 400, headers: rlHeaders }
    );
  }

  try {
    const start = Date.now();

    const upcRecord = await db.uPC.findUnique({
      where: { upc },
      include: {
        product: {
          include: {
            brand: { select: { id: true, slug: true, name: true } },
            category: { select: { id: true, slug: true, name: true } },
            upcs: { select: { upc: true, isDefault: true } },
            opportunities: {
              where: {
                isActive: true,
                OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
              },
              include: {
                store: { select: { id: true, slug: true, name: true } },
              },
              orderBy: { confidence: "desc" },
              take: 20,
            },
            priceObservations: {
              where: {
                isActive: true,
                OR: [{ expiresAt: null }, { expiresAt: { gte: new Date() } }],
              },
              include: {
                store: { select: { id: true, slug: true, name: true } },
              },
              orderBy: { confidence: "desc" },
              take: 10,
            },
          },
        },
      },
    });

    const elapsed = Date.now() - start;

    if (!upcRecord) {
      return NextResponse.json(
        { success: false, error: "Product not found for UPC" },
        { status: 404, headers: rlHeaders }
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: upcRecord.product,
        meta: { upc, responseMs: elapsed },
      },
      { headers: rlHeaders }
    );
  } catch (error) {
    console.error("Barcode lookup error:", error);
    return NextResponse.json(
      { success: false, error: "Lookup failed" },
      { status: 500, headers: rlHeaders }
    );
  }
}
