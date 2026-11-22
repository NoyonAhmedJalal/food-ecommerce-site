const { toObjectId } = require('../db');
const { admins } = require('../models/Admin');

async function requireAdmin(req, res, next) {
    try {
        if (!req.session || !req.session.adminId) {
            return res.status(401).json({ error: 'Please sign in to the admin panel.' });
        }

        const id = toObjectId(req.session.adminId);
        const admin = id ? await admins().findOne({ _id: id }) : null;

        if (!admin) {
            return req.session.destroy(() => {
                res.status(401).json({ error: 'Session expired. Please sign in again.' });
            });
        }

        req.admin = admin;
        return next();
    } catch (error) {
        return next(error);
    }
}

module.exports = requireAdmin;
