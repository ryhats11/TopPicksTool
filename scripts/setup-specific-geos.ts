import { db } from "../server/db";
import { geos, geoBrandRankings } from "../shared/schema";
import { eq } from "drizzle-orm";

const desiredGeos = [
  { code: "USA", name: "USA" },
  { code: "AU", name: "Australia" },
  { code: "CA", name: "Canada" },
  { code: "UK", name: "UK" },
  { code: "NZ", name: "New Zealand" },
  { code: "ZA", name: "South Africa" },
  { code: "IE", name: "Ireland" },
  { code: "DE", name: "Germany" },
  { code: "IT", name: "Italy" },
  { code: "SE", name: "Sweden" },
  { code: "NL", name: "Netherlands" },
];

async function setupGeos() {
  console.log("🌍 Setting up specific GEOs...\n");

  // Get all existing GEOs
  const existingGeos = await db.select().from(geos);
  const existingCodes = new Set(existingGeos.map(g => g.code));
  const desiredCodes = new Set(desiredGeos.map(g => g.code));

  // Find GEOs to remove (existing but not in desired list)
  const geosToRemove = existingGeos.filter(g => !desiredCodes.has(g.code));
  
  // Remove unwanted GEOs
  if (geosToRemove.length > 0) {
    console.log("🗑️  Removing GEOs not in the list:");
    for (const geo of geosToRemove) {
      // Delete rankings first (cascade should handle this, but being explicit)
      await db.delete(geoBrandRankings).where(eq(geoBrandRankings.geoId, geo.id));
      await db.delete(geos).where(eq(geos.id, geo.id));
      console.log(`   ✓ Removed: ${geo.name} (${geo.code})`);
    }
    console.log();
  }

  // Add missing GEOs
  console.log("➕ Adding/verifying GEOs:");
  for (const geoData of desiredGeos) {
    if (existingCodes.has(geoData.code)) {
      console.log(`   ✓ Exists: ${geoData.name} (${geoData.code})`);
    } else {
      await db.insert(geos).values(geoData);
      console.log(`   ✓ Created: ${geoData.name} (${geoData.code})`);
    }
  }

  console.log("\n✅ GEO setup complete!");
  console.log(`   Total GEOs: ${desiredGeos.length}`);
  
  // Show final list
  const finalGeos = await db.select().from(geos);
  console.log("\n📍 Current GEOs:");
  finalGeos.forEach(geo => {
    console.log(`   - ${geo.name} (${geo.code})`);
  });
}

setupGeos()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
