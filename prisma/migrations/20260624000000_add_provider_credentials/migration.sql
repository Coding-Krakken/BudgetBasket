-- CreateTable
CREATE TABLE "ProviderCredential" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "credentialType" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProviderCredential_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderCredential_providerId_idx" ON "ProviderCredential"("providerId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderCredential_providerId_credentialType_key" ON "ProviderCredential"("providerId", "credentialType");
