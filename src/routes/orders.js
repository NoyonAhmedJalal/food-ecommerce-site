const express = require('express');
const { toObjectId } = require('../db');
const { foods } = require('../models/Food');
const { orders, serializeOrder } = require('../models/Order');
const config = require('../config');
const { generateOrderNumber } = require('../utils/orderNumber');
const {
    ValidationError,
    text,
    integer,
    email,
    phone,
    normalizePhone
} = require('../utils/validate');

const router = express.Router();

function round(value) {
    return Math.round(value * 100) / 100;
}

function deliveryFeeFor(subtotal) {
    return subtotal >= config.delivery.freeAt ? 0 : config.delivery.fee;
}

function customerOrder(order) {
    return serializeOrder(order, { forCustomer: true });
}

/* POST /api/orders — place an order from the cart */
router.post('/', async (req, res, next) => {
    try {
        const body = req.body || {};
        const rawItems = Array.isArray(body.items) ? body.items : [];

        if (rawItems.length === 0) {
            throw new ValidationError('Your cart is empty.');
        }

        /* Merge duplicate lines and validate quantities */
        const quantities = new Map();
        for (const line of rawItems) {
            const foodId = String(line.foodId || line.id || '');
            const objectId = toObjectId(foodId);
            if (!objectId) {
                throw new ValidationError('Your cart contains an invalid item.');
            }
            const qty = integer(line.qty, { field: 'Quantity', min: 1, max: config.maxItemQuantity });
            const key = objectId.toString();
            quantities.set(key, Math.min(config.maxItemQuantity, (quantities.get(key) || 0) + qty));
        }

        const totalQty = [...quantities.values()].reduce((sum, qty) => sum + qty, 0);
        if (totalQty > config.maxOrderItems) {
            throw new ValidationError(`Orders are limited to ${config.maxOrderItems} items.`);
        }

        const foodIds = [...quantities.keys()].map((id) => toObjectId(id));
        const foodList = await foods().find({ _id: { $in: foodIds } }).toArray();
        const foodById = new Map(foodList.map((food) => [food._id.toString(), food]));

        const unavailable = [];
        const items = [];

        for (const [foodId, qty] of quantities) {
            const food = foodById.get(foodId);
            if (!food || !food.available) {
                if (food) unavailable.push(food.name);
                continue;
            }
            items.push({
                food: food._id,
                name: food.name,
                price: food.price,
                qty,
                image: food.image
            });
        }

        if (unavailable.length > 0) {
            throw new ValidationError(
                `Sorry, these items are no longer available: ${unavailable.join(', ')}.`
            );
        }

        if (items.length === 0) {
            throw new ValidationError('None of the items in your cart could be ordered.');
        }

        const customer = body.customer || {};
        const customerData = {
            name: text(customer.name, { field: 'Name', max: 80 }),
            phone: phone(customer.phone, { field: 'Phone number' }),
            email: email(customer.email, { field: 'Email', required: false }),
            address: text(customer.address, { field: 'Delivery address', max: 300 })
        };
        customerData.phoneKey = normalizePhone(customerData.phone);

        const note = text(body.note, { field: 'Note', required: false, max: 300 });
        const customerId =
            req.session && req.session.customerId ? toObjectId(req.session.customerId) : null;

        const subtotal = round(items.reduce((sum, item) => sum + item.price * item.qty, 0));
        const deliveryFee = deliveryFeeFor(subtotal);
        const total = round(subtotal + deliveryFee);

        const estimatedDelivery = new Date(Date.now() + config.estimatedDeliveryMinutes * 60 * 1000);
        const now = new Date();

        let order = null;
        for (let attempt = 0; attempt < 4 && !order; attempt += 1) {
            const document = {
                orderNumber: await generateOrderNumber(),
                customer: customerData,
                items,
                subtotal,
                deliveryFee,
                total,
                status: 'placed',
                statusHistory: [
                    { status: 'placed', note: 'Order received. Waiting for confirmation.', at: now }
                ],
                note,
                estimatedDelivery,
                deliveredAt: null,
                cancelledAt: null,
                createdAt: now,
                updatedAt: now
            };

            if (customerId) {
                document.customerId = customerId;
            }

            try {
                const result = await orders().insertOne(document);
                document._id = result.insertedId;
                order = document;
            } catch (error) {
                // Duplicate order number: generate another one.
                if (error.code !== 11000 || attempt === 3) throw error;
            }
        }

        res.status(201).json({ order: customerOrder(order) });
    } catch (error) {
        next(error);
    }
});

/* GET /api/orders/track/:orderNumber?phone=... — public order tracking */
router.get('/track/:orderNumber', async (req, res, next) => {
    try {
        const orderNumber = text(req.params.orderNumber, { field: 'Order number', max: 30 });
        const phoneKey = normalizePhone(req.query.phone);
        const customerId =
            req.session && req.session.customerId ? toObjectId(req.session.customerId) : null;

        const order = await orders().findOne({ orderNumber: orderNumber.toUpperCase() });

        const isOwner =
            Boolean(customerId) &&
            Boolean(order && order.customerId) &&
            order.customerId.equals(customerId);

        if (!order) {
            return res
                .status(404)
                .json({ error: 'No order found with that number and phone. Please check and try again.' });
        }

        if (!isOwner) {
            if (!phoneKey) {
                throw new ValidationError('Enter the phone number used for the order.');
            }
            if (order.customer.phoneKey !== phoneKey) {
                return res.status(404).json({
                    error: 'No order found with that number and phone. Please check and try again.'
                });
            }
        }

        res.json({ order: customerOrder(order) });
    } catch (error) {
        next(error);
    }
});

/* PATCH /api/orders/:orderNumber/cancel — customer cancellation */
router.patch('/:orderNumber/cancel', async (req, res, next) => {
    try {
        const orderNumber = text(req.params.orderNumber, { field: 'Order number', max: 30 });
        const phoneKey = normalizePhone((req.body || {}).phone);
        const customerId =
            req.session && req.session.customerId ? toObjectId(req.session.customerId) : null;

        const order = await orders().findOne({ orderNumber: orderNumber.toUpperCase() });

        const isOwner =
            Boolean(customerId) &&
            Boolean(order && order.customerId) &&
            order.customerId.equals(customerId);

        if (!order) {
            return res.status(404).json({ error: 'Order not found.' });
        }

        if (!isOwner) {
            if (!phoneKey) {
                throw new ValidationError('Enter the phone number used for the order.');
            }
            if (order.customer.phoneKey !== phoneKey) {
                return res.status(404).json({ error: 'Order not found.' });
            }
        }

        if (!['placed', 'confirmed'].includes(order.status)) {
            return res.status(409).json({
                error: 'This order can no longer be cancelled. Please contact the restaurant.'
            });
        }

        const now = new Date();
        const result = await orders().updateOne(
            { _id: order._id, status: { $in: ['placed', 'confirmed'] } },
            {
                $set: { status: 'cancelled', cancelledAt: now, updatedAt: now },
                $push: {
                    statusHistory: {
                        status: 'cancelled',
                        note: 'Cancelled by the customer.',
                        at: now
                    }
                }
            }
        );

        if (result.modifiedCount === 0) {
            return res.status(409).json({
                error: 'This order can no longer be cancelled. Please contact the restaurant.'
            });
        }

        const updated = await orders().findOne({ _id: order._id });

        res.json({ order: customerOrder(updated) });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
