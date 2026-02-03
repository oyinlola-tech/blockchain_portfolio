// API Configuration
const API_BASE_URL = 'http://localhost:3000/api';

// State Management
let authState = {
    token: localStorage.getItem('authToken') || null,
    user: null
};

let appState = {
    theme: localStorage.getItem('theme') || 'light',
    currency: localStorage.getItem('currency') || 'USD',
    currentPage: null
};

// Utility Functions
function redirectTo(page) {
    window.location.href = page;
}

function handleApiError(error) {
    console.error('API Error:', error);
    return error.message || 'An error occurred. Please try again.';
}

function showError(elementId, message) {
    const element = document.getElementById(elementId);
    if (element) {
        element.textContent = message;
        element.classList.remove('hidden');
    }
}

function hideError(elementId) {
    const element = document.getElementById(elementId);
    if (element) {
        element.classList.add('hidden');
    }
}

function showLoading(button) {
    if (button) {
        const text = button.querySelector('.btn-text');
        const loading = button.querySelector('.btn-loading');
        if (text) text.classList.add('hidden');
        if (loading) loading.classList.remove('hidden');
        button.disabled = true;
    }
}

function hideLoading(button) {
    if (button) {
        const text = button.querySelector('.btn-text');
        const loading = button.querySelector('.btn-loading');
        if (text) text.classList.remove('hidden');
        if (loading) loading.classList.add('hidden');
        button.disabled = false;
    }
}

function formatCurrency(amount, currency = appState.currency) {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: currency
    }).format(amount);
}

function formatPercent(value) {
    return `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`;
}

function formatNumber(num) {
    if (num >= 1e9) return (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return (num / 1e3).toFixed(2) + 'K';
    return num.toFixed(2);
}

// API Functions
async function apiFetch(endpoint, options = {}) {
    const headers = {
        'Content-Type': 'application/json',
        ...options.headers
    };

    if (authState.token) {
        headers['Authorization'] = `Bearer ${authState.token}`;
    }

    try {
        const response = await fetch(`${API_BASE_URL}${endpoint}`, {
            ...options,
            headers
        });

        if (response.status === 401 && !endpoint.startsWith('/auth/')) {
            // Unauthorized on a non-auth route - clear token and redirect to login
            localStorage.removeItem('authToken');
            authState.token = null;
            redirectTo('login.html');
            return null;
        }

        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.message || `API Error: ${response.status}`);
        }

        return data;
    } catch (error) {
        console.error('Fetch error:', error);
        throw error;
    }
}

// Auth API
const authApi = {
    async signup(data) {
        return await apiFetch('/auth/signup', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    async login(data) {
        return await apiFetch('/auth/login', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    async logout() {
        // Clear local state first to ensure immediate logout on client
        localStorage.removeItem('authToken');
        localStorage.removeItem('userName');
        localStorage.removeItem('userEmail');
        authState.token = null;
        redirectTo('login.html');

        // Then, try to inform the server. We don't need to wait for it.
        await apiFetch('/auth/logout', { method: 'POST' }).catch(err => console.error('Server logout failed', err));
    },

    async changePassword(data) {
        return await apiFetch('/auth/change-password', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }
};

// Dashboard API
const dashboardApi = {
    async getDashboard() {
        return await apiFetch('/dashboard');
    },

    async addCoin(data) {
        return await apiFetch('/dashboard/add-coin', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    async getActivity() {
        return await apiFetch('/dashboard/activity');
    },

    async getPerformance(range = '7d') {
        return await apiFetch(`/dashboard/performance?range=${range}`);
    }
};

// Coins API
const coinsApi = {
    async search(query) {
        return await apiFetch(`/coins/search?q=${encodeURIComponent(query)}`);
    },

    async getTrending() {
        return await apiFetch('/coins/trending');
    },

    async getCoin(coinId) {
        return await apiFetch(`/coins/${coinId}`);
    },

    async getCoinHistory(coinId, range = '3d') {
        return await apiFetch(`/coins/${coinId}/history?range=${range}`);
    },

    async setAlert(coinId, data) {
        return await apiFetch(`/coins/${coinId}/alert`, {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }
};

// Settings API
const settingsApi = {
    async getSettings() {
        return await apiFetch('/settings');
    },

    async updateTheme(data) {
        return await apiFetch('/settings/theme', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    async updateCurrency(data) {
        return await apiFetch('/settings/currency', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    },

    async updateSecurity(data) {
        return await apiFetch('/settings/security', {
            method: 'POST',
            body: JSON.stringify(data)
        });
    }
};

// Page Controllers
const loginController = {
    init() {
        const form = document.getElementById('loginForm');
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const rememberMe = document.getElementById('rememberMe')?.checked || false;
            const submitBtn = document.getElementById('submitBtn');
            const errorElement = document.getElementById('errorMessage');

            if (!email || !password) {
                showError('errorMessage', 'Please fill in all fields');
                return;
            }

            showLoading(submitBtn);
            hideError('errorMessage');

            try {
                const data = await authApi.login({ email, password, rememberMe });
                
                if (data && data.token) {
                    localStorage.setItem('authToken', data.token);
                    authState.token = data.token;
                    if (data.data && data.data.user) {
                        localStorage.setItem('userName', data.data.user.name);
                        localStorage.setItem('userEmail', data.data.user.email);
                    }
                    redirectTo('dashboard.html');
                } else {
                    showError('errorMessage', 'Invalid login credentials');
                }
            } catch (error) {
                showError('errorMessage', handleApiError(error));
            } finally {
                hideLoading(submitBtn);
            }
        });

        // Check if already logged in
        if (authState.token) {
            redirectTo('dashboard.html');
        }
    }
};

const signupController = {
    init() {
        const form = document.getElementById('signupForm');
        if (!form) return;

        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            
            const name = document.getElementById('name').value;
            const email = document.getElementById('email').value;
            const password = document.getElementById('password').value;
            const confirmPassword = document.getElementById('confirmPassword').value;
            const submitBtn = document.getElementById('submitBtn');
            const errorElement = document.getElementById('errorMessage');

            if (password !== confirmPassword) {
                showError('errorMessage', 'Passwords do not match');
                return;
            }

            if (password.length < 8) {
                showError('errorMessage', 'Password must be at least 8 characters');
                return;
            }

            showLoading(submitBtn);
            hideError('errorMessage');

            try {
                const data = await authApi.signup({
                    name,
                    email,
                    password
                });

                if (data && data.message) {
                    // Show success message and redirect to login
                    const successElement = document.getElementById('successMessage');
                    if (successElement) {
                        successElement.textContent = 'Account created successfully! Redirecting...';
                        successElement.classList.remove('hidden');
                        setTimeout(() => redirectTo('login.html'), 2000);
                    }
                }
            } catch (error) {
                showError('errorMessage', handleApiError(error));
            } finally {
                hideLoading(submitBtn);
            }
        });

        // Check if already logged in
        if (authState.token) {
            redirectTo('dashboard.html');
        }
    }
};

const dashboardController = {
    dashboardData: null,

    async init() {
        // Check authentication
        if (!authState.token) {
            redirectTo('login.html');
            return;
        }
        try {
            this.setupEventListeners();
            const response = await dashboardApi.getDashboard();
            this.dashboardData = response.data;
            this.renderDashboardData();
            this.renderHoldings();
            await this.loadPerformanceChart();
            await this.loadActivity();
        } catch (error) {
            console.error('Failed to load dashboard data:', error);
            // You could show a global error on the dashboard here
        }
    },

    setupEventListeners() {
        // Logout
        const logoutBtn = document.getElementById('logoutBtn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', async (e) => {
                e.preventDefault();
                try {
                    await authApi.logout();
                } catch (error) { console.error('Logout failed', error); }
            });
        }

        // Add coin modal
        const addCoinBtn = document.getElementById('addCoinBtn');
        const addCoinModal = document.getElementById('addCoinModal');
        const closeModalBtns = document.querySelectorAll('.close-modal');

        if (addCoinBtn) {
            addCoinBtn.addEventListener('click', () => {
                if (addCoinModal) addCoinModal.classList.remove('hidden');
            });
        }

        closeModalBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                if (addCoinModal) addCoinModal.classList.add('hidden');
            });
        });

        // Time range buttons
        const timeBtns = document.querySelectorAll('.time-btn');
        timeBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                timeBtns.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                await this.loadPerformanceChart(e.target.dataset.range);
            });
        });

        // Chart range select
        const chartRange = document.getElementById('chartRange');
        if (chartRange) {
            chartRange.addEventListener('change', async (e) => {
                await this.loadPerformanceChart(e.target.value);
            });
        }
    },

    renderDashboardData() {
        try {
            const data = this.dashboardData;
            if (data) {
                // Update portfolio summary
                const totalValue = document.getElementById('totalValue');
                const totalChange = document.getElementById('totalChange');
                const dailyChange = document.getElementById('dailyChange');
                const dailyChangePercent = document.getElementById('dailyChangePercent');
                const coinsCount = document.getElementById('coinsCount');

                if (totalValue) totalValue.textContent = formatCurrency(data.totalValue || 0);
                if (totalChange) {
                    const change = data.totalChange || 0;
                    totalChange.className = `metric-change ${change >= 0 ? 'positive' : 'negative'}`;
                    totalChange.innerHTML = `<i class="fas fa-arrow-${change >= 0 ? 'up' : 'down'}"></i><span>${formatPercent(change)}</span>`;
                    totalChange.classList.remove('hidden');
                }
                if (dailyChange) dailyChange.textContent = formatCurrency(data.dailyChange || 0);
                if (dailyChangePercent) {
                    const change = data.dailyChangePercent || 0;
                    dailyChangePercent.className = `metric-change ${change >= 0 ? 'positive' : 'negative'}`;
                    dailyChangePercent.innerHTML = `<i class="fas fa-arrow-${change >= 0 ? 'up' : 'down'}"></i><span>${formatPercent(change)}</span>`;
                    dailyChangePercent.classList.remove('hidden');
                }
                if (coinsCount) coinsCount.textContent = data.coinsCount || 0;
            }
        } catch (error) {
            console.error('Failed to load dashboard data:', error);
        }
    },

    async loadPerformanceChart(range = '7d') {
        const chartLoading = document.getElementById('chartLoading');
        const chartError = document.getElementById('chartError');

        if (chartLoading) chartLoading.classList.remove('hidden');
        if (chartError) chartError.classList.add('hidden');

        try {
            const data = await dashboardApi.getPerformance(range);
            
            if (data && data.chartData) {
                // In a real app, you would use Chart.js here
                // For now, we'll just hide the loading state
                if (chartLoading) chartLoading.classList.add('hidden');
                
                // Example Chart.js implementation (commented out):
                // const ctx = document.getElementById('performanceChart').getContext('2d');
                // new Chart(ctx, { ... });
            }
        } catch (error) {
            console.error('Failed to load performance chart:', error);
            if (chartLoading) chartLoading.classList.add('hidden');
            if (chartError) chartError.classList.remove('hidden');
        }
    },

    renderHoldings() {
        const tableBody = document.getElementById('holdingsTableBody');
        const emptyState = document.getElementById('emptyHoldings');
        
        if (!tableBody) return;

        tableBody.innerHTML = `
            <tr class="table-loading">
                <td colspan="6">
                    <div class="loading-row">
                        <div class="spinner"></div>
                        <span>Loading holdings...</span>
                    </div>
                </td>
            </tr>
        `;

        try {
            const holdings = this.dashboardData?.holdings;
            if (holdings && holdings.length > 0) {
                tableBody.innerHTML = '';
                holdings.forEach(holding => {
                    const row = document.createElement('tr');
                    row.innerHTML = `
                        <td>
                            <div class="coin-preview">
                                <img src="${holding.icon || ''}" alt="${holding.name}" class="coin-icon">
                                <div>
                                    <div>${holding.name}</div>
                                    <div class="coin-symbol">${holding.symbol}</div>
                                </div>
                            </div>
                        </td>
                        <td>${formatCurrency(holding.price)}</td>
                        <td class="${holding.change24h >= 0 ? 'positive' : 'negative'}">
                            ${formatPercent(holding.change24h)}
                        </td>
                        <td>${holding.amount}</td>
                        <td>${formatCurrency(holding.value)}</td>
                        <td>
                            <button class="btn btn-outline btn-sm" onclick="dashboardController.viewCoin('${holding.id}')">
                                View
                            </button>
                        </td>
                    `;
                    tableBody.appendChild(row);
                });

                if (emptyState) emptyState.classList.add('hidden');
                tableBody.closest('.card').classList.remove('hidden');
            } else {
                if (emptyState) emptyState.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Failed to load holdings:', error);
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="error-message">
                        Failed to load holdings
                    </td>
                </tr>
            `;
        }
    },

    async loadActivity() {
        const activityList = document.getElementById('activityList');
        const emptyState = document.getElementById('emptyActivity');
        
        if (!activityList) return;

        activityList.innerHTML = `
            <div class="activity-loading">
                <div class="spinner"></div>
                <span>Loading activity...</span>
            </div>
        `;

        try {
            const response = await dashboardApi.getActivity();
            if (response.data && response.data.activities && response.data.activities.length > 0) {
                activityList.innerHTML = '';
                
                response.data.activities.forEach(activity => {
                    const activityItem = document.createElement('div');
                    activityItem.className = 'activity-item';
                    activityItem.innerHTML = `
                        <div class="activity-icon">
                            <i class="fas fa-${activity.type === 'buy' ? 'arrow-down' : 'arrow-up'}"></i>
                        </div>
                        <div class="activity-content">
                            <div class="activity-title">${activity.description}</div>
                            <div class="activity-time">${new Date(activity.timestamp).toLocaleDateString()}</div>
                        </div>
                        <div class="activity-amount ${activity.type === 'buy' ? 'positive' : 'negative'}">
                            ${activity.type === 'buy' ? '+' : '-'}${formatCurrency(activity.amount)}
                        </div>
                    `;
                    activityList.appendChild(activityItem);
                });

                if (emptyState) emptyState.classList.add('hidden');
            } else {
                if (emptyState) emptyState.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Failed to load activity:', error);
            activityList.innerHTML = `
                <div class="error-message">
                    Failed to load activity
                </div>
            `;
        }
    },

    viewCoin(coinId) {
        redirectTo(`coin.html?id=${coinId}`);
    }
};

const coinController = {
    async init() {
        // Check authentication
        if (!authState.token) {
            redirectTo('login.html');
            return;
        }

        const urlParams = new URLSearchParams(window.location.search);
        const coinId = urlParams.get('id');
        
        if (!coinId) {
            redirectTo('dashboard.html');
            return;
        }

        this.coinId = coinId;
        this.setupEventListeners();
        await this.loadCoinData();
        await this.loadCoinChart();
        await this.loadAlerts();
    },

    setupEventListeners() {
        // Back button
        const backBtn = document.getElementById('backBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                window.history.back();
            });
        }

        // Add to portfolio modal
        const addToPortfolioBtn = document.getElementById('addToPortfolioBtn');
        const addToPortfolioModal = document.getElementById('addToPortfolioModal');
        
        if (addToPortfolioBtn && addToPortfolioModal) {
            addToPortfolioBtn.addEventListener('click', () => {
                addToPortfolioModal.classList.remove('hidden');
            });
        }

        // Set alert modal
        const setAlertBtn = document.getElementById('setAlertBtn');
        const setAlertModal = document.getElementById('setAlertModal');
        
        if (setAlertBtn && setAlertModal) {
            setAlertBtn.addEventListener('click', () => {
                setAlertModal.classList.remove('hidden');
            });
        }

        // Close modals
        const closeModalBtns = document.querySelectorAll('.close-modal');
        closeModalBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.modal-overlay').classList.add('hidden');
            });
        });

        // Chart range buttons
        const rangeBtns = document.querySelectorAll('.range-btn');
        rangeBtns.forEach(btn => {
            btn.addEventListener('click', async (e) => {
                rangeBtns.forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
                await this.loadCoinChart(e.target.dataset.range);
            });
        });

        // Alert form
        const alertForm = document.getElementById('setAlertForm');
        if (alertForm) {
            alertForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.submitAlert();
            });
        }

        // Add to portfolio form
        const portfolioForm = document.getElementById('addToPortfolioForm');
        if (portfolioForm) {
            portfolioForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.addToPortfolio();
            });
        }
    },

    async loadCoinData() {
        try {
            const data = await coinsApi.getCoin(this.coinId);
            
            if (data) {
                // Update header
                const coinName = document.getElementById('coinName');
                const coinSymbol = document.getElementById('coinSymbol');
                const coinIcon = document.getElementById('coinIcon');
                
                if (coinName) coinName.textContent = data.name;
                if (coinSymbol) coinSymbol.textContent = data.symbol;
                if (coinIcon) {
                    coinIcon.src = data.icon || '';
                    coinIcon.alt = data.name;
                }

                // Update price section
                const currentPrice = document.getElementById('currentPrice');
                const priceChange24h = document.getElementById('priceChange24h');
                const priceChangePercent = document.getElementById('priceChangePercent');
                const priceChangeAmount = document.getElementById('priceChangeAmount');
                
                if (currentPrice) currentPrice.textContent = formatCurrency(data.price);
                if (priceChange24h) {
                    const change = data.priceChange24h || 0;
                    priceChange24h.className = `price-change ${change >= 0 ? 'positive' : 'negative'}`;
                }
                if (priceChangePercent) priceChangePercent.textContent = formatPercent(data.priceChange24h || 0);
                if (priceChangeAmount) priceChangeAmount.textContent = formatCurrency(data.priceChange24hAmount || 0);

                // Update stats
                const marketCap = document.getElementById('marketCap');
                const volume24h = document.getElementById('volume24h');
                const rank = document.getElementById('rank');
                
                if (marketCap) marketCap.textContent = formatCurrency(data.marketCap);
                if (volume24h) volume24h.textContent = formatCurrency(data.volume24h);
                if (rank) rank.textContent = `#${data.rank || '--'}`;

                // Update other stats
                const circulatingSupply = document.getElementById('circulatingSupply');
                const totalSupply = document.getElementById('totalSupply');
                const maxSupply = document.getElementById('maxSupply');
                const ath = document.getElementById('ath');
                const atl = document.getElementById('atl');
                
                if (circulatingSupply) circulatingSupply.textContent = formatNumber(data.circulatingSupply || 0);
                if (totalSupply) totalSupply.textContent = formatNumber(data.totalSupply || 0);
                if (maxSupply) maxSupply.textContent = formatNumber(data.maxSupply || 0);
                if (ath) ath.textContent = formatCurrency(data.ath || 0);
                if (atl) atl.textContent = formatCurrency(data.atl || 0);

                // Update about section
                const aboutCoinName = document.getElementById('aboutCoinName');
                const coinDescription = document.getElementById('coinDescription');
                
                if (aboutCoinName) aboutCoinName.textContent = data.name;
                if (coinDescription) coinDescription.textContent = data.description || 'No description available.';

                // Update modal placeholders
                const modalCoinName = document.getElementById('modalCoinName');
                const modalCurrentPrice = document.getElementById('modalCurrentPrice');
                const alertCoinName = document.getElementById('alertCoinName');
                const alertCurrentPrice = document.getElementById('alertCurrentPrice');
                
                if (modalCoinName) modalCoinName.textContent = data.name;
                if (modalCurrentPrice) modalCurrentPrice.textContent = formatCurrency(data.price);
                if (alertCoinName) alertCoinName.textContent = data.name;
                if (alertCurrentPrice) alertCurrentPrice.textContent = formatCurrency(data.price);
            }
        } catch (error) {
            console.error('Failed to load coin data:', error);
        }
    },

    async loadCoinChart(range = '1d') {
        const chartLoading = document.getElementById('chartLoading');
        const chartError = document.getElementById('chartError');

        if (chartLoading) chartLoading.classList.remove('hidden');
        if (chartError) chartError.classList.add('hidden');

        try {
            const data = await coinsApi.getCoinHistory(this.coinId, range);
            
            if (data && data.history) {
                // In a real app, you would use Chart.js here
                if (chartLoading) chartLoading.classList.add('hidden');
            }
        } catch (error) {
            console.error('Failed to load coin chart:', error);
            if (chartLoading) chartLoading.classList.add('hidden');
            if (chartError) chartError.classList.remove('hidden');
        }
    },

    async loadAlerts() {
        const alertsList = document.getElementById('alertsList');
        const emptyState = document.getElementById('emptyAlerts');
        
        if (!alertsList) return;

        try {
            const data = await coinsApi.getCoin(this.coinId);
            
            if (data && data.alerts && data.alerts.length > 0) {
                alertsList.innerHTML = '';
                
                data.alerts.forEach(alert => {
                    const alertItem = document.createElement('div');
                    alertItem.className = 'alert-item';
                    alertItem.innerHTML = `
                        <div class="alert-content">
                            <div class="alert-title">${alert.name || 'Price Alert'}</div>
                            <div class="alert-condition">
                                ${alert.condition === 'above' ? 'Above' : 'Below'} ${formatCurrency(alert.price)}
                            </div>
                        </div>
                        <button class="btn btn-outline btn-sm" onclick="coinController.deleteAlert('${alert.id}')">
                            Delete
                        </button>
                    `;
                    alertsList.appendChild(alertItem);
                });

                if (emptyState) emptyState.classList.add('hidden');
            } else {
                if (emptyState) emptyState.classList.remove('hidden');
            }
        } catch (error) {
            console.error('Failed to load alerts:', error);
        }
    },

    async submitAlert() {
        const form = document.getElementById('setAlertForm');
        const submitBtn = form.querySelector('button[type="submit"]');
        const errorElement = document.getElementById('setAlertError');

        const alertType = document.getElementById('alertType').value;
        const alertValue = document.getElementById('alertValue').value;
        const alertName = document.getElementById('alertName').value;

        if (!alertValue) {
            showError('setAlertError', 'Please enter a target price');
            return;
        }

        showLoading(submitBtn);
        hideError('setAlertError');

        try {
            const data = await coinsApi.setAlert(this.coinId, {
                type: alertType,
                value: parseFloat(alertValue),
                name: alertName
            });

            if (data) {
                // Close modal and refresh alerts
                document.getElementById('setAlertModal').classList.add('hidden');
                await this.loadAlerts();
                form.reset();
            }
        } catch (error) {
            showError('setAlertError', handleApiError(error));
        } finally {
            hideLoading(submitBtn);
        }
    },

    async addToPortfolio() {
        const form = document.getElementById('addToPortfolioForm');
        const submitBtn = form.querySelector('button[type="submit"]');
        const errorElement = document.getElementById('addPortfolioError');

        const amount = document.getElementById('amount').value;
        const purchasePrice = document.getElementById('purchasePrice').value;

        if (!amount || parseFloat(amount) <= 0) {
            showError('addPortfolioError', 'Please enter a valid amount');
            return;
        }

        showLoading(submitBtn);
        hideError('addPortfolioError');

        try {
            const data = await dashboardApi.addCoin({
                coinId: this.coinId,
                amount: parseFloat(amount),
                purchasePrice: purchasePrice ? parseFloat(purchasePrice) : null
            });

            if (data) {
                // Close modal and redirect to dashboard
                document.getElementById('addToPortfolioModal').classList.add('hidden');
                redirectTo('dashboard.html');
            }
        } catch (error) {
            showError('addPortfolioError', handleApiError(error));
        } finally {
            hideLoading(submitBtn);
        }
    }
};

const trendingController = {
    async init() {
        // Check authentication
        if (!authState.token) {
            redirectTo('login.html');
            return;
        }

        this.setupEventListeners();
        await this.loadMarketOverview();
        await this.loadTrendingCoins();
        await this.loadGainersLosers();
    },

    setupEventListeners() {
        // Refresh button
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            refreshBtn.addEventListener('click', async () => {
                await this.loadTrendingCoins();
                await this.loadGainersLosers();
            });
        }

        // Search input
        const searchInput = document.getElementById('trendingSearch');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                this.filterCoins(e.target.value);
            });
        }

        // Tab switching
        const topGainersTab = document.getElementById('topGainersTab');
        const topLosersTab = document.getElementById('topLosersTab');
        
        if (topGainersTab) {
            topGainersTab.addEventListener('click', () => {
                this.switchTab('gainers');
            });
        }
        
        if (topLosersTab) {
            topLosersTab.addEventListener('click', () => {
                this.switchTab('losers');
            });
        }
    },

    async loadMarketOverview() {
        try {
            const data = await coinsApi.getTrending();
            
            if (data && data.marketOverview) {
                const totalMarketCap = document.getElementById('totalMarketCap');
                const marketCapChange = document.getElementById('marketCapChange');
                const totalVolume = document.getElementById('totalVolume');
                const btcDominance = document.getElementById('btcDominance');
                
                if (totalMarketCap) totalMarketCap.textContent = formatCurrency(data.marketOverview.totalMarketCap);
                if (marketCapChange) {
                    const change = data.marketOverview.marketCapChange24h || 0;
                    marketCapChange.className = `overview-change ${change >= 0 ? 'positive' : 'negative'}`;
                    marketCapChange.innerHTML = `<span>${formatPercent(change)}</span>`;
                }
                if (totalVolume) totalVolume.textContent = formatCurrency(data.marketOverview.totalVolume);
                if (btcDominance) btcDominance.textContent = `${(data.marketOverview.btcDominance || 0).toFixed(1)}%`;
            }
        } catch (error) {
            console.error('Failed to load market overview:', error);
        }
    },

    async loadTrendingCoins() {
        const tableBody = document.getElementById('trendingTableBody');
        const visibleCount = document.getElementById('visibleCount');
        
        if (!tableBody) return;

        tableBody.innerHTML = `
            <tr class="table-loading">
                <td colspan="6">
                    <div class="loading-row">
                        <div class="spinner"></div>
                        <span>Loading trending coins...</span>
                    </div>
                </td>
            </tr>
        `;

        try {
            const data = await coinsApi.getTrending();
            
            if (data && data.coins && data.coins.length > 0) {
                this.allCoins = data.coins;
                this.displayCoins(this.allCoins);
                
                if (visibleCount) visibleCount.textContent = data.coins.length;
            }
        } catch (error) {
            console.error('Failed to load trending coins:', error);
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="error-message">
                        Failed to load trending coins
                    </td>
                </tr>
            `;
        }
    },

    displayCoins(coins) {
        const tableBody = document.getElementById('trendingTableBody');
        if (!tableBody) return;

        tableBody.innerHTML = '';
        
        coins.forEach((coin, index) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${coin.rank || index + 1}</td>
                <td>
                    <div class="coin-preview">
                        <img src="${coin.icon || ''}" alt="${coin.name}" class="coin-icon">
                        <div>
                            <div>${coin.name}</div>
                            <div class="coin-symbol">${coin.symbol}</div>
                        </div>
                    </div>
                </td>
                <td>${formatCurrency(coin.price)}</td>
                <td class="${coin.change24h >= 0 ? 'positive' : 'negative'}">
                    ${formatPercent(coin.change24h)}
                </td>
                <td>${formatCurrency(coin.marketCap)}</td>
                <td>
                    <button class="btn btn-outline btn-sm" onclick="trendingController.viewCoin('${coin.id}')">
                        View
                    </button>
                </td>
            `;
            tableBody.appendChild(row);
        });
    },

    filterCoins(searchTerm) {
        if (!this.allCoins) return;
        
        const filtered = this.allCoins.filter(coin => 
            coin.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            coin.symbol.toLowerCase().includes(searchTerm.toLowerCase())
        );
        
        this.displayCoins(filtered);
        
        const visibleCount = document.getElementById('visibleCount');
        if (visibleCount) visibleCount.textContent = filtered.length;
    },

    async loadGainersLosers() {
        try {
            const data = await coinsApi.getTrending();
            
            if (data) {
                // Sort by 24h change to get gainers and losers
                const sorted = [...(data.coins || [])].sort((a, b) => b.change24h - a.change24h);
                
                // Top gainers (positive change)
                const gainers = sorted.filter(coin => coin.change24h > 0).slice(0, 5);
                this.displayGainersLosers('topGainersList', gainers);
                
                // Top losers (negative change)
                const losers = sorted.filter(coin => coin.change24h < 0).slice(0, 5);
                this.displayGainersLosers('topLosersList', losers);
            }
        } catch (error) {
            console.error('Failed to load gainers/losers:', error);
        }
    },

    displayGainersLosers(elementId, coins) {
        const element = document.getElementById(elementId);
        if (!element) return;

        element.innerHTML = '';
        
        coins.forEach(coin => {
            const item = document.createElement('div');
            item.className = 'gl-item';
            item.innerHTML = `
                <div class="gl-coin">
                    <img src="${coin.icon || ''}" alt="${coin.name}" class="coin-icon">
                    <div>
                        <div>${coin.name}</div>
                        <div class="coin-symbol">${coin.symbol}</div>
                    </div>
                </div>
                <div class="gl-change ${coin.change24h >= 0 ? 'positive' : 'negative'}">
                    ${formatPercent(coin.change24h)}
                </div>
            `;
            element.appendChild(item);
        });
    },

    switchTab(tab) {
        const topGainersTab = document.getElementById('topGainersTab');
        const topLosersTab = document.getElementById('topLosersTab');
        const topGainersList = document.getElementById('topGainersList');
        const topLosersList = document.getElementById('topLosersList');

        if (tab === 'gainers') {
            if (topGainersTab) topGainersTab.classList.add('active');
            if (topLosersTab) topLosersTab.classList.remove('active');
            if (topGainersList) topGainersList.classList.remove('hidden');
            if (topLosersList) topLosersList.classList.add('hidden');
        } else {
            if (topGainersTab) topGainersTab.classList.remove('active');
            if (topLosersTab) topLosersTab.classList.add('active');
            if (topGainersList) topGainersList.classList.add('hidden');
            if (topLosersList) topLosersList.classList.remove('hidden');
        }
    },

    viewCoin(coinId) {
        redirectTo(`coin.html?id=${coinId}`);
    }
};

const settingsController = {
    async init() {
        // Check authentication
        if (!authState.token) {
            redirectTo('login.html');
            return;
        }

        this.setupEventListeners();
        await this.loadSettings();
        this.loadUserProfile();
    },

    setupEventListeners() {
        // Back button
        const backBtn = document.getElementById('backBtn');
        if (backBtn) {
            backBtn.addEventListener('click', () => {
                window.history.back();
            });
        }

        // Change password modal
        const changePasswordBtn = document.getElementById('changePasswordBtn');
        const changePasswordModal = document.getElementById('changePasswordModal');
        
        if (changePasswordBtn && changePasswordModal) {
            changePasswordBtn.addEventListener('click', () => {
                changePasswordModal.classList.remove('hidden');
            });
        }

        // Close modals
        const closeModalBtns = document.querySelectorAll('.close-modal');
        closeModalBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.target.closest('.modal-overlay').classList.add('hidden');
            });
        });

        // Theme select
        const themeSelect = document.getElementById('themeSelect');
        if (themeSelect) {
            themeSelect.value = appState.theme;
            themeSelect.addEventListener('change', async (e) => {
                await this.updateTheme(e.target.value);
            });
        }

        // Currency select
        const currencySelect = document.getElementById('currencySelect');
        if (currencySelect) {
            currencySelect.value = appState.currency;
            currencySelect.addEventListener('change', async (e) => {
                await this.updateCurrency(e.target.value);
            });
        }

        // Change password form
        const changePasswordForm = document.getElementById('changePasswordForm');
        if (changePasswordForm) {
            changePasswordForm.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.changePassword();
            });
        }
    },

    async loadSettings() {
        try {
            const data = await settingsApi.getSettings();
            
            if (data) {
                // Update theme if different from current
                if (data.theme && data.theme !== appState.theme) {
                    appState.theme = data.theme;
                    localStorage.setItem('theme', data.theme);
                    this.applyTheme(data.theme);
                }

                // Update currency if different from current
                if (data.currency && data.currency !== appState.currency) {
                    appState.currency = data.currency;
                    localStorage.setItem('currency', data.currency);
                }

                // Update theme select
                const themeSelect = document.getElementById('themeSelect');
                if (themeSelect) {
                    themeSelect.value = data.theme || appState.theme;
                }

                // Update currency select
                const currencySelect = document.getElementById('currencySelect');
                if (currencySelect) {
                    currencySelect.value = data.currency || appState.currency;
                }
            }
        } catch (error) {
            console.error('Failed to load settings:', error);
        }
    },

    loadUserProfile() {
        // In a real app, this would come from an API
        const userName = document.getElementById('userName');
        const userEmail = document.getElementById('userEmail');
        
        if (userName) userName.textContent = localStorage.getItem('userName') || 'User';
        if (userEmail) userEmail.textContent = localStorage.getItem('userEmail') || 'user@example.com';
    },

    async updateTheme(theme) {
        try {
            await settingsApi.updateTheme({ theme });
            appState.theme = theme;
            localStorage.setItem('theme', theme);
            this.applyTheme(theme);
        } catch (error) {
            console.error('Failed to update theme:', error);
        }
    },

    applyTheme(theme) {
        if (theme === 'dark' || (theme === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
            document.documentElement.style.setProperty('color-scheme', 'dark');
        } else {
            document.documentElement.style.setProperty('color-scheme', 'light');
        }
    },

    async updateCurrency(currency) {
        try {
            await settingsApi.updateCurrency({ currency });
            appState.currency = currency;
            localStorage.setItem('currency', currency);
            // Refresh any currency displays on the page
            window.location.reload();
        } catch (error) {
            console.error('Failed to update currency:', error);
        }
    },

    async changePassword() {
        const form = document.getElementById('changePasswordForm');
        const submitBtn = form.querySelector('button[type="submit"]');
        const errorElement = document.getElementById('changePasswordError');

        const currentPassword = document.getElementById('currentPassword').value;
        const newPassword = document.getElementById('newPassword').value;
        const confirmNewPassword = document.getElementById('confirmNewPassword').value;

        if (newPassword !== confirmNewPassword) {
            showError('changePasswordError', 'New passwords do not match');
            return;
        }

        if (newPassword.length < 8) {
            showError('changePasswordError', 'Password must be at least 8 characters');
            return;
        }

        showLoading(submitBtn);
        hideError('changePasswordError');

        try {
            const data = await authApi.changePassword({
                currentPassword,
                newPassword
            });

            if (data && data.message) {
                // Show success message and close modal
                document.getElementById('changePasswordModal').classList.add('hidden');
                form.reset();
                alert('Password changed successfully');
            }
        } catch (error) {
            showError('changePasswordError', handleApiError(error));
        } finally {
            hideLoading(submitBtn);
        }
    }
};

// Global event listeners
document.addEventListener('DOMContentLoaded', () => {
    // Apply saved theme
    const savedTheme = localStorage.getItem('theme') || 'light';
    settingsController.applyTheme(savedTheme);

    // Check current page and initialize appropriate controller
    const path = window.location.pathname;
    
    if (path.includes('login.html')) {
        loginController.init();
    } else if (path.includes('signup.html')) {
        signupController.init();
    } else if (path.includes('dashboard.html')) {
        dashboardController.init();
    } else if (path.includes('coin.html')) {
        coinController.init();
    } else if (path.includes('trending.html')) {
        trendingController.init();
    } else if (path.includes('settings.html')) {
        settingsController.init();
    }

    // Bottom navigation search button
    const searchNavBtns = document.querySelectorAll('#searchNavBtn');
    searchNavBtns.forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            // In a real app, this would open a search modal or redirect to search page
            alert('Search functionality would open here');
        });
    });
});

// Expose controllers to global scope for inline event handlers
window.dashboardController = dashboardController;
window.coinController = coinController;
window.trendingController = trendingController;
window.settingsController = settingsController; 