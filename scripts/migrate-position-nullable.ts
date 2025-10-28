import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function migrate() {
  console.log("🔄 Making position column nullable and adding default to rpcInCents...");
  
  try {
    // Make position nullable
    await db.execute(sql`ALTER TABLE geo_brand_rankings ALTER COLUMN position DROP NOT NULL`);
    console.log("✅ Position column is now nullable");
    
    // Add default value to rpcInCents
    await db.execute(sql`ALTER TABLE geo_brand_rankings ALTER COLUMN rpc_in_cents SET DEFAULT 0`);
    console.log("✅ Added default value to rpcInCents");
    
    console.log("\n✅ Migration complete!");
  } catch (error: any) {
    console.error("❌ Migration error:", error.message);
    process.exit(1);
  }
}

migrate()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
