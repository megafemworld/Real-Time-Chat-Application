/**
 * API routes
 * 
 * This module defines the main router for the API, inlcuding authentication,
 * chat room management, and message handling routes.
 */

import express from 'express';
import authRoutes from './auth.js';
import chatRoutes from './chat.js';

const router = express.Router();

// Mount authentication routes
router.use('/auth', authRoutes);

// Mount chat routes
router.use('/chat', chatRoutes);

export default router;