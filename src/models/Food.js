const { getCollection } = require('../db');

const FOOD_DEFAULTS = {
    oldPrice: null,
    image: 'image/logo.png',
    rating: 4.5,
    isOffer: false,
    available: true,
    sortOrder: 0
};

function foods() {
    return getCollection('foods');
}

/** Apply the defaults the Mongoose schema used to provide. */
function withFoodDefaults(data) {
    return { ...FOOD_DEFAULTS, ...data };
}

/** Shape a MongoDB document like the old Mongoose toJSON output. */
function serializeFood(doc) {
    if (!doc) return null;
    const { _id, __v, ...rest } = doc;
    return { id: _id.toString(), ...rest };
}

module.exports = { foods, withFoodDefaults, serializeFood, FOOD_DEFAULTS };
