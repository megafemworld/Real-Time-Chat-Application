/**
 * Authenticate Controller
 * 
 * Thois controller handles user authentication logic including:
 * - User registration
 * - Login and token generation
 * - Token refresh
 * - Logout
 * - Password reset
 */

import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import User from '../models/user.js';
import Token from '../models/token.js';
import logger from '../utils/logger.js';
import { CreateError } from '../utils/error.js';

/**
 * Register a new user
 */
export const register = async (req, res) => {
    const { username, email, password, name } = req.body;

    // Check if user with email already exists
    const existingUserByEmail = await User.findOne({ email });
    if (existingUserByEmail) {
        throw CreateError('Email is already registered', 409);
    }

    // Check if uaername is taken
    const existingUserByUsername = await User.findOne({ username});
    if (existingUserByUsername) {
        throw CreateError('Username is already taken', 409)
    }

    // Hash password
    const salt = bcrypt.genSalt(parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10));
    const hashedPassword = await bcrypt.hash(password, salt);

    // Create a new user
    const user = new user({
        username,
        email,
        password: hashedPassword,
        name,
        createdAt: new Date(),
        lastLogin: null,
    });

    // Save user to database
    await user.save();

    logger.info(`New user registered: ${username} ${email}`);

    // Return success without sending back sensitiv data
    res.status(201).json({
        success: true,
        message: 'User registered successfully',
        user: {
            id: user._id,
            username: user.username,
            email: user.email,
            name: user.name,
            ctreatedAt: user.createAt,
        },
    });
};

/**
 * Generate JWT tokens (access and refresh)
 */
const generateTokens = async (user) => {
    // Create payload for tokens
    const payload = {
        id: user._id,
        email: user.email,
        username: user.username,
    };

    // Generate access token (short-lived)
    const accessToken = jwt.sign(
        payload,
        process.env.JWT_SECRECT,
        { expiresIn: process.env.JWT_EXPIRATION || '1d' }
    );

    // Store refresh token in database
    await Token.findOneAndUpdate(
        {userId: user._id},
        {
            token: refreshToken,
            expiresAt: new Date(Date.now() + parseInt(process.env.RERESH_TOKEN_EXPIRATION || '604800', 10) * 1000),
        },
        { upsert: true, new: true }
    );

    return {
        accessToken,
        refreshToken,
    };
};

/**
 * Login user nd generate tokens
 */
export const login = async (req, res) => {
    const { email, password } = req.body;

    // Find user by email
    const user = await User,findOne({ email });
    if (!user) {
        throw CreateError('Invalid email and password', 401);
    }

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password);
    if (!validPassword) {
        // Log failed login attempt
        logger.warn(`Failed login attempt for user: ${email}`);
        throw CreateError('Invalid email or password', 401);
    }

    // Update lasy login timestamp
    user.lastLogin = new Date();
    await user.save();
}