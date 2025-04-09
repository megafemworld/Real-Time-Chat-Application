/**
 * Async Handler utility
 * 
 * This utility waraps async route handlers to eliminate try-catch boilerplate
 * and propagate errors to the nexpress error handler.
 */

/**
 * Wrap an async function to automatcally catch errors and pass them to Express next()
 * @param {Function} fn - The async function to wrap
 * @return {Function} A middleware function that handles errors
 */
export const asyncHandler = (fn) => {
    return (req, res, next) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
};