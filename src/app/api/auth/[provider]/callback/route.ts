import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { encryptProviderToken } from "@/lib/token-encryption";
import {
  getAccountIdentity,
  getOAuthClientCredentials,
  getOAuthProvider,
  getOAuthRedirectUri,
  parseOAuthState,
  type TokenResponse,
} from "@/lib/provider-oauth";

interface RouteParams {
  params: Promise<{ provider: string }>;
}

export async function GET(request: NextRequest, { params }: RouteParams) {
  const { provider: providerId } = await params;
  const provider = getOAuthProvider(providerId);
  if (!provider) {
    return NextResponse.json({ success: false, error: "Unsupported OAuth provider" }, { status: 404 });
  }

  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const sealedState = url.searchParams.get("state");
  const expectedState = request.cookies.get(`cw_oauth_state_${provider.providerId}`)?.value;

  if (!code || !sealedState || !expectedState || sealedState !== expectedState) {
    return NextResponse.json({ success: false, error: "Invalid OAuth callback state" }, { status: 400 });
  }

  const state = parseOAuthState(sealedState);
  if (state.providerId !== provider.providerId) {
    return NextResponse.json({ success: false, error: "OAuth provider mismatch" }, { status: 400 });
  }

  const { clientId, clientSecret } = await getOAuthClientCredentials(provider.providerId);
  if (!clientId || !clientSecret) {
    return NextResponse.json({ success: false, error: `${provider.providerName} OAuth credentials are not configured` }, { status: 400 });
  }

  const tokenResponse = await fetch(provider.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: getOAuthRedirectUri(request.url, provider.providerId),
      client_id: clientId,
      client_secret: clientSecret,
      code_verifier: state.codeVerifier,
    }),
  });

  if (!tokenResponse.ok) {
    return NextResponse.json({ success: false, error: `${provider.providerName} token exchange failed` }, { status: 502 });
  }

  const tokenData = (await tokenResponse.json()) as TokenResponse;
  if (!tokenData.access_token) {
    return NextResponse.json({ success: false, error: "OAuth token response did not include an access token" }, { status: 502 });
  }

  const identity = getAccountIdentity(tokenData);
  const expiresAt = tokenData.expires_in
    ? new Date(Date.now() + tokenData.expires_in * 1000)
    : null;

  await db.user.upsert({
    where: { id: state.userId },
    update: {},
    create: {
      id: state.userId,
      email: identity.email,
      name: identity.email ? identity.email.split("@")[0] : null,
    },
  });

  const connection = await db.providerConnection.upsert({
    where: { userId_providerId: { userId: state.userId, providerId: provider.providerId } },
    update: {
      providerName: provider.providerName,
      status: "CONNECTED",
      accessToken: encryptProviderToken(tokenData.access_token),
      refreshToken: encryptProviderToken(tokenData.refresh_token),
      tokenExpiresAt: expiresAt,
      accountId: identity.accountId,
      accountEmail: identity.email,
      syncError: null,
      updatedAt: new Date(),
    },
    create: {
      userId: state.userId,
      providerId: provider.providerId,
      providerName: provider.providerName,
      status: "CONNECTED",
      accessToken: encryptProviderToken(tokenData.access_token),
      refreshToken: encryptProviderToken(tokenData.refresh_token),
      tokenExpiresAt: expiresAt,
      accountId: identity.accountId,
      accountEmail: identity.email,
    },
  });

  await db.auditLog.create({
    data: {
      userId: state.userId,
      action: "provider.connected",
      entityType: "ProviderConnection",
      entityId: connection.id,
      metadata: { providerId: provider.providerId },
    },
  }).catch(() => {});

  const response = NextResponse.redirect(state.redirectTo);
  response.cookies.delete(`cw_oauth_state_${provider.providerId}`);
  return response;
}
