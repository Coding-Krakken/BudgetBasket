import { NextResponse } from "next/server";
import db from "@/lib/db";

export async function GET() {
  const start = Date.now();

  let dbStatus: "ok" | "error" = "ok";
  let dbLatencyMs = 0;

  try {
    const dbStart = Date.now();
    await db.$queryRaw`SELECT 1`;
    dbLatencyMs = Date.now() - dbStart;
  } catch {
    dbStatus = "error";
  }

  return NextResponse.json({
    status: dbStatus === "ok" ? "healthy" : "degraded",
    version: "0.1.0",
    app: process.env.NEXT_PUBLIC_APP_NAME ?? "CartWise AI",
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    responseTimeMs: Date.now() - start,
    services: {
      database: {
        status: dbStatus,
        latencyMs: dbLatencyMs,
      },
      providers: {
        status: "ok",
        mode: "demo",
      },
    },
  });
}
