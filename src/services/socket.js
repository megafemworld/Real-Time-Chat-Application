/**
 * WebSocket service
 * 
 * This module handles WebSocket connections, message broadcating, and integration
 * with Redis for pub/sub system for a real-time chat application.
 */

import { Server } from 'socket.io';
import logger from '../utils/logger.js';
import { subscribeTochannel, publishToChannel } from '../database/redis.js';
import { parse } from 'dotenv';

//WebSocket server instance
let io = null

/**
 * Initialize webSocket
 * @parm {Object} httpServer - HTTP server ito attacch the WebSocket server to
 * @return {Object} WebSocket server instance
 */
const initializeWebSocket = (httpServer) => {
    io = new Server(httpServer, {
        cors: {
            origin: process.env.CORS_ORIGIN || '*',
            methods: ['GET', 'POST'],
        },
        path: process.env.WS_PATH || '/socket.io',
        pingInterval: parseInt(process.env.WS_PING_INTERVAL || '25000', 10),
        pingTimeout: parseInt(process.env.WS_PING_TIMEOUT || '10000', 10),
    });

    // Handle websocket connection
    io.on('connection', (socket) => {
        logger.info(`Websocket client connected: ${socket.id}`);
    })
}