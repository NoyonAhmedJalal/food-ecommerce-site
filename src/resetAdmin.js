/* Create or reset the admin account from ADMIN_EMAIL / ADMIN_PASSWORD in .env */
require('dotenv').config({ quiet: true });

const { connectDatabase, disconnectDatabase } = require('./db');
const { admins, hashPassword } = require('./models/Admin');

async function main() {
    const { memoryServer } = await connectDatabase();

    if (memoryServer) {
        console.warn('[admin] connected to the temporary in-memory database.');
        console.warn('[admin] Start a real MongoDB and run this again to persist the account.');
    }

    const email = (process.env.ADMIN_EMAIL || 'admin@foodies.com').toLowerCase();
    const password = process.env.ADMIN_PASSWORD || 'Admin@123';
    const name = process.env.ADMIN_NAME || 'Foodies Admin';

    const passwordHash = await hashPassword(password);
    const now = new Date();

    const existing = await admins().findOne({ email }, { projection: { _id: 1 } });

    if (existing) {
        await admins().updateOne(
            { _id: existing._id },
            { $set: { name, passwordHash, updatedAt: now } }
        );
    } else {
        await admins().insertOne({
            name,
            email,
            passwordHash,
            lastLoginAt: null,
            createdAt: now,
            updatedAt: now
        });
    }

    console.log(`[admin] account ready: ${email}`);
    console.log(`[admin] password: ${password}`);

    await disconnectDatabase();
    if (memoryServer) await memoryServer.stop();
}

main().catch((error) => {
    console.error('[admin] failed:', error.message);
    process.exit(1);
});
