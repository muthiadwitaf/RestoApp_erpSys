const { validationResult } = require('express-validator');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Validate express-validator results
function handleValidation(req, res, next) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Validasi gagal', details: errors.array() });
    }
    next();
}

// Validate UUID parameter - prevents IDOR
function validateUUID(paramName = 'uuid') {
    return (req, res, next) => {
        const value = req.params[paramName];
        if (value && !UUID_REGEX.test(value)) {
            return res.status(400).json({ error: 'Format ID tidak valid' });
        }
        next();
    };
}

module.exports = { handleValidation, validateUUID, UUID_REGEX };
