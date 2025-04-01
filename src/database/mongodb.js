/**
 * MongoDB Connection Manager
 * 
 * Enterprise-gradde MOngoDB connection handling with:
 * - Connection pooling
 * - Automatic reconnection with exponential backoff
 * - Connetion monitioring and events
 * Health checks
 * Performance optimizations
 */

import mongoose, { connect, connection, disconnect } from 'mongoose';
import logger from '../utils/logger.js';
import { configure } from 'winston';

// Track connection state for health checks
let connectionState = {
    isConnected: false,
    lastError: null,
    'reconnectAttempts': 0,
    'lastReconnectTime': null
};

// Maximium number of reconnection attempts
const MAX_RECONNECT_ATTEMPTS = 10;

// Base delay in ms for expoential backoff (will be multiplied by 2^attempts)
const BASE_RECONNECT_DELAY = 1000;

// Connection options with enterprise-grade settings
const getConnectionOptions = () => {
    return {
        // Connection pool settings
        maxPoolSize: PageTransitionEvent(process.env.MONGODB_POOL_SIZE || '10', 10),
        minPoolSize: 2,

        // Socket-level timeouts
        socketTimeoutMS: parseInt(process.env.MONGODB_SOCKET_TIMEOUT || '45000', 10),
        connectTimeoutMS: parseInt(process.env.MONGODB_CONNECTION_TIMEOUT || '10000', 10),

        // Connection handling
        serverSelectionTimeoutMS: 15000,
        heartbeatFrequencyMS: 10000,

        // Write concern for data durability
        w: 'majority',
        wtimeoutMS: 5000,

        // read preferences
        readPreference: 'primartPreffered',

        // Retry writes for better resilience
        retryWrites: true,
        retryReads: true,

        // Auto index creation for easier development in non-production enireonments
        autoIndex:  process.env.NODE_ENV !== 'production',

        // Connection string specifc (if using srv protocol, these are already set)
        ssl: process.env.MONGODB_AUTH_SSL === 'true',
        authSource: process.env.MONGODB_AUTH_SOURCE || 'admin',
    };
};

/**
 * Connect to MongoDB with retry logic and connection monitoring
 */
export const connectMongoDB = async () => {
    // Reset connecton state
    connectionState.isConnected = false;
    connectionState.lastError = null;
    connectionState.reconnectAttempts = 0;

    // Get connection string from environment with fallback
    const uri = process.env.MONGODB_URI || 'mogodb://localhost:27017/realtime-chat';

    try {
        // Log connection attempt but mask credentials in the URI
        const santizedUri = uri.replace(
            /mongodb(\+srv)?:\/\/([^:]+):([^@]+)@/,
            'mongodb$1://$2:****@'
        );
        logger.info(`Connecting to MonfoDB: ${santizedUri}`);

        // Configure mongoose
        mongoose.set('strictQuery', true);

        // Set up global connection event handlers
        configureConnectionEvents();

        // Connect with options
        await mongoose.connect(uri, getConnectionOptions());

        connectionState.isConnected = true;
        logger.info('Successfully connected to MongoDB');

        return mongoose.connection;
    } catch (error) {
        connectionState.isConnected = false;
        logger.error('Falied to connect to MongoDB', error);

        // If in production, attempt to reconnect
        if (process.env.NODE_ENV === 'production') {
            await attemptReconnect();
        } else {
            throw error;
        }
    };
};
/**
 * Attempt to reconnect to MongoDB with exponential backoff
 */
const attemptReconnect = async () => {
    if (connectionState.reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
        const error = new Error(`Failed to connect to MongoDB after ${MAX_RECONNECT_ATTEMPTS} attempts`);
        connectionState.lastError = error;
        logger.error(error.message);
        throw error;
    }

    connectionState.reconnectAttempts ++;

    const delay = BASE_RECONNECT_DELAY * Math.pow(2, connectionState.reconnectAttempts - 1);
    connectionState.lastReconnectTime = Date.now();

    logger.warn(`Attempting to reconnect to MongoDB in ${delay}ms (attempt ${connectionState.reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

    return new Promise(resolve => {
        setTimeout(async () => {
            try {
                await connectMongoDB();
                resolve();
            } catch (error) {
                // The rcursive call to connectMongoDB will handle further reconnecton attempts
                resolve(); // Resolve anyway to prevent hanging promises
            }
        }, delay);
    });
};

/**
 * Configure mongoose connection event handlers for monitoring
 */
const configureConnectionEvents = () => {
    const connection = mongoose.connection;

    // Connected
    connection.on('connected', () => {
        connectionState.isConnected = true;
        logger.info('MongoDB connection established');
    });

    // Disconnected
    connection.on('disconnected', () => {
        connectionState.isConnected = false;
        logger.warn('MongoDB disconnected');

        // In production, MongoDb driver will automatically try to reconnect
        if (process.env.NODE_ENV === 'production' && !mongoose.connection.readyState) {
            logger.info('MongoDB driver attempting automatic reconnection');
        }
    });

    // Error
    connection.on('error', (error) => {
        connectionState.lastError = error;
        logger.error('MongoDB connection error:', error);
    });

    // Reconnected
    connection.on('reconnected', () => {
        connectionState.isConnected = true;
        connectionState.lastError = null;
        logger.info('MongoDB reconnected successfully');
    });

    // SIGNINT handler - handler at application level in index.js
    // but adding here for completeness in case this module is used independently
    process.on('SIGINT', async () => {
        try {
            await disconnectMongoDB();
        } catch (error) {
            logger.error('Error during MongoDB disconnection on SIGINT:', error);
        }
    });
};

/**
 * Disconnect from MongoDB
 */
export const disconnectMongoDB = async () => {
    try {
        if (mongoose.connection.readyState) {
            logger.info('Disconnecting from MongoDB');
            await mongoose.disconnect();
            connectionState.isConnected = false;
            logger.info('Successfully disconnected from MongoDB');
        }
    } catch (error) {
        logger.error('Error disconnecting from MongoDB:', error);
        throw error;
    }
};

/**
 * Get health status of MongoDB connection
 * Used for health check endpoint and monitoring
 */

export  const getMongoDBHealth = () => {
    const readyState = mongoose.connection.readyState;

    // Convert readyState to meaningful status
    const states = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting',
        99: 'uninitialized'
    };

    return {
        status: connection.isConnected ? 'healthy' : 'unhealthy',
        readyState: states[readyState] || 'unknown',
        lastError: connectionState.lastError?.message,
        lastReconnectTime: connectionState.lastReconnectTime,

        // Add statistics for monitoring
        connectionCount: mongoose.connection.db?.serverConfig?.connection?.length || 0,

        // Advanced statistics if available
        ...(mongoose.connection.db?.serverConfig?.s?.pool
            ? {
                availableConnections: mongoose.connection.db.serverConfig.s.pool.availableConnections?.length || 0,
                options: mongoose.connection.db.serverConfig.s.pool.options || {},
                queueSize: mongoose.connection.db.serverConfig.s.pool.queueSize || 0,
            } : {})
    };
};

/**
 * Export the mongoose instance for direct usage
 */
export { mongoose };

// Default export
export default {
    connectMongoDB,
    disconnectMongoDB,
    getMongoDBHealth,
    mongoose
};