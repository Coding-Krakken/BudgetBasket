import { NextResponse } from "next/server";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json(
      { success: false, error: "Not available in production" },
      { status: 403 }
    );
  }

  return NextResponse.json({
    success: true,
    message: "Use npm run db:seed to reset demo data via the seed script",
    command: "npm run db:seed",
  });
}

export async function GET() {
  return POST();
}
