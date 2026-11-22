const { getCollection } = require('../db');

function keySignature(key) {
    return JSON.stringify(key);
}

function textFields(key) {
    return Object.entries(key)
        .filter(([, type]) => type === 'text')
        .map(([field]) => field);
}

function indexMatches(index, definition) {
    const wantedTextFields = textFields(definition.key);

    /* listIndexes reports text indexes as { _fts, _ftsx } with weights instead of the keys. */
    if (wantedTextFields.length > 0) {
        const weights = index.weights || {};
        return wantedTextFields.every((field) =>
            Object.prototype.hasOwnProperty.call(weights, field)
        );
    }

    return keySignature(index.key) === keySignature(definition.key);
}

async function ensureCollectionIndexes(name, definitions) {
    const collection = getCollection(name);

    let existing = [];
    try {
        existing = await collection.listIndexes().toArray();
    } catch (error) {
        if (error.codeName !== 'NamespaceNotFound' && error.code !== 26) throw error;
    }

    const missing = definitions.filter(
        (definition) => !existing.some((index) => indexMatches(index, definition))
    );

    if (missing.length > 0) {
        await collection.createIndexes(missing);
    }
}

/**
 * Indexes that Mongoose used to create automatically for the schemas.
 * They are created explicitly now that the app uses the native driver.
 * An index is skipped when one with the same key already exists, so databases
 * created by the old Mongoose version (or the driver, with other names) work.
 */
async function ensureIndexes() {
    await Promise.all([
        ensureCollectionIndexes('foods', [
            { key: { category: 1, sortOrder: 1 } },
            { key: { name: 'text', description: 'text' } }
        ]),
        ensureCollectionIndexes('orders', [
            { key: { orderNumber: 1 }, unique: true },
            { key: { status: 1 } },
            { key: { 'customer.phoneKey': 1 } },
            { key: { customerId: 1 } },
            { key: { createdAt: -1 } }
        ]),
        ensureCollectionIndexes('admins', [{ key: { email: 1 }, unique: true }]),
        ensureCollectionIndexes('customers', [{ key: { email: 1 }, unique: true }])
    ]);
}

module.exports = { ensureIndexes };
