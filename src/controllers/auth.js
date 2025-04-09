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
import { decode } from 'punycode';

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

    // Generate access token (long-lived)
    const refreshToken = jwt.sign(
        payload,
        process.env.REFRESH_TOKEN_SECRET,
        { expiresIn: process.env.REFRESH_TOKEN_EXPIRATION || '7d' }
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

    // Update last login timestamp
    user.lastLogin = new Date();
    await user.save();

    // Generate tokens
    const tokens = await generateTokens(user);

    // Set refresh token as HTTP-only cookie
    res.cookie('refreshToken', tokens.refreshToken, {
        htppsOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'Strict',
        maxAge: parseInt(process.env.REFRESH_TOKEN_EXPIRATION || '604800', 10) * 1000,
    });

    logger.info(`User logged in: ${user.username} (${user.email})`);

    // Return access token and user data
    res.json({
        success: true,
        message: 'Login successful',
        accessToken: tokens.accessToken,
        user: {
            id: user._id,
            username: user.username,
            email: user.email,
            name: user.name,
            createdAt: user.createAt,
            lastLogin: user.lastLogin,
        },
    });
};

/**
 * Refresh access token using refresh token
 */
export const refreshToken = async (req, res) => {
    // Get refresh token from request body or cookie
    const refreshTokenFromRequest = req.body.refreshToken || req.cookies.refreshToken;

    if (!refreshTokenFromRequest) {
        throw CreateError('Refresh token is required', 400);
    }

    try {
        // Verify refresh token
        const decoded = jwt.verify(refreshTokenFromRequest, process.env.REFRESH_TOKEN_SECRET);

        // Check if token exists in database
        const tokenDoc = await Token.findOne({
            userId: decoded.id,
            token: refreshTokenFromRequest,
            expiresAt: { $gt: new Date() }
        });

        if (!tokenDoc) {
            throw CreateError('Invalid or expired refresh token', 401);
        }

        // Get user
        const user = await User.findById(decoded.id);
        if (!user) {
            throw CreateError('User not found', 404);
        }

        // Generate new tokens
        const tokens = await generateTokens(user);

        // Update refresh token cookie
        res.cookie('refreshToken', tokens.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: parseInt(process.env.REFRESH_TOKEN_EXPIRATION || '604800', 10) * 100,
        });

        logger.info(`Token refreshed for user: ${user.username}`);

        // Return new access token
        res.json({
            success: true,
            accessToken: tokens.accessToken,
        });

    } catch (error) {
        if (error.name === 'JSONWebTokenError' || error.name === 'TokenExpiredError') {
            throw CreateError('Invalid or expiresd refresh token', 401);
        }
        throw error;
    }
};

/**
 * Logout user by invalidating refresh token
 */
export const logout = async (req, res) => {
    const userId = req.user.id;

    // Remove refresh token cookie cookie
    res.clearCookie('refreshToken');

    logger.info(`User logged out: ${req.user.username}`);

    res.json({
        success: true,
        message: 'Logout successful',
    })
};

/**
 * Request password reset
 */
export const forgotPassword = async (req, res) => {
    // Find user by email
    const user = await User.findOne({ email });
    if (!user) {
        // Don't reveal that email doesn't exist for security
        return res.json({
            success: true,
            message: 'If your email is registered, you will receive a password reset link.',
        });
    }

    // Generate reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenHash =  crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');

    // Save reset token hash to database
    user.resetPasswordToken = resetTokenHash;
    user.resetPasswordExpires = Date.now() + 3600000; // 1 hour
    await user.save();

    // In a real app, send email with reset token
    // For this example, we'll just log it
    logger.info(`Password reset token for ${user.email}: ${resetToken}`);

    res.json({
        success: true,
        message: 'If your email is registered, you will receive a password reset link',
        ...(process.env.NODE_ENV !== 'production' && { resetToken}),
    });
};

/**
 * Reset password with token
 */
export const resetPassword = async (req, res) => {
    const { token, password } = req.body;

    // Hash the token from the request
    const resetTokenHash = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');
    
    // Find user with matching token that hasn't expired
    const user = await user.findOne({
        resetPasswordToken: resetTokenHash,
        resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
        throw CreateError('Invalid or expired reset token', 400);
    }

    // Hash new password
    const salt = await bcrypt.genSalt(parseInt(process.env.BCRYPT_SALT_ROUNDS || '10', 10));
    const hashedPassword = await bcrypt.hash(password, salt);

    // Update user password and clear reset token fields
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    // Invalidate all existing refresh tokens for this user
    await Token.deleteMany({ userId: user._id });

    logger.info(`Password reset for user: ${user.username} (${user.email})`);

    res.json({
        success: true,
        message: 'Password reset successful',
    });
};

/**
 * Get current user profile
 */
export const getCurrentUser = async (req, res) => {
    const userId = req.user.id;
    
    // Find user by ID and exclude password field
    const user = await User.findById(userId).select('-password');

    if (!user) {
        throw CreateError('User not found', 404);
    }

    res.json({
        success: true,
        user: {
            id: user._id,
            username: user.username,
            email: user.email,
            name: user.name,
            createdAt: user.createdAt,
            lastLogin: user.lastLogin,
        },
    });
};