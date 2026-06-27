import { NextRequest, NextResponse } from "next/server";
import {
  createCodeChallenge,
  createCodeVerifier,
  createOAuthState,
  getCurrentUserId,
  getOAuthClientCredentials,
  getOAuthProvider,
  getOAuthRedirectUri,
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

  const userId = getCurrentUserId(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: "userId is required to connect an account" }, { status: 400 });
  }

  const { clientId } = await getOAuthClientCredentials(provider.providerId);
  if (!clientId) {
    return NextResponse.json({ success: false, error: `${provider.providerName} OAuth client ID is not configured` }, { status: 400 });
  }

  const codeVerifier = createCodeVerifier();
  const state = createOAuthState({
    providerId: provider.providerId,
    userId,
    codeVerifier,
    redirectTo: new URL("/integrations", request.url).toString(),
  });
  const codeChallenge = await createCodeChallenge(codeVerifier);
  const redirectUri = getOAuthRedirectUri(request.url, provider.providerId);
  const authUrl = new URL(provider.authorizationUrl);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", provider.scopes.join(" "));
  authUrl.searchParams.set("state", state);
  authUrl.searchParams.set("code_challenge", codeChallenge);
  authUrl.searchParams.set("code_challenge_method", "S256");

  const response = NextResponse.redirect(authUrl);
  response.cookies.set(`cw_oauth_state_${provider.providerId}`, state, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 10 * 60,
    path: "/",
  });
  return response;
}
