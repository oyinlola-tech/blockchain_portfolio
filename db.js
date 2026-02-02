const mysql = require('mysql2/promise');
require('dotenv').config();

class Database {
    constructor() {
        this.pool = null;
        this.initializeDatabase();
    }

    async initializeDatabase() {
        try {
            // First, create a connection without database to create the database if it doesn't exist
            const connection = await mysql.createConnection({
                host: process.env.DB_HOST || 'localhost',
                user: process.env.DB_USER || 'root',
                password: process.env.DB_PASSWORD || '',
                port: process.env.DB_PORT || 3306
            });

            // Create database if it doesn't exist
            await connection.query(`CREATE DATABASE IF NOT EXISTS \`${process.env.DB_NAME || 'telente'}\``);
            await connection.end();

            // Now create connection pool with the database
            this.pool = mysql.createPool({
                host: process.env.DB_HOST || 'localhost',
                user: process.env.DB_USER || 'root',
                password: process.env.DB_PASSWORD || '',
                database: process.env.DB_NAME || 'telente',
                port: process.env.DB_PORT || 3306,
                waitForConnections: true,
                connectionLimit: 10,
                queueLimit: 0,
                enableKeepAlive: true,
                keepAliveInitialDelay: 0
            });

            await this.createTables();
            console.log('Database initialized successfully');
        } catch (error) {
            console.error('Failed to initialize database:', error);
            process.exit(1);
        }
    }

    async createTables() {
        const connection = await this.pool.getConnection();
        
        try {
            // Users table
            await connection.query(`
                CREATE TABLE IF NOT EXISTS users (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    name VARCHAR(100) NOT NULL,
                    email VARCHAR(255) UNIQUE NOT NULL,
                    hashed_password VARCHAR(255) NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_email (email)
                )
            `);

            // Coins table - stores metadata about tracked coins
            await connection.query(`
                CREATE TABLE IF NOT EXISTS coins (
                    id VARCHAR(50) PRIMARY KEY,
                    symbol VARCHAR(20) NOT NULL,
                    name VARCHAR(100) NOT NULL,
                    image_url VARCHAR(500),
                    market_data JSON,
                    last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    INDEX idx_symbol (symbol),
                    INDEX idx_name (name)
                )
            `);

            // User coins table - user's portfolio holdings
            await connection.query(`
                CREATE TABLE IF NOT EXISTS user_coins (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    user_id INT NOT NULL,
                    coin_id VARCHAR(50) NOT NULL,
                    balance DECIMAL(20, 8) NOT NULL DEFAULT 0,
                    purchase_price DECIMAL(20, 8),
                    purchase_date TIMESTAMP,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (coin_id) REFERENCES coins(id) ON DELETE CASCADE,
                    UNIQUE KEY unique_user_coin (user_id, coin_id),
                    INDEX idx_user_id (user_id),
                    INDEX idx_coin_id (coin_id)
                )
            `);

            // Alerts table
            await connection.query(`
                CREATE TABLE IF NOT EXISTS alerts (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    user_id INT NOT NULL,
                    coin_id VARCHAR(50) NOT NULL,
                    alert_type ENUM('price_above', 'price_below', 'percent_change', 'volume_spike') NOT NULL,
                    target_value DECIMAL(20, 8) NOT NULL,
                    alert_name VARCHAR(100),
                    notification_enabled BOOLEAN DEFAULT true,
                    email_alert_enabled BOOLEAN DEFAULT false,
                    is_active BOOLEAN DEFAULT true,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    triggered_at TIMESTAMP NULL,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (coin_id) REFERENCES coins(id) ON DELETE CASCADE,
                    INDEX idx_user_id (user_id),
                    INDEX idx_coin_id (coin_id),
                    INDEX idx_is_active (is_active)
                )
            `);

            // Activity logs table
            await connection.query(`
                CREATE TABLE IF NOT EXISTS activity_logs (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    user_id INT NOT NULL,
                    action_type ENUM('login', 'logout', 'coin_added', 'coin_removed', 'alert_set', 'alert_triggered', 'password_changed', 'settings_updated') NOT NULL,
                    details JSON,
                    ip_address VARCHAR(45),
                    user_agent TEXT,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    INDEX idx_user_id (user_id),
                    INDEX idx_created_at (created_at)
                )
            `);

            // Settings table
            await connection.query(`
                CREATE TABLE IF NOT EXISTS settings (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    user_id INT UNIQUE NOT NULL,
                    theme ENUM('light', 'dark', 'auto') DEFAULT 'auto',
                    currency VARCHAR(3) DEFAULT 'USD',
                    email_notifications BOOLEAN DEFAULT true,
                    price_alerts BOOLEAN DEFAULT true,
                    market_updates BOOLEAN DEFAULT false,
                    portfolio_updates BOOLEAN DEFAULT true,
                    two_factor_enabled BOOLEAN DEFAULT false,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
                )
            `);

            // Session management table
            await connection.query(`
                CREATE TABLE IF NOT EXISTS user_sessions (
                    id INT PRIMARY KEY AUTO_INCREMENT,
                    user_id INT NOT NULL,
                    session_token VARCHAR(255) UNIQUE NOT NULL,
                    ip_address VARCHAR(45),
                    user_agent TEXT,
                    expires_at TIMESTAMP NOT NULL,
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    INDEX idx_session_token (session_token),
                    INDEX idx_user_id (user_id),
                    INDEX idx_expires_at (expires_at)
                )
            `);

            console.log('All tables created successfully');
        } catch (error) {
            console.error('Error creating tables:', error);
            throw error;
        } finally {
            connection.release();
        }
    }

    // User methods
    async createUser(name, email, hashedPassword) {
        const [result] = await this.pool.query(
            'INSERT INTO users (name, email, hashed_password) VALUES (?, ?, ?)',
            [name, email, hashedPassword]
        );
        return result.insertId;
    }

    async getUserByEmail(email) {
        const [rows] = await this.pool.query(
            'SELECT * FROM users WHERE email = ?',
            [email]
        );
        return rows[0];
    }

    async getUserById(id) {
        const [rows] = await this.pool.query(
            'SELECT id, name, email, created_at FROM users WHERE id = ?',
            [id]
        );
        return rows[0];
    }

    async updateUserPassword(userId, hashedPassword) {
        await this.pool.query(
            'UPDATE users SET hashed_password = ? WHERE id = ?',
            [hashedPassword, userId]
        );
    }

    // Coin methods
    async getOrCreateCoin(coinId, symbol, name, imageUrl = null) {
        const [rows] = await this.pool.query(
            'SELECT * FROM coins WHERE id = ?',
            [coinId]
        );
        
        if (rows.length === 0) {
            await this.pool.query(
                'INSERT INTO coins (id, symbol, name, image_url) VALUES (?, ?, ?, ?)',
                [coinId, symbol, name, imageUrl]
            );
        }
        
        return coinId;
    }

    async updateCoinMarketData(coinId, marketData) {
        await this.pool.query(
            'UPDATE coins SET market_data = ?, last_updated = CURRENT_TIMESTAMP WHERE id = ?',
            [JSON.stringify(marketData), coinId]
        );
    }

    async getCoin(coinId) {
        const [rows] = await this.pool.query(
            'SELECT * FROM coins WHERE id = ?',
            [coinId]
        );
        return rows[0];
    }

    async searchCoins(query) {
        const [rows] = await this.pool.query(
            'SELECT * FROM coins WHERE name LIKE ? OR symbol LIKE ? LIMIT 20',
            [`%${query}%`, `%${query}%`]
        );
        return rows;
    }

    // User coins methods
    async addUserCoin(userId, coinId, balance, purchasePrice = null, purchaseDate = null) {
        const [result] = await this.pool.query(
            `INSERT INTO user_coins (user_id, coin_id, balance, purchase_price, purchase_date) 
             VALUES (?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE 
             balance = balance + VALUES(balance),
             updated_at = CURRENT_TIMESTAMP`,
            [userId, coinId, balance, purchasePrice, purchaseDate]
        );
        return result.insertId;
    }

    async getUserCoins(userId) {
        const [rows] = await this.pool.query(
            `SELECT uc.*, c.symbol, c.name, c.image_url 
             FROM user_coins uc 
             JOIN coins c ON uc.coin_id = c.id 
             WHERE uc.user_id = ?`,
            [userId]
        );
        return rows;
    }

    async updateUserCoinBalance(userId, coinId, newBalance) {
        await this.pool.query(
            'UPDATE user_coins SET balance = ?, updated_at = CURRENT_TIMESTAMP WHERE user_id = ? AND coin_id = ?',
            [newBalance, userId, coinId]
        );
    }

    async removeUserCoin(userId, coinId) {
        await this.pool.query(
            'DELETE FROM user_coins WHERE user_id = ? AND coin_id = ?',
            [userId, coinId]
        );
    }

    // Alert methods
    async createAlert(userId, coinId, alertType, targetValue, alertName = null, notificationEnabled = true, emailAlertEnabled = false) {
        const [result] = await this.pool.query(
            `INSERT INTO alerts (user_id, coin_id, alert_type, target_value, alert_name, notification_enabled, email_alert_enabled) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [userId, coinId, alertType, targetValue, alertName, notificationEnabled, emailAlertEnabled]
        );
        return result.insertId;
    }

    async getUserAlerts(userId, coinId = null) {
        let query = `
            SELECT a.*, c.symbol, c.name 
            FROM alerts a 
            JOIN coins c ON a.coin_id = c.id 
            WHERE a.user_id = ? AND a.is_active = true
        `;
        const params = [userId];
        
        if (coinId) {
            query += ' AND a.coin_id = ?';
            params.push(coinId);
        }
        
        query += ' ORDER BY a.created_at DESC';
        
        const [rows] = await this.pool.query(query, params);
        return rows;
    }

    async deleteAlert(userId, alertId) {
        await this.pool.query(
            'DELETE FROM alerts WHERE id = ? AND user_id = ?',
            [alertId, userId]
        );
    }

    // Activity log methods
    async logActivity(userId, actionType, details = null, ipAddress = null, userAgent = null) {
        await this.pool.query(
            `INSERT INTO activity_logs (user_id, action_type, details, ip_address, user_agent) 
             VALUES (?, ?, ?, ?, ?)`,
            [userId, actionType, JSON.stringify(details), ipAddress, userAgent]
        );
    }

    async getUserActivity(userId, limit = 20) {
        const [rows] = await this.pool.query(
            `SELECT action_type, details, created_at 
             FROM activity_logs 
             WHERE user_id = ? 
             ORDER BY created_at DESC 
             LIMIT ?`,
            [userId, limit]
        );
        return rows;
    }

    // Settings methods
    async getSettings(userId) {
        const [rows] = await this.pool.query(
            'SELECT * FROM settings WHERE user_id = ?',
            [userId]
        );
        
        if (rows.length === 0) {
            // Create default settings if none exist
            await this.pool.query(
                `INSERT INTO settings (user_id) VALUES (?)`,
                [userId]
            );
            return await this.getSettings(userId);
        }
        
        return rows[0];
    }

    async updateSettings(userId, updates) {
        const allowedFields = ['theme', 'currency', 'email_notifications', 'price_alerts', 'market_updates', 'portfolio_updates', 'two_factor_enabled'];
        const setClauses = [];
        const values = [];
        
        Object.keys(updates).forEach(key => {
            if (allowedFields.includes(key)) {
                setClauses.push(`${key} = ?`);
                values.push(updates[key]);
            }
        });
        
        if (setClauses.length === 0) {
            return;
        }
        
        values.push(userId);
        
        await this.pool.query(
            `UPDATE settings SET ${setClauses.join(', ')} WHERE user_id = ?`,
            values
        );
    }

    // Session methods
    async createSession(userId, sessionToken, expiresAt, ipAddress = null, userAgent = null) {
        await this.pool.query(
            `INSERT INTO user_sessions (user_id, session_token, ip_address, user_agent, expires_at) 
             VALUES (?, ?, ?, ?, ?)`,
            [userId, sessionToken, ipAddress, userAgent, expiresAt]
        );
    }

    async getSession(sessionToken) {
        const [rows] = await this.pool.query(
            `SELECT us.*, u.id as user_id, u.name, u.email 
             FROM user_sessions us 
             JOIN users u ON us.user_id = u.id 
             WHERE us.session_token = ? AND us.expires_at > NOW()`,
            [sessionToken]
        );
        return rows[0];
    }

    async deleteSession(sessionToken) {
        await this.pool.query(
            'DELETE FROM user_sessions WHERE session_token = ?',
            [sessionToken]
        );
    }

    async cleanupExpiredSessions() {
        await this.pool.query(
            'DELETE FROM user_sessions WHERE expires_at <= NOW()'
        );
    }

    // Dashboard methods
    async getDashboardData(userId) {
        const userCoins = await this.getUserCoins(userId);
        
        // Calculate total portfolio value (would need current prices from API)
        // This is a placeholder - actual implementation would fetch current prices
        let totalValue = 0;
        let dailyChange = 0;
        
        userCoins.forEach(coin => {
            // These values would come from real-time price data
            const currentPrice = 0; // Placeholder
            const priceChange = 0; // Placeholder
            
            totalValue += coin.balance * currentPrice;
            dailyChange += coin.balance * priceChange;
        });
        
        return {
            totalValue,
            totalChange: totalValue > 0 ? (dailyChange / totalValue) * 100 : 0,
            dailyChange,
            dailyChangePercent: totalValue > 0 ? (dailyChange / totalValue) * 100 : 0,
            coinsCount: userCoins.length,
            holdings: userCoins
        };
    }

    async getPerformanceData(userId, range = '7d') {
        // This would calculate performance over time
        // For now, return placeholder data structure
        return {
            chartData: [],
            range: range
        };
    }

    // Close connection pool
    async close() {
        if (this.pool) {
            await this.pool.end();
        }
    }
}

module.exports = new Database();
 