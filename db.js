// db.js
// Database connection and setup for the crypto portfolio app
// This file handles all database operations and table creation

// Import required modules
const mysql = require('mysql2/promise'); // Use promise-based MySQL
const bcrypt = require('bcrypt'); // For password hashing
require('dotenv').config(); // Load environment variables from .env file

// Database connection configuration
// Using environment variables for security - never hardcode credentials
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '', // Empty by default for AMPPS
  database: process.env.DB_NAME || 'crypto_portfolio_db',
  waitForConnections: true,
  connectionLimit: 10, // Limit concurrent connections for safety
  queueLimit: 0
};

// Create a connection pool for better performance
// A pool manages multiple database connections
let pool;

// Function to initialize database connection and create tables
async function initializeDatabase() {
  try {
    // Create connection pool
    pool = mysql.createPool(dbConfig);
    
    console.log('  Database connection pool created');
    
    // Create tables if they don't exist
    await createTables();
    
    console.log('  Database tables initialized successfully');
    return pool;
  } catch (error) {
    console.error(' Database initialization failed:', error);
    throw error;
  }
}

// Function to create all necessary tables
async function createTables() {
  const connection = await pool.getConnection();
  
  try {
    // Users table - stores user information
    // Using prepared statements to prevent SQL injection
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        full_name VARCHAR(255) NOT NULL,
        theme_preference ENUM('light', 'dark') DEFAULT 'light',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      )
    `);
    
    // User_sessions table - stores JWT tokens for authentication
    // HTTP-only cookies will reference these tokens
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS user_sessions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        token_hash VARCHAR(255) NOT NULL,
        expires_at TIMESTAMP NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        INDEX idx_token_hash (token_hash),
        INDEX idx_expires_at (expires_at)
      )
    `);
    
    // Portfolio table - stores user's crypto holdings
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS portfolio (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        coin_id VARCHAR(100) NOT NULL, // From DexPaprika API
        coin_symbol VARCHAR(20) NOT NULL, // Like BTC, ETH
        coin_name VARCHAR(100) NOT NULL,
        amount DECIMAL(20, 8) NOT NULL, // Support up to 8 decimal places for crypto
        purchase_price DECIMAL(20, 2) NOT NULL, // In USD
        current_price DECIMAL(20, 2), // Updated from API
        current_value DECIMAL(20, 2), // amount * current_price
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_user_coin (user_id, coin_id)
      )
    `);
    
    // Transactions table - tracks all buy/sell transactions
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS transactions (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        coin_id VARCHAR(100) NOT NULL,
        coin_symbol VARCHAR(20) NOT NULL,
        transaction_type ENUM('buy', 'sell') NOT NULL,
        amount DECIMAL(20, 8) NOT NULL,
        price_per_unit DECIMAL(20, 2) NOT NULL,
        total_value DECIMAL(20, 2) NOT NULL,
        transaction_date TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )
    `);
    
    // Coin_watchlist table - for trending/quick access
    await connection.execute(`
      CREATE TABLE IF NOT EXISTS coin_watchlist (
        id INT AUTO_INCREMENT PRIMARY KEY,
        user_id INT NOT NULL,
        coin_id VARCHAR(100) NOT NULL,
        coin_symbol VARCHAR(20) NOT NULL,
        coin_name VARCHAR(100) NOT NULL,
        added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE KEY unique_user_watchlist (user_id, coin_id)
      )
    `);
    
    console.log('  All database tables created/verified');
  } catch (error) {
    console.error(' Error creating tables:', error);
    throw error;
  } finally {
    // Always release the connection back to the pool
    connection.release();
  }
}

// User-related database operations

// Create a new user with hashed password
async function createUser(email, password, fullName) {
  const connection = await pool.getConnection();
  
  try {
    // Hash the password before storing (NEVER store plain text)
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);
    
    const [result] = await connection.execute(
      'INSERT INTO users (email, password_hash, full_name) VALUES (?, ?, ?)',
      [email, passwordHash, fullName]
    );
    
    return { id: result.insertId, email, fullName };
  } catch (error) {
    console.error('Error creating user:', error);
    throw error;
  } finally {
    connection.release();
  }
}

// Verify user credentials (for login)
async function verifyUser(email, password) {
  const connection = await pool.getConnection();
  
  try {
    // Get user by email
    const [rows] = await connection.execute(
      'SELECT id, email, password_hash, full_name FROM users WHERE email = ?',
      [email]
    );
    
    if (rows.length === 0) {
      return null; // User not found
    }
    
    const user = rows[0];
    
    // Compare provided password with hashed password
    const isValid = await bcrypt.compare(password, user.password_hash);
    
    if (!isValid) {
      return null; // Invalid password
    }
    
    // Return user data (excluding password hash)
    return {
      id: user.id,
      email: user.email,
      fullName: user.full_name
    };
  } catch (error) {
    console.error(' Error verifying user:', error);
    throw error;
  } finally {
    connection.release();
  }
}

// Portfolio-related database operations

// Get user's portfolio with current values
async function getUserPortfolio(userId) {
  const connection = await pool.getConnection();
  
  try {
    const [rows] = await connection.execute(
      `SELECT 
        coin_id,
        coin_symbol,
        coin_name,
        amount,
        purchase_price,
        current_price,
        current_value,
        created_at
      FROM portfolio 
      WHERE user_id = ? 
      ORDER BY current_value DESC`,
      [userId]
    );
    
    return rows;
  } catch (error) {
    console.error(' Error getting portfolio:', error);
    throw error;
  } finally {
    connection.release();
  }
}

// Add a coin to user's portfolio
async function addToPortfolio(userId, coinData) {
  const connection = await pool.getConnection();
  
  try {
    const [result] = await connection.execute(
      `INSERT INTO portfolio 
        (user_id, coin_id, coin_symbol, coin_name, amount, purchase_price, current_price, current_value) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        amount = amount + VALUES(amount),
        purchase_price = VALUES(purchase_price),
        updated_at = CURRENT_TIMESTAMP`,
      [
        userId,
        coinData.coin_id,
        coinData.coin_symbol,
        coinData.coin_name,
        coinData.amount,
        coinData.purchase_price,
        coinData.current_price,
        coinData.current_value
      ]
    );
    
    return result;
  } catch (error) {
    console.error('Error adding to portfolio:', error);
    throw error;
  } finally {
    connection.release();
  }
}

// Update portfolio prices from API
async function updatePortfolioPrices(userId, priceUpdates) {
  const connection = await pool.getConnection();
  
  try {
    for (const update of priceUpdates) {
      await connection.execute(
        `UPDATE portfolio 
         SET current_price = ?, 
             current_value = amount * ?,
             updated_at = CURRENT_TIMESTAMP
         WHERE user_id = ? AND coin_id = ?`,
        [update.current_price, update.current_price, userId, update.coin_id]
      );
    }
  } catch (error) {
    console.error('Error updating portfolio prices:', error);
    throw error;
  } finally {
    connection.release();
  }
}

// Session management

// Store JWT token hash in database
async function storeSessionToken(userId, tokenHash, expiresAt) {
  const connection = await pool.getConnection();
  
  try {
    await connection.execute(
      'INSERT INTO user_sessions (user_id, token_hash, expires_at) VALUES (?, ?, ?)',
      [userId, tokenHash, expiresAt]
    );
  } catch (error) {
    console.error(' Error storing session token:', error);
    throw error;
  } finally {
    connection.release();
  }
}

// Verify session token
async function verifySessionToken(tokenHash) {
  const connection = await pool.getConnection();
  
  try {
    const [rows] = await connection.execute(
      `SELECT us.user_id, u.email, u.full_name 
       FROM user_sessions us
       JOIN users u ON us.user_id = u.id
       WHERE us.token_hash = ? AND us.expires_at > NOW()`,
      [tokenHash]
    );
    
    if (rows.length === 0) {
      return null; // Token expired or not found
    }
    
    return rows[0];
  } catch (error) {
    console.error(' Error verifying session token:', error);
    throw error;
  } finally {
    connection.release();
  }
}

// Cleanup expired sessions
async function cleanupExpiredSessions() {
  const connection = await pool.getConnection();
  
  try {
    await connection.execute(
      'DELETE FROM user_sessions WHERE expires_at <= NOW()'
    );
  } catch (error) {
    console.error(' Error cleaning up sessions:', error);
    throw error;
  } finally {
    connection.release();
  }
}

// Export all functions for use in other files
module.exports = {
  initializeDatabase,
  createUser,
  verifyUser,
  getUserPortfolio,
  addToPortfolio,
  updatePortfolioPrices,
  storeSessionToken,
  verifySessionToken,
  cleanupExpiredSessions,
  getPool: () => pool // Getter for the pool if needed elsewhere
};

// Note: This file only sets up the database structure and functions.
// We'll use environment variables for credentials in production.
// To set up environment variables, create a .env file with:
// DB_HOST=localhost
// DB_USER=root
// DB_PASSWORD=yourpassword
// DB_NAME=crypto_portfolio_db
// JWT_SECRET=yoursupersecretjwtkey