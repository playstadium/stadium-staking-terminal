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

const EPOCH_INFO = {
    number: 1,
    durationDays: 30,
    totalEmissionPerEpoch: 1666667,
    appchainPoolShare: 0.40
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

// Snapshot storage (in-memory, could be moved to file/db later)
let snapshots = [];

// Check if it's Friday and time to take a snapshot
function shouldTakeSnapshot() {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 5 = Friday
    const hour = now.getHours();
    
    // Take snapshot on Friday at 12:00 PM (noon)
    return dayOfWeek === 5 && hour === 12;
}

// Take a snapshot of top 10
function takeSnapshot(stats) {
    const snapshot = {
        date: new Date().toISOString().split('T')[0], // YYYY-MM-DD
        timestamp: Date.now(),
        totalStaked: stats.stadium.totalStaked,
        totalStakers: stats.stadium.totalStakers,
        rank: stats.stadium.rank,
        networkShare: stats.stadium.networkShare,
        top10: stats.top10.map(s => ({
            rank: s.rank,
            address: s.address,
            amount: s.amount,
            percentage: s.percentage,
            quality: s.quality
        }))
    };
    
    snapshots.push(snapshot);
    
    // Keep only last 52 snapshots (1 year of weekly data)
    if (snapshots.length > 52) {
        snapshots = snapshots.slice(-52);
    }
    
    console.log(`📸 Snapshot taken: ${snapshot.date} - ${snapshot.totalStaked.toFixed(2)} SYND staked`);
    return snapshot;
}

// Check for snapshot on startup and set up weekly check
let lastSnapshotCheck = Date.now();
setInterval(() => {
    const now = Date.now();
    // Check every hour
    if (now - lastSnapshotCheck > 60 * 60 * 1000) {
        lastSnapshotCheck = now;
        if (shouldTakeSnapshot()) {
            // Check if we already took a snapshot today
            const today = new Date().toISOString().split('T')[0];
            const alreadySnapped = snapshots.some(s => s.date === today);
            
            if (!alreadySnapped && cache.data) {
                takeSnapshot(cache.data);
            }
        }
    }
}, 60 * 60 * 1000); // Check every hour

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

// Calculate epoch number (30-day periods)
function getEpochNumber(timestamp) {
    // Assuming epoch 0 starts at a fixed date (e.g., Jan 1, 2024)
    const EPOCH_START = new Date('2024-01-01').getTime();
    const EPOCH_DURATION = 30 * 24 * 60 * 60 * 1000; // 30 days in ms
    const epoch = Math.floor((timestamp - EPOCH_START) / EPOCH_DURATION);
    return Math.max(0, epoch);
}

// Calculate node quality based on epoch consistency
function calculateNodeQuality(stakingHistory) {
    if (!stakingHistory || stakingHistory.length === 0) return 0;
    
    // Get unique epochs where node was active
    const activeEpochs = new Set();
    const currentEpoch = getEpochNumber(Date.now());
    
    stakingHistory.forEach(entry => {
        const epoch = getEpochNumber(entry.timestamp);
        if (entry.amount > 0) {
            activeEpochs.add(epoch);
        }
    });
    
    // Calculate quality: percentage of recent epochs where node was active
    // Look at last 6 epochs (6 months)
    const recentEpochs = Math.min(6, currentEpoch + 1);
    const consistency = activeEpochs.size / recentEpochs;
    
    // Quality score: 0-100, based on consistency and total epochs active
    const qualityScore = Math.min(100, Math.round(consistency * 100));
    
    return {
        score: qualityScore,
        activeEpochs: activeEpochs.size,
        totalEpochs: recentEpochs,
        consistency: consistency,
        epochs: Array.from(activeEpochs).sort((a, b) => b - a)
    };
}

// Process staking data
function processStakingData(logs) {
    const stakingData = {};
    const appchainData = {};
    const dailyTrends = {};
    const stakingHistory = {}; // Track history per address

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
                    
                    // Track staking history
                    if (!stakingHistory[from]) {
                        stakingHistory[from] = [];
                    }
                    stakingHistory[from].push({
                        timestamp,
                        amount: stakingData[from], // Current total after this stake
                        type: 'stake',
                        txHash: log.transactionHash
                    });
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
                    
                    // Track unstaking history
                    if (!stakingHistory[from]) {
                        stakingHistory[from] = [];
                    }
                    stakingHistory[from].push({
                        timestamp,
                        amount: Math.max(0, stakingData[from]), // Current total after this unstake
                        type: 'unstake',
                        txHash: log.transactionHash
                    });
                    
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

    return { stakingData, appchainData, dailyTrends, stakingHistory };
}

// Calculate statistics
function calculateStats(stakingData, appchainData, stakingHistory = {}) {
    const stadiumData = appchainData[CONFIG.STADIUM_APPCHAIN_ID] || { 
        total: 0, 
        stakers: [] 
    };
    
    const totalStaked = stadiumData.total;
    const totalStakers = stadiumData.stakers.length;

    // Top 10 stakers with quality scores
    const top10 = Object.entries(stakingData)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([address, amount], index) => {
            const history = stakingHistory[address] || [];
            const quality = calculateNodeQuality(history);
            return {
                rank: index + 1,
                address,
                amount,
                percentage: (amount / totalStaked) * 100,
                quality: quality
            };
        });
    
    // All stakers with quality (for node details)
    const allStakers = Object.entries(stakingData)
        .map(([address, amount]) => {
            const history = stakingHistory[address] || [];
            const quality = calculateNodeQuality(history);
            return {
                address,
                amount,
                percentage: (amount / totalStaked) * 100,
                quality: quality,
                history: history.slice(-20) // Last 20 transactions
            };
        })
        .sort((a, b) => b.amount - a.amount);

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

    const appchainPoolEmissionPerEpoch = EPOCH_INFO.totalEmissionPerEpoch * EPOCH_INFO.appchainPoolShare;
    const stadiumEmissionShare = networkShare / 100;
    const stadiumEmissionPerEpoch = appchainPoolEmissionPerEpoch * stadiumEmissionShare;
    const stadiumEmissionPerDay = stadiumEmissionPerEpoch / EPOCH_INFO.durationDays;

    // Define goals/milestones
    const goals = [
        { amount: 250000, label: '250K SYND', reached: totalStaked >= 250000 },
        { amount: 500000, label: '500K SYND', reached: totalStaked >= 500000 },
        { amount: 1000000, label: '1M SYND', reached: totalStaked >= 1000000 }
    ];
    
    // Find current goal (next unreached milestone)
    const currentGoal = goals.find(g => !g.reached) || goals[goals.length - 1];
    const progressToGoal = currentGoal ? (totalStaked / currentGoal.amount) * 100 : 100;

    return {
        stadium: {
            totalStaked,
            totalStakers,
            rank: stadiumRank,
            networkShare
        },
        top10,
        allStakers, // Include all stakers for node details
        ecosystem: ecosystemRankings.map((item, index) => ({
            ...item,
            rank: index + 1,
            share: totalNetworkStaked > 0 ? (item.total / totalNetworkStaked) * 100 : 0
        })),
        goals: {
            current: currentGoal,
            all: goals,
            progress: Math.min(100, progressToGoal)
        },
        emissions: {
            epochNumber: EPOCH_INFO.number,
            epochDurationDays: EPOCH_INFO.durationDays,
            totalEmissionPerEpoch: EPOCH_INFO.totalEmissionPerEpoch,
            appchainPoolShare: EPOCH_INFO.appchainPoolShare,
            appchainPoolEmissionPerEpoch,
            stadiumShareOfPool: stadiumEmissionShare,
            stadiumEmissionPerEpoch,
            stadiumEmissionPerDay
        }
    };
}

// Main data fetching function
async function fetchStakingData() {
    try {
        console.log('Fetching staking data...');
        const logs = await fetchLogsFromAPI();
        console.log(`Fetched ${logs.length} logs`);

        const { stakingData, appchainData, dailyTrends, stakingHistory } = processStakingData(logs);
        const stats = calculateStats(stakingData, appchainData, stakingHistory);
        
        // Fetch SYND price data
        let priceData = null;
        try {
            priceData = await fetchSYNDPrice();
            console.log('SYND price fetched:', priceData);
            
            // Calculate USD values for emissions if price is available
            if (priceData && priceData.price > 0 && stats.emissions) {
                const syndPrice = priceData.price;
                stats.emissions.stadiumEmissionPerEpochUSD = stats.emissions.stadiumEmissionPerEpoch * syndPrice;
                stats.emissions.stadiumEmissionPerDayUSD = stats.emissions.stadiumEmissionPerDay * syndPrice;
                stats.emissions.stadiumEmissionPerMonthUSD = stats.emissions.stadiumEmissionPerEpochUSD; // Per epoch = per month
            }
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
        
        // Check if we should take a snapshot
        if (shouldTakeSnapshot()) {
            const today = new Date().toISOString().split('T')[0];
            const alreadySnapped = snapshots.some(s => s.date === today);
            if (!alreadySnapped) {
                takeSnapshot(stats);
            }
        }

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

// Node details endpoint
app.get('/api/node/:address', async (req, res) => {
    try {
        const address = req.params.address.toLowerCase();
        console.log(`Looking up node: ${address}`);
        
        // Check cache first
        const now = Date.now();
        if (cache.data && cache.timestamp && (now - cache.timestamp < cache.ttl)) {
            // Try allStakers first
            let node = cache.data.allStakers?.find(s => 
                s.address.toLowerCase() === address
            );
            
            // Fallback to top10 if not in allStakers
            if (!node) {
                node = cache.data.top10?.find(s => 
                    s.address.toLowerCase() === address
                );
                if (node) {
                    // Add basic quality if missing
                    if (!node.quality) {
                        node.quality = { score: 0, activeEpochs: 0, totalEpochs: 0 };
                    }
                    if (!node.history) {
                        node.history = [];
                    }
                }
            }
            
            if (node) {
                console.log(`Node found in cache: ${address}`);
                return res.json({ ...node, cached: true });
            }
        }

        // Fetch fresh data if not in cache or cache expired
        console.log('Fetching fresh data for node lookup...');
        const stats = await fetchStakingData();
        
        // Try allStakers first
        let node = stats.allStakers?.find(s => 
            s.address.toLowerCase() === address
        );
        
        // Fallback to top10 if not in allStakers
        if (!node) {
            node = stats.top10?.find(s => 
                s.address.toLowerCase() === address
            );
            if (node) {
                // Add basic quality if missing
                if (!node.quality) {
                    node.quality = { score: 0, activeEpochs: 0, totalEpochs: 0 };
                }
                if (!node.history) {
                    node.history = [];
                }
            }
        }
        
        if (node) {
            console.log(`Node found in fresh data: ${address}`);
            res.json({ ...node, cached: false });
        } else {
            console.log(`Node not found: ${address}`);
            console.log('Available addresses in allStakers:', stats.allStakers?.slice(0, 5).map(s => s.address));
            console.log('Available addresses in top10:', stats.top10?.slice(0, 5).map(s => s.address));
            res.status(404).json({ 
                error: 'Node not found',
                address: req.params.address
            });
        }
    } catch (error) {
        console.error('Node API Error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch node data',
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

// Snapshots endpoint
app.get('/api/snapshots', (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 52;
        const sortedSnapshots = [...snapshots].sort((a, b) => 
            new Date(b.date) - new Date(a.date)
        );
        res.json({
            snapshots: sortedSnapshots.slice(0, limit),
            total: snapshots.length
        });
    } catch (error) {
        console.error('Snapshots API Error:', error);
        res.status(500).json({ 
            error: 'Failed to fetch snapshots',
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
        },
        snapshots: {
            count: snapshots.length,
            latest: snapshots.length > 0 ? snapshots[snapshots.length - 1].date : null
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
