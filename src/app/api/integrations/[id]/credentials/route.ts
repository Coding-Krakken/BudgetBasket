import { NextRequest, NextResponse } from "next/server";
import db from "@/lib/db";
import { credentialStore, getCredentialEnvName, type ProviderCredentialType } from "@/providers/credential-store";
import { PROVIDER_CREDENTIAL_REQUIREMENTS, CREDENTIAL_LABELS } from "@/providers/credential-requirements";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id: providerId } = await params;

  const requiredTypes = PROVIDER_CREDENTIAL_REQUIREMENTS[providerId];
  if (!requiredTypes) {
    return NextResponse.json(
      { error: `No credential requirements found for provider: ${providerId}` },
      { status: 404 }
    );
  }

  const storedRows = await db.providerCredential.findMany({
    where: { providerId },
    select: { credentialType: true },
  });
  const storedTypes = new Set(storedRows.map(r => r.credentialType));

  const fields = requiredTypes.map(type => ({
    type,
    label: CREDENTIAL_LABELS[type as ProviderCredentialType] ?? type,
    isSet: storedTypes.has(type) || credentialStore.getCredential(providerId, type as ProviderCredentialType) !== null,
    envName: getCredentialEnvName(providerId, type as ProviderCredentialType),
  }));

  return NextResponse.json({ providerId, fields });
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  const { id: providerId } = await params;

  const requiredTypes = PROVIDER_CREDENTIAL_REQUIREMENTS[providerId];
  if (!requiredTypes) {
    return NextResponse.json(
      { error: `No credential requirements found for provider: ${providerId}` },
      { status: 404 }
    );
  }

  let body: { credentials?: { type: string; value: string }[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { credentials } = body;
  if (!Array.isArray(credentials) || credentials.length === 0) {
    return NextResponse.json({ error: "credentials array is required" }, { status: 400 });
  }

  let configured = 0;
  for (const { type, value } of credentials) {
    if (!type || !value || typeof type !== "string" || typeof value !== "string") continue;
    if (!requiredTypes.includes(type as ProviderCredentialType)) continue;

    const trimmed = value.trim();
    if (!trimmed) continue;

    await db.providerCredential.upsert({
      where: { providerId_credentialType: { providerId, credentialType: type } },
      update: { value: trimmed },
      create: { providerId, credentialType: type, value: trimmed },
    });

    credentialStore.setCredential(providerId, type as ProviderCredentialType, trimmed);
    configured += 1;
  }

  return NextResponse.json({ success: true, configured });
}
