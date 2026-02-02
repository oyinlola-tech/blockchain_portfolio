const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const db = require('./db');
require('dotenv').config();

const router = express.Router();

// Constants
const JWT_SECRET = process.env.JWT_SECRET;
const DEX_PAPRIKA_API = 'https://api.coinpaprika.com/v1';
const SALT_ROUNDS = 10;

// Middleware
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1];

    if (!token) {
        return res.status(401).json({
            success: false,
            message: 'Access token required'
        });
    }

    jwt.verify(token, JWT_SECRET, async (err, user) => {
        if (err) {
            return res.status(403).json({
                success: false,
                message: 'Invalid or expired token'
            });
        }

        try {
            const dbUser = await db.getUserById(user.id);
            if (!dbUser) {
                return res.status(403).json({
                    success: false,
                    message: 'User not found'
                });
            }

            req.user = dbUser;
            next();
        } catch (error) {
            console.error('Auth middleware error:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error'
            });
        }
    });
};

const validateEmail = (email) => {
    const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return re.test(email);
};

const validatePassword = (password) => {
    return password.length >= 8;
};

// AUTH ROUTES
router.post('/auth/signup', async (req, res) => {
    try {
        const { name, email, password } = req.body;

        // Validation
        if (!name || !email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Name, email, and password are required'
            });
        }

        if (!validateEmail(email)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid email format'
            });
        }

        if (!validatePassword(password)) {
            return res.status(400).json({
                success: false,
                message: 'Password must be at least 8 characters'
            });
        }

        // Check if user exists
        const existingUser = await db.getUserByEmail(email);
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'Email already registered'
            });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        // Create user
        const userId = await db.createUser(name, email, hashedPassword);

        // Create default settings
        await db.getSettings(userId);

        // Log activity
        await db.logActivity(userId, 'signup', { email });

        res.status(201).json({
            success: true,
            message: 'Account created successfully',
            data: { userId }
        });
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

router.post('/auth/login', async (req, res) => {
    try {
        const { email, password, rememberMe } = req.body;

        if (!email || !password) {
            return res.status(400).json({
                success: false,
                message: 'Email and password are required'
            });
        }

        // Find user
        const user = await db.getUserByEmail(email);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Check password
        const validPassword = await bcrypt.compare(password, user.hashed_password);
        if (!validPassword) {
            return res.status(401).json({
                success: false,
                message: 'Invalid email or password'
            });
        }

        // Create token
        const token = jwt.sign(
            { id: user.id, email: user.email },
            JWT_SECRET,
            { expiresIn: rememberMe ? '30d' : '24h' }
        );

        // Log activity
        await db.logActivity(user.id, 'login', { ip: req.ip, userAgent: req.get('User-Agent') });

        res.json({
            success: true,
            message: 'Login successful',
            data: {
                token,
                user: {
                    id: user.id,
                    name: user.name,
                    email: user.email
                }
            }
        });
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

router.post('/auth/logout', authenticateToken, async (req, res) => {
    try {
        // Log activity
        await db.logActivity(req.user.id, 'logout');

        res.json({
            success: true,
            message: 'Logout successful'
        });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

router.post('/auth/change-password', authenticateToken, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;

        if (!currentPassword || !newPassword) {
            return res.status(400).json({
                success: false,
                message: 'Current password and new password are required'
            });
        }

        if (!validatePassword(newPassword)) {
            return res.status(400).json({
                success: false,
                message: 'New password must be at least 8 characters'
            });
        }

        // Get user with password
        const user = await db.getUserByEmail(req.user.email);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Verify current password
        const validPassword = await bcrypt.compare(currentPassword, user.hashed_password);
        if (!validPassword) {
            return res.status(401).json({
                success: false,
                message: 'Current password is incorrect'
            });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);

        // Update password
        await db.updateUserPassword(user.id, hashedPassword);

        // Log activity
        await db.logActivity(user.id, 'password_changed');

        res.json({
            success: true,
            message: 'Password updated successfully'
        });
    } catch (error) {
        console.error('Change password error:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// DASHBOARD ROUTES
router.get('/dashboard', authenticateToken, async (req, res) => {
    try {
        const dashboardData = await db.getDashboardData(req.user.id);
        res.json({
            success: true,
            message: 'Dashboard data retrieved',
            data: dashboardData
        });
    } catch (error) {
        console.error('Dashboard error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load dashboard data'
        });
    }
});

router.post('/dashboard/add-coin', authenticateToken, async (req, res) => {
    try {
        const { coinId, amount, purchasePrice, purchaseDate } = req.body;

        if (!coinId || !amount || parseFloat(amount) <= 0) {
            return res.status(400).json({
                success: false,
                message: 'Valid coin ID and amount are required'
            });
        }

        // Get coin data from DexPaprika
        let coinData;
        try {
            const response = await axios.get(`${DEX_PAPRIKA_API}/coins/${coinId}`);
            coinData = response.data;
        } catch (error) {
            return res.status(404).json({
                success: false,
                message: 'Coin not found'
            });
        }

        // Ensure coin exists in our database
        await db.getOrCreateCoin(
            coinId,
            coinData.symbol,
            coinData.name,
            coinData.logo || null
        );

        // Add coin to user's portfolio
        await db.addUserCoin(
            req.user.id,
            coinId,
            parseFloat(amount),
            purchasePrice ? parseFloat(purchasePrice) : null,
            purchaseDate || null
        );

        // Log activity
        await db.logActivity(req.user.id, 'coin_added', {
            coinId,
            amount,
            purchasePrice,
            purchaseDate
        });

        res.json({
            success: true,
            message: 'Coin added to portfolio',
            data: { coinId, amount }
        });
    } catch (error) {
        console.error('Add coin error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to add coin to portfolio'
        });
    }
});

router.get('/dashboard/activity', authenticateToken, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 20;
        const activities = await db.getUserActivity(req.user.id, limit);
        
        res.json({
            success: true,
            message: 'Activity retrieved',
            data: { activities }
        });
    } catch (error) {
        console.error('Activity error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load activity'
        });
    }
});

router.get('/dashboard/performance', authenticateToken, async (req, res) => {
    try {
        const range = req.query.range || '7d';
        const validRanges = ['1d', '7d', '30d', '90d', '1y'];
        
        if (!validRanges.includes(range)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid range parameter'
            });
        }

        const performanceData = await db.getPerformanceData(req.user.id, range);
        
        res.json({
            success: true,
            message: 'Performance data retrieved',
            data: performanceData
        });
    } catch (error) {
        console.error('Performance error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load performance data'
        });
    }
});

// COINS ROUTES
router.get('/coins/search', async (req, res) => {
    try {
        const query = req.query.q;
        
        if (!query || query.trim().length < 2) {
            return res.status(400).json({
                success: false,
                message: 'Search query must be at least 2 characters'
            });
        }

        // Search in our database first
        const localResults = await db.searchCoins(query);

        // Also search DexPaprika for more results
        let dexResults = [];
        try {
            const response = await axios.get(`${DEX_PAPRIKA_API}/search?q=${encodeURIComponent(query)}&c=currencies`);
            dexResults = response.data.currencies || [];
        } catch (error) {
            console.error('DexPaprika search error:', error);
        }

        // Merge and deduplicate results
        const results = [];
        const seenIds = new Set();

        // Add local results
        localResults.forEach(coin => {
            if (!seenIds.has(coin.id)) {
                seenIds.add(coin.id);
                results.push({
                    id: coin.id,
                    symbol: coin.symbol,
                    name: coin.name,
                    icon: coin.image_url,
                    price: coin.market_data ? JSON.parse(coin.market_data).price : null
                });
            }
        });

        // Add DexPaprika results (up to 20 total)
        for (const coin of dexResults) {
            if (results.length >= 20) break;
            
            if (!seenIds.has(coin.id)) {
                seenIds.add(coin.id);
                results.push({
                    id: coin.id,
                    symbol: coin.symbol,
                    name: coin.name,
                    icon: coin.logo || null
                });
            }
        }

        res.json({
            success: true,
            message: 'Search results',
            data: { coins: results }
        });
    } catch (error) {
        console.error('Search error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to search coins'
        });
    }
});

router.get('/coins/trending', async (req, res) => {
    try {
        // Fetch trending coins from DexPaprika
        const [marketData, coinsResponse] = await Promise.all([
            axios.get(`${DEX_PAPRIKA_API}/global`),
            axios.get(`${DEX_PAPRIKA_API}/coins`)
        ]);

        const marketOverview = marketData.data;
        const allCoins = coinsResponse.data;

        // Get top 20 coins by market cap
        const trendingCoins = allCoins
            .sort((a, b) => b.rank - a.rank)
            .slice(0, 20)
            .map(coin => ({
                id: coin.id,
                symbol: coin.symbol,
                name: coin.name,
                icon: coin.logo || null,
                rank: coin.rank,
                price: coin.quotes && coin.quotes.USD ? coin.quotes.USD.price : null,
                marketCap: coin.quotes && coin.quotes.USD ? coin.quotes.USD.market_cap : null,
                volume24h: coin.quotes && coin.quotes.USD ? coin.quotes.USD.volume_24h : null,
                change24h: coin.quotes && coin.quotes.USD ? coin.quotes.USD.percent_change_24h : null
            }));

        res.json({
            success: true,
            message: 'Trending coins retrieved',
            data: {
                coins: trendingCoins,
                marketOverview: {
                    totalMarketCap: marketOverview.market_cap_usd,
                    marketCapChange24h: marketOverview.market_cap_change_24h,
                    totalVolume: marketOverview.volume_24h_usd,
                    btcDominance: marketOverview.bitcoin_dominance_percentage
                }
            }
        });
    } catch (error) {
        console.error('Trending error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load trending coins'
        });
    }
});

router.get('/coins/:coinId', async (req, res) => {
    try {
        const { coinId } = req.params;

        // Fetch coin data from DexPaprika
        const [coinResponse, tickerResponse] = await Promise.all([
            axios.get(`${DEX_PAPRIKA_API}/coins/${coinId}`),
            axios.get(`${DEX_PAPRIKA_API}/tickers/${coinId}`)
        ]);

        const coinData = coinResponse.data;
        const tickerData = tickerResponse.data;

        if (!coinData || !tickerData) {
            return res.status(404).json({
                success: false,
                message: 'Coin not found'
            });
        }

        // Update or create coin in our database
        await db.getOrCreateCoin(
            coinId,
            coinData.symbol,
            coinData.name,
            coinData.logo || null
        );

        const quotes = tickerData.quotes?.USD || {};
        
        const coinDetails = {
            id: coinData.id,
            symbol: coinData.symbol,
            name: coinData.name,
            icon: coinData.logo || null,
            description: coinData.description || '',
            rank: coinData.rank,
            price: quotes.price,
            priceChange24h: quotes.percent_change_24h,
            priceChange24hAmount: (quotes.price * (quotes.percent_change_24h || 0)) / 100,
            marketCap: quotes.market_cap,
            volume24h: quotes.volume_24h,
            circulatingSupply: coinData.circulating_supply,
            totalSupply: coinData.total_supply,
            maxSupply: coinData.max_supply,
            marketCapDominance: null, // This would need separate API call
            ath: quotes.ath_price,
            athDate: quotes.ath_date,
            atl: quotes.atl_price,
            atlDate: quotes.atl_date,
            links: {
                website: coinData.links?.website?.[0] || null,
                explorer: coinData.links?.explorer?.[0] || null,
                whitepaper: coinData.links?.whitepaper || null,
                sourceCode: coinData.links?.source_code?.[0] || null
            }
        };

        res.json({
            success: true,
            message: 'Coin data retrieved',
            data: coinDetails
        });
    } catch (error) {
        console.error('Coin details error:', error);
        if (error.response?.status === 404) {
            return res.status(404).json({
                success: false,
                message: 'Coin not found'
            });
        }
        res.status(500).json({
            success: false,
            message: 'Failed to load coin data'
        });
    }
});

router.get('/coins/:coinId/history', async (req, res) => {
    try {
        const { coinId } = req.params;
        const range = req.query.range || '3d';
        
        const validRanges = ['1d', '3d', '7d', '30d', '90d', '1y'];
        if (!validRanges.includes(range)) {
            return res.status(400).json({
                success: false,
                message: 'Invalid range parameter'
            });
        }

        // Map our range to DexPaprika's format
        const rangeMapping = {
            '1d': '1d',
            '3d': '3d',
            '7d': '7d',
            '30d': '30d',
            '90d': '3m',
            '1y': '1y'
        };

        const dexRange = rangeMapping[range];
        const response = await axios.get(
            `${DEX_PAPRIKA_API}/tickers/${coinId}/historical?interval=1h&start=${getStartDate(dexRange)}&limit=100`
        );

        const history = response.data.map(item => ({
            timestamp: item.timestamp,
            price: item.price,
            volume: item.volume_24h
        }));

        res.json({
            success: true,
            message: 'Price history retrieved',
            data: { history }
        });
    } catch (error) {
        console.error('History error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load price history'
        });
    }
});

router.post('/coins/:coinId/alert', authenticateToken, async (req, res) => {
    try {
        const { coinId } = req.params;
        const { type, value, name, notificationEnabled = true, emailAlertEnabled = false } = req.body;

        if (!type || !value) {
            return res.status(400).json({
                success: false,
                message: 'Alert type and value are required'
            });
        }

        // Validate coin exists
        try {
            await axios.get(`${DEX_PAPRIKA_API}/coins/${coinId}`);
        } catch (error) {
            return res.status(404).json({
                success: false,
                message: 'Coin not found'
            });
        }

        // Ensure coin exists in our database
        await db.getOrCreateCoin(
            coinId,
            coinId.toUpperCase(), // Symbol placeholder
            coinId, // Name placeholder
            null
        );

        // Create alert
        const alertId = await db.createAlert(
            req.user.id,
            coinId,
            type,
            parseFloat(value),
            name,
            notificationEnabled,
            emailAlertEnabled
        );

        // Log activity
        await db.logActivity(req.user.id, 'alert_set', {
            coinId,
            alertId,
            type,
            value
        });

        res.json({
            success: true,
            message: 'Alert created',
            data: { alertId }
        });
    } catch (error) {
        console.error('Create alert error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to create alert'
        });
    }
});

// SETTINGS ROUTES
router.get('/settings', authenticateToken, async (req, res) => {
    try {
        const settings = await db.getSettings(req.user.id);
        
        res.json({
            success: true,
            message: 'Settings retrieved',
            data: settings
        });
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to load settings'
        });
    }
});

router.post('/settings/theme', authenticateToken, async (req, res) => {
    try {
        const { theme } = req.body;
        
        if (!theme || !['light', 'dark', 'auto'].includes(theme)) {
            return res.status(400).json({
                success: false,
                message: 'Valid theme (light, dark, or auto) is required'
            });
        }

        await db.updateSettings(req.user.id, { theme });

        // Log activity
        await db.logActivity(req.user.id, 'settings_updated', { field: 'theme', value: theme });

        res.json({
            success: true,
            message: 'Theme updated'
        });
    } catch (error) {
        console.error('Update theme error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update theme'
        });
    }
});

router.post('/settings/currency', authenticateToken, async (req, res) => {
    try {
        const { currency } = req.body;
        
        const validCurrencies = ['USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF'];
        if (!currency || !validCurrencies.includes(currency)) {
            return res.status(400).json({
                success: false,
                message: 'Valid currency code is required'
            });
        }

        await db.updateSettings(req.user.id, { currency });

        // Log activity
        await db.logActivity(req.user.id, 'settings_updated', { field: 'currency', value: currency });

        res.json({
            success: true,
            message: 'Currency updated'
        });
    } catch (error) {
        console.error('Update currency error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update currency'
        });
    }
});

router.post('/settings/security', authenticateToken, async (req, res) => {
    try {
        const { twoFactorEnabled, emailNotifications, priceAlerts } = req.body;

        const updates = {};
        if (twoFactorEnabled !== undefined) updates.two_factor_enabled = twoFactorEnabled;
        if (emailNotifications !== undefined) updates.email_notifications = emailNotifications;
        if (priceAlerts !== undefined) updates.price_alerts = priceAlerts;

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: 'No valid security settings provided'
            });
        }

        await db.updateSettings(req.user.id, updates);

        // Log activity
        await db.logActivity(req.user.id, 'settings_updated', { field: 'security', updates });

        res.json({
            success: true,
            message: 'Security settings updated'
        });
    } catch (error) {
        console.error('Update security error:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to update security settings'
        });
    }
});

// Helper function for date calculations
function getStartDate(range) {
    const now = new Date();
    const start = new Date();

    switch (range) {
        case '1d':
            start.setDate(now.getDate() - 1);
            break;
        case '3d':
            start.setDate(now.getDate() - 3);
            break;
        case '7d':
            start.setDate(now.getDate() - 7);
            break;
        case '30d':
            start.setDate(now.getDate() - 30);
            break;
        case '3m':
            start.setMonth(now.getMonth() - 3);
            break;
        case '1y':
            start.setFullYear(now.getFullYear() - 1);
            break;
        default:
            start.setDate(now.getDate() - 7);
    }

    return start.toISOString().split('T')[0];
}

module.exports = router;
 