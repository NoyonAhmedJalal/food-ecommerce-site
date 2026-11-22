class ValidationError extends Error {
    constructor(message, details = []) {
        super(message);
        this.name = 'ValidationError';
        this.status = 400;
        this.details = details;
    }
}

function text(value, { field = 'Value', required = true, min = 0, max = 200 } = {}) {
    if (value === undefined || value === null) {
        if (required) throw new ValidationError(`${field} is required`);
        return '';
    }

    if (typeof value !== 'string') {
        throw new ValidationError(`${field} must be text`);
    }

    const trimmed = value.trim();

    if (!trimmed && required) {
        throw new ValidationError(`${field} is required`);
    }

    if (trimmed.length < min) {
        throw new ValidationError(`${field} must be at least ${min} characters`);
    }

    if (trimmed.length > max) {
        throw new ValidationError(`${field} must be at most ${max} characters`);
    }

    return trimmed;
}

function integer(value, { field = 'Value', min = 1, max = 100 } = {}) {
    const number = Number(value);

    if (!Number.isInteger(number)) {
        throw new ValidationError(`${field} must be a whole number`);
    }

    if (number < min || number > max) {
        throw new ValidationError(`${field} must be between ${min} and ${max}`);
    }

    return number;
}

function money(value, { field = 'Price', required = true, min = 0, max = 100000 } = {}) {
    if (value === undefined || value === null || value === '') {
        if (required) throw new ValidationError(`${field} is required`);
        return null;
    }

    const number = Number(value);

    if (!Number.isFinite(number)) {
        throw new ValidationError(`${field} must be a number`);
    }

    if (number < min || number > max) {
        throw new ValidationError(`${field} must be between ${min} and ${max}`);
    }

    return Math.round(number * 100) / 100;
}

function email(value, { field = 'Email', required = false } = {}) {
    const address = text(value, { field, required, max: 120 });

    if (!address) return '';

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(address)) {
        throw new ValidationError(`${field} is not a valid email address`);
    }

    return address.toLowerCase();
}

function normalizePhone(value) {
    return String(value || '').replace(/\D/g, '');
}

function phone(value, { field = 'Phone number', required = true } = {}) {
    const raw = text(value, { field, required, max: 30 });

    if (!raw) return '';

    const digits = normalizePhone(raw);

    if (digits.length < 7 || digits.length > 15) {
        throw new ValidationError(`${field} must contain 7 to 15 digits`);
    }

    return raw;
}

function boolean(value, fallback = false) {
    if (value === undefined) return fallback;
    if (typeof value === 'boolean') return value;
    return value === 'true' || value === '1' || value === 1;
}

function escapeRegex(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = {
    ValidationError,
    text,
    integer,
    money,
    email,
    phone,
    normalizePhone,
    boolean,
    escapeRegex
};
