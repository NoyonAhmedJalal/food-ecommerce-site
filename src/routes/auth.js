const express = require('express');
const rateLimit = require('express-rate-limit');
const { toObjectId } = require('../db');
const { admins, checkPassword, serializeAdmin } = require('../models/Admin');
const { ValidationError, email } = require('../utils/validate');

const router = express.Router();

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many sign-in attempts. Please try again in a few minutes.' }
});

/* POST /api/auth/login */
router.post('/login', loginLimiter, async (req, res, next) => {
    try {
        const body = req.body || {};
        const emailAddress = email(body.email, { field: 'Email', required: true });
        const password = typeof body.password === 'string' ? body.password : '';

        if (!password) {
            throw new ValidationError('Password is required.');
        }
        if (password.length > 200) {
            throw new ValidationError('Password is too long.');
        }

        const admin = await admins().findOne({ email: emailAddress });

        if (!admin || !(await checkPassword(password, admin.passwordHash))) {
            return res.status(401).json({ error: 'Incorrect email or password.' });
        }

        const now = new Date();
        await admins().updateOne(
            { _id: admin._id },
            { $set: { lastLoginAt: now, updatedAt: now } }
        );

        return req.session.regenerate((error) => {
            if (error) return next(error);

            req.session.adminId = admin._id.toString();
            return req.session.save((saveError) => {
                if (saveError) return next(saveError);
                return res.json({ admin: serializeAdmin({ ...admin, lastLoginAt: now }) });
            });
        });
    } catch (error) {
        return next(error);
    }
});

/* POST /api/auth/logout */
router.post('/logout', (req, res) => {
    if (!req.session) return res.json({ ok: true });

    return req.session.destroy(() => {
        res.clearCookie('foodies.sid');
        res.json({ ok: true });
    });
});

/* GET /api/auth/me — returns the signed-in admin, or null */
router.get('/me', async (req, res, next) => {
    try {
        if (!req.session || !req.session.adminId) {
            return res.json({ admin: null });
        }

        const id = toObjectId(req.session.adminId);
        const admin = id ? await admins().findOne({ _id: id }) : null;

        if (!admin) {
            return req.session.destroy(() => res.json({ admin: null }));
        }

        return res.json({ admin: serializeAdmin(admin) });
    } catch (error) {
        return next(error);
    }
});

module.exports = router;
