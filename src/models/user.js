/**
 * User model
 * 
 * This module defines the schema and model for user data in the application.
 * It includes fields for user authentication, personal information, and more.
 */

import mongoose from "mongoose";
import validator from "validator";
import bcrypt from "bcrypt";

// Create the user schema
const userSchema = new mongoose.Schema(
    {
        username: {
            type: String,
            required: [true, 'Username is required'],
            unique: true,
            trim: true,
            minlength: [3, 'Username must be at least 3 characters long'],
            maxlength: [30, 'Username cannot exceed 30 characters'],
            match: [/^[a-zA-Z0-9_]+$/, 'Username can only contain letters, numbers, and underscores'],
        },
        email: {
            type: String,
            required: [true, 'Email is required'],
            unique: true,
            lowercase: true,
            validate: {
                validator: validator.isEmail,
                message: 'Please provide a valid email address',
            },
        },
        password: {
            type: String,
            required: [true, 'Email is required'],
            minlength: [8, 'Password must be at least 8 characters long'],
            maxlength: [50, 'Name cannot exceed 50 characters'],
        },
        name: {
            type: String,
            required: [true, 'name is required'],
            trim: true,
            minlength: [2, 'Name must be at least 2 characters long'],
            maxlength: [50, 'Name cannot exceed 50 characters'],
        },
        role: {
            type: String,
            enum: ['User', 'admin'], // Define allowed roles
            default: 'user',
        },
        status: {
            type: String,
            enum: ['active', 'inctive'],
            default: 'active',
        },
        createAt: {
            type: Date,
            default: Date.now,
        },
        lastLogin: {
            type: Date,
            default: null,
        },
        resetPasswordToken: {
            type: String,
            select: false,
        },
        resetPasswordExpires: {
            type: Date,
            select: false,
        }
    },
    {
        timestamps: true,
    }
);

// Hash the password before saving the user document
userSchema.pre('save', async function (next) {
    // Only hash the password if it has been modified or is new
    if (!this.isModified('password')) {
        return next();
    }

    // Generate a salt and hash the password
    const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10));
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// Instance method to compare passwords
userSchema.methods.comparePassword = async function (candidiatePassword) {
    return bcrypt.compare(candidiatePassword, this.password);
};

// Create the user model
const User = mongoose.model('User', userSchema);

export default User;