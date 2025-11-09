const fetch = require('node-fetch');

// Configuration
const CONFIG = {
    STADIUM_APPCHAIN_ID: 574014,
    CONTRACT_ADDRESS: '0xF9637B60f27AF139FC46EAa655cFBbe4E731BCdF',
    API_BASE_URL: 'https://commons.explorer.syndicate.io/api',
    STAKE_EVENT_TOPIC: '0x8b0e0cd1a643dbca06e3965f856008e9d2348d5ee6b547e4b1e6e25c172da0ca'
};

const EPOCH_INFO = {
    number: 1,
    durationDays: 30,
    totalEmissionPerEpoch: 1666667,
    basePoolShare: 0.30,
    performancePoolShare: 0.30,
    appchainPoolShare: 0.40
};

// Cache
let cache = {
    data: null,
    timestamp: null,
    ttl: 5 * 60 * 1000 // 5 minutes
};

async function fetchLogsFromAPI() {
    const params = new URLSearchParams({
        module: 'logs',
        action: 'getLogs',
        address: CONFIG.CONTRACT_ADDRESS,
        fromBlock: '0',
        toBlock: 'latest',
        topic0: CONFIG.STAKE_EVENT_TOPIC
    });

    const url = `${CONFIG.API_BASE_URL}?${params}`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.status === '1' && data.result) {
        return data.result;
    }
    throw new Error('Failed to fetch logs from API');
}

function processStakingData(logs) {
    const stakingData = {};
    const appchainData = {};

    logs.forEach(log => {
        try {
            const topics = log.topics;
            const data = log.data;

            const from = '0x' + topics[1].slice(-40);
            const toAppchainId = parseInt(topics[2], 16);
            const amount = parseInt(data, 16) / 1e18;

            if (!appchainData[toAppchainId]) {
                appchainData[toAppchainId] = {
                    total: 0,
                    stakers: new Set()
                };
            }
            appchainData[toAppchainId].total += amount;
            appchainData[toAppchainId].stakers.add(from);

            if (toAppchainId === CONFIG.STADIUM_APPCHAIN_ID) {
                if (!stakingData[from]) {
                    stakingData[from] = 0;
                }
                stakingData[from] += amount;
            }
        } catch (error) {
            console.error('Error processing log:', error);
        }
    });

    // Convert Sets to arrays
    Object.keys(appchainData).forEach(key => {
        appchainData[key].stakers = Array.from(appchainData[key].stakers);
    });

    return { stakingData, appchainData };
}

function calculateStats(stakingData, appchainData) {
    const stadiumData = appchainData[CONFIG.STADIUM_APPCHAIN_ID] || { 
        total: 0, 
        stakers: [] 
    };
    
    const totalStaked = stadiumData.total;
    const totalStakers = stadiumData.stakers.length;

    const top10 = Object.entries(stakingData)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([address, amount], index) => ({
            rank: index + 1,
            address,
            amount,
            percentage: (amount / totalStaked) * 100
        }));

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
            share: totalNetworkStaked > 0 ? (item.total / totalNetworkStaked) * 100 : 0
        })),
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

exports.handler = async function(event, context) {
    // CORS headers
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
    };

    // Handle OPTIONS request
    if (event.httpMethod === 'OPTIONS') {
        return {
            statusCode: 200,
            headers,
            body: ''
        };
    }

    try {
        // Check cache
        const now = Date.now();
        if (cache.data && cache.timestamp && (now - cache.timestamp < cache.ttl)) {
            console.log('Returning cached data');
            return {
                statusCode: 200,
                headers,
                body: JSON.stringify({
                    ...cache.data,
                    cached: true,
                    cacheAge: Math.floor((now - cache.timestamp) / 1000)
                })
            };
        }

        // Fetch fresh data
        console.log('Fetching fresh data...');
        const logs = await fetchLogsFromAPI();
        const { stakingData, appchainData } = processStakingData(logs);
        const stats = calculateStats(stakingData, appchainData);
        
        // Update cache
        cache.data = stats;
        cache.timestamp = now;

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                ...stats,
                cached: false,
                timestamp: now
            })
        };
    } catch (error) {
        console.error('Function error:', error);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ 
                error: 'Failed to fetch staking data',
                message: error.message 
            })
        };
    }
};
