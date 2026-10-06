import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { decryptProviderToken } from "@/lib/token-encryption";
import { getCurrentUserId, getOAuthClientCredentials, getOAuthProvider } from "@/lib/provider-oauth";

interface RouteParams {
  params: Promise<{ provider: string }>;
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  const { provider: providerId } = await params;
  const provider = getOAuthProvider(providerId);
  if (!provider) {
    return NextResponse.json({ success: false, error: "Unsupported OAuth provider" }, { status: 404 });
  }

  const userId = getCurrentUserId(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "userId is required to disconnect an account" }, { status: 400 });
  }

  const connection = await db.providerConnection.findUnique({
    where: { userId_providerId: { userId, providerId: provider.providerId } },
  });

  if (!connection) {
    return NextResponse.json({ success: true, disconnected: false });
  }

  if (provider.revokeUrl && (connection.refreshToken || connection.accessToken)) {
    const { clientId, clientSecret } = await getOAuthClientCredentials(provider.providerId);
    const token = decryptProviderToken(connection.refreshToken) ?? decryptProviderToken(connection.accessToken);
    if (clientId && clientSecret && token) {
      await fetch(provider.revokeUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token, client_id: clientId, client_secret: clientSecret }),
      }).catch(() => null);
    }
  }

  await db.providerConnection.update({
    where: { id: connection.id },
    data: {
      status: "DISCONNECTED",
      accessToken: null,
      refreshToken: null,
      tokenExpiresAt: null,
      syncError: null,
      updatedAt: new Date(),
    },
  });

  await db.auditLog.create({
    data: {
      userId,
      action: "provider.disconnected",
      entityType: "ProviderConnection",
      entityId: connection.id,
      metadata: { providerId: provider.providerId },
    },
  }).catch(() => {});

  return NextResponse.json({ success: true, disconnected: true });
}
