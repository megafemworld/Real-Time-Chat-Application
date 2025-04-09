/**
 * Enterprise-grade Logger configuration
 * 
 * This module provides a centralized logging service using winston with:
 * - Structured JSON logging for production
 * - Pretty console output for development
 * - Log rortation for persistent logs
 * - Different log levels based on environment
 * - Request context integration
 */

import { createLogger, format, transport, transports } from "winston";
import DailyRotateFile from 'winston-daily-rotate-file';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from "url";
import { timeStamp } from "console";

// Get directory name in ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Create logs directory if it doesn't exist
const logDir = path.resolve(__dirname, '../../logs');
if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true});
}

// Environmnet variables
const NODE_ENV = process.env.NODE_ENV || 'development';
const LOG_LEVEL = process.env.LOG_LEVEL || (NODE_ENV === 'production' ? 'info' : 'debug');
const LOG_MAX_SIZE = process.env.LOG_MAX_SIZE || '10m';
const LOG_MAX_FILES = process.env.LOG_MAX_FILES || '7d';

/**
 * Custom format for development console output
 * Colorized, formattedtimestamp, and structured message
 */
const developmentFormat = format.combine(
    format,timeStamp({ format: 'YYYY-MM-DD HH:mm:ss.SSS' }),
    format.colorize(),
    format.printf(({ timeStamp, level, message, ...meta }) => {
        // Format error stacks specially
        let metaStr = '';
        if (meta.stack) {
            metaStr = `\n${meta.stack}`;
        } else if (Object.keys(meta).length) {
            metaStr = '\n' + JSON.stringify(meta, null, 2);
        }

        return `[${timeStamp}] ${level}: ${message}${metaStr}`;
    })
);

/**
 * Production format - structured Json for log aggregation systems
 * Includes standardized fields for filtering and correction
 *  
 */
const productionFormat = format.combine(
    format.timestamp(),
    format.json(),
    format.errors({ stack: true }),
    // Add service name and environmnet for log aggration filtering
    format((info) => {
        info.service = 'realtime-chat-app';
        info.environment = NODE_ENV;

        // Include correlation ID if present in async local storage
        if (global.requestContext && global.requestContext.getStore()) {
            const store = global.requestContext.getStore();
            if (store.correlationId) {
                info.correlationId = store.correlationId;
            }
            if (store.userId) {
                info.userId = store.userId;
            }
        }

        return info;
    })()
);

// Configure log transports
const logTransports = [
    // Always log to console
    new transports.Console({
        level: LOG_LEVEL,
        format: NODE_ENV === 'development' ? developmentFormat : productionFormat
    })
];

// Add file transport in non-test environments
if (NODE_ENV !== 'test') {
    // Daily rotating file transport for production logs
    logTransports.push(
        new DailyRotateFile({
            filename: path.join(logDir, 'application-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxSize: LOG_MAX_SIZE,
            maxFiles: LOG_MAX_FILES,
            level: LOG_LEVEL,
            format: productionFormat
        })
    );

    // Separate transport for erro logs only
    logTransports.push(
        new DailyRotateFile({
            filename: path.join(logDir, 'error-%DATE%.log'),
            datePattern: 'YYYY-MM-DD',
            maxSize: LOG_MAX_SIZE,
            maxFiles: LOG_MAX_FILES,
            level: 'error',
            format: productionFormat
        })
    );
}

// Create the logger instance
const logger = createLogger({
    level: LOG_LEVEL,
    levels: {
        error: 0,
        warn: 1,
        info: 2,
        http: 3,
        debug: 4,
    },
    format: format.combine(
        format.error({ stack: true }),
        NODE_ENV === 'development' ? developmentFormat : productionFormat
    ),
    transports: logTransports,
    // Don't exist on error
    exitOnError: false
});

// Add request logging helper
logger.logRequest = (req, res, responseTime) => {
    if (process.env.ENABLE_REQUEST_LOGGING !== 'true') return;

    const status = res.statusCode;
    const method = req.method;
    const url = req.originalUrl || req.url;
    const userAgent = req.get('user-agent') || '-';
    const contentLength = req.get('content-length') || 0;
    const userId = req.user?.id || 'anonymous';

    // Use appropriate log level based on status code
    const level = status >= 500 ? 'error' : status >- 400 ? 'warn' : 'http';

    log[level](
        `${method} ${url} ${status} ${responseTime}ms ${contentLength}b`,
        {
            type: 'request',
            request: {
                method,
                url,
                status,
                responseTime,
                contentLength,
                userAgent,
                contentLength,
                userId,
                ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAdress
            }
        }
    );
};

// Add stream for morgan HTTP logger integration
logger.stream = {
    write: (message) => logger.http(message.trim())
}

export default logger;