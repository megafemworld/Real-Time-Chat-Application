/**
 * Real-Time Chat Application - Main Entry Point
 * 
 * This file bootstraps the entire application with proper initialization order,
 * graceful shutdown handling, and comprehensive error management.
 */


// Load environment variables
import dotenv from 'dotenv';
dotenv.config();

// Core Node.js modules
import http from 'http';
import process from 'process';

// Initialize logger early for capturing boostrap errors
import logger from './utils/logger.js';

// Import application components
import app from './app.js';
import { connectMongoDB, disconnectMongoDB } from './database/mongodb.js';
import { connectRedis, disconnectRedis } from './database/redis.js';
import socketServer from  './services/socket.js';
// import { registerMetrics, getMetricsServer } from './monitoring/metrics.js';
// import { log } from 'console';

// Constants from environment variables
const PORT = process.env.PORT || 3000;
const HOST = process.env.HOST || 'localhost';
const NODE_ENV = process.env.NODE_ENV || 'development';

// Track service for graceful shutdown

const runningServices = {
    httpServer: null,
    metricsServer: null,
    socketConnection: null,
    mongoConnection: false,
    redisConnection: false,
};

/**
 * Initialize all application components in the correct order.
 * with proper error handling and logging.
 */
async function boostrap() {
    logger.info(`Start application in ${NODE_ENV} mode...`);

    try {
        // Register monitoring metrics early
        logger.info('Initializing monitoring metrics');
        registerMetrics();

        // Connect to databases
        logger.info('Connecting to MongoDB...');
        await connectMongoDB();
        runningServices.mongoConnection = true;

        // Create HTTP server
        logger.info('Creating HTTP server...');
        const httpServer = http.createServer(app);
        runningServices.httpServer = httpServer;

        // Initialize Socket.IO (passing the HTTP server)
        logger.info('Initializing WebSocket server...');
        runningServices.socketConnection = socketServer.initialize(httpServer);

        // Start metrics server on a different port
        const metricsServer = getMetricsServer();

        if (metricsServer) {
            const metricsPort = process.env.METRICS_PORT || 9090;
            metricsServer.listen(metricsPort, () => {
                logger.info(`Metrics server is running on ${HOST}:${metricsPort}`);
            });
            runningServices.metricsServer = metricsServer;
        }

        // Start main HTTP server
        httpServer.listen(PORT, HOST, () => {
            logger.info(`Server is running on ${HOST}:${PORT}`);
            logger.info('Application bootstrap completed successfully');
        });

        return httpServer;
    } catch (error) {
        logger.error('Failed to bootstrap application:', error);
        await gracefulShutdown(1);
        throw error;
    }
}

/**
 * Perform a graceful shutdown, closing all connections and releasing resources.
 * in a the correct order to prevent data loss or corruption.
 */
async function gracefulShutdown(code=1) {
    logger.info('Initiating graceful shutdown sequence...');

    // Set a timeout for forced shutdown if graceful shutdown hangs
    const forceShutdownTimeout = setTimeout(() => {
        logger.error('Graceful shutdown timed out after 30s - forcing exit');
        process.exit(1);
    }, 3000);

    // Clear the timeout if shutdown completes successfully
    forceShutdownTimeout.unref();

    try {
        // Close socket connections first to stop accepting new requests
        if (runningServices.socketConnection) {
            logger.info('Closing websocket connections...');
            await new Promise(resolve => runningServices.socketConnection.close(resolve));
            logger.info('WebSocket connections closed');
        }

        // Close HTTP server to stop accepting new HTTPS requests
        if (runningServices.httpServer) {
            logger.info('Closing HTTP server...');
            await new Promise(resolve => runningServices.httpServer.close(resolve));
            logger.info('HTTP server closed');
        }

        // Close metric server
        if (runningServices.metricsServer) {
            logger.info('Closing metrics server...');
            await new Promise(resolve => runningServices.metricsServer.close(resolve));
            logger.info('Metrics server closed');
        }

        // Close database connections last to ensure all operations are completed
        if (runningServices.redisConnection) {
            logger.info('Closing Redis connection...');
            await disconnectRedis();
            logger.info('Redis connection closed');
        }

        // Close MongoDB connection
        if (runningServices.mongoConnection) {
            logger.info('Closing MongoDB connection...');
            await disconnectMongoDB();
            logger.info('MongoDB connection closed');
        }

        logger.info('Graceful shutdown completed successfully');
        clearTimeout(forceShutdownTimeout);

        if (NODE_ENV !== 'test') {
            process.exit(code);
        }
    } catch (error) {
        logger.error('Error during graceful shutdown:', error);
        clearTimeout(forceShutdownTimeout);
        process.exit(1);
    }
}

// Register signal handlers for graceful shutdown
process.on('SIGTERM', () => {
    logger.info('Received SIGTERM signal');
    gracefulShutdown();
});
process.on('SIGINT', () => {
    logger.info('Received SIGINT signal');
    gracefulShutdown();
});

// Catch unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    gracefulShutdown(1);
});

// Catch uncaught exceptions
process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception thrown:', error);
    gracefulShutdown(1);
});

// Start the application if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
    boostrap().catch((error) => {
        logger.error('Failed to start application:', error);
        process.exit(1);
    });
}

// Export the bootstrap function for testing purposes
export { boostrap, gracefulShutdown };
