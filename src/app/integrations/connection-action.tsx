"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";

interface ConnectionActionProps {
  providerId: string;
  userId: string;
  status?: string;
}

export function ConnectionAction({ providerId, userId, status }: ConnectionActionProps) {
  const router = useRouter();
  const [isPending, setIsPending] = useState(false);
  const isConnected = status === "CONNECTED";

  async function disconnect() {
    setIsPending(true);
    try {
      await fetch(`/api/auth/${providerId}/disconnect?userId=${encodeURIComponent(userId)}`, {
        method: "POST",
      });
      router.refresh();
    } finally {
      setIsPending(false);
    }
  }

  if (isConnected) {
    return (
      <Button type="button" variant="outline" size="sm" onClick={disconnect} disabled={isPending}>
        {isPending ? "Disconnecting" : "Disconnect"}
      </Button>
    );
  }

  return (
    <Button asChild size="sm">
      <a href={`/api/auth/${providerId}/connect?userId=${encodeURIComponent(userId)}`}>
        Connect
      </a>
    </Button>
  );
}
