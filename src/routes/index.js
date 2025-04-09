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

// API information route
router.get('/', (req, res) => {
    res.status(200).json({
      success: true,
      message: 'API is running',
      version: process.env.API_VERSION || '1.0.0',
      timestamp: new Date().toISOString(),
    });
  });

// Mount authentication routes
router.use('/auth', authRoutes);

// Mount chat routes
router.use('/chat', chatRoutes);

export default router;