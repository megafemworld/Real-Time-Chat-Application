/**
 * Validation Middleware
 * 
 * This middleware processes validation results from express-validator
 * and returns a formattted response for invalid inputs.
 */

import { validationResult } from 'express-validator';
import { createError } from '../utils/error.js';
import { error } from 'winston';

/**
 * Midddleware to handle validation results
 */
const validate = (req, res, next) => {
    // Extract validation errors from the request object
    const errors = validationResult(req);

    // if there are validation errors, format and return them
    if (!errors.isEmpty()) {
        const errorMessages = errors.array().map((err) => ({
            field: err.param,
            message: err.msg,
        }));

        // Log the validtion errors (optional)
        const errorLog = errorMessages.map((e) => `${e.field}: ${e.message}`).join(', ');
        console.error('Validation errors:', errorLog);

        // Return a 400 Bad Request with the validation error deatails
        return next(
            createError(
                'Validation failed',
                400,
                errorMessages
            )
        );
    }

    // If no validation errors, proceed to the next middleware
    next();
};

export default validate;