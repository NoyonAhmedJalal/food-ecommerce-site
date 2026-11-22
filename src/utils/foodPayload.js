const Food = require('../models/Food');
const { text, money, boolean } = require('./validate');

function buildFoodPayload(body, { partial = false } = {}) {
    const data = {};
    const has = (key) => body[key] !== undefined;

    if (!partial || has('name')) {
        data.name = text(body.name, { field: 'Name', max: 80 });
    }
    if (!partial || has('description')) {
        data.description = text(body.description, { field: 'Description', max: 240 });
    }
    if (!partial || has('price')) {
        data.price = money(body.price, { field: 'Price', max: 10000 });
    }
    if (has('oldPrice')) {
        data.oldPrice =
            body.oldPrice === '' || body.oldPrice === null
                ? null
                : money(body.oldPrice, { field: 'Old price', required: false, max: 10000 });
    }
    if (!partial || has('category')) {
        data.category = text(body.category, { field: 'Category', max: 40 });
    }
    if (!partial || has('image')) {
        const image = text(body.image, { field: 'Image', required: false, max: 300 });
        if (
            image &&
            !/^(https?:\/\/|\/|image\/)/i.test(image) &&
            !/^[\w./-]+\.(png|jpe?g|webp|gif|svg)$/i.test(image)
        ) {
            throw Object.assign(new Error('Image must be a relative path or an http(s) URL.'), {
                status: 400
            });
        }
        data.image = image || 'image/logo.png';
    }
    if (has('rating')) {
        const rating = Number(body.rating);
        if (!Number.isFinite(rating) || rating < 0 || rating > 5) {
            throw Object.assign(new Error('Rating must be between 0 and 5.'), { status: 400 });
        }
        data.rating = Math.round(rating * 10) / 10;
    }
    if (has('isOffer')) data.isOffer = boolean(body.isOffer);
    if (has('available')) data.available = boolean(body.available);
    if (has('sortOrder')) data.sortOrder = Number(body.sortOrder) || 0;

    return data;
}

module.exports = { buildFoodPayload };
