import { db } from "../server/db";
import { sql } from "drizzle-orm";

async function migrate() {
  console.log("🔄 Renaming 'notes' column to 'affiliate_link'...");
  
  try {
    // Rename notes to affiliate_link
    await db.execute(sql`ALTER TABLE geo_brand_rankings RENAME COLUMN notes TO affiliate_link`);
    console.log("✅ Column renamed from 'notes' to 'affiliate_link'");
    
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
