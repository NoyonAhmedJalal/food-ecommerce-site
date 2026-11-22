const bcrypt = require('bcryptjs');
const { getCollection } = require('../db');

function customers() {
    return getCollection('customers');
}

function hashPassword(password) {
    return bcrypt.hash(password, 10);
}

function checkPassword(password, passwordHash) {
    return bcrypt.compare(password, passwordHash);
}

/** Shape a customer document without ever exposing the password hash. */
function serializeCustomer(doc) {
    if (!doc) return null;
    const { _id, __v, passwordHash, ...rest } = doc;
    return { id: _id.toString(), ...rest };
}

module.exports = { customers, hashPassword, checkPassword, serializeCustomer };
