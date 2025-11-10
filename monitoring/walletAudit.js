const WEI = 10n ** 18n;

const STAKE_TOPIC = '0x507ac39eb33610191cd8fd54286e91c5cc464c262861643be3978f5a9f18ab02';
const UNSTAKE_TOPIC = '0x8bd4728ee9ca3f99ddcffa24eb4f15de015cda9a27ccc427dfdaf711943ebca0';
const RESTAKE_TOPIC = '0xb312903ce207d21e84e57d1005e0aa5385b783eb27e258817174d00cfbbc3278';

function normalizeAddress(address) {
    if (!address) return null;
    return address.toLowerCase();
}

function parseUint(hex) {
    if (!hex) return 0n;
    if (!hex.startsWith('0x')) {
        hex = '0x' + hex;
    }
    return BigInt(hex);
}

function parseAddress(word) {
    if (!word) return null;
    return '0x' + word.slice(-40);
}

function getWord(data, index) {
    if (!data) return '';
    const clean = data.startsWith('0x') ? data.slice(2) : data;
    const start = index * 64;
    const end = start + 64;
    return clean.slice(start, end);
}

function formatAmount(valueWei, maxDecimals = 6) {
    if (typeof valueWei === 'string') {
        valueWei = BigInt(valueWei);
    }
    if (typeof valueWei === 'number') {
        valueWei = BigInt(valueWei);
    }

    const sign = valueWei < 0n ? '-' : '';
    let abs = valueWei < 0n ? -valueWei : valueWei;
    const whole = abs / WEI;
    let fraction = abs % WEI;

    if (fraction === 0n) {
        return sign + whole.toString();
    }

    let fractionStr = fraction.toString().padStart(18, '0');
    if (maxDecimals < 18) {
        fractionStr = fractionStr.slice(0, maxDecimals);
    }
    fractionStr = fractionStr.replace(/0+$/, '');

    return fractionStr
        ? `${sign}${whole.toString()}.${fractionStr}`
        : `${sign}${whole.toString()}`;
}

function createEventFromLog(log, appchainId) {
    const topic0 = log.topics[0];
    const blockNumber = parseInt(log.blockNumber, 16);
    const timestamp = parseInt(log.timeStamp, 16) * 1000;
    const txHash = log.transactionHash;
    const data = log.data || '';

    if (topic0 === STAKE_TOPIC) {
        // Data words layout:
        // 0: padding / unused
        // 1: staker address
        // 2: amount
        // 3: to appchain id
        const staker = parseAddress(getWord(data, 1));
        const amountWei = parseUint(getWord(data, 2));
        const toAppchainId = Number(parseUint(getWord(data, 3)));
        if (toAppchainId !== appchainId) return null;

        return {
            direction: 'stake',
            category: 'stake',
            staker,
            amountWei,
            fromAppchainId: null,
            toAppchainId,
            blockNumber,
            timestamp,
            txHash,
            note: `Stake to appchain ${toAppchainId}`
        };
    }

    if (topic0 === UNSTAKE_TOPIC) {
        // Data words layout:
        // 0: staker address
        // 1: from appchain id
        // 2: amount
        const staker = parseAddress(getWord(data, 0));
        const fromAppchainId = Number(parseUint(getWord(data, 1)));
        if (fromAppchainId !== appchainId) return null;
        const amountWei = parseUint(getWord(data, 2));

        return {
            direction: 'unstake',
            category: 'unstake',
            staker,
            amountWei,
            fromAppchainId,
            toAppchainId: null,
            blockNumber,
            timestamp,
            txHash,
            note: `Unstake from appchain ${fromAppchainId}`
        };
    }

    if (topic0 === RESTAKE_TOPIC) {
        // Data words layout:
        // 0: action type
        // 1: staker address
        // 2: amount
        // 3: from appchain id
        // 4: to appchain id
        const actionType = Number(parseUint(getWord(data, 0)));
        const staker = parseAddress(getWord(data, 1));
        const amountWei = parseUint(getWord(data, 2));
        const fromAppchainId = Number(parseUint(getWord(data, 3)));
        const toAppchainId = Number(parseUint(getWord(data, 4)));
        const affectsAppchain = fromAppchainId === appchainId || toAppchainId === appchainId;

        if (!affectsAppchain) return null;

        if (toAppchainId === appchainId && fromAppchainId !== appchainId) {
            return {
                direction: 'stake',
                category: 'restake-in',
                staker,
                amountWei,
                fromAppchainId,
                toAppchainId,
                blockNumber,
                timestamp,
                txHash,
                note: `Restake into appchain ${toAppchainId} from ${fromAppchainId} (action ${actionType})`
            };
        }

        if (fromAppchainId === appchainId && toAppchainId !== appchainId) {
            return {
                direction: 'unstake',
                category: 'restake-out',
                staker,
                amountWei,
                fromAppchainId,
                toAppchainId,
                blockNumber,
                timestamp,
                txHash,
                note: `Restake out of appchain ${fromAppchainId} to ${toAppchainId} (action ${actionType})`
            };
        }

        return null;
    }

    return null;
}

function ensureRecord(map, address) {
    if (!map.has(address)) {
        map.set(address, {
            address,
            balanceWei: 0n,
            totalStakedWei: 0n,
            totalUnstakedWei: 0n,
            stakeCount: 0,
            unstakeCount: 0,
            restakeInCount: 0,
            restakeOutCount: 0,
            events: []
        });
    }
    return map.get(address);
}

function summarizeRecords(records, monitoredSet = null) {
    let totalStakeWei = 0n;
    let totalUnstakeWei = 0n;
    let negativeBalances = 0;
    let zeroBalances = 0;

    records.forEach(record => {
        totalStakeWei += record.totalStakedWei;
        totalUnstakeWei += record.totalUnstakedWei;
        if (record.balanceWei < 0n) negativeBalances += 1;
        if (record.balanceWei === 0n) zeroBalances += 1;
    });

    const missingAddresses = [];
    if (monitoredSet && monitoredSet.size > 0) {
        monitoredSet.forEach(addr => {
            if (!records.has(addr)) {
                missingAddresses.push(addr);
            }
        });
    }

    const netWei = totalStakeWei - totalUnstakeWei;

    return {
        totalStakeWei: totalStakeWei.toString(),
        totalStakeSYND: formatAmount(totalStakeWei),
        totalUnstakeWei: totalUnstakeWei.toString(),
        totalUnstakeSYND: formatAmount(totalUnstakeWei),
        netWei: netWei.toString(),
        netSYND: formatAmount(netWei),
        addressCount: records.size,
        negativeBalanceCount: negativeBalances,
        zeroBalanceCount: zeroBalances,
        monitoredAddressesMissing: missingAddresses
    };
}

function prepareEventOutput(event, runningBalance) {
    return {
        direction: event.direction,
        category: event.category,
        amount: formatAmount(event.amountWei),
        amountWei: event.amountWei.toString(),
        fromAppchainId: event.fromAppchainId,
        toAppchainId: event.toAppchainId,
        blockNumber: event.blockNumber,
        timestampISO: new Date(event.timestamp).toISOString(),
        txHash: event.txHash,
        note: event.note,
        balanceAfter: formatAmount(runningBalance),
        balanceAfterWei: runningBalance.toString()
    };
}

function buildAddressOutput(record, maxEvents) {
    const sortedEvents = record.events
        .slice()
        .sort((a, b) => a.timestamp - b.timestamp);

    const trimmedEvents = sortedEvents.length > maxEvents
        ? sortedEvents.slice(-maxEvents)
        : sortedEvents;

    let runningBalance = 0n;
    const timeline = trimmedEvents.map(event => {
        if (event.direction === 'stake') {
            runningBalance += event.amountWei;
        } else {
            runningBalance -= event.amountWei;
        }
        return prepareEventOutput(event, runningBalance);
    });

    return {
        address: record.address,
        balanceWei: record.balanceWei.toString(),
        balanceSYND: formatAmount(record.balanceWei),
        totalStakedWei: record.totalStakedWei.toString(),
        totalStakedSYND: formatAmount(record.totalStakedWei),
        totalUnstakedWei: record.totalUnstakedWei.toString(),
        totalUnstakedSYND: formatAmount(record.totalUnstakedWei),
        stakeCount: record.stakeCount,
        unstakeCount: record.unstakeCount,
        restakeInCount: record.restakeInCount,
        restakeOutCount: record.restakeOutCount,
        recentEvents: timeline
    };
}

async function runWalletAudit({
    fetchLogs,
    config,
    monitoredAddresses = [],
    maxAddresses = 50,
    maxEventsPerAddress = 20
}) {
    if (typeof fetchLogs !== 'function') {
        throw new Error('fetchLogs function is required for wallet audit');
    }
    if (!config || typeof config.STADIUM_APPCHAIN_ID !== 'number') {
        throw new Error('config with STADIUM_APPCHAIN_ID is required for wallet audit');
    }

    const monitoredSet = new Set(
        (monitoredAddresses || []).map(addr => normalizeAddress(addr)).filter(Boolean)
    );

    const start = Date.now();
    const logs = await fetchLogs();

    const records = new Map();

    logs.forEach(log => {
        const event = createEventFromLog(log, config.STADIUM_APPCHAIN_ID);
        if (!event || !event.staker) return;

        const address = normalizeAddress(event.staker);
        const record = ensureRecord(records, address);

        if (event.direction === 'stake') {
            record.balanceWei += event.amountWei;
            record.totalStakedWei += event.amountWei;
            record.stakeCount += 1;
            if (event.category === 'restake-in') {
                record.restakeInCount += 1;
            }
        } else if (event.direction === 'unstake') {
            record.balanceWei -= event.amountWei;
            record.totalUnstakedWei += event.amountWei;
            record.unstakeCount += 1;
            if (event.category === 'restake-out') {
                record.restakeOutCount += 1;
            }
        }

        record.events.push(event);
    });

    const summary = summarizeRecords(records, monitoredSet);

    const sortedRecords = Array.from(records.values()).sort((a, b) => {
        if (a.balanceWei === b.balanceWei) return 0;
        return a.balanceWei > b.balanceWei ? -1 : 1;
    });

    const outputRecords = [];
    const included = new Set();

    // Include monitored addresses first (preserve order from sorted list)
    sortedRecords.forEach(record => {
        if (monitoredSet.size === 0) return;
        if (monitoredSet.has(record.address)) {
            outputRecords.push(buildAddressOutput(record, maxEventsPerAddress));
            included.add(record.address);
        }
    });

    // Fill with top balances until maxAddresses reached
    for (const record of sortedRecords) {
        if (outputRecords.length >= maxAddresses) break;
        if (included.has(record.address)) continue;
        outputRecords.push(buildAddressOutput(record, maxEventsPerAddress));
        included.add(record.address);
    }

    const durationMs = Date.now() - start;

    return {
        runStartedAt: new Date(start).toISOString(),
        runCompletedAt: new Date().toISOString(),
        durationMs,
        logCount: logs.length,
        summary,
        addresses: outputRecords
    };
}

module.exports = {
    runWalletAudit,
    formatAmount
};

