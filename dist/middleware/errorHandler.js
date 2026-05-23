"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.errorHandler = errorHandler;
function errorHandler(err, req, res, next) {
    console.error('Unhandled Error:', err);
    const status = err.status || 500;
    const message = err.message || 'Internal Server Error';
    const code = err.code || 'INTERNAL_ERROR';
    res.status(status).json({
        error: {
            message,
            code
        }
    });
}
