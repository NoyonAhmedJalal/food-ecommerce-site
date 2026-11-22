const { orders } = require('../models/Order');

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function randomCode(length = 6) {
    let code = '';
    for (let index = 0; index < length; index += 1) {
        code += ALPHABET[Math.floor(Math.random() * ALPHABET.length)];
    }
    return code;
}

async function generateOrderNumber() {
    for (let attempt = 0; attempt < 8; attempt += 1) {
        const candidate = `FD-${randomCode(6)}`;
        const exists = await orders().findOne(
            { orderNumber: candidate },
            { projection: { _id: 1 } }
        );
        if (!exists) return candidate;
    }

    // Extremely unlikely fallback: include a timestamp.
    return `FD-${Date.now().toString(36).toUpperCase().slice(-6)}`;
}

module.exports = { generateOrderNumber };
