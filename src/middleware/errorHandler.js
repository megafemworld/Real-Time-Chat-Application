/**
 * Erorr Handler Middleware
 * 
 * This middleware handles all errors occuring in the application,
 * formats them apropriately, and sends standardized responses.
 * It's designed to be the last midleware in the stack.
 */

import { formatError } from '../utils/error.js';
import logger from '../utils/logger.js';

/**
 * Error handling middleware
 * @param {Error} err - The error object
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 * @param {Function} next - The next middleware function
 */
export const errorHandler = (err, req, res, next) => {
    // Default value of errors
    let status = err.status || 500;
    let message = err.message || 'Internal Server Error';
    let errorDetails = err.data || undefined;

    // Log the error with different level based on status code
    if (status >= 500) {
        logger.error(`Server Error: ${message}`, {
            error: {
                stack: err.stack,
                ...err,
            },
            url: req.originalUrl,
            method: req.method,
        });
    } else if (status >= 400) {
        logger.warn(`Client Error: ${message}`, {
            error: {
                stack: err.stack,
                ...err,
            },
            url: req.originalUrl,
            method: req.method,
        });
    }

    // Don't expose sensitive error details in production
    if (status === 500 && process.env.NODE_ENV === 'production') {
        errorDetails = undefined;
        // Keep the message generic
        message = 'Internal Server Error';
    }

    // Format the error response
    const formattedError = formatError({
        status,
        message,
        data: errorDetails,
    });

    // Send the error response
    res.status(formattedError.status).json({
        success: false,
        error: formattedError,
    });
}

/**
 * Not found middleware for handling undefined routes
 * @param {Object} req - The request object
 * @param {Object} res - The response object
 * @param {Function} next - The next middleware function
 */
export const notFoundHandler = (req, res, next) => {
    const err = new Error(`Route not found: ${req.originalUrl}`);
    err.status = 404;
    next(err);
};

/**
 * Request timeout middleware
 * @param {number} timeout - The timeout duration in milliseconds
 */
export const requestTimeout = (timeout = 30000) => {
    return (req, res, next) => {
        // Set a timeout for the request
        res.setTimeoout(timeout, () => {
            const err = new Error(`Request timeout after ${timeout}ms`);
            err.status = 408;
            next(err);
        });
        next();
    };
};
