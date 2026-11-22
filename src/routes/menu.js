const express = require('express');
const { toObjectId } = require('../db');
const { foods, serializeFood } = require('../models/Food');
const { text, escapeRegex } = require('../utils/validate');

const router = express.Router();

const CATEGORY_ORDER = ['Pizza', 'Burgers', 'Rice', 'Sides', 'Drinks', 'Desserts', 'Combos'];

function sortCategories(categories) {
    return [...categories].sort((a, b) => {
        const indexA = CATEGORY_ORDER.indexOf(a);
        const indexB = CATEGORY_ORDER.indexOf(b);
        if (indexA === -1 && indexB === -1) return a.localeCompare(b);
        if (indexA === -1) return 1;
        if (indexB === -1) return -1;
        return indexA - indexB;
    });
}

/* GET /api/menu — public restaurant menu */
router.get('/', async (req, res, next) => {
    try {
        const filter = { available: true };

        if (req.query.category && req.query.category !== 'All') {
            filter.category = text(req.query.category, { field: 'Category', max: 40 });
        }

        if (req.query.offers === 'true') {
            filter.isOffer = true;
        }

        if (req.query.q) {
            const pattern = new RegExp(escapeRegex(String(req.query.q).slice(0, 60)), 'i');
            filter.$or = [{ name: pattern }, { description: pattern }, { category: pattern }];
        }

        const [items, categories] = await Promise.all([
            foods().find(filter).sort({ sortOrder: 1, name: 1 }).toArray(),
            foods().distinct('category', { available: true })
        ]);

        res.json({ items: items.map(serializeFood), categories: sortCategories(categories) });
    } catch (error) {
        next(error);
    }
});

/* GET /api/menu/categories */
router.get('/categories', async (req, res, next) => {
    try {
        const categories = await foods().distinct('category', { available: true });
        res.json({ categories: sortCategories(categories) });
    } catch (error) {
        next(error);
    }
});

/* GET /api/menu/:id */
router.get('/:id', async (req, res, next) => {
    try {
        const id = toObjectId(req.params.id);

        if (!id) {
            return res.status(404).json({ error: 'Menu item not found.' });
        }

        const item = await foods().findOne({ _id: id, available: true });
        if (!item) return res.status(404).json({ error: 'Menu item not found.' });

        return res.json({ item: serializeFood(item) });
    } catch (error) {
        return next(error);
    }
});

module.exports = router;
module.exports.sortCategories = sortCategories;
