import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { rateLimit, getRateLimitHeaders } from "@/lib/rate-limit";
import { z } from "zod";

const SearchSchema = z.object({
  q: z.string().min(1).max(200),
  category: z.string().optional(),
  limit: z.coerce.number().min(1).max(20).default(10),
});

function getClientIp(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request.headers.get("x-real-ip") ??
    "unknown"
  );
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request);
  const rl = rateLimit(`search:${ip}`, 60, 60_000);
  const rlHeaders = getRateLimitHeaders(rl);

  if (!rl.allowed) {
    return NextResponse.json(
      { success: false, error: "Too many requests" },
      { status: 429, headers: rlHeaders }
    );
  }

  const { searchParams } = new URL(request.url);
  const rawParams = {
    q: searchParams.get("q") ?? "",
    category: searchParams.get("category") ?? undefined,
    limit: searchParams.get("limit") ?? "10",
  };

  const parsed = SearchSchema.safeParse(rawParams);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: "Invalid query", details: parsed.error.flatten() },
      { status: 422, headers: rlHeaders }
    );
  }

  const { q, category, limit } = parsed.data;
  const term = q.toLowerCase().trim();

  try {
    const products = await db.product.findMany({
      where: {
        AND: [
          {
            OR: [
              { normalizedName: { contains: term } },
              { name: { contains: term, mode: "insensitive" } },
              { brand: { name: { contains: term, mode: "insensitive" } } },
            ],
          },
          ...(category ? [{ category: { slug: category } }] : []),
        ],
      },
      select: {
        id: true,
        slug: true,
        name: true,
        normalizedName: true,
        averagePrice: true,
        imageUrl: true,
        category: { select: { id: true, slug: true, name: true } },
        brand: { select: { id: true, slug: true, name: true } },
      },
      take: limit,
      orderBy: { name: "asc" },
    });

    return NextResponse.json(
      {
        success: true,
        data: products,
        meta: { query: q, count: products.length },
      },
      { headers: rlHeaders }
    );
  } catch (error) {
    console.error("Product search error:", error);
    return NextResponse.json(
      { success: false, error: "Search failed" },
      { status: 500, headers: rlHeaders }
    );
  }
}
