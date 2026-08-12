/**
 * P0 Data — production seed guard.
 *
 * Seeds and fixture auto-fills may ONLY run in dev/test. In production
 * (NODE_ENV=production on Vercel, or PROD_SEED_GUARD=1 as a belt-and-braces
 * env var) they must FAIL LOUDLY so a seed can never fabricate supply or
 * traction on the live site. The deployed build never seeds: every seed
 * entry point calls assertNotProductionSeeding() before touching the DB.
 */
export function assertNotProductionSeeding(context: string): void {
  const nodeEnv = process.env.NODE_ENV ?? "";
  const vercelEnv = process.env.VERCEL_ENV ?? "";
  const guard = process.env.PROD_SEED_GUARD ?? "";
  const isProduction =
    nodeEnv === "production" || vercelEnv === "production" || guard === "1";

  if (isProduction) {
    throw new Error(
      `SEED-GUARD: ${context} refuses to run in production (NODE_ENV=${nodeEnv}, VERCEL_ENV=${vercelEnv}, PROD_SEED_GUARD=${guard}). ` +
        `Fixture/seeding writes are disabled on the live site.`,
    );
  }
}
