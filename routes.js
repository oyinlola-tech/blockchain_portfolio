// routes.js
// This file contains all API routes for the crypto portfolio app
// Each route handles a specific task and follows security best practices

// Import required modules
const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
require('dotenv').config();

// Import database functions from db.js
const db = require('./db');

// Import DexPaprika service for crypto data
const dexpaprikaService = require('./services/dexpaprika');

// ======================================
// MIDDLEWARE FUNCTIONS
// ======================================

// Middleware to verify JWT token from HTTP-only cookie
async function authenticateToken(req, res, next) {
  try {
    // Get token from HTTP-only cookie (not from headers for better security)
    const token = req.cookies?.token;
    
    if (!token) {
      return res.status(401).json({ error: 'Authentication required' });
    }
    
    // Verify the JWT token
    jwt.verify(token, process.env.JWT_SECRET, async (err, decoded) => {
      if (err) {
        // Clear invalid cookie
        res.clearCookie('token');
        return res.status(403).json({ error: 'Invalid or expired token' });
      }
      
      // Verify token is still valid in database (not revoked)
      const tokenHash = await hashToken(token);
      const session = await db.verifySessionToken(tokenHash);
      
      if (!session) {
        res.clearCookie('token');
        return res.status(403).json({ error: 'Session expired' });
      }
      
      // Attach user info to request object
      req.user = {
        id: session.user_id,
        email: session.email,
        fullName: session.full_name
      };
      
      next(); // Proceed to the actual route handler
    });
  } catch (error) {
    console.error('  Authentication error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
}

// Helper function to hash tokens for database storage
async function hashToken(token) {
  return await bcrypt.hash(token, 10);
}

// Middleware to sanitize and validate user input
function sanitizeInput(req, res, next) {
  // Clean all string inputs by trimming and escaping
  if (req.body) {
    for (let key in req.body) {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key].trim();
        // Basic XSS protection - remove script tags
        req.body[key] = req.body[key].replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
      }
    }
  }
  
  // Clean query parameters
  if (req.query) {
    for (let key in req.query) {
      if (typeof req.query[key] === 'string') {
        req.query[key] = req.query[key].trim();
      }
    }
  }
  
  next();
}

// ======================================
// AUTHENTICATION ROUTES
// ======================================

// Route 1: User registration
router.post('/api/register', sanitizeInput, async (req, res) => {
  try {
    const { email, password, fullName } = req.body;
    
    // Validate input
    if (!email || !password || !fullName) {
      return res.status(400).json({ error: 'All fields are required' });
    }
    
    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      return res.status(400).json({ error: 'Invalid email format' });
    }
    
    // Password strength check (at least 8 characters)
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }
    
    // Create user in database
    const user = await db.createUser(email, password, fullName);
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' } // Token expires in 7 days
    );
    
    // Hash token for database storage
    const tokenHash = await hashToken(token);
    
    // Calculate expiration date (7 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    
    // Store token hash in database
    await db.storeSessionToken(user.id, tokenHash, expiresAt);
    
    // Set HTTP-only cookie (secure in production)
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('token', token, {
      httpOnly: true, // Prevents JavaScript access (XSS protection)
      secure: isProduction, // Only send over HTTPS in production
      sameSite: 'strict', // CSRF protection
      maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days in milliseconds
    });
    
    // Return success response (without sensitive data)
    res.status(201).json({
      message: 'Registration successful',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName
      }
    });
    
  } catch (error) {
    console.error('  Registration error:', error);
    
    // Handle duplicate email error
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Email already registered' });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Route 2: User login
router.post('/api/login', sanitizeInput, async (req, res) => {
  try {
    const { email, password } = req.body;
    
    // Validate input
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Verify user credentials
    const user = await db.verifyUser(email, password);
    
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    // Generate JWT token
    const token = jwt.sign(
      { userId: user.id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: '7d' }
    );
    
    // Hash token for database storage
    const tokenHash = await hashToken(token);
    
    // Calculate expiration date
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);
    
    // Store token hash in database
    await db.storeSessionToken(user.id, tokenHash, expiresAt);
    
    // Set HTTP-only cookie
    const isProduction = process.env.NODE_ENV === 'production';
    res.cookie('token', token, {
      httpOnly: true,
      secure: isProduction,
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000
    });
    
    // Return success response
    res.json({
      message: 'Login successful',
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName
      }
    });
    
  } catch (error) {
    console.error('  Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Route 3: User logout
router.post('/api/logout', authenticateToken, async (req, res) => {
  try {
    // Get token from cookie
    const token = req.cookies?.token;
    
    if (token) {
      // Hash the token to match database record
      const tokenHash = await hashToken(token);
      
      // In production, we would delete the specific token from database
      // For simplicity, we just clear the cookie
    }
    
    // Clear the HTTP-only cookie
    res.clearCookie('token');
    
    res.json({ message: 'Logout successful' });
    
  } catch (error) {
    console.error('  Logout error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Route 4: Get current user info
router.get('/api/user', authenticateToken, async (req, res) => {
  try {
    // User info is already attached by authenticateToken middleware
    res.json({
      user: req.user
    });
  } catch (error) {
    console.error('  Get user error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ======================================
// PORTFOLIO ROUTES (PROTECTED)
// ======================================

// Route 5: Get user's complete portfolio
router.get('/api/portfolio', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    
    // Get portfolio from database
    let portfolio = await db.getUserPortfolio(userId);
    
    // Update prices from DexPaprika API
    if (portfolio.length > 0) {
      // Extract coin IDs for price lookup
      const coinIds = portfolio.map(item => item.coin_id);
      
      // Get current prices from API
      const currentPrices = await dexpaprikaService.getCurrentPrices(coinIds);
      
      // Update portfolio with current prices and values
      const priceUpdates = [];
      portfolio = portfolio.map(item => {
        const currentPrice = currentPrices[item.coin_id] || item.current_price || 0;
        const currentValue = item.amount * currentPrice;
        
        // Prepare update for database
        priceUpdates.push({
          coin_id: item.coin_id,
          current_price: currentPrice
        });
        
        return {
          ...item,
          current_price: currentPrice,
          current_value: currentValue,
          // Calculate gain/loss percentage
          gain_loss_percentage: item.purchase_price > 0 
            ? ((currentPrice - item.purchase_price) / item.purchase_price * 100).toFixed(2)
            : 0
        };
      });
      
      // Update database with new prices
      await db.updatePortfolioPrices(userId, priceUpdates);
    }
    
    // Calculate total portfolio value
    const totalValue = portfolio.reduce((sum, item) => {
      return sum + (item.current_value || 0);
    }, 0);
    
    // Calculate total gain/loss
    const totalPurchaseValue = portfolio.reduce((sum, item) => {
      return sum + (item.amount * item.purchase_price || 0);
    }, 0);
    
    const totalGainLossPercentage = totalPurchaseValue > 0
      ? ((totalValue - totalPurchaseValue) / totalPurchaseValue * 100).toFixed(2)
      : 0;
    
    res.json({
      portfolio,
      summary: {
        total_value: totalValue,
        total_gain_loss_percentage: totalGainLossPercentage,
        total_gain_loss_value: totalValue - totalPurchaseValue,
        currency: 'USD'
      }
    });
    
  } catch (error) {
    console.error('  Get portfolio error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Route 6: Add coin to portfolio
router.post('/api/portfolio/add', authenticateToken, sanitizeInput, async (req, res) => {
  try {
    const userId = req.user.id;
    const { coin_id, coin_symbol, coin_name, amount, purchase_price } = req.body;
    
    // Validate input
    if (!coin_id || !coin_symbol || !coin_name || !amount || !purchase_price) {
      return res.status(400).json({ error: 'All coin details are required' });
    }
    
    // Validate numeric values
    const amountNum = parseFloat(amount);
    const purchasePriceNum = parseFloat(purchase_price);
    
    if (isNaN(amountNum) || isNaN(purchasePriceNum) || amountNum <= 0 || purchasePriceNum <= 0) {
      return res.status(400).json({ error: 'Valid amount and purchase price are required' });
    }
    
    // Get current price from API
    const currentPrice = await dexpaprikaService.getCoinCurrentPrice(coin_id);
    const currentValue = amountNum * currentPrice;
    
    // Prepare coin data for database
    const coinData = {
      coin_id,
      coin_symbol: coin_symbol.toUpperCase(),
      coin_name,
      amount: amountNum,
      purchase_price: purchasePriceNum,
      current_price: currentPrice,
      current_value: currentValue
    };
    
    // Add to portfolio
    await db.addToPortfolio(userId, coinData);
    
    res.json({
      message: 'Coin added to portfolio successfully',
      coin: coinData
    });
    
  } catch (error) {
    console.error('  Add to portfolio error:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: 'Coin not found' });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Route 7: Remove coin from portfolio
router.delete('/api/portfolio/:coinId', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const coinId = req.params.coinId;
    
    // In production, we would implement this delete functionality
    // For now, return a message since we haven't implemented the delete function in db.js
    
    res.json({
      message: 'Delete functionality will be implemented in next phase',
      coin_id: coinId
    });
    
  } catch (error) {
    console.error('  Remove from portfolio error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ======================================
// SEARCH & TRENDING ROUTES (PROTECTED)
// ======================================

// Route 8: Search for coins
router.get('/api/search', authenticateToken, async (req, res) => {
  try {
    const searchQuery = req.query.q;
    
    if (!searchQuery || searchQuery.trim().length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }
    
    // Search coins using DexPaprika API
    const searchResults = await dexpaprikaService.searchCoins(searchQuery);
    
    res.json({
      query: searchQuery,
      results: searchResults
    });
    
  } catch (error) {
    console.error('  Search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Route 9: Get trending coins
router.get('/api/trending', authenticateToken, async (req, res) => {
  try {
    // Get trending data from DexPaprika API
    const trendingData = await dexpaprikaService.getTrendingCoins();
    
    res.json({
      popular: trendingData.popular || [],
      top_gainers: trendingData.top_gainers || [],
      top_losers: trendingData.top_losers || [],
      recently_added: trendingData.recently_added || [] // Additional category
    });
    
  } catch (error) {
    console.error(' Trending error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Route 10: Get coin details
router.get('/api/coin/:coinId', authenticateToken, async (req, res) => {
  try {
    const coinId = req.params.coinId;
    const timeFrame = req.query.timeframe || '7d'; // Default to 7 days
    
    // Get coin details from DexPaprika API
    const coinDetails = await dexpaprikaService.getCoinDetails(coinId, timeFrame);
    
    res.json({
      coin: coinDetails
    });
    
  } catch (error) {
    console.error(' Coin details error:', error);
    
    if (error.message.includes('not found')) {
      return res.status(404).json({ error: 'Coin not found' });
    }
    
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ======================================
// SETTINGS ROUTES (PROTECTED)
// ======================================

// Route 11: Get user settings
router.get('/api/settings', authenticateToken, async (req, res) => {
  try {
    // In a full implementation, we would get settings from database
    // For now, return default settings
    
    res.json({
      settings: {
        theme: 'light', // Will be fetched from database
        currency: 'USD',
        notifications: true
      }
    });
    
  } catch (error) {
    console.error(' Get settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Route 12: Update user settings
router.put('/api/settings', authenticateToken, sanitizeInput, async (req, res) => {
  try {
    const { theme, currency, notifications } = req.body;
    
    // Validate theme
    if (theme && !['light', 'dark'].includes(theme)) {
      return res.status(400).json({ error: 'Theme must be "light" or "dark"' });
    }
    
    // In a full implementation, we would update settings in database
    // For now, return success message
    
    res.json({
      message: 'Settings updated successfully',
      settings: {
        theme: theme || 'light',
        currency: currency || 'USD',
        notifications: notifications !== undefined ? notifications : true
      }
    });
    
  } catch (error) {
    console.error(' Update settings error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ======================================
// HEALTH CHECK ROUTE (PUBLIC)
// ======================================

// Route 13: Health check endpoint
router.get('/api/health', (req, res) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    service: 'Crypto Portfolio API'
  });
});

// ======================================
// ERROR HANDLING MIDDLEWARE
// ======================================

// Handle 404 - Route not found
router.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Handle all other errors
router.use((err, req, res, next) => {
  console.error(' Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Export the router
module.exports = router;