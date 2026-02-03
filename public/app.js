// public/app.js
// Main frontend JavaScript for the crypto portfolio app

// ======================================
// 1. APPLICATION STATE & CONFIGURATION
// ======================================

const AppState = {
    isAuthenticated: false,
    currentUser: null,
    portfolio: [],
    popularTokens: [],
    currentView: 'home',
    theme: localStorage.getItem('theme') || 'light',
    apiBaseUrl: window.location.origin,
    balanceVisible: localStorage.getItem('balanceVisible') !== 'false'
};

// ======================================
// 2. DOM ELEMENT REFERENCES
// ======================================

// Loading screen
const loadingScreen = document.getElementById('loading-screen');
const appContainer = document.getElementById('app-container');

// Header elements
const welcomeText = document.getElementById('welcome-text');
const userName = document.getElementById('user-name');
const portfolioTotal = document.getElementById('portfolio-total');
const portfolioChange = document.getElementById('portfolio-change');
const portfolioConverted = document.getElementById('portfolio-converted');
const balanceVisibilityBtn = document.getElementById('balance-visibility');
const themeToggle = document.getElementById('theme-toggle');

// Action buttons
const depositBtn = document.getElementById('deposit-btn');
const withdrawBtn = document.getElementById('withdraw-btn');
const buyBtn = document.getElementById('buy-btn');
const sellBtn = document.getElementById('sell-btn');
const swapBtn = document.getElementById('swap-btn');
const moreBtn = document.getElementById('more-btn');

// Promotional banner
const copyLinkBtn = document.getElementById('copy-link-btn');

// Tokens section
const viewAllTokensBtn = document.getElementById('view-all-tokens');
const popularTokensList = document.getElementById('popular-tokens-list');

// Portfolio section
const refreshPortfolioBtn = document.getElementById('refresh-portfolio');
const portfolioList = document.getElementById('portfolio-list');
const addFirstCryptoBtn = document.getElementById('add-first-crypto');

// Navigation
const navItems = document.querySelectorAll('.nav-item');

// View sections
const homeView = document.querySelector('.app-main');
const searchView = document.getElementById('search-view');
const trendingView = document.getElementById('trending-view');
const settingsView = document.getElementById('settings-view');

// Modals
const authModal = document.getElementById('auth-modal');
const loginForm = document.getElementById('login-form');
const registerForm = document.getElementById('register-form');
const authModalTitle = document.getElementById('auth-modal-title');
const loginBtn = document.getElementById('login-btn');
const registerBtn = document.getElementById('register-btn');
const switchToRegisterBtn = document.getElementById('switch-to-register');
const switchToLoginBtn = document.getElementById('switch-to-login');
const modalCloseBtns = document.querySelectorAll('.modal-close');

const addCryptoModal = document.getElementById('add-crypto-modal');
const cryptoSearchInput = document.getElementById('crypto-search');
const cryptoSearchResults = document.getElementById('crypto-search-results');

const cryptoDetailsModal = document.getElementById('crypto-details-modal');
const cryptoModalTitle = document.getElementById('crypto-modal-title');

// Toast container
const toastContainer = document.getElementById('toast-container');

// Audio elements
const clickSound = document.getElementById('click-sound');
const successSound = document.getElementById('success-sound');

// ======================================
// 3. UTILITY FUNCTIONS
// ======================================

/**
 * Plays a sound effect
 */
function playSound(soundElement) {
    try {
        soundElement.currentTime = 0;
        soundElement.play().catch(e => console.log('Sound playback failed:', e));
    } catch (error) {
        console.log('Sound error:', error);
    }
}

/**
 * Shows a toast notification
 */
function showToast(type, title, message, duration = 5000) {
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `
        <div class="toast-icon">
            ${type === 'success' ? '<i class="fas fa-check-circle"></i>' : 
              type === 'error' ? '<i class="fas fa-exclamation-circle"></i>' : 
              '<i class="fas fa-info-circle"></i>'}
        </div>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close"><i class="fas fa-times"></i></button>
    `;
    
    toastContainer.appendChild(toast);
    
    // Add close functionality
    const closeBtn = toast.querySelector('.toast-close');
    closeBtn.addEventListener('click', () => {
        toast.remove();
    });
    
    // Auto-remove after duration
    setTimeout(() => {
        if (toast.parentNode) {
            toast.style.opacity = '0';
            toast.style.transform = 'translateX(100%)';
            setTimeout(() => {
                if (toast.parentNode) {
                    toast.remove();
                }
            }, 300);
        }
    }, duration);
    
    return toast;
}

/**
 * Formats currency amounts
 */
function formatCurrency(amount, currency = 'USD') {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
}

/**
 * Formats percentages
 */
function formatPercent(value) {
    const sign = value >= 0 ? '+' : '';
    return `${sign}${value.toFixed(2)}%`;
}

/**
 * Formats large numbers with abbreviations
 */
function formatNumber(num) {
    if (num >= 1e9) {
        return (num / 1e9).toFixed(2) + 'B';
    }
    if (num >= 1e6) {
        return (num / 1e6).toFixed(2) + 'M';
    }
    if (num >= 1e3) {
        return (num / 1e3).toFixed(2) + 'K';
    }
    return num.toFixed(2);
}

/**
 * Converts USD to NGN (using approximate exchange rate)
 */
function convertToNGN(usdAmount) {
    // Using approximate exchange rate (you could update this from an API)
    const exchangeRate = 1400;
    return usdAmount * exchangeRate;
}

/**
 * Debounce function to limit API calls
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Toggle element visibility
 */
function toggleElement(element, show) {
    if (show) {
        element.classList.remove('hidden');
    } else {
        element.classList.add('hidden');
    }
}

// ======================================
// 4. AUTHENTICATION FUNCTIONS
// ======================================

/**
 * Check if user is authenticated
 */
async function checkAuth() {
    try {
        const response = await fetch('/api/user', {
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            AppState.isAuthenticated = true;
            AppState.currentUser = data.user;
            updateUIForAuthenticatedUser();
            loadInitialData();
            return true;
        } else {
            showAuthModal();
            return false;
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        showAuthModal();
        return false;
    }
}

/**
 * Show authentication modal
 */
function showAuthModal() {
    authModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

/**
 * Hide authentication modal
 */
function hideAuthModal() {
    authModal.classList.add('hidden');
    document.body.style.overflow = '';
}

/**
 * Handle user login
 */
async function handleLogin(email, password) {
    try {
        const response = await fetch('/api/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ email, password }),
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (response.ok) {
            AppState.isAuthenticated = true;
            AppState.currentUser = data.user;
            updateUIForAuthenticatedUser();
            hideAuthModal();
            loadInitialData();
            showToast('success', 'Welcome!', 'Login successful');
            playSound(successSound);
        } else {
            showToast('error', 'Login Failed', data.error || 'Invalid credentials');
        }
    } catch (error) {
        console.error('Login error:', error);
        showToast('error', 'Login Error', 'Failed to connect to server');
    }
}

/**
 * Handle user registration
 */
async function handleRegister(name, email, password, confirmPassword) {
    // Validate passwords match
    if (password !== confirmPassword) {
        showToast('error', 'Registration Failed', 'Passwords do not match');
        return;
    }
    
    // Validate password strength
    if (password.length < 8) {
        showToast('error', 'Registration Failed', 'Password must be at least 8 characters');
        return;
    }
    
    try {
        const response = await fetch('/api/register', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ fullName: name, email, password }),
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (response.ok) {
            AppState.isAuthenticated = true;
            AppState.currentUser = data.user;
            updateUIForAuthenticatedUser();
            hideAuthModal();
            loadInitialData();
            showToast('success', 'Welcome!', 'Account created successfully');
            playSound(successSound);
        } else {
            showToast('error', 'Registration Failed', data.error || 'Registration failed');
        }
    } catch (error) {
        console.error('Registration error:', error);
        showToast('error', 'Registration Error', 'Failed to connect to server');
    }
}

/**
 * Handle user logout
 */
async function handleLogout() {
    try {
        await fetch('/api/logout', {
            method: 'POST',
            credentials: 'include'
        });
        
        AppState.isAuthenticated = false;
        AppState.currentUser = null;
        AppState.portfolio = [];
        updateUIForUnauthenticatedUser();
        showAuthModal();
        showToast('success', 'Logged Out', 'You have been logged out successfully');
    } catch (error) {
        console.error('Logout error:', error);
        showToast('error', 'Logout Error', 'Failed to logout');
    }
}

/**
 * Update UI for authenticated user
 */
function updateUIForAuthenticatedUser() {
    if (AppState.currentUser) {
        userName.textContent = AppState.currentUser.fullName;
        welcomeText.textContent = 'Welcome back';
    }
}

/**
 * Update UI for unauthenticated user
 */
function updateUIForUnauthenticatedUser() {
    userName.textContent = 'Guest';
    welcomeText.textContent = 'Welcome';
    portfolioTotal.textContent = '$0.00';
    portfolioChange.textContent = '0.00%';
    portfolioChange.className = 'change-amount neutral';
    portfolioConverted.textContent = '~ NGN 0.00';
    portfolioList.innerHTML = '';
}

// ======================================
// 5. PORTFOLIO FUNCTIONS
// ======================================

/**
 * Load initial data (portfolio and popular tokens)
 */
async function loadInitialData() {
    try {
        await Promise.all([
            loadPortfolio(),
            loadPopularTokens()
        ]);
    } catch (error) {
        console.error('Failed to load initial data:', error);
        showToast('error', 'Data Error', 'Failed to load data');
    }
}

/**
 * Load user portfolio
 */
async function loadPortfolio() {
    try {
        const response = await fetch('/api/portfolio', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Failed to load portfolio');
        }
        
        const data = await response.json();
        AppState.portfolio = data.portfolio || [];
        
        updatePortfolioDisplay(data);
        updatePortfolioList(AppState.portfolio);
        
    } catch (error) {
        console.error('Portfolio load error:', error);
        showToast('error', 'Portfolio Error', 'Failed to load portfolio');
    }
}

/**
 * Update portfolio display (total balance, etc.)
 */
function updatePortfolioDisplay(data) {
    if (!data.summary) return;
    
    const totalValue = data.summary.total_value || 0;
    const changePercent = data.summary.total_gain_loss_percentage || 0;
    
    // Update portfolio total
    portfolioTotal.textContent = formatCurrency(totalValue);
    
    // Update change percentage
    portfolioChange.textContent = formatPercent(parseFloat(changePercent));
    portfolioChange.className = 'change-amount ' + 
        (changePercent > 0 ? 'positive' : changePercent < 0 ? 'negative' : 'neutral');
    
    // Update converted amount
    const ngnAmount = convertToNGN(totalValue);
    portfolioConverted.textContent = `~ NGN ${formatNumber(ngnAmount)}`;
    
    // Apply visibility setting
    updateBalanceVisibility();
}

/**
 * Update portfolio list display
 */
function updatePortfolioList(portfolioItems) {
    if (!portfolioItems || portfolioItems.length === 0) {
        portfolioList.innerHTML = `
            <div class="empty-portfolio">
                <i class="fas fa-wallet"></i>
                <h3>No Cryptocurrencies Yet</h3>
                <p>Add your first cryptocurrency to start tracking</p>
                <button id="add-first-crypto" class="add-btn">
                    <i class="fas fa-plus"></i>
                    <span>Add Cryptocurrency</span>
                </button>
            </div>
        `;
        
        // Re-attach event listener to the new button
        document.getElementById('add-first-crypto')?.addEventListener('click', showAddCryptoModal);
        return;
    }
    
    portfolioList.innerHTML = portfolioItems.map(item => `
        <div class="portfolio-item" data-coin-id="${item.coin_id}">
            <div class="token-icon">
                <i class="fas fa-coins"></i>
            </div>
            <div class="token-info">
                <div class="token-name">${item.coin_name}</div>
                <div class="token-symbol">${item.coin_symbol}</div>
            </div>
            <div class="portfolio-amount">
                <div class="portfolio-value">${formatCurrency(item.current_value || 0)}</div>
                <div class="portfolio-change ${(item.gain_loss_percentage || 0) >= 0 ? 'positive' : 'negative'}">
                    ${formatPercent(parseFloat(item.gain_loss_percentage || 0))}
                </div>
            </div>
        </div>
    `).join('');
    
    // Add click event to portfolio items
    document.querySelectorAll('.portfolio-item').forEach(item => {
        item.addEventListener('click', () => {
            const coinId = item.getAttribute('data-coin-id');
            showCoinDetails(coinId);
        });
    });
}

/**
 * Update balance visibility based on user preference
 */
function updateBalanceVisibility() {
    if (AppState.balanceVisible) {
        portfolioTotal.textContent = portfolioTotal.getAttribute('data-real-value') || '$0.00';
        balanceVisibilityBtn.innerHTML = '<i class="fas fa-eye"></i>';
    } else {
        portfolioTotal.setAttribute('data-real-value', portfolioTotal.textContent);
        portfolioTotal.textContent = '******';
        balanceVisibilityBtn.innerHTML = '<i class="fas fa-eye-slash"></i>';
    }
}

// ======================================
// 6. CRYPTO DATA FUNCTIONS
// ======================================

/**
 * Load popular tokens
 */
async function loadPopularTokens() {
    try {
        const response = await fetch('/api/trending', {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Failed to load trending tokens');
        }
        
        const data = await response.json();
        AppState.popularTokens = data.popular || [];
        
        updatePopularTokensDisplay(AppState.popularTokens.slice(0, 3));
        
    } catch (error) {
        console.error('Popular tokens load error:', error);
        showToast('error', 'Data Error', 'Failed to load popular tokens');
    }
}

/**
 * Update popular tokens display
 */
function updatePopularTokensDisplay(tokens) {
    if (!tokens || tokens.length === 0) {
        popularTokensList.innerHTML = `
            <div class="token-loading">
                <div class="loading-shimmer"></div>
                <div class="loading-shimmer"></div>
                <div class="loading-shimmer"></div>
            </div>
        `;
        return;
    }
    
    popularTokensList.innerHTML = tokens.map(token => `
        <div class="token-item" data-coin-id="${token.id}">
            <div class="token-icon">
                <i class="fas fa-coins"></i>
            </div>
            <div class="token-info">
                <div class="token-name">${token.name}</div>
                <div class="token-symbol">${token.symbol}</div>
            </div>
            <div class="token-price">
                <div class="current-price">${formatCurrency(token.price || 0)}</div>
                <div class="price-change ${(token.change_24h || 0) >= 0 ? 'positive' : 'negative'}">
                    ${formatPercent(parseFloat(token.change_24h || 0))}
                </div>
            </div>
        </div>
    `).join('');
    
    // Add click event to token items
    document.querySelectorAll('.token-item').forEach(item => {
        item.addEventListener('click', () => {
            const coinId = item.getAttribute('data-coin-id');
            showCoinDetails(coinId);
        });
    });
}

/**
 * Search for cryptocurrencies
 */
const searchCryptos = debounce(async (query) => {
    if (!query || query.length < 2) {
        cryptoSearchResults.innerHTML = '<p class="text-muted text-center">Type at least 2 characters to search</p>';
        return;
    }
    
    try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Search failed');
        }
        
        const data = await response.json();
        displaySearchResults(data.results || []);
        
    } catch (error) {
        console.error('Search error:', error);
        cryptoSearchResults.innerHTML = '<p class="text-muted text-center">Search failed. Please try again.</p>';
    }
}, 500);

/**
 * Display search results
 */
function displaySearchResults(results) {
    if (results.length === 0) {
        cryptoSearchResults.innerHTML = '<p class="text-muted text-center">No cryptocurrencies found</p>';
        return;
    }
    
    cryptoSearchResults.innerHTML = results.slice(0, 10).map(coin => `
        <div class="token-item search-result" data-coin-id="${coin.id}">
            <div class="token-icon">
                <i class="fas fa-coins"></i>
            </div>
            <div class="token-info">
                <div class="token-name">${coin.name}</div>
                <div class="token-symbol">${coin.symbol}</div>
            </div>
            <button class="add-coin-btn" data-coin-id="${coin.id}" data-coin-name="${coin.name}" data-coin-symbol="${coin.symbol}">
                <i class="fas fa-plus"></i>
            </button>
        </div>
    `).join('');
    
    // Add event listeners to add buttons
    document.querySelectorAll('.add-coin-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const coinId = btn.getAttribute('data-coin-id');
            const coinName = btn.getAttribute('data-coin-name');
            const coinSymbol = btn.getAttribute('data-coin-symbol');
            showAddCoinForm(coinId, coinName, coinSymbol);
        });
    });
    
    // Add click event to search result items
    document.querySelectorAll('.search-result').forEach(item => {
        item.addEventListener('click', () => {
            const coinId = item.getAttribute('data-coin-id');
            showCoinDetails(coinId);
        });
    });
}

/**
 * Show add coin form
 */
function showAddCoinForm(coinId, coinName, coinSymbol) {
    const formHtml = `
        <div class="add-coin-form">
            <h3>Add ${coinName} (${coinSymbol}) to Portfolio</h3>
            <div class="form-group">
                <label for="coin-amount">Amount Owned</label>
                <input type="number" id="coin-amount" step="0.00000001" min="0.00000001" placeholder="0.00000000" required>
                <small>Enter the amount of ${coinSymbol} you own</small>
            </div>
            <div class="form-group">
                <label for="purchase-price">Purchase Price (USD per coin)</label>
                <input type="number" id="purchase-price" step="0.01" min="0.01" placeholder="0.00" required>
                <small>Enter the price you paid per ${coinSymbol}</small>
            </div>
            <div class="form-actions">
                <button class="secondary-btn cancel-add">Cancel</button>
                <button class="primary-btn confirm-add">Add to Portfolio</button>
            </div>
        </div>
    `;
    
    cryptoSearchResults.innerHTML = formHtml;
    
    // Add event listeners
    document.querySelector('.cancel-add').addEventListener('click', () => {
        cryptoSearchInput.value = '';
        cryptoSearchResults.innerHTML = '<p class="text-muted text-center">Search for cryptocurrencies...</p>';
    });
    
    document.querySelector('.confirm-add').addEventListener('click', async () => {
        const amount = parseFloat(document.getElementById('coin-amount').value);
        const purchasePrice = parseFloat(document.getElementById('purchase-price').value);
        
        if (!amount || amount <= 0 || !purchasePrice || purchasePrice <= 0) {
            showToast('error', 'Invalid Input', 'Please enter valid amount and price');
            return;
        }
        
        await addCoinToPortfolio(coinId, coinSymbol, coinName, amount, purchasePrice);
    });
}

/**
 * Add coin to portfolio
 */
async function addCoinToPortfolio(coinId, coinSymbol, coinName, amount, purchasePrice) {
    try {
        const response = await fetch('/api/portfolio/add', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                coin_id: coinId,
                coin_symbol: coinSymbol,
                coin_name: coinName,
                amount: amount,
                purchase_price: purchasePrice
            }),
            credentials: 'include'
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showToast('success', 'Success', `${coinName} added to portfolio`);
            playSound(successSound);
            
            // Close modal and refresh portfolio
            hideAddCryptoModal();
            await loadPortfolio();
        } else {
            showToast('error', 'Failed', data.error || 'Failed to add coin');
        }
    } catch (error) {
        console.error('Add coin error:', error);
        showToast('error', 'Error', 'Failed to add coin to portfolio');
    }
}

/**
 * Show coin details
 */
async function showCoinDetails(coinId) {
    try {
        const response = await fetch(`/api/coin/${coinId}?timeframe=7d`, {
            credentials: 'include'
        });
        
        if (!response.ok) {
            throw new Error('Failed to load coin details');
        }
        
        const data = await response.json();
        displayCoinDetails(data.coin);
        
    } catch (error) {
        console.error('Coin details error:', error);
        showToast('error', 'Error', 'Failed to load coin details');
    }
}

/**
 * Display coin details in modal
 */
function displayCoinDetails(coin) {
    cryptoModalTitle.textContent = `${coin.name} (${coin.symbol})`;
    
    const detailsHtml = `
        <div class="coin-details">
            <div class="coin-price-header">
                <div class="current-price-large">${formatCurrency(coin.metrics?.price || 0)}</div>
                <div class="price-change-large ${(coin.metrics?.percent_change_24h || 0) >= 0 ? 'positive' : 'negative'}">
                    ${formatPercent(parseFloat(coin.metrics?.percent_change_24h || 0))} (24h)
                </div>
            </div>
            
            <div class="coin-stats-grid">
                <div class="stat-item">
                    <div class="stat-label">Market Cap</div>
                    <div class="stat-value">${formatCurrency(coin.metrics?.market_cap || 0)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">24h Volume</div>
                    <div class="stat-value">${formatCurrency(coin.metrics?.volume_24h || 0)}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Circulating Supply</div>
                    <div class="stat-value">${formatNumber(coin.metrics?.circulating_supply || 0)} ${coin.symbol}</div>
                </div>
                <div class="stat-item">
                    <div class="stat-label">Total Supply</div>
                    <div class="stat-value">${coin.metrics?.total_supply ? formatNumber(coin.metrics.total_supply) : '∞'}</div>
                </div>
            </div>
            
            ${coin.description ? `
                <div class="coin-description">
                    <h4>About ${coin.name}</h4>
                    <p>${coin.description.substring(0, 300)}${coin.description.length > 300 ? '...' : ''}</p>
                </div>
            ` : ''}
            
            <div class="coin-actions">
                <button class="secondary-btn" id="add-to-portfolio-btn" data-coin-id="${coin.id}" data-coin-name="${coin.name}" data-coin-symbol="${coin.symbol}">
                    <i class="fas fa-plus"></i> Add to Portfolio
                </button>
                <button class="primary-btn" id="buy-now-btn">
                    <i class="fas fa-shopping-cart"></i> Buy Now
                </button>
            </div>
        </div>
    `;
    
    cryptoDetailsModal.querySelector('.modal-body').innerHTML = detailsHtml;
    
    // Add event listeners
    document.getElementById('add-to-portfolio-btn')?.addEventListener('click', () => {
        const coinId = document.getElementById('add-to-portfolio-btn').getAttribute('data-coin-id');
        const coinName = document.getElementById('add-to-portfolio-btn').getAttribute('data-coin-name');
        const coinSymbol = document.getElementById('add-to-portfolio-btn').getAttribute('data-coin-symbol');
        
        hideCryptoDetailsModal();
        showAddCryptoModal();
        
        // Pre-fill search with selected coin
        cryptoSearchInput.value = coinSymbol;
        searchCryptos(coinSymbol);
    });
    
    showCryptoDetailsModal();
}

// ======================================
// 7. MODAL MANAGEMENT
// ======================================

/**
 * Show add crypto modal
 */
function showAddCryptoModal() {
    playSound(clickSound);
    addCryptoModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    cryptoSearchInput.focus();
}

/**
 * Hide add crypto modal
 */
function hideAddCryptoModal() {
    addCryptoModal.classList.add('hidden');
    document.body.style.overflow = '';
    cryptoSearchInput.value = '';
    cryptoSearchResults.innerHTML = '<p class="text-muted text-center">Search for cryptocurrencies...</p>';
}

/**
 * Show crypto details modal
 */
function showCryptoDetailsModal() {
    playSound(clickSound);
    cryptoDetailsModal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

/**
 * Hide crypto details modal
 */
function hideCryptoDetailsModal() {
    cryptoDetailsModal.classList.add('hidden');
    document.body.style.overflow = '';
}

// ======================================
// 8. THEME MANAGEMENT
// ======================================

/**
 * Initialize theme
 */
function initTheme() {
    document.documentElement.setAttribute('data-theme', AppState.theme);
    updateThemeToggleIcon();
}

/**
 * Toggle theme between light and dark
 */
function toggleTheme() {
    playSound(clickSound);
    
    AppState.theme = AppState.theme === 'light' ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', AppState.theme);
    localStorage.setItem('theme', AppState.theme);
    
    updateThemeToggleIcon();
    showToast('success', 'Theme Changed', `Switched to ${AppState.theme} mode`);
}

/**
 * Update theme toggle icon
 */
function updateThemeToggleIcon() {
    const icon = themeToggle.querySelector('i');
    if (AppState.theme === 'dark') {
        icon.className = 'fas fa-sun';
    } else {
        icon.className = 'fas fa-moon';
    }
}

// ======================================
// 9. NAVIGATION MANAGEMENT
// ======================================

/**
 * Switch between views
 */
function switchView(viewName) {
    playSound(clickSound);
    
    // Update active nav item
    navItems.forEach(item => {
        if (item.getAttribute('data-view') === viewName) {
            item.classList.add('active');
        } else {
            item.classList.remove('active');
        }
    });
    
    // Hide all views
    toggleElement(homeView, false);
    toggleElement(searchView, false);
    toggleElement(trendingView, false);
    toggleElement(settingsView, false);
    
    // Show selected view
    AppState.currentView = viewName;
    
    switch (viewName) {
        case 'home':
            toggleElement(homeView, true);
            break;
        case 'search':
            toggleElement(searchView, true);
            loadSearchView();
            break;
        case 'trending':
            toggleElement(trendingView, true);
            loadTrendingView();
            break;
        case 'settings':
            toggleElement(settingsView, true);
            loadSettingsView();
            break;
    }
}

/**
 * Load search view content
 */
function loadSearchView() {
    searchView.innerHTML = `
        <div class="search-view-container">
            <div class="search-header">
                <div class="search-box large">
                    <i class="fas fa-search"></i>
                    <input type="text" id="main-search-input" placeholder="Search cryptocurrencies...">
                </div>
            </div>
            <div class="search-results-container" id="main-search-results">
                <p class="text-muted text-center">Search for cryptocurrencies to add to your portfolio</p>
            </div>
        </div>
    `;
    
    // Add event listener to search input
    const mainSearchInput = document.getElementById('main-search-input');
    mainSearchInput.addEventListener('input', (e) => {
        const query = e.target.value;
        
        // Use debounced search function
        const debouncedSearch = debounce(async (searchQuery) => {
            if (!searchQuery || searchQuery.length < 2) {
                document.getElementById('main-search-results').innerHTML = 
                    '<p class="text-muted text-center">Type at least 2 characters to search</p>';
                return;
            }
            
            try {
                const response = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`, {
                    credentials: 'include'
                });
                
                if (!response.ok) throw new Error('Search failed');
                
                const data = await response.json();
                const results = data.results || [];
                
                if (results.length === 0) {
                    document.getElementById('main-search-results').innerHTML = 
                        '<p class="text-muted text-center">No cryptocurrencies found</p>';
                    return;
                }
                
                document.getElementById('main-search-results').innerHTML = results.slice(0, 20).map(coin => `
                    <div class="token-item search-result" data-coin-id="${coin.id}">
                        <div class="token-icon">
                            <i class="fas fa-coins"></i>
                        </div>
                        <div class="token-info">
                            <div class="token-name">${coin.name}</div>
                            <div class="token-symbol">${coin.symbol}</div>
                        </div>
                        <button class="add-coin-btn" data-coin-id="${coin.id}" data-coin-name="${coin.name}" data-coin-symbol="${coin.symbol}">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                `).join('');
                
                // Add event listeners
                document.querySelectorAll('.add-coin-btn').forEach(btn => {
                    btn.addEventListener('click', (e) => {
                        e.stopPropagation();
                        const coinId = btn.getAttribute('data-coin-id');
                        const coinName = btn.getAttribute('data-coin-name');
                        const coinSymbol = btn.getAttribute('data-coin-symbol');
                        showAddCoinForm(coinId, coinName, coinSymbol);
                    });
                });
                
                document.querySelectorAll('.search-result').forEach(item => {
                    item.addEventListener('click', () => {
                        const coinId = item.getAttribute('data-coin-id');
                        showCoinDetails(coinId);
                    });
                });
                
            } catch (error) {
                console.error('Search error:', error);
                document.getElementById('main-search-results').innerHTML = 
                    '<p class="text-muted text-center">Search failed. Please try again.</p>';
            }
        }, 500);
        
        debouncedSearch(query);
    });
}

/**
 * Load trending view content
 */
function loadTrendingView() {
    trendingView.innerHTML = `
        <div class="trending-view-container">
            <div class="trending-categories">
                <button class="trending-category active" data-category="popular">Popular</button>
                <button class="trending-category" data-category="top_gainers">Top Gainers</button>
                <button class="trending-category" data-category="top_losers">Top Losers</button>
                <button class="trending-category" data-category="recently_added">Recently Added</button>
            </div>
            <div class="trending-list" id="trending-list">
                <div class="token-loading">
                    <div class="loading-shimmer"></div>
                    <div class="loading-shimmer"></div>
                    <div class="loading-shimmer"></div>
                </div>
            </div>
        </div>
    `;
    
    loadTrendingData('popular');
    
    // Add event listeners to category buttons
    document.querySelectorAll('.trending-category').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.trending-category').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const category = btn.getAttribute('data-category');
            loadTrendingData(category);
        });
    });
}

/**
 * Load trending data for a category
 */
async function loadTrendingData(category) {
    try {
        const response = await fetch('/api/trending', {
            credentials: 'include'
        });
        
        if (!response.ok) throw new Error('Failed to load trending data');
        
        const data = await response.json();
        const tokens = data[category] || [];
        
        const trendingList = document.getElementById('trending-list');
        trendingList.innerHTML = tokens.map(token => `
            <div class="token-item trending-item" data-coin-id="${token.id}">
                <div class="token-icon">
                    <i class="fas fa-coins"></i>
                </div>
                <div class="token-info">
                    <div class="token-name">${token.name}</div>
                    <div class="token-symbol">${token.symbol}</div>
                    <div class="token-rank">Rank: #${token.rank}</div>
                </div>
                <div class="token-price">
                    <div class="current-price">${formatCurrency(token.price || 0)}</div>
                    <div class="price-change ${(token.change_24h || 0) >= 0 ? 'positive' : 'negative'}">
                        ${formatPercent(parseFloat(token.change_24h || 0))}
                    </div>
                </div>
            </div>
        `).join('');
        
        // Add click event to trending items
        document.querySelectorAll('.trending-item').forEach(item => {
            item.addEventListener('click', () => {
                const coinId = item.getAttribute('data-coin-id');
                showCoinDetails(coinId);
            });
        });
        
    } catch (error) {
        console.error('Trending data error:', error);
        document.getElementById('trending-list').innerHTML = 
            '<p class="text-muted text-center">Failed to load trending data</p>';
    }
}

/**
 * Load settings view content
 */
function loadSettingsView() {
    settingsView.innerHTML = `
        <div class="settings-view-container">
            <h2>Settings</h2>
            
            <div class="settings-section">
                <h3>Account</h3>
                <div class="settings-item">
                    <div class="settings-label">Email</div>
                    <div class="settings-value">${AppState.currentUser?.email || 'Not logged in'}</div>
                </div>
                <div class="settings-item">
                    <div class="settings-label">Full Name</div>
                    <div class="settings-value">${AppState.currentUser?.fullName || 'Guest'}</div>
                </div>
                <button class="settings-btn danger-btn" id="logout-btn">
                    <i class="fas fa-sign-out-alt"></i> Logout
                </button>
            </div>
            
            <div class="settings-section">
                <h3>Preferences</h3>
                <div class="settings-item">
                    <div class="settings-label">Theme</div>
                    <div class="settings-value">
                        <button class="theme-toggle-small" id="theme-toggle-small">
                            Switch to ${AppState.theme === 'light' ? 'Dark' : 'Light'} Mode
                        </button>
                    </div>
                </div>
                <div class="settings-item">
                    <div class="settings-label">Balance Visibility</div>
                    <div class="settings-value">
                        <button class="toggle-switch ${AppState.balanceVisible ? 'active' : ''}" id="balance-toggle">
                            <div class="toggle-slider"></div>
                        </button>
                    </div>
                </div>
            </div>
            
            <div class="settings-section">
                <h3>About</h3>
                <div class="settings-item">
                    <div class="settings-label">Version</div>
                    <div class="settings-value">1.0.0</div>
                </div>
                <div class="settings-item">
                    <div class="settings-label">Data Source</div>
                    <div class="settings-value">CoinPaprika API</div>
                </div>
                <button class="settings-btn" id="refresh-data-btn">
                    <i class="fas fa-sync-alt"></i> Refresh All Data
                </button>
            </div>
        </div>
    `;
    
    // Add event listeners for settings
    document.getElementById('logout-btn')?.addEventListener('click', handleLogout);
    document.getElementById('theme-toggle-small')?.addEventListener('click', toggleTheme);
    document.getElementById('balance-toggle')?.addEventListener('click', toggleBalanceVisibility);
    document.getElementById('refresh-data-btn')?.addEventListener('click', async () => {
        await loadInitialData();
        showToast('success', 'Refreshed', 'All data has been refreshed');
    });
}

/**
 * Toggle balance visibility
 */
function toggleBalanceVisibility() {
    playSound(clickSound);
    AppState.balanceVisible = !AppState.balanceVisible;
    localStorage.setItem('balanceVisible', AppState.balanceVisible);
    updateBalanceVisibility();
    
    // Update toggle switch in settings if visible
    const balanceToggle = document.getElementById('balance-toggle');
    if (balanceToggle) {
        if (AppState.balanceVisible) {
            balanceToggle.classList.add('active');
        } else {
            balanceToggle.classList.remove('active');
        }
    }
}

// ======================================
// 10. EVENT LISTENERS SETUP
// ======================================

/**
 * Set up all event listeners
 */
function setupEventListeners() {
    // Theme toggle
    themeToggle.addEventListener('click', toggleTheme);
    
    // Balance visibility toggle
    balanceVisibilityBtn.addEventListener('click', toggleBalanceVisibility);
    
    // Action buttons
    depositBtn.addEventListener('click', () => {
        playSound(clickSound);
        showToast('info', 'Coming Soon', 'Deposit functionality coming soon');
    });
    
    withdrawBtn.addEventListener('click', () => {
        playSound(clickSound);
        showToast('info', 'Coming Soon', 'Withdraw functionality coming soon');
    });
    
    buyBtn.addEventListener('click', () => {
        playSound(clickSound);
        showToast('info', 'Coming Soon', 'Buy functionality coming soon');
    });
    
    sellBtn.addEventListener('click', () => {
        playSound(clickSound);
        showToast('info', 'Coming Soon', 'Sell functionality coming soon');
    });
    
    swapBtn.addEventListener('click', () => {
        playSound(clickSound);
        showToast('info', 'Coming Soon', 'Swap functionality coming soon');
    });
    
    moreBtn.addEventListener('click', () => {
        playSound(clickSound);
        showToast('info', 'Coming Soon', 'More functionality coming soon');
    });
    
    // Promotional banner
    copyLinkBtn.addEventListener('click', () => {
        playSound(clickSound);
        navigator.clipboard.writeText(window.location.href)
            .then(() => {
                showToast('success', 'Link Copied', 'Referral link copied to clipboard');
            })
            .catch(() => {
                showToast('error', 'Copy Failed', 'Failed to copy link');
            });
    });
    
    // View all tokens
    viewAllTokensBtn.addEventListener('click', () => {
        playSound(clickSound);
        switchView('trending');
    });
    
    // Refresh portfolio
    refreshPortfolioBtn.addEventListener('click', async () => {
        playSound(clickSound);
        await loadPortfolio();
        showToast('success', 'Portfolio Refreshed', 'Updated with latest prices');
    });
    
    // Add first crypto button (will be re-attached dynamically)
    addFirstCryptoBtn?.addEventListener('click', showAddCryptoModal);
    
    // Navigation items
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const view = item.getAttribute('data-view');
            switchView(view);
        });
    });
    
    // Modal close buttons
    modalCloseBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            playSound(clickSound);
            hideAuthModal();
            hideAddCryptoModal();
            hideCryptoDetailsModal();
        });
    });
    
    // Close modals when clicking outside
    window.addEventListener('click', (event) => {
        if (event.target === authModal) {
            hideAuthModal();
        }
        if (event.target === addCryptoModal) {
            hideAddCryptoModal();
        }
        if (event.target === cryptoDetailsModal) {
            hideCryptoDetailsModal();
        }
    });
    
    // Close modals with Escape key
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') {
            hideAuthModal();
            hideAddCryptoModal();
            hideCryptoDetailsModal();
        }
    });
    
    // Authentication form switching
    switchToRegisterBtn.addEventListener('click', () => {
        playSound(clickSound);
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
        authModalTitle.textContent = 'Create Account';
    });
    
    switchToLoginBtn.addEventListener('click', () => {
        playSound(clickSound);
        registerForm.classList.add('hidden');
        loginForm.classList.remove('hidden');
        authModalTitle.textContent = 'Welcome Back';
    });
    
    // Login form submission
    loginBtn.addEventListener('click', (e) => {
        e.preventDefault();
        playSound(clickSound);
        
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        
        if (!email || !password) {
            showToast('error', 'Login Failed', 'Please enter email and password');
            return;
        }
        
        handleLogin(email, password);
    });
    
    // Register form submission
    registerBtn.addEventListener('click', (e) => {
        e.preventDefault();
        playSound(clickSound);
        
        const name = document.getElementById('reg-name').value;
        const email = document.getElementById('reg-email').value;
        const password = document.getElementById('reg-password').value;
        const confirmPassword = document.getElementById('reg-confirm').value;
        
        handleRegister(name, email, password, confirmPassword);
    });
    
    // Allow form submission with Enter key
    document.querySelectorAll('.auth-form input').forEach(input => {
        input.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                if (loginForm.classList.contains('hidden')) {
                    registerBtn.click();
                } else {
                    loginBtn.click();
                }
            }
        });
    });
    
    // Crypto search input
    cryptoSearchInput.addEventListener('input', (e) => {
        searchCryptos(e.target.value);
    });
}

// ======================================
// 11. INITIALIZATION
// ======================================

/**
 * Initialize the application
 */
async function initApp() {
    try {
        // Set initial theme
        initTheme();
        
        // Set up event listeners
        setupEventListeners();
        
        // Check authentication
        const isAuthenticated = await checkAuth();
        
        if (!isAuthenticated) {
            // Show auth modal after a short delay
            setTimeout(() => {
                showAuthModal();
            }, 500);
        }
        
        // Hide loading screen and show app
        setTimeout(() => {
            loadingScreen.style.opacity = '0';
            setTimeout(() => {
                loadingScreen.classList.add('hidden');
                appContainer.classList.remove('hidden');
                
                // Show welcome message for new users
                if (isAuthenticated) {
                    showToast('success', 'Welcome Back!', 'Your portfolio is ready');
                }
            }, 300);
        }, 1000);
        
    } catch (error) {
        console.error('App initialization failed:', error);
        loadingScreen.innerHTML = `
            <div class="error-screen">
                <i class="fas fa-exclamation-triangle"></i>
                <h2>Failed to Load App</h2>
                <p>${error.message}</p>
                <button onclick="location.reload()">Retry</button>
            </div>
        `;
    }
}

// ======================================
// 12. START THE APPLICATION
// ======================================

// Start the app when DOM is loaded
document.addEventListener('DOMContentLoaded', initApp);

// Service worker registration for PWA (future enhancement)
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js')
            .then(registration => {
                console.log('ServiceWorker registration successful');
            })
            .catch(err => {
                console.log('ServiceWorker registration failed: ', err);
            });
    });
}

// Export for debugging (optional)
window.AppState = AppState;