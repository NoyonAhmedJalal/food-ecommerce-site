const bcrypt = require('bcryptjs');
const { getCollection } = require('../db');

function admins() {
    return getCollection('admins');
}

function hashPassword(password) {
    return bcrypt.hash(password, 10);
}

function checkPassword(password, passwordHash) {
    return bcrypt.compare(password, passwordHash);
}

/** Shape an admin document without ever exposing the password hash. */
function serializeAdmin(doc) {
    if (!doc) return null;
    const { _id, __v, passwordHash, ...rest } = doc;
    return { id: _id.toString(), ...rest };
}

module.exports = { admins, hashPassword, checkPassword, serializeAdmin };
