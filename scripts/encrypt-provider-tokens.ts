import db from "../src/lib/db";
import { encryptProviderToken, isEncryptedToken } from "../src/lib/token-encryption";

async function main() {
  const connections = await db.providerConnection.findMany({
    where: {
      OR: [
        { accessToken: { not: null } },
        { refreshToken: { not: null } },
      ],
    },
    select: { id: true, accessToken: true, refreshToken: true },
  });

  let updated = 0;
  for (const connection of connections) {
    const accessToken = connection.accessToken && !isEncryptedToken(connection.accessToken)
      ? encryptProviderToken(connection.accessToken)
      : connection.accessToken;
    const refreshToken = connection.refreshToken && !isEncryptedToken(connection.refreshToken)
      ? encryptProviderToken(connection.refreshToken)
      : connection.refreshToken;

    if (accessToken !== connection.accessToken || refreshToken !== connection.refreshToken) {
      await db.providerConnection.update({
        where: { id: connection.id },
        data: { accessToken, refreshToken },
      });
      updated += 1;
    }
  }

  console.log(`Encrypted provider tokens for ${updated} connection(s).`);
}

main()
  .catch(error => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
