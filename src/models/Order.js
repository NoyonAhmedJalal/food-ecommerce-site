const { getCollection } = require('../db');

const ORDER_STATUSES = [
    'placed',
    'confirmed',
    'preparing',
    'out_for_delivery',
    'delivered',
    'cancelled'
];

const ACTIVE_STATUSES = ['placed', 'confirmed', 'preparing', 'out_for_delivery'];

function orders() {
    return getCollection('orders');
}

/**
 * Shape an order document like the old Mongoose toJSON output.
 * Customer-facing responses hide the normalized phone key.
 */
function serializeOrder(doc, { forCustomer = false } = {}) {
    if (!doc) return null;

    const { _id, __v, customer = {}, items = [], statusHistory = [], ...rest } = doc;

    const output = {
        id: _id.toString(),
        ...rest,
        customer: { ...customer },
        items: items.map((item) => ({
            ...item,
            food: item.food ? item.food.toString() : null
        })),
        statusHistory
    };

    if (forCustomer) delete output.customer.phoneKey;

    return output;
}

module.exports = { orders, serializeOrder, ORDER_STATUSES, ACTIVE_STATUSES };
