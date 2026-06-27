import { createHash, createHmac, randomBytes } from "crypto";
import db from "@/lib/db";
import { credentialStore, refreshCredentialCache } from "@/providers/credential-store";

export type OAuthProviderId =
  | "live-kroger-digital"
  | "live-target-circle"
  | "live-cvs-extracare"
  | "live-walgreens-loyalty"
  | "live-safeway-loyalty"
  | "live-meijer-mperks";

export interface OAuthProviderConfig {
  providerId: OAuthProviderId;
  providerName: string;
  authorizationUrl: string;
  tokenUrl: string;
  revokeUrl?: string;
  scopes: string[];
}

export const OAUTH_PROVIDERS: Record<OAuthProviderId, OAuthProviderConfig> = {
  "live-kroger-digital": {
    providerId: "live-kroger-digital",
    providerName: "Kroger Digital Coupons",
    authorizationUrl: "https://api.kroger.com/v1/connect/oauth2/authorize",
    tokenUrl: "https://api.kroger.com/v1/connect/oauth2/token",
    revokeUrl: "https://api.kroger.com/v1/connect/oauth2/revoke",
    scopes: ["profile.compact", "loyalty"],
  },
  "live-target-circle": {
    providerId: "live-target-circle",
    providerName: "Target Circle",
    authorizationUrl: "https://oauth.iam.target.com/auth/oauth/v2/authorize",
    tokenUrl: "https://oauth.iam.target.com/auth/oauth/v2/token",
    scopes: ["openid", "profile", "offline_access", "circle.offers.read"],
  },
  "live-cvs-extracare": {
    providerId: "live-cvs-extracare",
    providerName: "CVS ExtraCare",
    authorizationUrl: "https://api.cvs.com/auth/oauth2/authorize",
    tokenUrl: "https://api.cvs.com/auth/oauth2/token",
    scopes: ["openid", "profile", "extracare.offers.read", "offline_access"],
  },
  "live-walgreens-loyalty": {
    providerId: "live-walgreens-loyalty",
    providerName: "myWalgreens",
    authorizationUrl: "https://api.walgreens.com/oauth/authorize",
    tokenUrl: "https://api.walgreens.com/oauth/token",
    scopes: ["openid", "profile", "loyalty.read", "offline_access"],
  },
  "live-safeway-loyalty": {
    providerId: "live-safeway-loyalty",
    providerName: "Safeway for U",
    authorizationUrl: "https://www.safeway.com/oauth2/authorize",
    tokenUrl: "https://www.safeway.com/oauth2/token",
    scopes: ["openid", "profile", "offers.read", "offline_access"],
  },
  "live-meijer-mperks": {
    providerId: "live-meijer-mperks",
    providerName: "Meijer mPerks",
    authorizationUrl: "https://api.meijer.com/oauth2/authorize",
    tokenUrl: "https://api.meijer.com/oauth2/token",
    scopes: ["openid", "profile", "mperks.offers.read", "offline_access"],
  },
};

interface OAuthState {
  providerId: OAuthProviderId;
  userId: string;
  codeVerifier: string;
  redirectTo: string;
  nonce: string;
  exp: number;
}

export interface TokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  id_token?: string;
  account_id?: string;
  user_id?: string;
  member_id?: string;
  email?: string;
}

function getStateSecret(): string {
  const secret = process.env.APP_SECRET ?? process.env.NEXTAUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("APP_SECRET must be configured with at least 16 characters for OAuth state signing.");
  }
  return secret;
}

function signState(payload: string): string {
  return createHmac("sha256", getStateSecret()).update(payload).digest("base64url");
}

export function createOAuthState(input: Omit<OAuthState, "nonce" | "exp">): string {
  const state: OAuthState = {
    ...input,
    nonce: randomBytes(16).toString("base64url"),
    exp: Date.now() + 10 * 60 * 1000,
  };
  const payload = Buffer.from(JSON.stringify(state)).toString("base64url");
  return `${payload}.${signState(payload)}`;
}

export function parseOAuthState(sealedState: string): OAuthState {
  const [payload, signature] = sealedState.split(".");
  if (!payload || !signature || signState(payload) !== signature) {
    throw new Error("Invalid OAuth state.");
  }

  const state = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthState;
  if (state.exp < Date.now()) throw new Error("OAuth state expired.");
  if (!OAUTH_PROVIDERS[state.providerId]) throw new Error("Unknown OAuth provider.");
  return state;
}

export function createCodeVerifier(): string {
  return randomBytes(48).toString("base64url");
}

export async function createCodeChallenge(verifier: string): Promise<string> {
  return createHash("sha256").update(verifier).digest("base64url");
}

export function getOAuthProvider(providerId: string): OAuthProviderConfig | null {
  return OAUTH_PROVIDERS[providerId as OAuthProviderId] ?? null;
}

export async function getOAuthClientCredentials(providerId: string) {
  await refreshCredentialCache(db);
  const clientId = credentialStore.getCredential(providerId, "client_id");
  const clientSecret = credentialStore.getCredential(providerId, "client_secret");
  return { clientId, clientSecret };
}

export function getOAuthRedirectUri(requestUrl: string, providerId: string): string {
  return new URL(`/api/auth/${providerId}/callback`, requestUrl).toString();
}

export function getAccountIdentity(tokenResponse: TokenResponse): { accountId: string | null; email: string | null } {
  const idPayload = decodeJwtPayload(tokenResponse.id_token);
  return {
    accountId: tokenResponse.account_id ?? tokenResponse.user_id ?? tokenResponse.member_id ?? idPayload?.sub ?? null,
    email: tokenResponse.email ?? idPayload?.email ?? null,
  };
}

function decodeJwtPayload(token: string | undefined): Record<string, string> | null {
  if (!token) return null;
  const [, payload] = token.split(".");
  if (!payload) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, string>;
  } catch {
    return null;
  }
}

export function getCurrentUserId(request: Request): string | null {
  const url = new URL(request.url);
  const userId =
    request.headers.get("x-cartwise-user-id") ??
    url.searchParams.get("userId") ??
    readCookie(request.headers.get("cookie"), "cw_user_id");

  if (!userId || !/^[a-zA-Z0-9_:@.-]{1,200}$/.test(userId)) return null;
  return userId;
}

function readCookie(header: string | null, name: string): string | null {
  if (!header) return null;
  const cookies = header.split(";").map(part => part.trim());
  const prefix = `${name}=`;
  const match = cookies.find(cookie => cookie.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : null;
}
