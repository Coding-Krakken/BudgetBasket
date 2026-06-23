"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { initAnalytics, trackPageView } from "@/lib/analytics";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";

const CONSENT_KEY = "cartwise:analytics-consent";

function useConsent() {
  const [consent, setConsent] = useState<"accepted" | "declined" | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(CONSENT_KEY);
    if (stored === "accepted" || stored === "declined") {
      setConsent(stored);
    } else {
      setConsent(null); // show banner
    }
  }, []);

  const accept = () => {
    localStorage.setItem(CONSENT_KEY, "accepted");
    setConsent("accepted");
  };

  const decline = () => {
    localStorage.setItem(CONSENT_KEY, "declined");
    setConsent("declined");
  };

  return { consent, accept, decline };
}

export function AnalyticsProvider({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { consent, accept, decline } = useConsent();

  useEffect(() => {
    if (consent === "accepted") {
      initAnalytics();
    }
  }, [consent]);

  useEffect(() => {
    if (consent === "accepted") {
      trackPageView(pathname);
    }
  }, [pathname, consent]);

  return (
    <>
      {children}
      {consent === null && <CookieConsentBanner onAccept={accept} onDecline={decline} />}
    </>
  );
}

function CookieConsentBanner({
  onAccept,
  onDecline,
}: {
  onAccept: () => void;
  onDecline: () => void;
}) {
  return (
    <div className="fixed bottom-20 md:bottom-4 left-4 right-4 md:left-auto md:right-4 md:max-w-sm z-50 bg-background border rounded-xl shadow-lg p-4">
      <div className="flex items-start gap-3">
        <div className="flex-1">
          <p className="text-sm font-medium mb-1">Analytics cookies</p>
          <p className="text-xs text-muted-foreground">
            We use privacy-first analytics to improve CartWise AI. No personal
            data or PII is ever collected.{" "}
            <a
              href="/privacy"
              className="underline hover:text-foreground"
              target="_blank"
            >
              Privacy policy
            </a>
          </p>
        </div>
        <button
          onClick={onDecline}
          className="text-muted-foreground hover:text-foreground p-0.5 shrink-0"
          aria-label="Decline"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      <div className="flex gap-2 mt-3">
        <Button size="sm" className="flex-1 h-8 text-xs" onClick={onAccept}>
          Accept
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="flex-1 h-8 text-xs"
          onClick={onDecline}
        >
          Decline
        </Button>
      </div>
    </div>
  );
}
