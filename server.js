const path = require('path');
const fs = require('fs');

// Third-party modules
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const cookieParser = require('cookie-parser');
const morgan = require('morgan');
require('dotenv').config();

// Our custom modules
const db = require('./db');
const routes = require('./routes');

// ======================================
// STEP 2: CONFIGURATION AND SETUP
// ======================================

// Create Express application
const app = express();

// Set server port
const PORT = process.env.PORT || 3000;

// Check for required environment variables
const requiredEnvVars = ['JWT_SECRET'];
for (const envVar of requiredEnvVars) {
  if (!process.env[envVar]) {
    console.error(`  ERROR: Missing required environment variable: ${envVar}`);
    console.error('Please set this in your .env file');
    process.exit(1);
  }
}

// ======================================
// STEP 3: CREATE PUBLIC DIRECTORY IF IT DOESN'T EXIST
// ======================================

// Define public directory path
const publicDir = path.join(__dirname, 'public');

// Check if public directory exists, create if it doesn't
if (!fs.existsSync(publicDir)) {
  console.log(' Creating public directory...');
  fs.mkdirSync(publicDir, { recursive: true });
}

// ======================================
// STEP 4: SETUP SECURITY MIDDLEWARE
// ======================================

// Helmet.js for security headers
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "cdn.jsdelivr.net", "unpkg.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "fonts.googleapis.com", "cdn.jsdelivr.net"],
      fontSrc: ["'self'", "fonts.gstatic.com", "cdn.jsdelivr.net"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "api.coinpaprika.com"]
    }
  },
  crossOriginEmbedderPolicy: false
}));

// CORS configuration
app.use(cors({
  origin: process.env.NODE_ENV === 'production' 
    ? ['https://yourdomain.com'] // Change this to your actual domain
    : ['http://localhost:3000', 'http://127.0.0.1:3000'],
  credentials: true, // Allow cookies to be sent
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

// Rate limiting to prevent brute force attacks
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later',
  standardHeaders: true,
  legacyHeaders: false
});

// Apply rate limiting to all API routes
app.use('/api', limiter);

// Special stricter rate limiting for authentication routes
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Only 10 attempts per 15 minutes for auth routes
  message: 'Too many login attempts, please try again later'
});
app.use(['/api/login', '/api/register'], authLimiter);

// ======================================
// STEP 5: SETUP APPLICATION MIDDLEWARE
// ======================================

// Parse JSON request bodies (with size limit for safety)
app.use(express.json({ limit: '10kb' }));

// Parse URL-encoded request bodies
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Parse cookies (for JWT authentication)
app.use(cookieParser());

// HTTP request logging
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// Serve static files from public directory
app.use(express.static(publicDir, {
  setHeaders: (res, filePath) => {
    // Set cache-control headers for static files
    if (filePath.endsWith('.html')) {
      // Don't cache HTML files
      res.setHeader('Cache-Control', 'no-store');
    } else if (filePath.endsWith('.js') || filePath.endsWith('.css')) {
      // Cache JS and CSS for 1 hour
      res.setHeader('Cache-Control', 'public, max-age=3600');
    }
  }
}));

// ======================================
// STEP 6: DATABASE INITIALIZATION
// ======================================

// Initialize database connection when server starts
async function initializeServer() {
  try {
    console.log('🔄 Initializing database connection...');
    await db.initializeDatabase();
    console.log('  Database connected successfully');
    
    // Start the server
    app.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`🌐 Open http://localhost:${PORT} in your browser`);
      console.log(`📊 API available at http://localhost:${PORT}/api`);
      console.log(`🔒 Environment: ${process.env.NODE_ENV || 'development'}`);
    });
    
  } catch (error) {
    console.error('  Failed to initialize server:', error);
    process.exit(1);
  }
}

// ======================================
// STEP 7: APPLICATION ROUTES
// ======================================

// Health check endpoint (for monitoring)
app.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Crypto Portfolio API',
    version: '1.0.0'
  });
});

// Mount all API routes from routes.js
app.use('/', routes);

// ======================================
// STEP 8: SERVE FRONTEND FILES
// ======================================

// Route to serve the main HTML file
app.get('/', (req, res) => {
  res.sendFile(path.join(publicDir, 'index.html'));
});

// Catch-all route for frontend routing (for single-page application)
app.get('*', (req, res) => {
  // If the request is for an API route, return 404
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }
  
  // Otherwise, serve the frontend HTML (for client-side routing)
  res.sendFile(path.join(publicDir, 'index.html'));
});

// ======================================
// STEP 9: ERROR HANDLING MIDDLEWARE
// ======================================

// 404 handler for unmatched API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    error: 'API endpoint not found',
    path: req.originalUrl
  });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error(' Unhandled error:', err);
  
  // Don't leak stack traces in production
  const errorDetails = process.env.NODE_ENV === 'production' 
    ? 'Internal server error'
    : err.message;
  
  res.status(err.status || 500).json({
    error: errorDetails,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack })
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('💥 Uncaught Exception:', error);
  // Don't exit in development, but log heavily
  if (process.env.NODE_ENV === 'production') {
    process.exit(1);
  }
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error(' Unhandled Rejection at:', promise, 'reason:', reason);
});

// ======================================
// STEP 10: CLEANUP TASKS
// ======================================

// Function to gracefully shutdown server
function gracefulShutdown() {
  console.log('\n Received shutdown signal');
  console.log(' Cleaning up before shutdown...');
  
  // Perform cleanup tasks here
  // Example: Close database connections, clear temp files, etc.
  
  console.log(' Cleanup complete');
  process.exit(0);
}

// Handle shutdown signals
process.on('SIGTERM', gracefulShutdown);
process.on('SIGINT', gracefulShutdown);

// ======================================
// STEP 11: START THE SERVER
// ======================================

// Initialize and start the server
initializeServer();

// Export app for testing purposes
module.exports = app;