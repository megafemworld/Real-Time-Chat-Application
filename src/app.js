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
import { connect } from 'http2';

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

    // Add requestId to response headers
    res.setHeader('x-request-id', store.get('requestId'));

    // Run the rest lf the request in the context of this store
    global.requestContet.run(store, () => {
        next();
    });
});

// Apply security headers

app.use(
    helment({
        contentSecurityPolicy: {
            directivees: {
                defaultSrc: ["'self'"],
                scriptSrc: ["'self", "'unsafe-inline'"],
                styleSrc: ["'self'", "'unsafe-inline'"],
                imgSrc: ["'self'", 'data:'],
                connectSrc: ["'self'"],
                fontSrc: ["'self'"],
                objectSrc: ["'none'"],
                mediaSrc: ["'self'"],
                frameSrc: ["'self'"],
            },
        },
        xssFilter: true,
        noSniff: true,
        referrerPolicy: {policy: 'strict-origin-when-cross-origin'},
    })
);

// Parse cookies
app.use(cookieParser(process.env.COOKIE_SECRET));

// Configure Cross-Origin Resource Sharing (CORS)
app.use(
    cors({
        origin: process.env.CORS_ORIGIN || '*',
        methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
        allowedGeaders: ['content-Type', 'Authorization', 'x-correlation-id'],
        exposedHeaders: ['x-correlation-id', 'x-request-id'],
        credentials: true,
        maxAge: 86400,
    })
);

// Compress responses
app.use(compression());

// Parse JSON request bodies
app.use(express.json({ limit: '1mb' }));

// Parse JSON request bodies
app.use(express.urlencoded({ extended: true, limit: '1mb' }));

// Configure request logging
app.use(
    morgan(
        process.env.NODE_ENV === 'production'
            ? ':remote-addr : method :url :status :res[content-length] - :response-time ms'
            : 'dev',
            {
                stream: logger.stream,
                skip: (req) => req.url === '/health' || req.url === '/metrics',
            }
    )
);

// Apply rate limiting
const apiLimiter = rateLimit({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW || '15', 10) * 60 * 1000, // Default: 15 minutes
    max: parseInt(process.RATE_LIMIT_REQUESTS || '100', 10), // Default: 100 requests per windowMS
    standardHeaders: true,
    legacyHeaders: false,
    message: {
        status: 429,
        message: 'Too many requests, please try again later.',
    },
    // Skip rate limiting for health check
    skip: (req) => req.url === '/health',
});

// Apply rate limiting to API routes
app.use('/api/', apiLimiter);

// Request timing middleware
app.use((req, res, next) => {
    const startTime = Date.now();

    // Intercept the response finish event
    res.on('finish', () => {
        const responseTime = Date.now() - startTime;
        logger.logRequest(req, res, responseTime);
    });

    next();
});

// Health check endpoint
app.get('/health', (req, res) => {
    const mongpoHealth = getMongoDBHealth();
    const redisHealth = getRedisHealth();

    const health = {
        status: mongpoHealth.status && redisHealth.status === 'healthy'
            ? 'healthy'
            : 'unhealthy',
        services: {
            mongodb: mongpoHealth,
            redis: redisHealth,
            api: { status: 'healthy' }
        },
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
    };

    const statusCode = health.status === 'healthy' ? 200 : 503;
    res.status(statusCode).json(health);
});

// Error HAndler
app.use((err, req, res, next) => {
    const status = err.status || 500;

    // Don't leak stack to client in production
    const error = {
        message: err. message,
        status,
        ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    };
});