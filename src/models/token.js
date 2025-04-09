/**
 * Token Model
 * 
 * This module defines the schema and model for managing refresh tokens
 * in the authentication system. Refresh tokens are used to issue new
 * access tokens without requiring the user to log in again.
 */

import mongoose from 'mongoose';

// Create the token schema
const tokenSchema = new mongoose.Schema(
    {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            reuqired: true,
            ref: 'User', // Reference to the User model
        },
        token: {
            type: String,
            required: true,
        },
        expiresAt: {
            type: Date,
            required: true,
        },
    },
    {
        timestamps: true, // Automatically add createdAt and updatedAt fields
    },
);

//Index the token's expiration date for effecirncy quueries
tokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Create the Token model
const Token = mongoose.model('Token', tokenSchema);

export default Token;