import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const activeOnly = searchParams.get("active") !== "false";
  const chain = searchParams.get("chain");

  try {
    const stores = await db.store.findMany({
      where: {
        ...(activeOnly ? { isActive: true } : {}),
        ...(chain ? { chain: { contains: chain, mode: "insensitive" } } : {}),
      },
      orderBy: { name: "asc" },
    });

    return NextResponse.json({
      success: true,
      data: stores,
      meta: { count: stores.length },
    });
  } catch (error) {
    console.error("Stores API error:", error);
    return NextResponse.json(
      { success: false, error: "Failed to fetch stores" },
      { status: 500 }
    );
  }
}
