const dns = require('dns');
const { MongoClient, ObjectId } = require('mongodb');

let client = null;
let database = null;

function resolveSrv(host) {
    return new Promise((resolve, reject) => {
        dns.resolveSrv(`_mongodb._tcp.${host}`, (error, records) => {
            if (error) reject(error);
            else resolve(records);
        });
    });
}

/**
 * Some Windows setups have a system DNS server that refuses SRV queries made
 * through Node's resolver, which breaks `mongodb+srv://` connection strings.
 * If the SRV lookup fails, retry once with public DNS servers (configurable).
 */
async function ensureSrvDns(uri) {
    if (!/^mongodb\+srv:\/\//i.test(uri)) return true;

    let host;
    try {
        host = new URL(uri).hostname;
    } catch (error) {
        return true;
    }

    try {
        await resolveSrv(host);
        return true;
    } catch (error) {
        const servers = (process.env.DNS_SERVERS || '8.8.8.8,1.1.1.1')
            .split(',')
            .map((server) => server.trim())
            .filter(Boolean);

        if (servers.length === 0) return false;

        console.warn(
            `[db] SRV lookup for ${host} failed (${error.code || error.message}); retrying with DNS ${servers.join(', ')}`
        );

        try {
            dns.setServers(servers);
            await resolveSrv(host);
            return true;
        } catch (retryError) {
            return false;
        }
    }
}

/**
 * Connect to MongoDB with the native driver.
 *
 * Uses MONGODB_URI when it is reachable. In development, if no MongoDB
 * server is available, it automatically starts an in-memory MongoDB
 * instance so the project can be demoed with zero setup.
 */
async function connectDatabase() {
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/foodies';

    try {
        await ensureSrvDns(uri);

        client = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
        await client.connect();
        database = client.db();
        console.log(`[db] connected to ${uri}`);
        return { memory: false, client, db: database };
    } catch (error) {
        if (client) {
            await client.close().catch(() => {});
            client = null;
            database = null;
        }

        const allowMemory =
            process.env.NODE_ENV !== 'production' && process.env.USE_MEMORY_DB !== 'false';

        if (!allowMemory) {
            throw error;
        }

        console.warn(`[db] could not reach ${uri}`);
        console.warn('[db] starting an in-memory MongoDB for development...');

        const { MongoMemoryServer } = require('mongodb-memory-server');
        const memoryServer = await MongoMemoryServer.create();

        client = new MongoClient(memoryServer.getUri());
        await client.connect();
        database = client.db('foodies');

        console.log('[db] in-memory MongoDB ready (data is lost when the server stops)');
        return { memory: true, memoryServer, client, db: database };
    }
}

function getDb() {
    if (!database) {
        throw new Error('Database is not connected.');
    }
    return database;
}

function getCollection(name) {
    return getDb().collection(name);
}

/** Convert a string/ObjectId into an ObjectId, or return null when invalid. */
function toObjectId(value) {
    if (value instanceof ObjectId) return value;
    if (typeof value !== 'string' || !/^[0-9a-fA-F]{24}$/.test(value)) return null;
    return new ObjectId(value);
}

async function disconnectDatabase() {
    if (client) {
        await client.close();
        client = null;
        database = null;
    }
}

module.exports = {
    connectDatabase,
    disconnectDatabase,
    getDb,
    getCollection,
    toObjectId,
    ObjectId
};
