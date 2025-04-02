/**
 * Express Application Setup
 * 
 * This module configures the Express application with middleware,
 * security features, API routes, and error handling.
 */

import express from 'express';
import cors from 'cors';
import helment from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { rateLimit } from 'express-rate-limit';
import cookieParser from 'cookie-parser';
import { createHttpTermiantor } from 'http-terminator';
import { v4 as uuid4 } from 'uuid';
import { AsyncLocalStorage } from 'async_hooks';

import logger from './utils/logger.js';
import routes from './routes/index.js';
import { getMongoDBHealth } from './database/mongodb.js';
import { getRedisHealth } from './database/redis.js';

// Create request context storage
global.requestContext = new AsyncLocalStorage();

// Create Express application
const app = express();

// Set trut proxy for proper IP detection behind load balancers
app.set('trust proxy', 1);

// Request correlation ID middleware
app.use((req, res, next) => {
    // Extract correlation ID from header or genrate a new one
    const correlationId = req.headers['x-correlation-id'] || uuid4();

    // Store  correlation ID and set response header
    res.setHeader('x-correlation-id', correlationId);

    // Create store with request context data
    const store = new Map();
    store.set('correlationId', correlationId);
    store.set('requestId', req.id);
    store.set('startTime', Date.now());
})
