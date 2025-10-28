import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function migrate() {
  console.log("🔄 Removing rpc_in_cents column from geo_brand_rankings...");
  
  try {
    await db.execute(sql`ALTER TABLE geo_brand_rankings DROP COLUMN IF EXISTS rpc_in_cents`);
    console.log("✅ rpc_in_cents column removed");
    
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
