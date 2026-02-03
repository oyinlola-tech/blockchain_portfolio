// services/dexpaprika.js
// DexPaprika API service for cryptocurrency data
// This file handles all external API calls for crypto prices, trends, and charts

// ======================================
// STEP 1: IMPORT REQUIRED MODULES
// ======================================

// No external modules needed for fetch (built into Node.js 18+)
// If using older Node.js, you would need to install node-fetch

// ======================================
// STEP 2: API CONFIGURATION
// ======================================

// Base URL for CoinPaprika API
const BASE_URL = 'https://api.coinpaprika.com/v1';

// API endpoints
const ENDPOINTS = {
  // Global crypto data
  GLOBAL: '/global',
  
  // Coin data
  COINS: '/coins',
  COIN_BY_ID: (id) => `/coins/${id}`,
  COIN_TWITTER: (id) => `/coins/${id}/twitter`,
  
  // Price data
  TICKERS: '/tickers',
  TICKER_BY_ID: (id) => `/tickers/${id}`,
  HISTORICAL_TICKER: (id) => `/tickers/${id}/historical`,
  
  // Market data
  MARKET: '/coins/markets',
  
  // Search
  SEARCH: '/search',
  
  // Trending categories
  POPULAR: '/coins/most-viewed',
  TOP_GAINERS: '/coins/top-gainers',
  TOP_LOSERS: '/coins/top-losers',
  RECENTLY_ADDED: '/coins/new',
  
  // OHLCV data (for charts)
  OHLCV_TODAY: (id) => `/coins/${id}/ohlcv/today`,
  OHLCV_LATEST: (id) => `/coins/${id}/ohlcv/latest`,
  OHLCV_HISTORICAL: (id) => `/coins/${id}/ohlcv/historical`,
  
  // Exchanges
  EXCHANGES: '/exchanges',
  
  // People
  PEOPLE: '/people',
};

// Cache configuration to reduce API calls
const cache = {
  data: new Map(),
  timestamps: new Map(),
  TTL: 5 * 60 * 1000, // 5 minutes cache time
};

// ======================================
// STEP 3: HELPER FUNCTIONS
// ======================================

// Helper function to make API requests with error handling
async function makeAPIRequest(endpoint, params = {}) {
  try {
    // Build URL with query parameters
    let url = `${BASE_URL}${endpoint}`;
    
    // Add query parameters if any
    if (Object.keys(params).length > 0) {
      const queryParams = new URLSearchParams(params);
      url += `?${queryParams.toString()}`;
    }
    
    // Check cache first
    const cacheKey = url;
    const cachedData = getFromCache(cacheKey);
    if (cachedData) {
      console.log(` Using cached data for: ${endpoint}`);
      return cachedData;
    }
    
    console.log(` Fetching from API: ${endpoint}`);
    
    // Make API request
    const response = await fetch(url, {
      headers: {
        'Accept': 'application/json',
        'User-Agent': 'CryptoPortfolioApp/1.0'
      },
      timeout: 10000 // 10 second timeout
    });
    
    // Check if response is OK
    if (!response.ok) {
      throw new Error(`API request failed: ${response.status} ${response.statusText}`);
    }
    
    // Parse JSON response
    const data = await response.json();
    
    // Store in cache
    storeInCache(cacheKey, data);
    
    return data;
    
  } catch (error) {
    console.error(`  API request error for ${endpoint}:`, error.message);
    
    // Return appropriate error response
    throw new Error(`Failed to fetch data from DexPaprika API: ${error.message}`);
  }
}

// Cache management functions
function getFromCache(key) {
  const timestamp = cache.timestamps.get(key);
  const data = cache.data.get(key);
  
  if (timestamp && data) {
    const now = Date.now();
    if (now - timestamp < cache.TTL) {
      return data;
    } else {
      // Cache expired, remove it
      cache.data.delete(key);
      cache.timestamps.delete(key);
    }
  }
  return null;
}

function storeInCache(key, data) {
  cache.data.set(key, data);
  cache.timestamps.set(key, Date.now());
}

// Helper to convert timeframe to days for historical data
function timeframeToDays(timeframe) {
  const timeframeMap = {
    '1h': 0.04, // Approximately 1/24 of a day
    '4h': 0.17, // Approximately 4/24 of a day
    '12h': 0.5, // Half a day
    '1d': 1,
    '3d': 3,
    '7d': 7,
    '14d': 14,
    '30d': 30,
    '90d': 90,
    '180d': 180,
    '365d': 365,
    'max': 'max'
  };
  
  return timeframeMap[timeframe] || 7; // Default to 7 days
}

// ======================================
// STEP 4: CORE API FUNCTIONS
// ======================================

// Function 1: Get current prices for multiple coins
async function getCurrentPrices(coinIds = []) {
  try {
    // If no coin IDs provided, get all tickers
    if (coinIds.length === 0) {
      const allTickers = await makeAPIRequest(ENDPOINTS.TICKERS, {
        quotes: 'USD'
      });
      
      // Transform to our format
      const prices = {};
      allTickers.forEach(ticker => {
        prices[ticker.id] = ticker.quotes?.USD?.price || 0;
      });
      
      return prices;
    }
    
    // Get prices for specific coins
    const prices = {};
    
    // We could fetch all tickers and filter, but let's fetch individually for accuracy
    // (CoinPaprika doesn't have a batch endpoint for specific coins)
    for (const coinId of coinIds) {
      try {
        const ticker = await makeAPIRequest(ENDPOINTS.TICKER_BY_ID(coinId), {
          quotes: 'USD'
        });
        
        prices[coinId] = ticker.quotes?.USD?.price || 0;
      } catch (error) {
        console.warn(`⚠️ Could not get price for ${coinId}:`, error.message);
        prices[coinId] = 0;
      }
    }
    
    return prices;
    
  } catch (error) {
    console.error('  Error getting current prices:', error);
    throw error;
  }
}

// Function 2: Get current price for a single coin
async function getCoinCurrentPrice(coinId) {
  try {
    const ticker = await makeAPIRequest(ENDPOINTS.TICKER_BY_ID(coinId), {
      quotes: 'USD'
    });
    
    return ticker.quotes?.USD?.price || 0;
  } catch (error) {
    console.error(`  Error getting price for ${coinId}:`, error);
    throw new Error(`Coin ${coinId} not found or price unavailable`);
  }
}

// Function 3: Search for coins
async function searchCoins(query, limit = 20) {
  try {
    const searchResults = await makeAPIRequest(ENDPOINTS.SEARCH, {
      q: query,
      limit: limit,
      c: 'currencies' // Search only currencies (coins)
    });
    
    // Transform to our format
    return searchResults.currencies.map(coin => ({
      id: coin.id,
      symbol: coin.symbol,
      name: coin.name,
      rank: coin.rank,
      is_new: coin.is_new,
      is_active: coin.is_active,
      type: coin.type
    }));
    
  } catch (error) {
    console.error('  Error searching coins:', error);
    throw error;
  }
}

// Function 4: Get trending coins in different categories
async function getTrendingCoins() {
  try {
    // Fetch all trending categories in parallel for better performance
    const [popular, topGainers, topLosers, recentlyAdded] = await Promise.allSettled([
      makeAPIRequest(ENDPOINTS.POPULAR, { limit: 10 }),
      makeAPIRequest(ENDPOINTS.TOP_GAINERS, { limit: 10 }),
      makeAPIRequest(ENDPOINTS.TOP_LOSERS, { limit: 10 }),
      makeAPIRequest(ENDPOINTS.RECENTLY_ADDED, { limit: 10 })
    ]);
    
    // Process results (handle potential API failures gracefully)
    const processResult = (result) => {
      if (result.status === 'fulfilled') {
        return result.value.map(coin => ({
          id: coin.id,
          symbol: coin.symbol,
          name: coin.name,
          rank: coin.rank,
          price: coin.quotes?.USD?.price || 0,
          change_24h: coin.quotes?.USD?.percent_change_24h || 0,
          market_cap: coin.quotes?.USD?.market_cap || 0
        }));
      }
      console.warn(' Failed to fetch trending category:', result.reason);
      return [];
    };
    
    return {
      popular: processResult(popular),
      top_gainers: processResult(topGainers),
      top_losers: processResult(topLosers),
      recently_added: processResult(recentlyAdded)
    };
    
  } catch (error) {
    console.error('  Error getting trending coins:', error);
    throw error;
  }
}

// Function 5: Get detailed coin information
async function getCoinDetails(coinId, timeframe = '7d') {
  try {
    // Get basic coin info and current price in parallel
    const [coinInfo, tickerData, ohlcvData] = await Promise.allSettled([
      makeAPIRequest(ENDPOINTS.COIN_BY_ID(coinId)),
      makeAPIRequest(ENDPOINTS.TICKER_BY_ID(coinId), { quotes: 'USD' }),
      getCoinOHLCV(coinId, timeframe)
    ]);
    
    // Handle potential API failures
    if (coinInfo.status === 'rejected') {
      throw new Error(`Coin ${coinId} not found`);
    }
    
    const coin = coinInfo.value;
    const ticker = tickerData.status === 'fulfilled' ? tickerData.value : null;
    const chartData = ohlcvData.status === 'fulfilled' ? ohlcvData.value : [];
    
    // Get additional metrics if available
    let additionalMetrics = {};
    if (ticker) {
      additionalMetrics = {
        price: ticker.quotes?.USD?.price || 0,
        volume_24h: ticker.quotes?.USD?.volume_24h || 0,
        market_cap: ticker.quotes?.USD?.market_cap || 0,
        percent_change_1h: ticker.quotes?.USD?.percent_change_1h || 0,
        percent_change_24h: ticker.quotes?.USD?.percent_change_24h || 0,
        percent_change_7d: ticker.quotes?.USD?.percent_change_7d || 0,
        percent_change_30d: ticker.quotes?.USD?.percent_change_30d || 0,
        ath_price: ticker.quotes?.USD?.ath_price || 0,
        ath_date: ticker.ath_date,
        percent_from_ath: ticker.quotes?.USD?.percent_from_price_ath || 0
      };
    }
    
    // Construct the complete coin details object
    return {
      id: coin.id,
      symbol: coin.symbol,
      name: coin.name,
      description: coin.description || 'No description available',
      rank: coin.rank,
      is_active: coin.is_active,
      is_new: coin.is_new,
      type: coin.type,
      tags: coin.tags || [],
      team: coin.team || [],
      links: coin.links || {},
      started_at: coin.started_at,
      development_status: coin.development_status,
      hardware_wallet: coin.hardware_wallet,
      org_structure: coin.org_structure,
      hash_algorithm: coin.hash_algorithm,
      metrics: {
        ...additionalMetrics,
        total_supply: coin.total_supply,
        max_supply: coin.max_supply,
        circulating_supply: coin.circulating_supply
      },
      chart_data: chartData
    };
    
  } catch (error) {
    console.error(`  Error getting details for ${coinId}:`, error);
    throw error;
  }
}

// Function 6: Get OHLCV data for charts
async function getCoinOHLCV(coinId, timeframe = '7d') {
  try {
    const days = timeframeToDays(timeframe);
    
    let ohlcvData = [];
    
    if (days === 'max') {
      // For max, we need to fetch historical data
      // Note: This might be limited by API constraints
      ohlcvData = await makeAPIRequest(ENDPOINTS.OHLCV_HISTORICAL(coinId), {
        start: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0],
        limit: 365
      });
    } else if (days <= 1) {
      // For today or less
      ohlcvData = await makeAPIRequest(ENDPOINTS.OHLCV_TODAY(coinId));
    } else {
      // For specific number of days
      ohlcvData = await makeAPIRequest(ENDPOINTS.OHLCV_HISTORICAL(coinId), {
        start: new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end: new Date().toISOString().split('T')[0],
        limit: Math.min(days, 365) // Limit to 365 points max
      });
    }
    
    // Transform to our chart format
    return ohlcvData.map(point => ({
      timestamp: point.time_close || point.time_open || Date.now(),
      open: point.open,
      high: point.high,
      low: point.low,
      close: point.close,
      volume: point.volume
    }));
    
  } catch (error) {
    console.error(`  Error getting OHLCV for ${coinId}:`, error);
    return []; // Return empty array instead of throwing
  }
}

// Function 7: Get global market data
async function getGlobalMarketData() {
  try {
    const globalData = await makeAPIRequest(ENDPOINTS.GLOBAL);
    
    return {
      total_market_cap: globalData.market_cap_usd,
      total_volume_24h: globalData.volume_24h_usd,
      bitcoin_dominance: globalData.bitcoin_dominance_percentage,
      cryptocurrencies_count: globalData.cryptocurrencies_number,
      market_cap_change_24h: globalData.market_cap_change_24h,
      volume_change_24h: globalData.volume_change_24h
    };
    
  } catch (error) {
    console.error(' Error getting global market data:', error);
    throw error;
  }
}

// Function 8: Get all coins (for reference)
async function getAllCoins() {
  try {
    const coins = await makeAPIRequest(ENDPOINTS.COINS);
    
    return coins.map(coin => ({
      id: coin.id,
      symbol: coin.symbol,
      name: coin.name,
      rank: coin.rank,
      is_active: coin.is_active,
      is_new: coin.is_new,
      type: coin.type
    }));
    
  } catch (error) {
    console.error('  Error getting all coins:', error);
    throw error;
  }
}

// Function 9: Get coin by symbol (case-insensitive)
async function getCoinBySymbol(symbol) {
  try {
    // First get all coins and filter by symbol
    const allCoins = await getAllCoins();
    
    const coin = allCoins.find(c => 
      c.symbol.toLowerCase() === symbol.toLowerCase()
    );
    
    if (!coin) {
      throw new Error(`Coin with symbol ${symbol} not found`);
    }
    
    return coin;
    
  } catch (error) {
    console.error(`  Error getting coin by symbol ${symbol}:`, error);
    throw error;
  }
}

// ======================================
// STEP 5: ERROR HANDLING AND VALIDATION
// ======================================

// Validate coin ID format
function isValidCoinId(coinId) {
  return coinId && typeof coinId === 'string' && coinId.trim().length > 0;
}

// Validate timeframe
function isValidTimeframe(timeframe) {
  const validTimeframes = ['1h', '4h', '12h', '1d', '3d', '7d', '14d', '30d', '90d', '180d', '365d', 'max'];
  return validTimeframes.includes(timeframe);
}

// ======================================
// STEP 6: RATE LIMIT HANDLING
// ======================================

// Note: CoinPaprika has rate limits (10 requests/minute without API key)
// We implement basic rate limiting awareness
let requestCount = 0;
let resetTime = Date.now() + 60000; // 1 minute from now

function checkRateLimit() {
  const now = Date.now();
  
  // Reset counter if minute has passed
  if (now > resetTime) {
    requestCount = 0;
    resetTime = now + 60000;
  }
  
  // Check if we're approaching limit
  if (requestCount >= 8) { // Warning at 8 requests
    console.warn(` Approaching rate limit: ${requestCount}/10 requests this minute`);
  }
  
  if (requestCount >= 10) {
    throw new Error('Rate limit exceeded (10 requests/minute). Please wait.');
  }
  
  requestCount++;
}

// ======================================
// STEP 7: EXPORT ALL FUNCTIONS
// ======================================

module.exports = {
  // Price functions
  getCurrentPrices,
  getCoinCurrentPrice,
  
  // Search and discovery
  searchCoins,
  getTrendingCoins,
  getAllCoins,
  getCoinBySymbol,
  
  // Detailed data
  getCoinDetails,
  getCoinOHLCV,
  
  // Market data
  getGlobalMarketData,
  
  // Utility functions
  isValidCoinId,
  isValidTimeframe,
  
  // Constants (for reference)
  ENDPOINTS,
  BASE_URL
};

// ======================================
// STEP 8: USAGE EXAMPLES
// ======================================

/*
  Example usage in other files:
  
  // Import the service
  const dexpaprika = require('./services/dexpaprika');
  
  // Get current price of Bitcoin
  const btcPrice = await dexpaprika.getCoinCurrentPrice('btc-bitcoin');
  
  // Search for coins
  const results = await dexpaprika.searchCoins('bitcoin');
  
  // Get trending coins
  const trending = await dexpaprika.getTrendingCoins();
  
  // Get detailed coin info with chart
  const coinDetails = await dexpaprika.getCoinDetails('btc-bitcoin', '7d');
*/

// ======================================
// STEP 9: IMPORTANT NOTES
// ======================================

/*
  IMPORTANT: CoinPaprika API Notes
  
  1. Rate Limits: 10 requests per minute without API key
  2. Coin IDs: Use specific IDs like 'btc-bitcoin' not symbols
  3. Data Freshness: Prices update every 10-60 seconds
  4. Free Tier: Sufficient for our app's needs
  
  Common Coin IDs:
  - Bitcoin: btc-bitcoin
  - Ethereum: eth-ethereum
  - Binance Coin: bnb-binance-coin
  - Cardano: ada-cardano
  - Solana: sol-solana
  
  To find a coin's ID, use searchCoins() function.
*/