const express = require('express');
const { toObjectId } = require('../db');
const { foods, withFoodDefaults, serializeFood } = require('../models/Food');
const { orders, serializeOrder, ORDER_STATUSES, ACTIVE_STATUSES } = require('../models/Order');
const requireAdmin = require('../middleware/requireAdmin');
const { buildFoodPayload } = require('../utils/foodPayload');
const { ValidationError, text, escapeRegex, normalizePhone } = require('../utils/validate');

const router = express.Router();

/* Every route below requires an admin session */
router.use(requireAdmin);

/* GET /api/admin/stats — dashboard summary */
router.get('/stats', async (req, res, next) => {
    try {
        const startOfToday = new Date();
        startOfToday.setHours(0, 0, 0, 0);

        const orderCollection = orders();

        const [
            totalOrders,
            todayOrders,
            activeOrders,
            revenueAgg,
            deliveredAgg,
            menuCount,
            customerKeys,
            statusCounts,
            recentOrders
        ] = await Promise.all([
            orderCollection.countDocuments(),
            orderCollection.countDocuments({ createdAt: { $gte: startOfToday } }),
            orderCollection.countDocuments({ status: { $in: ACTIVE_STATUSES } }),
            orderCollection
                .aggregate([
                    { $match: { status: { $ne: 'cancelled' } } },
                    { $group: { _id: null, total: { $sum: '$total' } } }
                ])
                .toArray(),
            orderCollection
                .aggregate([
                    { $match: { status: 'delivered' } },
                    { $group: { _id: null, total: { $sum: '$total' } } }
                ])
                .toArray(),
            foods().countDocuments(),
            orderCollection.distinct('customer.phoneKey'),
            orderCollection
                .aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }])
                .toArray(),
            orderCollection.find().sort({ createdAt: -1 }).limit(6).toArray()
        ]);

        const counts = {};
        for (const status of ORDER_STATUSES) counts[status] = 0;
        for (const row of statusCounts) counts[row._id] = row.count;

        res.json({
            stats: {
                totalOrders,
                todayOrders,
                activeOrders,
                revenue: Math.round((revenueAgg[0]?.total || 0) * 100) / 100,
                deliveredRevenue: Math.round((deliveredAgg[0]?.total || 0) * 100) / 100,
                menuCount,
                customerCount: customerKeys.length,
                statusCounts: counts
            },
            recentOrders: recentOrders.map((order) => serializeOrder(order))
        });
    } catch (error) {
        next(error);
    }
});

/* GET /api/admin/orders?status=&q=&page=&limit= */
router.get('/orders', async (req, res, next) => {
    try {
        const filter = {};
        const status = String(req.query.status || '').trim();

        if (status && status !== 'all') {
            if (!ORDER_STATUSES.includes(status)) {
                throw new ValidationError('Unknown order status.');
            }
            filter.status = status;
        }

        const q = String(req.query.q || '').trim().slice(0, 80);
        if (q) {
            const pattern = new RegExp(escapeRegex(q), 'i');
            filter.$or = [{ orderNumber: pattern }, { 'customer.name': pattern }];

            const digits = normalizePhone(q);
            if (digits.length >= 3) {
                filter.$or.push({ 'customer.phoneKey': new RegExp(escapeRegex(digits)) });
            }
        }

        const page = Math.max(1, Number(req.query.page) || 1);
        const limit = Math.min(100, Math.max(5, Number(req.query.limit) || 25));

        const orderCollection = orders();

        const [orderList, total] = await Promise.all([
            orderCollection
                .find(filter)
                .sort({ createdAt: -1 })
                .skip((page - 1) * limit)
                .limit(limit)
                .toArray(),
            orderCollection.countDocuments(filter)
        ]);

        res.json({
            orders: orderList.map((order) => serializeOrder(order)),
            total,
            page,
            pages: Math.max(1, Math.ceil(total / limit))
        });
    } catch (error) {
        next(error);
    }
});

/* GET /api/admin/orders/:id */
router.get('/orders/:id', async (req, res, next) => {
    try {
        const id = toObjectId(req.params.id);
        if (!id) {
            return res.status(404).json({ error: 'Order not found.' });
        }

        const order = await orders().findOne({ _id: id });
        if (!order) return res.status(404).json({ error: 'Order not found.' });

        return res.json({ order: serializeOrder(order) });
    } catch (error) {
        return next(error);
    }
});

/* PATCH /api/admin/orders/:id/status */
router.patch('/orders/:id/status', async (req, res, next) => {
    try {
        const id = toObjectId(req.params.id);
        if (!id) {
            return res.status(404).json({ error: 'Order not found.' });
        }

        const status = String((req.body || {}).status || '');
        if (!ORDER_STATUSES.includes(status)) {
            throw new ValidationError('Choose a valid order status.');
        }

        const note = text((req.body || {}).note, { field: 'Note', required: false, max: 200 });

        const order = await orders().findOne({ _id: id });
        if (!order) return res.status(404).json({ error: 'Order not found.' });

        if (order.status === status) {
            return res.json({ order: serializeOrder(order) });
        }

        const now = new Date();
        const update = {
            status,
            updatedAt: now
        };

        if (status === 'delivered') {
            update.deliveredAt = now;
            update.cancelledAt = null;
        } else if (status === 'cancelled') {
            update.cancelledAt = now;
        } else {
            update.deliveredAt = null;
            update.cancelledAt = null;
        }

        await orders().updateOne(
            { _id: id },
            {
                $set: update,
                $push: {
                    statusHistory: {
                        status,
                        note: note || 'Status updated by the restaurant.',
                        at: now
                    }
                }
            }
        );

        const updated = await orders().findOne({ _id: id });
        return res.json({ order: serializeOrder(updated) });
    } catch (error) {
        return next(error);
    }
});

/* DELETE /api/admin/orders/:id */
router.delete('/orders/:id', async (req, res, next) => {
    try {
        const id = toObjectId(req.params.id);
        if (!id) {
            return res.status(404).json({ error: 'Order not found.' });
        }

        const result = await orders().deleteOne({ _id: id });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'Order not found.' });

        return res.json({ ok: true });
    } catch (error) {
        return next(error);
    }
});

/* GET /api/admin/menu — includes unavailable items */
router.get('/menu', async (req, res, next) => {
    try {
        const items = await foods().find().sort({ sortOrder: 1, name: 1 }).toArray();
        res.json({ items: items.map(serializeFood) });
    } catch (error) {
        next(error);
    }
});

/* POST /api/admin/menu */
router.post('/menu', async (req, res, next) => {
    try {
        const payload = withFoodDefaults(buildFoodPayload(req.body || {}));
        const now = new Date();
        const document = { ...payload, createdAt: now, updatedAt: now };

        const result = await foods().insertOne(document);
        document._id = result.insertedId;

        res.status(201).json({ item: serializeFood(document) });
    } catch (error) {
        next(error);
    }
});

/* PUT /api/admin/menu/:id */
router.put('/menu/:id', async (req, res, next) => {
    try {
        const id = toObjectId(req.params.id);
        if (!id) {
            return res.status(404).json({ error: 'Menu item not found.' });
        }

        const payload = buildFoodPayload(req.body || {});
        const result = await foods().updateOne(
            { _id: id },
            { $set: { ...payload, updatedAt: new Date() } }
        );

        if (result.matchedCount === 0) return res.status(404).json({ error: 'Menu item not found.' });

        const item = await foods().findOne({ _id: id });
        return res.json({ item: serializeFood(item) });
    } catch (error) {
        return next(error);
    }
});

/* DELETE /api/admin/menu/:id */
router.delete('/menu/:id', async (req, res, next) => {
    try {
        const id = toObjectId(req.params.id);
        if (!id) {
            return res.status(404).json({ error: 'Menu item not found.' });
        }

        const result = await foods().deleteOne({ _id: id });
        if (result.deletedCount === 0) return res.status(404).json({ error: 'Menu item not found.' });

        return res.json({ ok: true });
    } catch (error) {
        return next(error);
    }
});

module.exports = router;
