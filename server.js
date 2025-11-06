const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const CONFIG = {
    STADIUM_APPCHAIN_ID: 574014,
    CONTRACT_ADDRESS: '0xF9637B60f27AF139FC46EAa655cFBbe4E731BCdF',
    API_BASE_URL: 'https://commons.explorer.syndicate.io/api',
    STAKE_EVENT_TOPIC: '0x507ac39eb33610191cd8fd54286e91c5cc464c262861643be3978f5a9f18ab02',
    SYND_CONTRACT_ADDRESS: '0x1bab804803159ad84b8854581aa53ac72455614e',
    GECKO_TERMINAL_API: 'https://api.geckoterminal.com/api/v2'
};

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Cache for API responses
let cache = {
    data: null,
    timestamp: null,
    ttl: 5 * 60 * 1000 // 5 minutes
};

// Cache for price data
let priceCache = {
    data: null,
    timestamp: null,
    ttl: 2 * 60 * 1000 // 2 minutes
};

// Fetch SYND price data from GeckoTerminal
async function fetchSYNDPrice() {
    try {
        // GeckoTerminal API format: /simple/networks/{network}/token_price/{addresses}
        // For Ethereum mainnet, network is 'eth'
        const url = `${CONFIG.GECKO_TERMINAL_API}/simple/networks/eth/token_price/${CONFIG.SYND_CONTRACT_ADDRESS}`;
        console.log('Fetching SYND price from GeckoTerminal:', url);
        
        const response = await fetch(url);
        const data = await response.json();
        
        console.log('GeckoTerminal API response:', JSON.stringify(data, null, 2));
        
        if (data.data && data.data.attributes) {
            const attributes = data.data.attributes;
            return {
                price: parseFloat(attributes.token_prices[CONFIG.SYND_CONTRACT_ADDRESS]) || 0,
                change24h: null, // Will try to get this from another endpoint if needed
                marketCap: null,
                volume24h: null
            };
        }
        
        throw new Error('Failed to fetch SYND price data from GeckoTerminal');
    } catch (error) {
        console.error('Error fetching SYND price:', error);
        
        // Fallback to CoinGecko if GeckoTerminal fails
        try {
            console.log('Trying CoinGecko fallback...');
            const fallbackUrl = `https://api.coingecko.com/api/v3/simple/price?ids=syndicate&vs_currencies=usd&include_24hr_change=true`;
            const fallbackResponse = await fetch(fallbackUrl);
            const fallbackData = await fallbackResponse.json();
            
            if (fallbackData.syndicate) {
                return {
                    price: fallbackData.syndicate.usd,
                    change24h: fallbackData.syndicate.usd_24h_change,
                    marketCap: null,
                    volume24h: null
                };
            }
        } catch (fallbackError) {
            console.error('Fallback also failed:', fallbackError);
        }
        
        throw error;
    }
}

// Fetch logs from Blockscout API
async function fetchLogsFromAPI() {
    try {
        const params = new URLSearchParams({
            module: 'logs',
            action: 'getLogs',
            address: CONFIG.CONTRACT_ADDRESS,
            fromBlock: '45000',
            toBlock: 'latest'
        });

        const url = `${CONFIG.API_BASE_URL}?${params}`;
        console.log('Fetching from:', url);

        const response = await fetch(url);
        const data = await response.json();

        if (data.status === '1' && data.result || (data.status === '0' && Array.isArray(data.result))) {
            return data.result;
        }
        throw new Error('Failed to fetch logs from API');
    } catch (error) {
        console.error('Error fetching logs:', error);
        throw error;
    }
}

// Process staking data
function processStakingData(logs) {
    const stakingData = {};
    const appchainData = {};
    const dailyTrends = {};

    logs.forEach(log => {
        try {
            const data = log.data;
            const eventTopic = log.topics[0];

            // Handle different event types
            let from, toAppchainId, fromAppchainId, amount, isStake = true;
            
            // Get date for trend analysis
            const timestamp = parseInt(log.timeStamp, 16) * 1000;
            const date = new Date(timestamp).toISOString().split('T')[0]; // YYYY-MM-DD format

            if (eventTopic === '0x507ac39eb33610191cd8fd54286e91c5cc464c262861643be3978f5a9f18ab02') {
                // Stake event - adds to appchain
                if (data.length < 258) return;
                
                const chunk2 = data.slice(66, 130); // staker address
                const chunk3 = data.slice(130, 194); // amount
                const chunk4 = data.slice(194, 258); // appchain ID
                
                from = '0x' + chunk2.slice(-40);
                toAppchainId = parseInt('0x' + chunk4, 16);
                amount = parseInt('0x' + chunk3, 16) / 1e18;
                isStake = true;
                
            } else if (eventTopic === '0x8bd4728ee9ca3f99ddcffa24eb4f15de015cda9a27ccc427dfdaf711943ebca0') {
                // Unstake/Move event - removes from one appchain, may add to another
                if (data.length < 194) return;
                
                const chunk1 = data.slice(2, 66);   // staker address
                const chunk2 = data.slice(66, 130); // from appchain ID
                const chunk3 = data.slice(130, 194); // amount
                
                from = '0x' + chunk1.slice(-40);
                fromAppchainId = parseInt('0x' + chunk2, 16);
                amount = parseInt('0x' + chunk3, 16) / 1e18;
                isStake = false;
                
            } else {
                // Other event types - skip for now
                return;
            }

            if (isStake && toAppchainId) {
                // Adding stake to an appchain
                if (!appchainData[toAppchainId]) {
                    appchainData[toAppchainId] = {
                        total: 0,
                        stakers: new Set()
                    };
                }
                appchainData[toAppchainId].total += amount;
                appchainData[toAppchainId].stakers.add(from);

                // Track Stadium-specific stakers
                if (toAppchainId === CONFIG.STADIUM_APPCHAIN_ID) {
                    if (!stakingData[from]) {
                        stakingData[from] = 0;
                    }
                    stakingData[from] += amount;
                }
                
            } else if (!isStake && fromAppchainId) {
                // Removing stake from an appchain
                if (!appchainData[fromAppchainId]) {
                    appchainData[fromAppchainId] = {
                        total: 0,
                        stakers: new Set()
                    };
                }
                appchainData[fromAppchainId].total -= amount;
                
                // Track Stadium-specific unstakers
                if (fromAppchainId === CONFIG.STADIUM_APPCHAIN_ID) {
                    if (!stakingData[from]) {
                        stakingData[from] = 0;
                    }
                    stakingData[from] -= amount;
                    
                    // Remove staker if they have no remaining stake
                    if (stakingData[from] <= 0) {
                        delete stakingData[from];
                        if (appchainData[fromAppchainId]) {
                            appchainData[fromAppchainId].stakers.delete(from);
                        }
                    }
                } else if (appchainData[fromAppchainId].total <= 0) {
                    appchainData[fromAppchainId].stakers.delete(from);
                }
            }

            // Track daily trends for Stadium
            if ((isStake && toAppchainId === CONFIG.STADIUM_APPCHAIN_ID) || (!isStake && fromAppchainId === CONFIG.STADIUM_APPCHAIN_ID)) {
                if (!dailyTrends[date]) {
                    dailyTrends[date] = {
                        date,
                        stakes: 0,
                        unstakes: 0,
                        netFlow: 0,
                        totalStaked: 0,
                        totalStakers: 0,
                        transactions: []
                    };
                }

                const trend = dailyTrends[date];
                if (isStake) {
                    trend.stakes += amount;
                    trend.netFlow += amount;
                } else {
                    trend.unstakes += amount;
                    trend.netFlow -= amount;
                }

                trend.transactions.push({
                    type: isStake ? 'stake' : 'unstake',
                    from,
                    amount,
                    appchainId: isStake ? toAppchainId : fromAppchainId,
                    txHash: log.transactionHash,
                    blockNumber: parseInt(log.blockNumber, 16)
                });
            }
        } catch (error) {
            console.error('Error processing log:', error);
        }
    });

    // Convert Sets to arrays for JSON serialization
    Object.keys(appchainData).forEach(key => {
        appchainData[key].stakers = Array.from(appchainData[key].stakers);
    });

    // Calculate running totals for trends
    const sortedDates = Object.keys(dailyTrends).sort();
    let runningTotal = 0;
    let runningStakers = 0;
    const stakerTracker = {};

    sortedDates.forEach(date => {
        runningTotal += dailyTrends[date].netFlow;
        
        // Track unique stakers
        dailyTrends[date].transactions.forEach(tx => {
            if (tx.type === 'stake') {
                stakerTracker[tx.from] = true;
            } else if (tx.type === 'unstake') {
                // Check if they still have stake remaining
                const remainingStake = stakingData[tx.from] || 0;
                if (remainingStake <= 0) {
                    delete stakerTracker[tx.from];
                }
            }
        });
        
        dailyTrends[date].totalStaked = Math.max(0, runningTotal);
        dailyTrends[date].totalStakers = Object.keys(stakerTracker).length;
    });

    return { stakingData, appchainData, dailyTrends };
}

// Calculate statistics
function calculateStats(stakingData, appchainData) {
    const stadiumData = appchainData[CONFIG.STADIUM_APPCHAIN_ID] || { 
        total: 0, 
        stakers: [] 
    };
    
    const totalStaked = stadiumData.total;
    const totalStakers = stadiumData.stakers.length;

    // Top 10 stakers
    const top10 = Object.entries(stakingData)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([address, amount], index) => ({
            rank: index + 1,
            address,
            amount,
            percentage: (amount / totalStaked) * 100
        }));

    // Ecosystem rankings
    const ecosystemRankings = Object.entries(appchainData)
        .map(([appchainId, data]) => ({
            appchainId: parseInt(appchainId),
            total: data.total,
            stakers: data.stakers.length
        }))
        .sort((a, b) => b.total - a.total);

    const totalNetworkStaked = ecosystemRankings.reduce((sum, item) => sum + item.total, 0);
    const stadiumRank = ecosystemRankings.findIndex(item => item.appchainId === CONFIG.STADIUM_APPCHAIN_ID) + 1;
    const networkShare = totalStaked > 0 ? (totalStaked / totalNetworkStaked) * 100 : 0;

    return {
        stadium: {
            totalStaked,
            totalStakers,
            rank: stadiumRank,
            networkShare
        },
        top10,
        ecosystem: ecosystemRankings.map((item, index) => ({
            ...item,
            rank: index + 1,
            share: (item.total / totalNetworkStaked) * 100
        }))
    };
}

// Main data fetching function
async function fetchStakingData() {
    try {
        console.log('Fetching staking data...');
        const logs = await fetchLogsFromAPI();
        console.log(`Fetched ${logs.length} logs`);

        const { stakingData, appchainData, dailyTrends } = processStakingData(logs);
        const stats = calculateStats(stakingData, appchainData);
        
        // Fetch SYND price data
        let priceData = null;
        try {
            priceData = await fetchSYNDPrice();
            console.log('SYND price fetched:', priceData);
        } catch (priceError) {
            console.warn('Could not fetch SYND price:', priceError.message);
        }
        
        return { ...stats, trends: dailyTrends, price: priceData };
    } catch (error) {
        console.error('Error fetching staking data:', error);
        throw error;
    }
}

// API Routes
app.get('/api/stats', async (req, res) => {
    try {
        // Check cache
        const now = Date.now();
        if (cache.data && cache.timestamp && (now - cache.timestamp < cache.ttl)) {
            console.log('Returning cached data');
            return res.json({
                ...cache.data,
                cached: true,
                cacheAge: Math.floor((now - cache.timestamp) / 1000)
            });
        }

        // Fetch fresh data
        const stats = await fetchStakingData();
        
        // Update cache
        cache.data = stats;
        cache.timestamp = now;

        res.json({
            ...stats,
            cached: false,
            timestamp: now
        });
    } catch (error) {
        console.error('API Error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch staking data',
            message: error.message 
        });
    }
});

// Trends endpoint
app.get('/api/trends', async (req, res) => {
    try {
        // Check cache
        const now = Date.now();
        if (cache.data && cache.timestamp && (now - cache.timestamp < cache.ttl)) {
            const trends = cache.data.trends || {};
            return res.json({
                trends: Object.values(trends).sort((a, b) => a.date.localeCompare(b.date)),
                cached: true,
                cacheAge: Math.floor((now - cache.timestamp) / 1000)
            });
        }

        // Fetch fresh data
        const stats = await fetchStakingData();
        const trends = stats.trends || {};
        
        res.json({
            trends: Object.values(trends).sort((a, b) => a.date.localeCompare(b.date)),
            cached: false,
            timestamp: now
        });
    } catch (error) {
        console.error('Trends API Error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch trend data',
            message: error.message 
        });
    }
});

// Price endpoint
app.get('/api/price', async (req, res) => {
    try {
        // Check price cache
        const now = Date.now();
        if (priceCache.data && priceCache.timestamp && (now - priceCache.timestamp < priceCache.ttl)) {
            console.log('Returning cached price data');
            return res.json({
                ...priceCache.data,
                cached: true,
                cacheAge: Math.floor((now - priceCache.timestamp) / 1000)
            });
        }

        // Fetch fresh price data
        const priceData = await fetchSYNDPrice();
        
        // Update price cache
        priceCache.data = priceData;
        priceCache.timestamp = now;

        res.json({
            ...priceData,
            cached: false,
            timestamp: now
        });
    } catch (error) {
        console.error('Price API Error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch price data',
            message: error.message 
        });
    }
});

// Health check
app.get('/api/health', (req, res) => {
    res.json({ 
        status: 'ok',
        uptime: process.uptime(),
        cache: {
            hasData: !!cache.data,
            age: cache.timestamp ? Math.floor((Date.now() - cache.timestamp) / 1000) : null
        },
        priceCache: {
            hasData: !!priceCache.data,
            age: priceCache.timestamp ? Math.floor((Date.now() - priceCache.timestamp) / 1000) : null
        }
    });
});

// Serve index.html for root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server
app.listen(PORT, () => {
    console.log(`🏟️  Stadium Staking Terminal API running on port ${PORT}`);
    console.log(`📊 API endpoint: http://localhost:${PORT}/api/stats`);
    console.log(`🌐 Web interface: http://localhost:${PORT}`);
});
