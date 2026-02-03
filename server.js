const express = require('express');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const apiRouter = require('./api');
const db = require('./db');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT;

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: {
        success: false,
        message: 'Too many requests from this IP, please try again later.'
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Security middleware
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdnjs.cloudflare.com"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"],
            fontSrc: ["'self'", "https://cdnjs.cloudflare.com"],
            imgSrc: ["'self'", "data:", "https:", "http:"],
        },
    },
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

// CORS configuration
app.use(cors({
    origin: process.env.NODE_ENV === 'production' 
        ? process.env.FRONTEND_URL 
        : 'http://localhost:8080',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
}));

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Apply rate limiting to API routes
app.use('/api/', limiter);

// Serve static files from public directory
app.use('/public', express.static(path.join(__dirname, 'public'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0
}));

// Serve HTML files from views directory
app.use(express.static(path.join(__dirname, 'views'), {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0
}));

// API routes
app.use('/api', apiRouter);

// Serve HTML pages for frontend routes
app.get(['/', '/login'], (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'login.html'));
});

app.get('/signup', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'signup.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'dashboard.html'));
});

app.get('/coin', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'coin.html'));
});

app.get('/trending', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'trending.html'));
});

app.get('/settings', (req, res) => {
    res.sendFile(path.join(__dirname, 'views', 'settings.html'));
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.status(200).json({
        success: true,
        message: 'Server is healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime()
    });
});

// 404 handler for API routes
app.use('/api/', (req, res) => {
    res.status(404).json({
        success: false,
        message: 'API endpoint not found'
    });
});

// 404 handler for frontend routes - serve 404.html if exists, otherwise JSON
app.use((req, res) => {
    if (req.accepts('html')) {
        res.status(404).send('Page not found');
    } else if (req.accepts('json')) {
        res.status(404).json({
            success: false,
            message: 'Resource not found'
        });
    } else {
        res.status(404).type('txt').send('Not found');
    }
});

// Global error handler
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);

    // Handle JWT errors
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            message: 'Invalid token'
        });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            success: false,
            message: 'Token expired'
        });
    }

    // Handle validation errors
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: err.errors
        });
    }

    // Handle rate limit errors
    if (err.name === 'RateLimitError') {
        return res.status(429).json({
            success: false,
            message: 'Too many requests, please try again later.'
        });
    }

    // Default error
    res.status(err.status || 500).json({
        success: false,
        message: process.env.NODE_ENV === 'production' 
            ? 'Internal server error' 
            : err.message,
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
});

// Graceful shutdown
const gracefulShutdown = () => {
    console.log('Shutting down gracefully...');
    
    // Close database connection
    db.close().then(() => {
        console.log('Database connection closed');
        process.exit(0);
    }).catch(err => {
        console.error('Error closing database connection:', err);
        process.exit(1);
    });
};

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    gracefulShutdown();
});

process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start server only if not in test environment
if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, async () => {
        console.log(`Server is running on http://localhost:${PORT}`);
        console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
        
        try {
            // Initialize database connection
            await db.initializeDatabase();
            console.log('Database connected successfully');
        } catch (error) {
            console.error('Failed to connect to database:', error);
            process.exit(1);
        }
    });
}

module.exports = app;
 