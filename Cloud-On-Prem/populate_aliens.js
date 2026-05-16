// Script to populate missing Alien cards
import { sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { cards, cardStats, cardCollections, collectionStatTypes } from "./shared/schema.js";

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("DATABASE_URL not found in environment");
  process.exit(1);
}

const client = postgres(DATABASE_URL);
const db = drizzle(client);

// Alien names for the missing 29 cards
const alienNames = [
  "Zephyrian", "Kythara", "Vorthak", "Nexillian", "Drakmori", "Sylthren", "Mortaan", 
  "Zelthara", "Kyrneth", "Voxilan", "Threxor", "Nyxalon", "Qelthari", "Ryzakk",
  "Sylvox", "Krenthia", "Vyronn", "Zelkoth", "Nythari", "Qrixan", "Thyxara",
  "Vekronii", "Zylthek", "Morphex", "Kythron", "Vylthari", "Nexthara", "Drekthos", "Xyrvani"
];

async function populateAliens() {
  try {
    // Get Aliens collection ID and stat types
    const [aliensCollection] = await db.select().from(cardCollections).where(sql`name = 'Aliens'`);
    if (!aliensCollection) {
      console.error("Aliens collection not found");
      process.exit(1);
    }

    const statTypes = await db.select().from(collectionStatTypes)
      .where(sql`collection_id = ${aliensCollection.id}`)
      .orderBy(sql`display_order`);

    console.log(`Found ${statTypes.length} stat types for Aliens collection`);
    console.log(`Creating ${alienNames.length} alien cards...`);

    // Create each alien card with stats
    for (let i = 0; i < alienNames.length; i++) {
      const alienName = alienNames[i];
      const displayOrder = i + 2; // Start from 2 since Glaurung is 1

      // Insert card
      const [newCard] = await db.insert(cards).values({
        collectionId: aliensCollection.id,
        name: alienName,
        imageKey: null, // No specific image
        displayOrder: displayOrder
      }).returning();

      // Generate realistic alien stats
      const stats = [
        { statTypeId: statTypes[0].id, value: (Math.random() * 50 + 1).toFixed(2) }, // Distance (1-50 light years)
        { statTypeId: statTypes[1].id, value: Math.floor(Math.random() * 50000 + 1000).toString() }, // Race Age (1000-50000 years)
        { statTypeId: statTypes[2].id, value: Math.floor(Math.random() * 100 + 1).toString() }, // Danger Level (1-100)
        { statTypeId: statTypes[3].id, value: Math.floor(Math.random() * 500 + 50).toString() }, // Lifespan (50-500 years)
        { statTypeId: statTypes[4].id, value: (Math.random() * 100 + 0.1).toFixed(1) }, // Population (0.1-100 thousand)
      ];

      // Insert card stats
      for (const stat of stats) {
        await db.insert(cardStats).values({
          cardId: newCard.id,
          statTypeId: stat.statTypeId,
          value: stat.value
        });
      }

      console.log(`✅ Created ${alienName} with ${stats.length} stats`);
    }

    console.log(`🎉 Successfully created ${alienNames.length} alien cards!`);
    console.log("Aliens collection now has 30 cards total (1 existing + 29 new)");
    
  } catch (error) {
    console.error("Error populating aliens:", error);
  } finally {
    await client.end();
  }
}

populateAliens();