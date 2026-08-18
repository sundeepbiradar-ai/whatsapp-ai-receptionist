import { Client } from "pg";

/**
 * Test-only privileged database access for integration fixtures. It runs only
 * against the local Supabase instance identified by SUPABASE_TEST_DB_URL and is
 * never imported by application code.
 */
async function withClient<T>(run: (client: Client) => Promise<T>): Promise<T> {
  const connectionString = process.env["SUPABASE_TEST_DB_URL"];
  if (!connectionString) {
    throw new Error("SUPABASE_TEST_DB_URL is required for privileged test fixtures.");
  }
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await run(client);
  } finally {
    await client.end();
  }
}

export async function createTestVaultSecret(value: string, name: string): Promise<string> {
  return withClient(async (client) => {
    const result = await client.query<{ id: string }>(
      "select vault.create_secret($1, $2, $3) as id",
      [value, name, "Phase 5.1 test secret"]
    );
    const id = result.rows[0]?.id;
    if (typeof id !== "string") throw new Error("Vault secret was not created.");
    return id;
  });
}

export async function deleteTestVaultSecrets(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await withClient(async (client) => {
    await client.query("delete from vault.secrets where id = any($1::uuid[])", [ids]);
  });
}
