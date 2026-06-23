import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { NavBar } from "@/components/layout/navbar";
import { Toaster } from "@/components/ui/toaster";
import { AnalyticsProvider } from "@/components/analytics-provider";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const APP_NAME = process.env.NEXT_PUBLIC_APP_NAME ?? "CartWise AI";

export const metadata: Metadata = {
  title: {
    default: `${APP_NAME} — Your AI Household Purchasing Agent`,
    template: `%s | ${APP_NAME}`,
  },
  description:
    "AI-powered grocery savings. Find the lowest effective price combining coupons, rebates, store deals, loyalty rewards, and cashback — automatically.",
  keywords: ["grocery savings", "coupon app", "rebates", "price comparison", "shopping optimizer"],
  openGraph: {
    title: APP_NAME,
    description: "Your AI household purchasing agent.",
    type: "website",
  },
};

export const viewport: Viewport = {
  themeColor: "#6366f1",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`${geistSans.variable} ${geistMono.variable} min-h-screen bg-background font-sans`}
      >
        <AnalyticsProvider>
          <div className="flex min-h-screen flex-col">
            <NavBar />
            <main className="flex-1">{children}</main>
            <footer className="border-t py-6 text-center text-xs text-muted-foreground">
              <p>
                {APP_NAME} — Demo Mode. Prices and offers are illustrative.{" "}
                <span className="font-medium text-primary">Always verify before purchasing.</span>
              </p>
            </footer>
          </div>
          <Toaster />
        </AnalyticsProvider>
      </body>
    </html>
  );
}
