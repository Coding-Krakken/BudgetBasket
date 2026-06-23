import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const storeId = searchParams.get("storeId");
  const storeSlug = searchParams.get("storeSlug");
  const productId = searchParams.get("productId");
  const type = searchParams.get("type");
  const featured = searchParams.get("featured") === "true";
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);
  const offset = parseInt(searchParams.get("offset") ?? "0");
  const activeOnly = searchParams.get("active") !== "false";

  try {
    const now = new Date();

    const opportunities = await db.opportunity.findMany({
      where: {
        ...(activeOnly
          ? {
              isActive: true,
              OR: [
                { expiresAt: null },
                { expiresAt: { gte: now } },
              ],
            }
          : {}),
        ...(storeId ? { storeId } : {}),
        ...(storeSlug ? { store: { slug: storeSlug } } : {}),
        ...(productId ? { productId } : {}),
        ...(type ? { type: type as never } : {}),
        ...(featured ? { isFeatured: true } : {}),
      },
      include: {
        store: { select: { id: true, slug: true, name: true, chain: true } },
        product: { select: { id: true, slug: true, name: true } },
      },
      take: limit,
      skip: offset,
      orderBy: [
        { isFeatured: "desc" },
        { confidence: "desc" },
        { createdAt: "desc" },
      ],
    });

    return NextResponse.json({
      success: true,
      data: opportunities,
      meta: { count: opportunities.length, limit, offset },
    });
  } catch (error) {
    console.error("Opportunities API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch opportunities" },
      { status: 500 }
    );
  }
}
