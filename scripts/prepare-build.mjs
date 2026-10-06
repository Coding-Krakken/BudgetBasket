import { execSync } from "node:child_process";

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = "postgresql://placeholder:placeholder@localhost:5432/cartwise";
}

console.log("[prisma] Generating Prisma client...");
execSync("npx prisma generate", { stdio: "inherit" });

console.log("[next] Building Next.js application...");
execSync("npx next build", { stdio: "inherit" });
