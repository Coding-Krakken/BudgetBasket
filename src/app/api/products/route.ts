import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");
  const categorySlug = searchParams.get("category");
  const limit = Math.min(parseInt(searchParams.get("limit") ?? "50"), 200);
  const offset = parseInt(searchParams.get("offset") ?? "0");

  try {
    const products = await db.product.findMany({
      where: {
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { normalizedName: { contains: query, mode: "insensitive" } },
                { keywords: { has: query.toLowerCase() } },
              ],
            }
          : {}),
        ...(categorySlug
          ? { category: { slug: categorySlug } }
          : {}),
      },
      include: {
        brand: { select: { id: true, slug: true, name: true } },
        category: { select: { id: true, slug: true, name: true } },
      },
      take: limit,
      skip: offset,
      orderBy: { name: "asc" },
    });

    const total = await db.product.count({
      where: {
        ...(query
          ? {
              OR: [
                { name: { contains: query, mode: "insensitive" } },
                { normalizedName: { contains: query, mode: "insensitive" } },
              ],
            }
          : {}),
        ...(categorySlug ? { category: { slug: categorySlug } } : {}),
      },
    });

    return NextResponse.json({
      success: true,
      data: products,
      meta: { count: products.length, total, limit, offset },
    });
  } catch (error) {
    console.error("Products API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch products" },
      { status: 500 }
    );
  }
}
