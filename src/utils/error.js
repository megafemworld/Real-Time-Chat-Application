/**
 * Error Utility
 * 
 * This module provides a utility for creating structured errors
 * and ensures consistenncy in error handling across the application.
 */

/**
 * Create a structured error object
 * @param {string} message - The Error message
 * @param {number} statusCode - The HTTP status code (default: 500)
 * @param {Object|Array} data - Additional error details (Optional)
 * @returns {Error} - A structured error object
 */
export const createError = (message, status = 500, data = null) => {
    const error = new Error(message);
    error.status = status;

    // Attach additional data to the error object if provided
    if (data) {
        error.data = data;
    }

    return error;
};

/**
 * Erorr Formatter
 * Foormat an erorr object for JSON output
 * @param {Error} error - The error object
 * @returns {Object} A formatted error response
 */
export const formatError = (error) =>  {
    return {
        status: error.status || 500,
        message: error.message || 'Internal Server Error',
        ...(error.data && { details: error.data }),
    };
};