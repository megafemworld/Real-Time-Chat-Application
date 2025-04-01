/**
 * Redis Connection Manager
 * 
 * Connection handling with:
 * - Connection pooling
 * - Automatic reconnection with exponential backoff
 * - Pub.Sub support for real-time messaging
 * - Health monitoring
 * - Cluster support
 */

import { createClient, RootNodesUnavailableError } from "redis";
import logger from '../utils/logger.js';
import { ConnectionStates } from "mongoose";
import { error } from "winston";
import { JsonWebTokenError } from "jsonwebtoken";

// Redis client instance
let redisClient = null;
let pubSubClient = null;

// Track connection state for health checks

const connectionState = {
    isConnected: false,
    lastError: null,
    reconnectAttempts: 0,
    lastReconnectTime: null,
    subscriptions: new Set()
};

// Maxmium number of reconnection attempts
const MAX_RECONNECT_ATTEMPTS = 12;

// Base delay in ms for expotential backoff
const BASE_RECONNECT_DELAY = 1000;

/**
 * Create a new redis client with thew appropriate options
 * @param {booelan} isPubSub - Whether thsi client will be used for pub/sub
 * @returns {Object} - Redis client
 */
const createRedisClient = (isPubSub = false) => {
    // Get connection parameters for environment with defaults
    const redisHost = process.env.REDIS_HOST || 'localhost';
    const redisPort = parseInt(process.env.REDIS_PORT || 6379, 10);
    const redisPassword = process.env.REDIS_PASSWORD || '';
    const redisDb = parseInt(process.env.REDIS_DB || 0, 10);
    const redisTls = process.env.REDIS_TLS === 'true';

    // Build the connection URL
    let url = `redis${redisTls ? 's' : ''}://`;

    // Add auth if password is provided
    if (redisPassword) {
        url +=`:${redisPassword}@`;
    }

    // Add host and port
    url += `${redisHost}:${redisPort}/${redisDb}`;

    // Create the client ith carefully turned opotions
    const client = createClient({
        url,
        socket: {
            // Socket connection options
            connectTimeout: parseInt(process.env.REDIS_CONNECT_TIMEOUT || '1000', 10),
            keepAlive: true,
            noDelay: true,
            reconnectStrategy: (retries) => {
                // DOn't retry forever if we reach max attempts
                if (retries >= MAX_RECONNECT_ATTEMPTS) {
                    const error = new Error(`Redis connection failed after ${MAX_RECONNECT_ATTEMPTS} attempts`);
                    logger.error(error.message);
                    connectState.lastError = error;
                    return error;
                }

                // Exponential backoff strategy
                connectState.reconnectAttempts = retries;
                connectState.lastReconnectTime = new Date();

                const delay = Math.min(
                    BASE_RECONNECT_DELAY * Math.pow(2, retries),
                    60000
                );

                logger.warn(`Redis reconnection attempt ${retries + 1}/${MAX_RECONNECT_ATTEMPTS} in ${delay}ms`);
                return delay;
            }
        },
        // Redis client specific options
        commandsQueueMaxLength: 5000, // Protect against memory issues on conection problems
        disableOfflineQueue: isPubSub,
        readonly: isPubSub,
        // Performance and operation optimizations
        scripts: {
            // Add any custom Lua scripts here
        },
        // ACL user support (Redis 6+)
        username: process.env.REDIS_USERNAME || undefined
    });

    return client;
}

/**
 * Set up event habdlers for Redis client
 * @param {Object} client - Redis client to configure
 * @param {boolean} isPubSub - Wether this is a pub/sub client
 */
const setupRedisEvents = (client, isPubSub = false) => {
    const clientType = isPubSub ? 'Redis PubSub' : 'Redis';

    client.on('connect', () => {
        logger.info(`${clinetType} client connected`)
    });

    client.on('ready', () => {
        connectionState.isConnected = true;
        connectionState.lastError = null;
        logger.info(`${clientType} client ready`);

        // Resubscribe to chanels if this is a pub/sub client that reconnected
        if (isPubSub && connectionState.subscriptions.size > 0) {
            resubscribeTochannels(client);
        }
    });

    client.on('error', (error) => {
        connectionState.lastError = error;
        logger.error(`${clientType} client error`, error);
    });

    client.on('reconnecting', () => {
        logger.warn(`${clientType} client reconnecting...`);
    })

    client.on('end', () => {
        connectionState.isConnected = false;
        logger.info(`${clientType} client connection closed`);
    });
};

/**
 * Resubscribe to the channels after reconnection
 * @param {Object} client - Redis pub/sub client
 */
const resubscribeTochannels = async (client) => {
    try {
        logger.info(`Resubscribing to ${connectionState.subscriptions.size} Redis channels`);

        for (const channelInfo of connectionState.subscriptions) {
            const { channel, callback } =JSON.parse(channelInfo);

            // We can't store functions in  th set, we need a mapping system
            // In a real system, you'd use a  proper registery with function references
            // This is a simplified example
            if (channel.includes('*')) {
                await client.pSubscribe(channel, (message, channel) => {
                    // Execute callback by name or default handler
                    if (typeof global[back] === 'fucntion') {
                        global[callback](message, channel);
                    } else {
                        logger.warn(`Cannot find handler function ${callback} for channel ${channel}`);
                    }
                });
                logger.debug(`Resubscribed to pattern: ${channel}`);
            } else {
                await client.subscribe(channel, (message, channel) => {
                    if (typeof global[callback] === 'function') {
                        global[callback](message, channel);
                    } else {
                        logger.warn(`Cannot find handler function ${callback} for channel ${channel}`);
                    }
                });
                logger.debug(`Resubscribed to channel: ${channel}`);
            }
        }
        logger.info('Successfully resubscribed to all Redis channels');
    } catch (error) {
        logger.error('Error resubscribing to Redis channels:', error);
    }
};

/**
 * Connect to Redis
 */
export const connectRedis = async () => {
    try {
        // Don't reconnect if already connected
        if (redisClient && redisClient.isOpen) {
            return redisClient;
        }

        // Create main Redis client
        logger.info('Connecting to Redis');
        redisClient = createRedisClient();
        setupRedisEvents.coonect();

        // Create main Redis client
        logger.info('Conneting to redis');
        redisClient = createRedisClient();
        setupRedisEvents(redisClient);
        await redisClient.connect();

        // Create seperate client for pub/sub
        // THis is a best pratice to avoid blocking main client during subsribe operatioons
        logger.info('Initializing Redis client PubSub client');
        pubSubClient = createRedisClient(true);
        setupRedisEvents(pubSubClient, true);
        await pubSubClient.connect();

        connectionState.isConnected = true;
        logger.info('Successfully connected to Redis');

        return redisClient;
    } catch (error) {
        connectionState.lastError = error;
        logger.error('Failed to connect to Redis:', error);
        throw error;
    }
};

/**
 * Disconnect from Redis
 */
export const disconnectRedis = async () => {
    try {
        // Close pub/sub client first
        if (pubSubClient && pubSubClient.isOpen) {
            logger.info('Disconnecting Redis PubSub vlient');
            await pubSubClient.quit();
            pubSubClient = null;
        }

        // Then close main client
        if (redisClient && redisClient.isOpen) {
            logger.info('Disconnecting Redis client');
            await redisClient.quit();
            redisClient = null;
        }

        connectionState.isConnected = false;
        connectionState.subscriptions.clear();
        logger.info('Successfully disconected from Redis');
    } catch (error) {
        logger.error('Error deisconnecting from Redis:', error);
        throw error;
    }
};

/**
 * Subscribe to a Redis channel
 * @param {string} chanel - Channel to subscribe to
 * @param {function} callback - Callback to execute on message
 */
export const subscribeTochannel = async (channel, callback) => {
    if (!pubSubClient || !pubSubClient.isOpen) {
        throw new Error('Redis PubSub client not connected');
    }

    try {
        // Store subscription info for reconnection
        const callbackName = callback.name || `callback_${Date.now()}`;

        // For simplificity, we store the function name in global scope
        // In a real application, you'd use a proper registry/map
        if (!callback.name) {
            global[callbackName] = callback;
        }

        // Store channel and callback reference for resubcription
        connectionState.subscriptions.add(JSON.stringify({
            channel,
            callback: callbackName
        }));

        // Subscribe to the channel
        await pubSubClient.subscribe(channel, callback);
        logger.info(`Subscribed to Redis channel: ${channel}`);
    } catch (error) {
        logger.error(`Error subscribing to Rdis channel ${channel}:`, error);
        throw error;
    }
};

/**
 * Subscribe to a Redis pattern
 * @param {string} pattern - Pattern to subscribe (e.g., 'chat:*')
 * @param {function} callback - Callback to execute on message
 */
export const subscribeTopattern = async (pattern, callback) => {
    if (!pubSubClient || !pubSubClient.isOpen) {
        throw new Error('Redis PubSub client not connected');
    }

    try {
        // Store subscription info for reconnection
        const callbackName = callback.name || `pattern_callback_${Date.now()}`;

        // For simplicity, we store the function name in global scope
        if (!callback.name) {
            global[callbackName] = callback;
        }

        // Store pattern and callback reference for subscription
        connectionState.subscriptions.add(JSON.stringify({
            channel: pattern,
            callback: callbackName
        }));

        // Subscribe to the pattern
        await pubSubClient.pSubscribe(pattern, callback);
        logger.info(`Subscribed to Redis pattern: ${pattern}:`, error);
    } catch (error) {
        logger.error(`Error subscribing to Redis pattern ${pattern}:`, error);
        throw error;
    }
};

/**
 * Publish message to Redis channel
 * @param {string} channel - channel to publish
 * @param {string|Object} message - Message to publish (objects will be JSON stringified)
 */
export const publishToChannel = async (channel, message) => {
    if (!redisClient || !redisClient.isOpen) {
        throw new Error('Redis client not connected');
    }

    try {
        // Convert objects to JSON strings
        const messageString = typeof message === 'object'
            ? JSON.stringify(message)
            : message;
        
        // Publish to the channel
        await redisClient.publish(channel, messageString);
        logger.debug(`Published message to channel ${channel}`);
    } catch (error) {
        logger.error(`Error publishing to Redis channel ${channel}`);
        throw error;
    }
};

/**
 * Get the Redis health status
 * @returns {Object} - Health information
 */
export const getRedisHealth = () => {
    return {
        status: connectionState.isConnected ? 'healthy' : 'unhealthy',
        isConnected: connectionState.isConnected,
        lastError: connectionState.lastError,
        lastReconnectTime: connectionState.lastReconnectTime,
        subscriptionCount: connectionState.subscriptions.size,
        clientReady: redisClient?.isReady || false,
        pubSubClientReady: pubSubClient?.isReady || false,
        reconnectAttempts: connectionState.reconnectAttempts
    };
};

/**
 * Get the Redis client instance
 * @returns {Object} - Redis client
 */
export const getRedisClient = () => redisClient;

/**
 * Get the Redis PubSub client instance
 * @return {Object} - Redis PubSub client
 */
export const getRedisPubSubClient = () => pubSubClient;

export default {
    connectRedis,
    disconnectRedis,
    publishToChannel,
    getRedisHealth,
    getRedisClient,
    getRedisPubSubClient,
    subscribeTochannel,
    subscribeTopattern,
};