const express = require('express');
const rateLimit = require('express-rate-limit');
const { toObjectId } = require('../db');
const {
    customers,
    hashPassword,
    checkPassword,
    serializeCustomer
} = require('../models/Customer');
const { orders, serializeOrder } = require('../models/Order');
const { ValidationError, text, email, phone } = require('../utils/validate');

const router = express.Router();

const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many attempts. Please try again in a few minutes.' }
});

function passwordFrom(value) {
    const password = typeof value === 'string' ? value : '';

    if (!password) {
        throw new ValidationError('Password is required.');
    }
    if (password.length < 8) {
        throw new ValidationError('Password must be at least 8 characters.');
    }
    if (password.length > 200) {
        throw new ValidationError('Password is too long.');
    }

    return password;
}

function optionalPhone(value) {
    if (value === undefined || value === null || String(value).trim() === '') return '';
    return phone(value, { field: 'Phone number', required: false });
}

function currentCustomerId(req) {
    return req.session && req.session.customerId ? toObjectId(req.session.customerId) : null;
}

async function requireCustomer(req, res) {
    const id = currentCustomerId(req);
    if (!id) {
        res.status(401).json({ error: 'Please sign in to your account.' });
        return null;
    }

    const customer = await customers().findOne({ _id: id });
    if (!customer) {
        res.status(401).json({ error: 'Your session expired. Please sign in again.' });
        return null;
    }

    return customer;
}

/* POST /api/customers/signup */
router.post('/signup', authLimiter, async (req, res, next) => {
    try {
        const body = req.body || {};
        const name = text(body.name, { field: 'Name', max: 80 });
        const emailAddress = email(body.email, { field: 'Email', required: true });
        const password = passwordFrom(body.password);
        const phoneNumber = optionalPhone(body.phone);
        const address = text(body.address, { field: 'Delivery address', required: false, max: 300 });

        const existing = await customers().findOne({ email: emailAddress }, { projection: { _id: 1 } });
        if (existing) {
            return res.status(409).json({ error: 'An account with this email already exists.' });
        }

        const passwordHash = await hashPassword(password);
        const now = new Date();
        const document = {
            name,
            email: emailAddress,
            passwordHash,
            phone: phoneNumber,
            address,
            lastLoginAt: now,
            createdAt: now,
            updatedAt: now
        };

        let insertedId;

        try {
            const result = await customers().insertOne(document);
            insertedId = result.insertedId;
        } catch (error) {
            if (error.code === 11000) {
                return res.status(409).json({ error: 'An account with this email already exists.' });
            }
            throw error;
        }

        document._id = insertedId;

        return req.session.regenerate((error) => {
            if (error) return next(error);

            req.session.customerId = insertedId.toString();
            return req.session.save((saveError) => {
                if (saveError) return next(saveError);
                return res.status(201).json({ customer: serializeCustomer(document) });
            });
        });
    } catch (error) {
        return next(error);
    }
});

/* POST /api/customers/signin */
router.post('/signin', authLimiter, async (req, res, next) => {
    try {
        const body = req.body || {};
        const emailAddress = email(body.email, { field: 'Email', required: true });
        const password = typeof body.password === 'string' ? body.password : '';

        if (!password) {
            throw new ValidationError('Password is required.');
        }

        const customer = await customers().findOne({ email: emailAddress });

        if (!customer || !(await checkPassword(password, customer.passwordHash))) {
            return res.status(401).json({ error: 'Incorrect email or password.' });
        }

        const now = new Date();
        await customers().updateOne(
            { _id: customer._id },
            { $set: { lastLoginAt: now, updatedAt: now } }
        );

        return req.session.regenerate((error) => {
            if (error) return next(error);

            req.session.customerId = customer._id.toString();
            return req.session.save((saveError) => {
                if (saveError) return next(saveError);
                return res.json({ customer: serializeCustomer({ ...customer, lastLoginAt: now }) });
            });
        });
    } catch (error) {
        return next(error);
    }
});

/* POST /api/customers/signout */
router.post('/signout', (req, res) => {
    if (!req.session) return res.json({ ok: true });

    return req.session.destroy(() => {
        res.clearCookie('foodies.sid');
        res.json({ ok: true });
    });
});

/* GET /api/customers/me */
router.get('/me', async (req, res, next) => {
    try {
        const id = currentCustomerId(req);
        const customer = id ? await customers().findOne({ _id: id }) : null;

        if (!customer) {
            return res.json({ customer: null });
        }

        return res.json({ customer: serializeCustomer(customer) });
    } catch (error) {
        return next(error);
    }
});

/* PATCH /api/customers/me — update profile details */
router.patch('/me', async (req, res, next) => {
    try {
        const customer = await requireCustomer(req, res);
        if (!customer) return undefined;

        const body = req.body || {};
        const update = {};

        if (body.name !== undefined) {
            update.name = text(body.name, { field: 'Name', max: 80 });
        }
        if (body.phone !== undefined) {
            update.phone = optionalPhone(body.phone);
        }
        if (body.address !== undefined) {
            update.address = text(body.address, {
                field: 'Delivery address',
                required: false,
                max: 300
            });
        }

        if (Object.keys(update).length === 0) {
            return res.json({ customer: serializeCustomer(customer) });
        }

        update.updatedAt = new Date();
        await customers().updateOne({ _id: customer._id }, { $set: update });

        const updated = await customers().findOne({ _id: customer._id });
        return res.json({ customer: serializeCustomer(updated) });
    } catch (error) {
        return next(error);
    }
});

/* GET /api/customers/orders — orders placed by the signed-in customer */
router.get('/orders', async (req, res, next) => {
    try {
        const customer = await requireCustomer(req, res);
        if (!customer) return undefined;

        const filters = [{ customerId: customer._id }];
        if (customer.email) {
            filters.push({ 'customer.email': customer.email });
        }

        const list = await orders()
            .find({ $or: filters })
            .sort({ createdAt: -1 })
            .limit(50)
            .toArray();

        return res.json({
            orders: list.map((order) => serializeOrder(order, { forCustomer: true }))
        });
    } catch (error) {
        return next(error);
    }
});

module.exports = router;
