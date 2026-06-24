export type ProviderCredentialType = "client_id" | "client_secret" | "api_key" | "oauth_access_token";

export interface CredentialStore {
  getCredential(providerId: string, credentialType: ProviderCredentialType): string | null;
  hasCredentials(providerId: string, credentialTypes: readonly ProviderCredentialType[]): boolean;
  missingCredentials(providerId: string, credentialTypes: readonly ProviderCredentialType[]): ProviderCredentialType[];
}

const CREDENTIAL_ENV_SUFFIX: Record<ProviderCredentialType, string> = {
  client_id: "CLIENT_ID",
  client_secret: "CLIENT_SECRET",
  api_key: "API_KEY",
  oauth_access_token: "OAUTH_ACCESS_TOKEN",
};

function toEnvProviderPrefix(providerId: string) {
  return providerId
    .replace(/^live-/, "")
    .replace(/-api$/, "")
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toUpperCase();
}

export function getCredentialEnvName(providerId: string, credentialType: ProviderCredentialType) {
  return `${toEnvProviderPrefix(providerId)}_${CREDENTIAL_ENV_SUFFIX[credentialType]}`;
}

// Kept for backwards compatibility
export class EnvCredentialStore implements CredentialStore {
  constructor(private readonly env: Record<string, string | undefined> = process.env) {}

  getCredential(providerId: string, credentialType: ProviderCredentialType): string | null {
    const value = this.env[getCredentialEnvName(providerId, credentialType)];
    return value && value.trim().length > 0 ? value : null;
  }

  hasCredentials(providerId: string, credentialTypes: readonly ProviderCredentialType[]): boolean {
    return this.missingCredentials(providerId, credentialTypes).length === 0;
  }

  missingCredentials(providerId: string, credentialTypes: readonly ProviderCredentialType[]): ProviderCredentialType[] {
    return credentialTypes.filter(type => !this.getCredential(providerId, type));
  }
}

type MinimalDbClient = {
  providerCredential: {
    findMany(): Promise<{ providerId: string; credentialType: string; value: string }[]>;
  };
};

class CombinedCredentialStore implements CredentialStore {
  private cache = new Map<string, string>();

  private cacheKey(providerId: string, credentialType: string): string {
    return `${providerId}:${credentialType}`;
  }

  getCredential(providerId: string, credentialType: ProviderCredentialType): string | null {
    const cached = this.cache.get(this.cacheKey(providerId, credentialType));
    if (cached !== undefined) return cached;

    const envValue = process.env[getCredentialEnvName(providerId, credentialType)];
    return envValue && envValue.trim().length > 0 ? envValue : null;
  }

  hasCredentials(providerId: string, credentialTypes: readonly ProviderCredentialType[]): boolean {
    return this.missingCredentials(providerId, credentialTypes).length === 0;
  }

  missingCredentials(providerId: string, credentialTypes: readonly ProviderCredentialType[]): ProviderCredentialType[] {
    return credentialTypes.filter(type => !this.getCredential(providerId, type));
  }

  setCredential(providerId: string, credentialType: ProviderCredentialType, value: string): void {
    this.cache.set(this.cacheKey(providerId, credentialType), value);
  }

  async refreshFromDb(db: MinimalDbClient): Promise<void> {
    try {
      const rows = await db.providerCredential.findMany();
      for (const row of rows) {
        this.cache.set(this.cacheKey(row.providerId, row.credentialType), row.value);
      }
    } catch {
      // DB may not be available — silently fall back to env vars
    }
  }
}

export const credentialStore = new CombinedCredentialStore();

export async function refreshCredentialCache(db: MinimalDbClient): Promise<void> {
  await credentialStore.refreshFromDb(db);
}

export function collectCredentialValues(
  store: CredentialStore,
  requirements: Record<string, readonly ProviderCredentialType[]>
): string[] {
  const values = new Set<string>();

  for (const [providerId, credentialTypes] of Object.entries(requirements)) {
    for (const type of credentialTypes) {
      const value = store.getCredential(providerId, type);
      if (value) values.add(value);
    }
  }

  return [...values];
}
