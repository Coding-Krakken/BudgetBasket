"use client";

import { useState, useEffect, useCallback } from "react";
import { Bell, BellOff, CheckCheck, AlertCircle, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { formatDistanceToNow } from "date-fns";

const PREFS_KEY = "cartwise:prefs";

interface Notification {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  isRead: boolean;
  createdAt: string;
}

interface NotificationPreference {
  dealAlerts: boolean;
  expiryReminders: boolean;
  rebateReminders: boolean;
  priceDropAlerts: boolean;
  emailEnabled: boolean;
  email: string | null;
}

const DEFAULT_PREFS: NotificationPreference = {
  dealAlerts: true,
  expiryReminders: true,
  rebateReminders: true,
  priceDropAlerts: true,
  emailEnabled: false,
  email: null,
};

const TYPE_ICONS: Record<string, string> = {
  DEAL_ALERT: "🏷️",
  EXPIRY_REMINDER: "⏰",
  REBATE_REMINDER: "💰",
  PRICE_DROP: "📉",
  SYSTEM: "ℹ️",
};

function getDemoUserId(): string {
  if (typeof window === "undefined") return "demo";
  let id = localStorage.getItem("cartwise:userId");
  if (!id) {
    id = `demo-${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem("cartwise:userId", id);
  }
  return id;
}

export default function NotificationsPage() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [prefs, setPrefs] = useState<NotificationPreference>(DEFAULT_PREFS);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [savingPrefs, setSavingPrefs] = useState(false);

  const userId = typeof window !== "undefined" ? getDemoUserId() : "demo";

  const fetchNotifications = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications?userId=${encodeURIComponent(userId)}&limit=50`);
      const json = await res.json();
      if (json.success) {
        setNotifications(json.data);
        setUnreadCount(json.meta.unreadCount);
      }
    } catch {
      // no-op
    }
  }, [userId]);

  const fetchPrefs = useCallback(async () => {
    try {
      const res = await fetch(`/api/notifications/preferences?userId=${encodeURIComponent(userId)}`);
      const json = await res.json();
      if (json.success && json.data) setPrefs(json.data);
    } catch {
      // no-op
    }
  }, [userId]);

  useEffect(() => {
    Promise.all([fetchNotifications(), fetchPrefs()]).finally(() =>
      setLoading(false)
    );
  }, [fetchNotifications, fetchPrefs]);

  async function markAllRead() {
    const unread = notifications.filter((n) => !n.isRead).map((n) => n.id);
    if (!unread.length) return;

    await fetch("/api/notifications", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids: unread }),
    });

    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
  }

  async function savePrefs(updated: NotificationPreference) {
    setSavingPrefs(true);
    try {
      await fetch("/api/notifications/preferences", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, ...updated }),
      });
      setPrefs(updated);
    } finally {
      setSavingPrefs(false);
    }
  }

  const togglePref = (key: keyof Omit<NotificationPreference, "email">) => {
    const updated = { ...prefs, [key]: !prefs[key] };
    void savePrefs(updated);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-3xl">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Bell className="h-6 w-6 text-primary" />
            Notifications
          </h1>
          {unreadCount > 0 && (
            <p className="text-sm text-muted-foreground mt-1">
              {unreadCount} unread notification{unreadCount !== 1 ? "s" : ""}
            </p>
          )}
        </div>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" className="gap-1.5" onClick={markAllRead}>
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </Button>
        )}
      </div>

      {/* Notification list */}
      <Card className="mb-6">
        <CardContent className="p-0">
          {notifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-center">
              <BellOff className="h-10 w-10 text-muted-foreground/40 mb-3" />
              <p className="text-sm text-muted-foreground">No notifications yet.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Deal alerts and reminders will appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className={`px-4 py-3 flex items-start gap-3 transition-colors ${
                    n.isRead ? "" : "bg-primary/5"
                  }`}
                >
                  <span className="text-lg mt-0.5 shrink-0">
                    {TYPE_ICONS[n.type] ?? "🔔"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className={`text-sm ${n.isRead ? "text-muted-foreground" : "font-medium"}`}>
                        {n.title}
                      </p>
                      {!n.isRead && (
                        <span className="h-2 w-2 rounded-full bg-primary shrink-0 mt-1.5" />
                      )}
                    </div>
                    {n.body && (
                      <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>
                    )}
                    <p className="text-[10px] text-muted-foreground mt-1">
                      {formatDistanceToNow(new Date(n.createdAt), { addSuffix: true })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Preferences */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertCircle className="h-4 w-4" />
            Notification Preferences
            {savingPrefs && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Deal alerts</p>
              <p className="text-xs text-muted-foreground">Notify me about new deals for items I track</p>
            </div>
            <Switch checked={prefs.dealAlerts} onCheckedChange={() => togglePref("dealAlerts")} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Expiry reminders</p>
              <p className="text-xs text-muted-foreground">Remind me before coupons and offers expire</p>
            </div>
            <Switch checked={prefs.expiryReminders} onCheckedChange={() => togglePref("expiryReminders")} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Rebate reminders</p>
              <p className="text-xs text-muted-foreground">Remind me to submit rebates before they expire</p>
            </div>
            <Switch checked={prefs.rebateReminders} onCheckedChange={() => togglePref("rebateReminders")} />
          </div>
          <Separator />
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">Price drop alerts</p>
              <p className="text-xs text-muted-foreground">Notify me when watched items hit my target price</p>
            </div>
            <Switch checked={prefs.priceDropAlerts} onCheckedChange={() => togglePref("priceDropAlerts")} />
          </div>
        </CardContent>
      </Card>

      <div className="mt-4 text-xs text-muted-foreground text-center">
        <Badge variant="demo" className="mr-1">Demo</Badge>
        In production, email notifications require account sign-in.
      </div>
    </div>
  );
}
