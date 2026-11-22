/* CLI seed script:  npm run seed   (add --force to reset the menu) */
require('dotenv').config({ quiet: true });

const { connectDatabase, disconnectDatabase } = require('./db');
const { ensureIndexes } = require('./models/indexes');
const { seedDatabase } = require('./seedData');

async function main() {
    const force = process.argv.includes('--force');

    const { memoryServer } = await connectDatabase();
    await ensureIndexes();
    const result = await seedDatabase({ force });

    console.log(`[seed] menu items in database: ${result.menuCount}`);

    if (result.admin && result.admin.created) {
        console.log(`[seed] admin created: ${result.admin.email} / ${result.admin.password}`);
    } else if (result.admin) {
        console.log(`[seed] admin already exists: ${result.admin.email}`);
    }

    await disconnectDatabase();
    if (memoryServer) await memoryServer.stop();
}

main().catch((error) => {
    console.error('[seed] failed:', error.message);
    process.exit(1);
});
