/**
 * WebSocket service
 * 
 * This module handles WebSocket connections, message broadcating, and integration
 * with Redis for pub/sub system for a real-time chat application.
 */

import { Server } from 'socket.io';
import logger from '../utils/logger.js';
import { subscribeTochannel, publishToChannel } from '../database/redis.js';


//WebSocket server instance
let io = null

/**
 * Initialize webSocket
 * @parm {Object} httpServer - HTTP server ito attacch the WebSocket server to
 * @return {Object} WebSocket server instance
 */
const initialize = (httpServer) => {
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

        // Handle joing a chat room
        socket.on('join', (room) => {
            socket.join(room);
            logger.info(`Client ${socket.id} joined room: ${room}`);
        })

        // Handle leaving a chat room
        socket.on('leave', (room) => {
            socket.leave(room);
            logger.info(`Client ${socket.id} left room: ${room}`);
        });

        // Handle receiving a message
        socket.on('message', async (data) => {
            logger.info(`Message received from ${socket.id}: ${data}`);
            const { room, message } = messageData;

            // Publish message to Redis channel
            await publishToChannel(room, message);
            logger.info(`Message from ${socket.id} in room ${room}: ${message}`);

            // Handle client disconnection
            socket.on('disconnect', (reason) => {
                logger,info(`Websocket client disconnected: ${socket.id} - reason: ${reason}`);
            });
        });

        // Subscribe to Redis channel for real-time message broadcasting
        const handleMesage = (message, channel) => {
            io.to(channel).emit('message', message);
            logger.info(`Broadcasted message to room ${channel}: ${message}`);
        };

        subscribeTochannel('chat:*', handleMesage);

        return io;
    });
}

/**
 * Get the websocket server instance
 * @return {Object} webSocvket server instance
 */
const getInstance = () => io;
export default {
    initialize,
    getInstance,
};