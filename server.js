require('dotenv').config({ quiet: true });

const path = require('path');
const express = require('express');
const session = require('express-session');
const { MongoStore } = require('connect-mongo');
const helmet = require('helmet');

const { connectDatabase, disconnectDatabase, getDb } = require('./src/db');
const { ensureIndexes } = require('./src/models/indexes');
const { seedDatabase } = require('./src/seedData');
const config = require('./src/config');

const menuRoutes = require('./src/routes/menu');
const orderRoutes = require('./src/routes/orders');
const authRoutes = require('./src/routes/auth');
const adminRoutes = require('./src/routes/admin');
const customerRoutes = require('./src/routes/customers');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const isProduction = process.env.NODE_ENV === 'production';

if (process.env.TRUST_PROXY === 'true') {
    app.set('trust proxy', 1);
}

app.use(
    helmet({
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false
    })
);
app.use(express.json({ limit: '100kb' }));
app.use(express.urlencoded({ extended: false, limit: '100kb' }));

/* Public configuration used by the storefront */
app.get('/api/config', (req, res) => {
    res.json({
        delivery: config.delivery,
        estimatedDeliveryMinutes: config.estimatedDeliveryMinutes,
        maxItemQuantity: config.maxItemQuantity
    });
});

app.get('/api/health', async (req, res) => {
    try {
        await getDb().command({ ping: 1 });
        res.json({ ok: true, database: 'connected' });
    } catch (error) {
        res.json({ ok: false, database: 'disconnected' });
    }
});

let memoryServer = null;

async function start() {
    const connection = await connectDatabase();
    memoryServer = connection.memoryServer || null;

    await ensureIndexes();

    const seeded = await seedDatabase();
    if (seeded.admin && seeded.admin.created) {
        console.log(`[seed] admin account created: ${seeded.admin.email} / ${seeded.admin.password}`);
        console.log('[seed] change these credentials in .env before deploying.');
    }

    const store = MongoStore.create({
        client: connection.client,
        dbName: connection.db.databaseName,
        collectionName: 'sessions',
        ttl: 60 * 60 * 8
    });

    if (!process.env.SESSION_SECRET) {
        console.warn('[auth] SESSION_SECRET is not set — using an insecure development secret.');
    }

    app.use(
        session({
            name: 'foodies.sid',
            secret: process.env.SESSION_SECRET || 'foodies-development-secret',
            resave: false,
            saveUninitialized: false,
            store,
            cookie: {
                httpOnly: true,
                sameSite: 'lax',
                secure: isProduction && process.env.TRUST_PROXY === 'true',
                maxAge: 1000 * 60 * 60 * 8
            }
        })
    );

    /* API routes */
    app.use('/api/menu', menuRoutes);
    app.use('/api/orders', orderRoutes);
    app.use('/api/auth', authRoutes);
    app.use('/api/customers', customerRoutes);
    app.use('/api/admin', adminRoutes);

    app.use('/api', (req, res) => {
        res.status(404).json({ error: 'API endpoint not found.' });
    });

    /* Static storefront + admin panel */
    const publicDir = path.join(__dirname, 'public');
    app.use(
        express.static(publicDir, {
            extensions: ['html'],
            maxAge: isProduction ? '1h' : 0,
            setHeaders(res, filePath) {
                if (filePath.endsWith('.html')) {
                    res.setHeader('Cache-Control', 'no-cache');
                }
            }
        })
    );

    /* Central error handler */
    // eslint-disable-next-line no-unused-vars
    app.use((error, req, res, next) => {
        if (error.code === 11000) {
            return res.status(409).json({ error: 'That record already exists.' });
        }

        const status = error.status || 500;
        if (status >= 500) console.error('[error]', error);

        return res.status(status).json({
            error: status >= 500 ? 'Something went wrong. Please try again.' : error.message
        });
    });

    const server = app.listen(PORT, () => {
        console.log('');
        console.log(`  Foodies is running at http://localhost:${PORT}`);
        console.log(`  Admin panel      at http://localhost:${PORT}/admin/`);
        console.log('');
    });

    const shutdown = async (signal) => {
        console.log(`\n[server] ${signal} received, shutting down...`);
        server.close(async () => {
            await disconnectDatabase().catch(() => {});
            if (memoryServer) await memoryServer.stop().catch(() => {});
            process.exit(0);
        });
    };

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));
}

start().catch((error) => {
    console.error('[server] failed to start:', error);
    process.exit(1);
});
