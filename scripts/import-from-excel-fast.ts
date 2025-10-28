import XLSX from "xlsx";
import { db } from "../server/db";
import { geos, brands, geoBrandRankings } from "../shared/schema";
import { eq, and } from "drizzle-orm";

const excelFilePath = "attached_assets/November Top Picks Order by GEO_1761691726701.xlsx";

async function importFromExcel() {
  console.log("📊 Reading Excel file...");
  
  const workbook = XLSX.readFile(excelFilePath);
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
  
  console.log(`   Sheet: ${sheetName}, Rows: ${data.length}`);
  
  const headerRow = data[0];
  
  // Find GEO columns
  const geoColumns: Array<{ name: string; code: string; brandCol: number; rpcCol: number }> = [];
  for (let i = 0; i < headerRow.length; i++) {
    const cell = headerRow[i];
    if (cell && typeof cell === 'string') {
      const nextCell = headerRow[i + 1];
      if (nextCell && typeof nextCell === 'string' && nextCell.includes('RPC')) {
        geoColumns.push({
          name: cell,
          code: cell,
          brandCol: i,
          rpcCol: i + 1,
        });
      }
    }
  }
  
  console.log(`✅ Found ${geoColumns.length} GEOs:`, geoColumns.map(g => g.name).join(', '));
  
  // Collect unique brands and rankings
  const uniqueBrands = new Set<string>();
  const geoRankingsData: Record<string, Array<{ brand: string; rpc: number; position: number }>> = {};
  
  for (const geoCol of geoColumns) {
    const rankings: Array<{ brand: string; rpc: number; position: number }> = [];
    
    for (let rowIdx = 1; rowIdx < Math.min(data.length, 50); rowIdx++) { // Limit to first 50 rows for top rankings
      const row = data[rowIdx];
      const position = row[0];
      if (!position || typeof position !== 'number') continue;
      
      const brandName = row[geoCol.brandCol];
      const rpcValue = row[geoCol.rpcCol];
      
      const brandStr = typeof brandName === 'string' ? brandName.trim() : String(brandName || '').trim();
      
      if (brandStr && brandStr !== 'new' && brandStr !== '' && brandStr !== 'undefined' && brandStr !== 'null') {
        uniqueBrands.add(brandStr);
        
        let rpc = 0;
        if (typeof rpcValue === 'number') {
          rpc = rpcValue;
        } else if (typeof rpcValue === 'string') {
          rpc = parseFloat(rpcValue.replace(/[€$,]/g, ''));
        }
        
        if (!isNaN(rpc) && rpc > 0) {
          rankings.push({ brand: brandStr, rpc, position });
        }
      }
    }
    
    if (rankings.length > 0) {
      geoRankingsData[geoCol.code] = rankings;
    }
  }
  
  console.log(`\n🎰 Found ${uniqueBrands.size} unique brands`);
  
  // Fetch existing GEOs and brands
  const existingGeos = await db.select().from(geos);
  const existingBrands = await db.select().from(brands);
  
  const geoRecords: Record<string, any> = {};
  const brandRecords: Record<string, any> = {};
  
  // Map existing records
  for (const geo of existingGeos) {
    geoRecords[geo.code] = geo;
  }
  for (const brand of existingBrands) {
    brandRecords[brand.name] = brand;
  }
  
  // Insert missing GEOs
  console.log("\n📍 Processing GEOs...");
  for (const geoCol of geoColumns) {
    if (!geoRecords[geoCol.code]) {
      const [inserted] = await db.insert(geos).values({
        code: geoCol.code,
        name: geoCol.name,
      }).returning();
      geoRecords[geoCol.code] = inserted;
      console.log(`  ✓ Created: ${geoCol.name}`);
    } else {
      console.log(`  ✓ Exists: ${geoCol.name}`);
    }
  }
  
  // Insert missing brands
  console.log("\n🎰 Processing brands...");
  let newBrandCount = 0;
  for (const brandName of Array.from(uniqueBrands).sort()) {
    if (!brandRecords[brandName]) {
      const [inserted] = await db.insert(brands).values({
        name: brandName,
        status: "active",
      }).returning();
      brandRecords[brandName] = inserted;
      newBrandCount++;
    }
  }
  console.log(`  ✓ Created ${newBrandCount} new brands`);
  console.log(`  ✓ Total brands: ${Object.keys(brandRecords).length}`);
  
  // Insert rankings
  console.log("\n🏆 Inserting rankings...");
  let insertedCount = 0;
  let skippedCount = 0;
  
  for (const [geoCode, rankings] of Object.entries(geoRankingsData)) {
    const geoRecord = geoRecords[geoCode];
    if (!geoRecord) continue;
    
    // Clear existing rankings for this GEO first
    await db.delete(geoBrandRankings).where(eq(geoBrandRankings.geoId, geoRecord.id));
    
    console.log(`\n  ${geoCode}: Inserting ${rankings.length} rankings...`);
    
    for (const ranking of rankings) {
      const brand = brandRecords[ranking.brand];
      if (!brand) continue;
      
      const rpcInCents = Math.round(ranking.rpc * 100);
      
      try {
        await db.insert(geoBrandRankings).values({
          geoId: geoRecord.id,
          brandId: brand.id,
          position: ranking.position,
          rpcInCents,
          timestamp: Date.now(),
        });
        insertedCount++;
      } catch (error: any) {
        skippedCount++;
      }
    }
  }
  
  console.log(`\n✅ Import complete!`);
  console.log(`   Inserted: ${insertedCount} rankings`);
  console.log(`   Skipped: ${skippedCount} rankings`);
}

importFromExcel()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
