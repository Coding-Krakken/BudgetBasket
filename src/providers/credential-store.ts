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

export const credentialStore = new EnvCredentialStore();

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
