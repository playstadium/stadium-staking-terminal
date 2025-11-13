const express = require('express');
const cors = require('cors');
const compression = require('compression');
const fetch = require('node-fetch');
const path = require('path');
const { runWalletAudit } = require('./monitoring/walletAudit');

let kv;
try {
    ({ kv } = require('@vercel/kv'));
} catch (error) {
    console.warn('Vercel KV module not available:', error.message);
}

let Redis;
try {
    Redis = require('ioredis');
} catch (error) {
    console.warn('ioredis module not available:', error.message);
}

const KV_ENABLED = Boolean(
    kv &&
    ((process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
     (process.env.KV_URL && process.env.KV_REST_API_TOKEN))
);
const REDIS_URL = process.env.stadium_terminal_REDIS_URL ||
    process.env.STADIUM_TERMINAL_REDIS_URL ||
    process.env.REDIS_URL;
const REDIS_ENABLED = Boolean(Redis && REDIS_URL);
let redisClient = null;

if (REDIS_ENABLED) {
    redisClient = new Redis(REDIS_URL, {
        lazyConnect: true,
        maxRetriesPerRequest: 1
    });
    redisClient.on('error', (error) => {
        console.error('Redis error:', error);
    });
}

const STORAGE_MODE = KV_ENABLED ? 'kv' : (REDIS_ENABLED ? 'redis' : 'memory');
const PERSISTENCE_ENABLED = STORAGE_MODE !== 'memory';
const SNAPSHOT_LIMIT = 52;
const SNAPSHOT_LIST_KEY = 'snapshots:list';
const SNAPSHOT_ITEM_PREFIX = 'snapshot:';

const app = express();
const PORT = process.env.PORT || 3000;

// Configuration
const CONFIG = {
    STADIUM_APPCHAIN_ID: 574014,
    CONTRACT_ADDRESS: '0xF9637B60f27AF139FC46EAa655cFBbe4E731BCdF',
    API_BASE_URL: 'https://commons.explorer.syndicate.io/api',
    STAKE_EVENT_TOPIC: '0x507ac39eb33610191cd8fd54286e91c5cc464c262861643be3978f5a9f18ab02',
    SYND_CONTRACT_ADDRESS: '0x11dc28d01984079b7efe7763b533e6ed9e3722b9',
    SYND_POOL_ADDRESS: '0xa6f77321b8726faab89b72f28c2603b667448bc2',
    SYND_NETWORK: 'base', // BASE network, not Ethereum
    GECKO_TERMINAL_API: 'https://api.geckoterminal.com/api/v2'
};

const DEFAULT_MONITORED_ADDRESSES = [
    '0xe961c0a8a86e4cb3aa32380d67a45dce46bd573c',
    '0x74b86da31f5df6bf974a3088297d95ff6b377f80',
    '0x9db82c2c62a829d96a03275d379276945809df24',
    '0xc1d9c61fb7b618ad40f082fad09c74d476d07a80',
    '0x5b78ace197872a4c90bb137d0643aa3755dbc1a0',
    '0x57387d1215c1e0d6b12d019265193653f812f2b7',
    '0x2efba4ccd1aee02c9f37467ac281465d688e6469',
    '0xb9c0aba138b98656ffea4309bfe2881b0b7c1d96',
    '0x23cb5f48fa3f4502232f3442637f90e8e3355701',
    '0x6834113a573db3a81696d08a64917ca0290bd3ef'
];

function parseAddressList(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    return value
        .split(',')
        .map(addr => addr.trim())
        .filter(Boolean);
}

const AUDIT_CONFIG = {
    enabled: process.env.AUDIT_ENABLED !== 'false',
    intervalMs: Number(process.env.AUDIT_INTERVAL_MS) || (15 * 60 * 1000),
    monitoredAddresses: parseAddressList(process.env.AUDIT_ADDRESSES),
    maxAddresses: Number(process.env.AUDIT_MAX_ADDRESSES) || 60,
    maxEventsPerAddress: Number(process.env.AUDIT_EVENTS_PER_ADDRESS) || 25
};

if (AUDIT_CONFIG.monitoredAddresses.length === 0) {
    AUDIT_CONFIG.monitoredAddresses = DEFAULT_MONITORED_ADDRESSES;
}

let latestAudit = {
    status: AUDIT_CONFIG.enabled ? 'idle' : 'disabled',
    updatedAt: null,
    trigger: null,
    data: null,
    error: null
};

let auditRunning = false;
let auditIntervalHandle = null;

const EPOCH_INFO = {
    number: 1,
    durationDays: 30,
    totalEmissionPerEpoch: 1666667,
    basePoolShare: 0.30,
    performancePoolShare: 0.30,
    appchainPoolShare: 0.40
};

// Middleware
app.use(compression());
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

// Snapshot storage (with optional Vercel KV persistence)
let snapshots = [];
let snapshotsLoaded = false;

if (STORAGE_MODE === 'kv') {
    console.log('📦 Vercel KV persistence enabled for snapshots');
} else if (STORAGE_MODE === 'redis') {
    console.log('📦 Redis persistence enabled for snapshots');
} else {
    console.log('📦 Using in-memory snapshot storage (non-persistent)');
}

// Check if it's Friday and time to take a snapshot
function shouldTakeSnapshot() {
    const now = new Date();
    const dayOfWeek = now.getDay(); // 0 = Sunday, 5 = Friday
    const hour = now.getHours();
    
    // Take snapshot on Friday at 12:00 PM (noon)
    return dayOfWeek === 5 && hour === 12;
}

function getMostRecentFriday() {
    const now = new Date();
    now.setUTCHours(0, 0, 0, 0);
    const day = now.getUTCDay(); // 0 Sunday ... 5 Friday
    const diff = (day >= 5) ? day - 5 : day + 2; // days since Friday
    now.setUTCDate(now.getUTCDate() - diff);
    return now.toISOString().split('T')[0];
}

async function ensureSnapshotsLoadedFromStorage(force = false) {
    if (!PERSISTENCE_ENABLED) return;
    if (snapshotsLoaded && !force) return;
    
    const { snapshots: storedSnapshots } = await fetchSnapshotsFromStorage(SNAPSHOT_LIMIT);
    snapshots = storedSnapshots
        .slice()
        .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    snapshotsLoaded = true;
}

async function fetchSnapshotsFromStorage(limit = SNAPSHOT_LIMIT) {
    if (!PERSISTENCE_ENABLED) {
        const ordered = snapshots
            .slice()
            .sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
        return {
            snapshots: ordered.slice(0, limit),
            total: snapshots.length
        };
    }

    if (STORAGE_MODE === 'kv') {
        try {
            const total = await kv.zcard(SNAPSHOT_LIST_KEY);
            if (!total || total <= 0) {
                return { snapshots: [], total: 0 };
            }

            const rangeLimit = Math.min(limit, total) - 1;
            const dates = await kv.zrange(
                SNAPSHOT_LIST_KEY,
                0,
                rangeLimit >= 0 ? rangeLimit : 0,
                { rev: true }
            );

            if (!dates || dates.length === 0) {
                return { snapshots: [], total };
            }

            const items = await Promise.all(
                dates.map(date => kv.get(`${SNAPSHOT_ITEM_PREFIX}${date}`))
            );

            const validSnapshots = [];
            items.forEach((snapshot) => {
                if (!snapshot) return;
                validSnapshots.push(snapshot);
            });

            validSnapshots.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

            return {
                snapshots: validSnapshots,
                total
            };
        } catch (error) {
            console.error('Error fetching snapshots from KV:', error);
            return { snapshots: [], total: 0 };
        }
    }

    if (STORAGE_MODE === 'redis') {
        try {
            if (redisClient.status === 'wait') {
                await redisClient.connect();
            }

            const total = await redisClient.zcard(SNAPSHOT_LIST_KEY);
            if (!total || total <= 0) {
                return { snapshots: [], total: 0 };
            }

            const rangeLimit = Math.min(limit, total) - 1;
            const dates = await redisClient.zrevrange(
                SNAPSHOT_LIST_KEY,
                0,
                rangeLimit >= 0 ? rangeLimit : 0
            );

            if (!dates || dates.length === 0) {
                return { snapshots: [], total };
            }

            const keys = dates.map(date => `${SNAPSHOT_ITEM_PREFIX}${date}`);
            const items = await redisClient.mget(keys);

            const validSnapshots = [];
            items.forEach((raw, idx) => {
                if (!raw) return;
                try {
                    const parsed = JSON.parse(raw);
                    if (parsed) {
                        validSnapshots.push(parsed);
                    }
                } catch (error) {
                    console.error(`Error parsing snapshot ${dates[idx]} from Redis:`, error);
                }
            });

            validSnapshots.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

            return {
                snapshots: validSnapshots,
                total
            };
        } catch (error) {
            console.error('Error fetching snapshots from Redis:', error);
            return { snapshots: [], total: 0 };
        }
    }

    return { snapshots: [], total: 0 };
}

async function pruneSnapshotsInStorage(limit = SNAPSHOT_LIMIT) {
    if (!PERSISTENCE_ENABLED) return;

    if (STORAGE_MODE === 'kv') {
        try {
            const total = await kv.zcard(SNAPSHOT_LIST_KEY);
            if (!total || total <= limit) return;

            const removeCount = total - limit;
            const datesToRemove = await kv.zrange(
                SNAPSHOT_LIST_KEY,
                0,
                removeCount - 1
            );

            if (!datesToRemove || datesToRemove.length === 0) return;

            const pipeline = kv.pipeline();
            datesToRemove.forEach(date => {
                pipeline.del(`${SNAPSHOT_ITEM_PREFIX}${date}`);
            });
            pipeline.zrem(SNAPSHOT_LIST_KEY, ...datesToRemove);
            await pipeline.exec();
        } catch (error) {
            console.error('Error pruning snapshots in KV:', error);
        }
        return;
    }

    if (STORAGE_MODE === 'redis') {
        try {
            if (redisClient.status === 'wait') {
                await redisClient.connect();
            }

            const total = await redisClient.zcard(SNAPSHOT_LIST_KEY);
            if (!total || total <= limit) return;

            const removeCount = total - limit;
            const datesToRemove = await redisClient.zrange(
                SNAPSHOT_LIST_KEY,
                0,
                removeCount - 1
            );

            if (!datesToRemove || datesToRemove.length === 0) return;

            const pipeline = redisClient.multi();
            datesToRemove.forEach(date => {
                pipeline.del(`${SNAPSHOT_ITEM_PREFIX}${date}`);
            });
            pipeline.zrem(SNAPSHOT_LIST_KEY, ...datesToRemove);
            await pipeline.exec();
        } catch (error) {
            console.error('Error pruning snapshots in Redis:', error);
        }
    }
}

async function persistSnapshotToStorage(snapshot) {
    if (!PERSISTENCE_ENABLED) return;

    if (STORAGE_MODE === 'kv') {
        try {
            const pipeline = kv.pipeline();
            pipeline.set(`${SNAPSHOT_ITEM_PREFIX}${snapshot.date}`, snapshot);
            pipeline.zadd(SNAPSHOT_LIST_KEY, {
                score: snapshot.timestamp,
                member: snapshot.date
            });
            await pipeline.exec();

            await pruneSnapshotsInStorage(SNAPSHOT_LIMIT);
        } catch (error) {
            console.error('Error persisting snapshot to KV:', error);
        }
        return;
    }

    if (STORAGE_MODE === 'redis') {
        try {
            if (redisClient.status === 'wait') {
                await redisClient.connect();
            }

            const pipeline = redisClient.multi();
            pipeline.set(`${SNAPSHOT_ITEM_PREFIX}${snapshot.date}`, JSON.stringify(snapshot));
            pipeline.zadd(SNAPSHOT_LIST_KEY, snapshot.timestamp || Date.now(), snapshot.date);
            await pipeline.exec();

            await pruneSnapshotsInStorage(SNAPSHOT_LIMIT);
        } catch (error) {
            console.error('Error persisting snapshot to Redis:', error);
        }
    }
}

async function hasSnapshotForDate(date) {
    if (STORAGE_MODE === 'kv') {
        try {
            const existing = await kv.get(`${SNAPSHOT_ITEM_PREFIX}${date}`);
            return Boolean(existing);
        } catch (error) {
            console.error('Error checking snapshot existence in KV:', error);
            return false;
        }
    }

    if (STORAGE_MODE === 'redis') {
        try {
            if (redisClient.status === 'wait') {
                await redisClient.connect();
            }
            const existing = await redisClient.exists(`${SNAPSHOT_ITEM_PREFIX}${date}`);
            return existing === 1;
        } catch (error) {
            console.error('Error checking snapshot existence in Redis:', error);
            return false;
        }
    }

    return snapshots.some(s => s.date === date);
}

// Take a snapshot of top 10
async function takeSnapshot(stats, options = {}) {
    const { date: overrideDate, timestamp: overrideTimestamp } = options;
    const dateISO = overrideDate || new Date().toISOString().split('T')[0];
    let computedTimestamp = overrideTimestamp ?? new Date(`${dateISO}T12:00:00Z`).getTime();
    if (!Number.isFinite(computedTimestamp)) {
        computedTimestamp = Date.now();
    }

    const snapshot = {
        date: dateISO, // YYYY-MM-DD
        timestamp: computedTimestamp,
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
    
    await ensureSnapshotsLoadedFromStorage();

    snapshots = snapshots.filter(s => s.date !== snapshot.date);
    snapshots.push(snapshot);
    snapshots.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
    
    // Keep only last 52 snapshots (1 year of weekly data)
    if (snapshots.length > SNAPSHOT_LIMIT) {
        snapshots = snapshots.slice(-SNAPSHOT_LIMIT);
    }
    snapshotsLoaded = true;

    await persistSnapshotToStorage(snapshot);
    
    console.log(`📸 Snapshot taken: ${snapshot.date} - ${snapshot.totalStaked.toFixed(2)} SYND staked`);

    return snapshot;
}

// Check for snapshot on startup and set up weekly check
let lastSnapshotCheck = Date.now();
setInterval(async () => {
    const now = Date.now();
    // Check every hour
    if (now - lastSnapshotCheck > 60 * 60 * 1000) {
        lastSnapshotCheck = now;
        if (shouldTakeSnapshot()) {
            // Check if we already took a snapshot today
            const today = new Date().toISOString().split('T')[0];
            try {
                const alreadySnapped = await hasSnapshotForDate(today);
                
                if (!alreadySnapped && cache.data) {
                    await takeSnapshot(cache.data);
                }
            } catch (error) {
                console.error('Error during scheduled snapshot check:', error);
            }
        }
    }
}, 60 * 60 * 1000); // Check every hour

// Fetch SYND price data from GeckoTerminal ONLY (no CoinGecko)
// NOTE: We ONLY use GeckoTerminal API - never CoinGecko or any other price API
async function fetchSYNDPrice() {
    try {
        // GeckoTerminal API format: /simple/networks/{network}/token_price/{addresses}
        // Using BASE network, not Ethereum
        const url = `${CONFIG.GECKO_TERMINAL_API}/simple/networks/${CONFIG.SYND_NETWORK}/token_price/${CONFIG.SYND_CONTRACT_ADDRESS}`;
        console.log('Fetching SYND price from GeckoTerminal:', url);
        
        const response = await fetch(url);
        const data = await response.json();
        
        console.log('GeckoTerminal API response:', JSON.stringify(data, null, 2));
        
        if (data.data && data.data.attributes) {
            const attributes = data.data.attributes;
            const currentPrice = parseFloat(attributes.token_prices[CONFIG.SYND_CONTRACT_ADDRESS]) || 0;
            
            // Calculate price history for past 24 hours
            // We'll use hourly OHLC data from the pool and calculate 24 evenly-spaced points
            // Always use real-time current price for the most recent point
            let priceHistory = [];
            const now = Date.now();
            const twentyFourHoursAgo = now - (24 * 60 * 60 * 1000);
            
            try {
                // Fetch hourly OHLC data from GeckoTerminal using pool address
                // Format: /networks/{network}/pools/{pool_address}/ohlcv/{timeframe}
                const historyUrl = `${CONFIG.GECKO_TERMINAL_API}/networks/${CONFIG.SYND_NETWORK}/pools/${CONFIG.SYND_POOL_ADDRESS}/ohlcv/hour`;
                console.log('Fetching historical data from GeckoTerminal:', historyUrl);
                
                const historyResponse = await fetch(historyUrl);
                const historyData = await historyResponse.json();
                
                console.log('GeckoTerminal historical data response:', JSON.stringify(historyData, null, 2));
                
                if (historyData.data && historyData.data.attributes && historyData.data.attributes.ohlcv_list) {
                    // Process all available hourly data from pool OHLC
                    // Format: [[timestamp, open, high, low, close, volume], ...]
                    const allHistory = historyData.data.attributes.ohlcv_list
                        .map(([timestamp, open, high, low, close, volume]) => {
                            const ts = timestamp < 10000000000 ? timestamp * 1000 : timestamp;
                            const price = parseFloat(close) || parseFloat(high) || parseFloat(low) || parseFloat(open);
                            if (!price || isNaN(price) || price <= 0) return null;
                            return { timestamp: ts, price: price };
                        })
                        .filter(item => item !== null && item.timestamp >= twentyFourHoursAgo)
                        .sort((a, b) => a.timestamp - b.timestamp);
                    
                    // Calculate 24 evenly-spaced hourly intervals over the past 24 hours
                    const hourlyInterval = 60 * 60 * 1000; // 1 hour in milliseconds
                    const calculatedHistory = [];
                    
                    for (let i = 0; i < 24; i++) {
                        const targetTime = twentyFourHoursAgo + (i * hourlyInterval);
                        
                        // Find the closest historical data point to this target time
                        let closestPrice = currentPrice; // Default to current price
                        if (allHistory.length > 0) {
                            const closest = allHistory.reduce((prev, curr) => {
                                return Math.abs(curr.timestamp - targetTime) < Math.abs(prev.timestamp - targetTime) ? curr : prev;
                            });
                            closestPrice = closest.price;
                        }
                        
                        calculatedHistory.push({
                            timestamp: targetTime,
                            price: closestPrice
                        });
                    }
                    
                    // Always use real-time current price for the most recent point (last hour)
                    if (currentPrice > 0) {
                        calculatedHistory[calculatedHistory.length - 1] = {
                            timestamp: now,
                            price: currentPrice
                        };
                    }
                    
                    priceHistory = calculatedHistory;
                    console.log(`Calculated ${priceHistory.length} price points for past 24 hours using real-time price: ${currentPrice}`);
                } else {
                    console.warn('GeckoTerminal historical data format unexpected');
                    // Fallback: create 24 points with current price
                    if (currentPrice > 0) {
                        for (let i = 0; i < 24; i++) {
                            priceHistory.push({
                                timestamp: twentyFourHoursAgo + (i * 60 * 60 * 1000),
                                price: currentPrice
                            });
                        }
                    }
                }
            } catch (historyError) {
                console.warn('Could not fetch historical data from GeckoTerminal:', historyError.message);
                // Fallback: create 24 points with current real-time price
                if (currentPrice > 0) {
                    for (let i = 0; i < 24; i++) {
                        priceHistory.push({
                            timestamp: twentyFourHoursAgo + (i * 60 * 60 * 1000),
                            price: currentPrice
                        });
                    }
                }
            }
            
            return {
                price: currentPrice,
                change24h: null, // GeckoTerminal doesn't provide 24h change in this endpoint
                marketCap: null,
                volume24h: null,
                priceHistory: priceHistory
            };
        }
        
        throw new Error('Failed to fetch SYND price data from GeckoTerminal');
    } catch (error) {
        console.error('Error fetching SYND price from GeckoTerminal:', error);
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

async function performWalletAudit(trigger = 'manual') {
    if (!AUDIT_CONFIG.enabled) {
        latestAudit = {
            status: 'disabled',
            updatedAt: new Date().toISOString(),
            trigger,
            data: null,
            error: 'Wallet audit disabled via configuration'
        };
        return;
    }

    if (auditRunning) {
        console.log('🔁 Wallet audit already in progress, skipping trigger:', trigger);
        return;
    }

    auditRunning = true;
    const startedAt = Date.now();

    try {
        const data = await runWalletAudit({
            fetchLogs: fetchLogsFromAPI,
            config: CONFIG,
            monitoredAddresses: AUDIT_CONFIG.monitoredAddresses,
            maxAddresses: AUDIT_CONFIG.maxAddresses,
            maxEventsPerAddress: AUDIT_CONFIG.maxEventsPerAddress
        });

        latestAudit = {
            status: 'ok',
            updatedAt: new Date().toISOString(),
            trigger,
            durationMs: Date.now() - startedAt,
            data,
            error: null
        };

        const missing = data.summary?.monitoredAddressesMissing || [];
        const missingNote = missing.length ? ` | Missing monitored addresses: ${missing.join(', ')}` : '';
        console.log(`🔍 Wallet audit (${trigger}) completed in ${latestAudit.durationMs}ms${missingNote}`);
    } catch (error) {
        latestAudit = {
            status: 'error',
            updatedAt: new Date().toISOString(),
            trigger,
            durationMs: Date.now() - startedAt,
            data: null,
            error: error.message
        };
        console.error('❌ Wallet audit failed:', error);
    } finally {
        auditRunning = false;
    }
}

if (AUDIT_CONFIG.enabled) {
    performWalletAudit('startup').catch(error => {
        console.error('❌ Initial wallet audit failed:', error);
    });
    auditIntervalHandle = setInterval(() => {
        performWalletAudit('interval').catch(err => {
            console.error('❌ Wallet audit interval failure:', err);
        });
    }, AUDIT_CONFIG.intervalMs);

    if (typeof auditIntervalHandle.unref === 'function') {
        auditIntervalHandle.unref();
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
    const performancePoolEmissionPerEpoch = EPOCH_INFO.totalEmissionPerEpoch * EPOCH_INFO.performancePoolShare;
    const basePoolEmissionPerEpoch = EPOCH_INFO.totalEmissionPerEpoch * EPOCH_INFO.basePoolShare;
    const stadiumEmissionShare = networkShare / 100;
    const stadiumEmissionPerEpoch = appchainPoolEmissionPerEpoch * stadiumEmissionShare;
    const stadiumEmissionPerDay = stadiumEmissionPerEpoch / EPOCH_INFO.durationDays;
    const stadiumPerformancePerEpoch = performancePoolEmissionPerEpoch * stadiumEmissionShare;
    const stadiumPerformancePerDay = stadiumPerformancePerEpoch / EPOCH_INFO.durationDays;
    const stadiumBasePerEpoch = basePoolEmissionPerEpoch * stadiumEmissionShare;
    const stadiumBasePerDay = stadiumBasePerEpoch / EPOCH_INFO.durationDays;

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
            basePoolShare: EPOCH_INFO.basePoolShare,
            performancePoolShare: EPOCH_INFO.performancePoolShare,
            appchainPoolShare: EPOCH_INFO.appchainPoolShare,
            appchainPoolEmissionPerEpoch,
            performancePoolEmissionPerEpoch,
            basePoolEmissionPerEpoch,
            stadiumShareOfPool: stadiumEmissionShare,
            stadiumPerformanceShare: stadiumEmissionShare,
            stadiumEmissionPerEpoch,
            stadiumEmissionPerDay,
            stadiumPerformancePerEpoch,
            stadiumPerformancePerDay,
            stadiumBasePerEpoch,
            stadiumBasePerDay
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
                stats.emissions.stadiumPerformancePerEpochUSD = (stats.emissions.stadiumPerformancePerEpoch || 0) * syndPrice;
                stats.emissions.stadiumPerformancePerDayUSD = (stats.emissions.stadiumPerformancePerDay || 0) * syndPrice;
                stats.emissions.stadiumBasePerEpochUSD = (stats.emissions.stadiumBasePerEpoch || 0) * syndPrice;
                stats.emissions.stadiumBasePerDayUSD = (stats.emissions.stadiumBasePerDay || 0) * syndPrice;
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
            const alreadySnapped = await hasSnapshotForDate(today);
            if (!alreadySnapped) {
                await takeSnapshot(stats);
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

app.get('/api/audit', (req, res) => {
    res.json({
        config: {
            enabled: AUDIT_CONFIG.enabled,
            intervalMs: AUDIT_CONFIG.intervalMs,
            monitoredAddresses: AUDIT_CONFIG.monitoredAddresses,
            maxAddresses: AUDIT_CONFIG.maxAddresses,
            maxEventsPerAddress: AUDIT_CONFIG.maxEventsPerAddress
        },
        audit: latestAudit
    });
});

app.post('/api/audit/run', async (req, res) => {
    if (!AUDIT_CONFIG.enabled) {
        return res.status(503).json({
            error: 'Wallet audit disabled via configuration'
        });
    }

    try {
        await performWalletAudit('manual');
        res.json({
            status: latestAudit.status,
            audit: latestAudit
        });
    } catch (error) {
        res.status(500).json({
            error: 'Failed to execute wallet audit',
            message: error.message
        });
    }
});

// Manual snapshot endpoint
app.post('/api/snapshots/manual', async (req, res) => {
    try {
        const secret = process.env.SNAPSHOT_SECRET;
        if (secret) {
            const providedSecret = req.headers['x-snapshot-secret'] || req.body?.secret;
            if (providedSecret !== secret) {
                return res.status(403).json({
                    error: 'Forbidden',
                    message: 'Invalid snapshot secret'
                });
            }
        }

        const requestedDate = (req.body && typeof req.body.date === 'string') ? req.body.date.trim() : '';
        let snapshotDate = requestedDate || getMostRecentFriday();

        if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) {
            return res.status(400).json({
                error: 'Invalid date format',
                message: 'Expected YYYY-MM-DD'
            });
        }

        const snapshotTimestamp = new Date(`${snapshotDate}T12:00:00Z`).getTime();
        if (!Number.isFinite(snapshotTimestamp)) {
            return res.status(400).json({
                error: 'Invalid date',
                message: 'Unable to parse provided date'
            });
        }

        const alreadySnapped = await hasSnapshotForDate(snapshotDate);
        if (alreadySnapped) {
            return res.status(409).json({
                error: 'Snapshot exists',
                message: `Snapshot for ${snapshotDate} already exists`
            });
        }

        let stats;
        const now = Date.now();
        if (req.body && req.body.useCache && cache.data && cache.timestamp && (now - cache.timestamp < cache.ttl)) {
            stats = cache.data;
        } else {
            stats = await fetchStakingData();
            cache.data = stats;
            cache.timestamp = now;
        }

        const snapshot = await takeSnapshot(stats, {
            date: snapshotDate,
            timestamp: snapshotTimestamp
        });

        res.json({
            snapshot,
            persisted: PERSISTENCE_ENABLED
        });
    } catch (error) {
        console.error('Manual snapshot error:', error);
        res.status(500).json({
            error: 'Failed to create snapshot',
            message: error.message
        });
    }
});

// Snapshots endpoint
app.get('/api/snapshots', async (req, res) => {
    try {
        const limitParam = parseInt(req.query.limit, 10);
        const limit = Number.isFinite(limitParam) && limitParam > 0 ? Math.min(limitParam, SNAPSHOT_LIMIT) : SNAPSHOT_LIMIT;

        if (PERSISTENCE_ENABLED) {
            const { snapshots: latestSnapshots, total } = await fetchSnapshotsFromStorage(limit);

            snapshots = latestSnapshots
                .slice()
                .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
            snapshotsLoaded = true;

            return res.json({
                snapshots: latestSnapshots.slice(0, limit),
                total
            });
        }

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
app.get('/api/health', async (req, res) => {
    let snapshotInfo = {
        count: snapshots.length,
        latest: snapshots.length > 0 ? snapshots[snapshots.length - 1].date : null
    };

    if (STORAGE_MODE === 'kv') {
        try {
            const total = await kv.zcard(SNAPSHOT_LIST_KEY);
            let latest = null;

            if (total > 0) {
                const latestDates = await kv.zrange(
                    SNAPSHOT_LIST_KEY,
                    0,
                    0,
                    { rev: true }
                );
                latest = Array.isArray(latestDates) && latestDates.length > 0 ? latestDates[0] : null;
            }

            snapshotInfo = {
                count: total || 0,
                latest
            };
        } catch (error) {
            console.error('Health check snapshot error:', error);
        }
    } else if (STORAGE_MODE === 'redis') {
        try {
            if (redisClient.status === 'wait') {
                await redisClient.connect();
            }

            const total = await redisClient.zcard(SNAPSHOT_LIST_KEY);
            let latest = null;

            if (total > 0) {
                const latestDates = await redisClient.zrevrange(
                    SNAPSHOT_LIST_KEY,
                    0,
                    0
                );
                latest = Array.isArray(latestDates) && latestDates.length > 0 ? latestDates[0] : null;
            }

            snapshotInfo = {
                count: total || 0,
                latest
            };
        } catch (error) {
            console.error('Health check snapshot error (Redis):', error);
        }
    }

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
        snapshots: snapshotInfo
    });
});

// Serve index.html for root
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Start server (local development)
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`🏟️  Stadium Staking Terminal API running on port ${PORT}`);
        console.log(`📊 API endpoint: http://localhost:${PORT}/api/stats`);
        console.log(`🌐 Web interface: http://localhost:${PORT}`);
    });
}

module.exports = app;
