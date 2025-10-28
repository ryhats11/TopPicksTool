import XLSX from "xlsx";
import { db } from "../server/db";
import { geos, brands, geoBrandRankings } from "../shared/schema";
import { eq } from "drizzle-orm";

const excelFilePath = "attached_assets/November Top Picks Order by GEO_1761691726701.xlsx";

async function importFromExcel() {
  console.log("📊 Reading Excel file...");
  
  // Read the workbook
  const workbook = XLSX.readFile(excelFilePath);
  
  // Get the first sheet
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  
  console.log(`   Sheet: ${sheetName}`);
  
  // Convert to JSON
  const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
  
  console.log(`   Rows: ${data.length}`);
  console.log("\n📋 First few rows:");
  data.slice(0, 5).forEach((row, idx) => {
    console.log(`   Row ${idx}:`, row);
  });
  
  // Parse the header to find GEO columns
  const headerRow = data[0];
  console.log("\n🔍 Header row:", headerRow);
  
  // Find GEO column pairs (each GEO has a name column and RPC column)
  const geoColumns: Array<{ name: string; code: string; brandCol: number; rpcCol: number }> = [];
  
  for (let i = 0; i < headerRow.length; i++) {
    const cell = headerRow[i];
    if (cell && typeof cell === 'string') {
      // Check if this looks like a GEO code or name
      const nextCell = headerRow[i + 1];
      if (nextCell && typeof nextCell === 'string' && nextCell.includes('RPC')) {
        // Found a GEO column
        geoColumns.push({
          name: cell,
          code: cell,
          brandCol: i,
          rpcCol: i + 1,
        });
      }
    }
  }
  
  console.log(`\n✅ Found ${geoColumns.length} GEO columns:`, geoColumns.map(g => g.name));
  
  // Collect all unique brands from all GEOs
  const uniqueBrands = new Set<string>();
  const geoRankingsData: Record<string, Array<{ brand: string; rpc: number; position: number }>> = {};
  
  // Parse data rows (skip header)
  for (const geoCol of geoColumns) {
    const rankings: Array<{ brand: string; rpc: number; position: number }> = [];
    
    for (let rowIdx = 1; rowIdx < data.length; rowIdx++) {
      const row = data[rowIdx];
      
      // Check if this row has a position number in the first column
      const position = row[0];
      if (!position || typeof position !== 'number') continue;
      
      const brandName = row[geoCol.brandCol];
      const rpcValue = row[geoCol.rpcCol];
      
      // Convert brandName to string and validate
      const brandStr = typeof brandName === 'string' ? brandName.trim() : String(brandName || '').trim();
      
      if (brandStr && brandStr !== 'new' && brandStr !== '' && brandStr !== 'undefined' && brandStr !== 'null') {
        uniqueBrands.add(brandStr);
        
        // Parse RPC value
        let rpc = 0;
        if (typeof rpcValue === 'number') {
          rpc = rpcValue;
        } else if (typeof rpcValue === 'string') {
          // Remove currency symbols and parse
          rpc = parseFloat(rpcValue.replace(/[€$,]/g, ''));
        }
        
        if (!isNaN(rpc) && rpc > 0) {
          rankings.push({
            brand: brandStr,
            rpc,
            position,
          });
        }
      }
    }
    
    if (rankings.length > 0) {
      geoRankingsData[geoCol.code] = rankings;
    }
  }
  
  console.log(`\n🎰 Found ${uniqueBrands.size} unique brands`);
  console.log(`📍 Found ${Object.keys(geoRankingsData).length} GEOs with rankings`);
  
  // Now insert into database
  console.log("\n💾 Inserting into database...");
  
  // 1. Insert GEOs
  console.log("\n📍 Inserting GEOs...");
  const geoRecords: Record<string, any> = {};
  
  for (const geoCol of geoColumns) {
    try {
      const [inserted] = await db.insert(geos).values({
        code: geoCol.code,
        name: geoCol.name,
      }).returning();
      geoRecords[geoCol.code] = inserted;
      console.log(`  ✓ Created GEO: ${geoCol.name} (${geoCol.code})`);
    } catch (error: any) {
      if (error.message?.includes('duplicate')) {
        console.log(`  ⊙ GEO already exists: ${geoCol.name} (${geoCol.code})`);
        // Fetch existing
        const [existing] = await db.select().from(geos).where(eq(geos.code, geoCol.code)).limit(1);
        if (existing) {
          geoRecords[geoCol.code] = existing;
        }
      } else {
        throw error;
      }
    }
  }
  
  // 2. Insert brands
  console.log("\n🎰 Inserting brands...");
  const brandRecords: Record<string, any> = {};
  
  for (const brandName of Array.from(uniqueBrands).sort()) {
    try {
      const [inserted] = await db.insert(brands).values({
        name: brandName,
        status: "active",
      }).returning();
      brandRecords[brandName] = inserted;
      console.log(`  ✓ Created brand: ${brandName}`);
    } catch (error: any) {
      if (error.message?.includes('duplicate')) {
        console.log(`  ⊙ Brand already exists: ${brandName}`);
        // Fetch existing
        const [existing] = await db.select().from(brands).where(eq(brands.name, brandName)).limit(1);
        if (existing) {
          brandRecords[brandName] = existing;
        }
      } else {
        throw error;
      }
    }
  }
  
  // 3. Insert rankings
  console.log("\n🏆 Inserting rankings...");
  
  for (const [geoCode, rankings] of Object.entries(geoRankingsData)) {
    const geoRecord = geoRecords[geoCode];
    if (!geoRecord) {
      console.log(`  ⚠ GEO not found: ${geoCode}`);
      continue;
    }
    
    console.log(`\n  Processing ${geoCode}...`);
    
    for (const ranking of rankings) {
      const brand = brandRecords[ranking.brand];
      if (!brand) {
        console.log(`    ⚠ Brand not found: ${ranking.brand}`);
        continue;
      }
      
      const rpcInCents = Math.round(ranking.rpc * 100);
      
      try {
        await db.insert(geoBrandRankings).values({
          geoId: geoRecord.id,
          brandId: brand.id,
          position: ranking.position,
          rpcInCents,
          timestamp: Date.now(),
        });
        console.log(`    ✓ Position ${ranking.position}: ${ranking.brand} (€${ranking.rpc.toFixed(2)})`);
      } catch (error: any) {
        if (error.message?.includes('duplicate')) {
          console.log(`    ⊙ Ranking already exists: Position ${ranking.position} - ${ranking.brand}`);
        } else {
          console.error(`    ❌ Error inserting ranking:`, error.message);
        }
      }
    }
  }
  
  console.log("\n✅ Import complete!");
}

importFromExcel()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Error:", error);
    process.exit(1);
  });
