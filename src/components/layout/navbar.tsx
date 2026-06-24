"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  ShoppingCart,
  Compass,
  Archive,
  PlugZap,
  User,
  Settings,
  Sparkles,
  Bell,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";

const navItems = [
  { href: "/", label: "Home", icon: Sparkles },
  { href: "/plan", label: "Plan", icon: ShoppingCart },
  { href: "/discover", label: "Discover", icon: Compass },
  { href: "/pantry", label: "Pantry", icon: Archive },
  { href: "/integrations", label: "Integrations", icon: PlugZap },
  { href: "/profile", label: "Profile", icon: User },
];

function useUnreadNotificationCount() {
  const [count, setCount] = useState(0);

  useEffect(() => {
    const userId = localStorage.getItem("cartwise:userId");
    if (!userId) return;
    fetch(`/api/notifications?userId=${encodeURIComponent(userId)}&unreadOnly=true&limit=1`)
      .then((r) => r.json())
      .then((j) => { if (j.success) setCount(j.meta.unreadCount); })
      .catch(() => undefined);
  }, []);

  return count;
}

export function NavBar() {
  const pathname = usePathname();
  const unreadCount = useUnreadNotificationCount();

  return (
    <>
      {/* Desktop top nav */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-16 items-center justify-between px-4">
          <Link href="/" className="flex items-center gap-2.5 group">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg gradient-savings shadow-sm">
              <ShoppingCart className="h-4 w-4 text-white" />
            </div>
            <span className="font-bold text-lg tracking-tight">
              CartWise <span className="text-primary">AI</span>
            </span>
          </Link>

          <nav className="hidden md:flex items-center gap-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="flex items-center gap-2">
            <Link
              href="/notifications"
              className="relative hidden md:flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
              aria-label="Notifications"
            >
              <Bell className="h-4 w-4" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 h-4 w-4 rounded-full bg-primary text-[9px] font-bold text-primary-foreground flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </Link>
            <Link
              href="/admin/providers"
              className="hidden md:flex items-center gap-1.5 px-3 py-2 rounded-md text-sm text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Settings className="h-4 w-4" />
              Admin
            </Link>
          </div>
        </div>
      </header>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur md:hidden">
        <div className="flex items-center justify-around px-2 py-1.5">
          {navItems.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex flex-col items-center gap-0.5 px-2 py-1 rounded-md text-[10px] font-medium transition-colors min-w-[3rem]",
                  isActive
                    ? "text-primary"
                    : "text-muted-foreground"
                )}
              >
                <Icon className={cn("h-5 w-5", isActive && "text-primary")} />
                {item.label}
              </Link>
            );
          })}
          <Link
            href="/notifications"
            className={cn(
              "relative flex flex-col items-center gap-0.5 px-2 py-1 rounded-md text-[10px] font-medium transition-colors min-w-[3rem]",
              pathname === "/notifications" ? "text-primary" : "text-muted-foreground"
            )}
          >
            <Bell className={cn("h-5 w-5", pathname === "/notifications" && "text-primary")} />
            {unreadCount > 0 && (
              <span className="absolute top-0.5 right-1.5 h-3.5 w-3.5 rounded-full bg-primary text-[8px] font-bold text-primary-foreground flex items-center justify-center">
                {unreadCount > 9 ? "9+" : unreadCount}
              </span>
            )}
            Alerts
          </Link>
        </div>
      </nav>

      {/* Mobile bottom nav spacer */}
      <div className="h-16 md:hidden" />
    </>
  );
}
