/**
 * Stadium Chain Emissions Calculator for Google Sheets
 * 
 * This script calculates emissions for:
 * - Appchain Pool (based on stake share)
 * - Performance Pool (based on fee share 40% + stake share 60%)
 * 
 * Usage in Google Sheets:
 * =CALCULATE_APPCHAIN_EMISSIONS(stakeShare, totalEmissionPerEpoch, appchainPoolShare, epochDays)
 * =CALCULATE_PERFORMANCE_EMISSIONS(stakeShare, feeShare, totalEmissionPerEpoch, performancePoolShare, epochDays)
 * =SIMULATE_EMISSIONS(additionalStake, currentStake, totalNetworkStake, transactionsPerDay, feePerTransactionUSD, networkFeesPerDayUSD, totalEmissionPerEpoch, appchainPoolShare, performancePoolShare, epochDays, priceUSD)
 */

// Epoch Configuration Constants
const EPOCH_CONFIG = {
  TOTAL_EMISSION_PER_EPOCH: 1666667,  // SYND tokens per epoch
  EPOCH_DURATION_DAYS: 30,
  APPCHAIN_POOL_SHARE: 0.40,          // 40% of total emissions
  PERFORMANCE_POOL_SHARE: 0.30,       // 30% of total emissions
  BASE_POOL_SHARE: 0.30,              // 30% of total emissions
  PERFORMANCE_FEE_WEIGHT: 0.40,       // 40% weight for fees in performance calculation
  PERFORMANCE_STAKE_WEIGHT: 0.60      // 60% weight for stake in performance calculation
};

/**
 * Calculate Appchain Pool Emissions
 * 
 * @param {number} stakeShare - Stadium's share of total network stake (as percentage, e.g., 5.5 for 5.5%)
 * @param {number} totalEmissionPerEpoch - Total emission per epoch (default: 1666667)
 * @param {number} appchainPoolShare - Appchain pool share (default: 0.40)
 * @param {number} epochDays - Epoch duration in days (default: 30)
 * @return {object} Object with emissions per epoch and per day
 * 
 * Example: =CALCULATE_APPCHAIN_EMISSIONS(5.5)
 */
function CALCULATE_APPCHAIN_EMISSIONS(
  stakeShare,
  totalEmissionPerEpoch,
  appchainPoolShare,
  epochDays
) {
  // Use defaults if not provided
  if (totalEmissionPerEpoch === undefined || totalEmissionPerEpoch === null || totalEmissionPerEpoch === '') {
    totalEmissionPerEpoch = EPOCH_CONFIG.TOTAL_EMISSION_PER_EPOCH;
  }
  if (appchainPoolShare === undefined || appchainPoolShare === null || appchainPoolShare === '') {
    appchainPoolShare = EPOCH_CONFIG.APPCHAIN_POOL_SHARE;
  }
  if (epochDays === undefined || epochDays === null || epochDays === '') {
    epochDays = EPOCH_CONFIG.EPOCH_DURATION_DAYS;
  }
  
  // Convert to numbers
  stakeShare = Number(stakeShare);
  totalEmissionPerEpoch = Number(totalEmissionPerEpoch);
  appchainPoolShare = Number(appchainPoolShare);
  epochDays = Number(epochDays);
  
  // Validate inputs
  if (isNaN(stakeShare) || stakeShare < 0 || stakeShare > 100) {
    return 'ERROR: Stake share must be a number between 0 and 100';
  }
  
  // Calculate appchain pool total emissions
  const appchainPoolEmissionPerEpoch = totalEmissionPerEpoch * appchainPoolShare;
  
  // Calculate Stadium's share (convert percentage to decimal)
  const stakeShareDecimal = stakeShare / 100;
  
  // Calculate Stadium's emissions
  const stadiumEmissionPerEpoch = appchainPoolEmissionPerEpoch * stakeShareDecimal;
  const stadiumEmissionPerDay = stadiumEmissionPerEpoch / epochDays;
  
  return {
    appchainPoolTotalPerEpoch: appchainPoolEmissionPerEpoch,
    stadiumEmissionPerEpoch: stadiumEmissionPerEpoch,
    stadiumEmissionPerDay: stadiumEmissionPerDay,
    stakeShare: stakeShare,
    stakeShareDecimal: stakeShareDecimal
  };
}

/**
 * Calculate Performance Pool Emissions
 * 
 * @param {number} stakeShare - Stadium's share of total network stake (as percentage)
 * @param {number} feeShare - Stadium's share of network fees (as percentage, 0-100)
 * @param {number} totalEmissionPerEpoch - Total emission per epoch (default: 1666667)
 * @param {number} performancePoolShare - Performance pool share (default: 0.30)
 * @param {number} epochDays - Epoch duration in days (default: 30)
 * @return {object} Object with performance emissions per epoch and per day
 * 
 * Example: =CALCULATE_PERFORMANCE_EMISSIONS(5.5, 3.2)
 */
function CALCULATE_PERFORMANCE_EMISSIONS(
  stakeShare,
  feeShare,
  totalEmissionPerEpoch,
  performancePoolShare,
  epochDays
) {
  // Use defaults if not provided
  if (feeShare === undefined || feeShare === null || feeShare === '') {
    feeShare = 0;
  }
  if (totalEmissionPerEpoch === undefined || totalEmissionPerEpoch === null || totalEmissionPerEpoch === '') {
    totalEmissionPerEpoch = EPOCH_CONFIG.TOTAL_EMISSION_PER_EPOCH;
  }
  if (performancePoolShare === undefined || performancePoolShare === null || performancePoolShare === '') {
    performancePoolShare = EPOCH_CONFIG.PERFORMANCE_POOL_SHARE;
  }
  if (epochDays === undefined || epochDays === null || epochDays === '') {
    epochDays = EPOCH_CONFIG.EPOCH_DURATION_DAYS;
  }
  
  // Convert to numbers
  stakeShare = Number(stakeShare);
  feeShare = Number(feeShare);
  totalEmissionPerEpoch = Number(totalEmissionPerEpoch);
  performancePoolShare = Number(performancePoolShare);
  epochDays = Number(epochDays);
  
  // Validate inputs
  if (isNaN(stakeShare) || stakeShare < 0 || stakeShare > 100) {
    return 'ERROR: Stake share must be a number between 0 and 100';
  }
  if (isNaN(feeShare) || feeShare < 0 || feeShare > 100) {
    return 'ERROR: Fee share must be a number between 0 and 100';
  }
  
  // Calculate performance pool total emissions
  const performancePoolEmissionPerEpoch = totalEmissionPerEpoch * performancePoolShare;
  
  // Convert percentages to decimals
  const stakeShareDecimal = stakeShare / 100;
  const feeShareDecimal = feeShare / 100;
  
  // Calculate performance share: 40% fee share + 60% stake share
  const performanceShareDecimal = Math.max(0, Math.min(1, 
    (feeShareDecimal * EPOCH_CONFIG.PERFORMANCE_FEE_WEIGHT) + 
    (stakeShareDecimal * EPOCH_CONFIG.PERFORMANCE_STAKE_WEIGHT)
  ));
  
  // Calculate Stadium's performance emissions
  const stadiumPerformancePerEpoch = performancePoolEmissionPerEpoch * performanceShareDecimal;
  const stadiumPerformancePerDay = stadiumPerformancePerEpoch / epochDays;
  
  return {
    performancePoolTotalPerEpoch: performancePoolEmissionPerEpoch,
    stadiumPerformancePerEpoch: stadiumPerformancePerEpoch,
    stadiumPerformancePerDay: stadiumPerformancePerDay,
    performanceShare: performanceShareDecimal * 100,
    stakeShare: stakeShare,
    feeShare: feeShare,
    stakeWeight: EPOCH_CONFIG.PERFORMANCE_STAKE_WEIGHT * 100,
    feeWeight: EPOCH_CONFIG.PERFORMANCE_FEE_WEIGHT * 100
  };
}

/**
 * Calculate Fee Share from Transaction Data
 * 
 * @param {number} transactionsPerDay - Stadium transactions per day
 * @param {number} feePerTransactionUSD - Fee per transaction in USD
 * @param {number} networkFeesPerDayUSD - Total network fees per day in USD
 * @param {number} epochDays - Epoch duration in days (default: 30)
 * @return {object} Object with fee share and fee calculations
 * 
 * Example: =CALCULATE_FEE_SHARE(220, 0.5, 10000)
 */
function CALCULATE_FEE_SHARE(
  transactionsPerDay,
  feePerTransactionUSD,
  networkFeesPerDayUSD,
  epochDays
) {
  // Use defaults if not provided
  if (epochDays === undefined || epochDays === null || epochDays === '') {
    epochDays = EPOCH_CONFIG.EPOCH_DURATION_DAYS;
  }
  
  // Convert to numbers
  transactionsPerDay = Number(transactionsPerDay);
  feePerTransactionUSD = Number(feePerTransactionUSD);
  networkFeesPerDayUSD = Number(networkFeesPerDayUSD);
  epochDays = Number(epochDays);
  // Calculate Stadium fees
  const stadiumFeesPerDayUSD = transactionsPerDay * feePerTransactionUSD;
  const stadiumFeesPerEpochUSD = stadiumFeesPerDayUSD * epochDays;
  
  // Use the larger of provided network fees or Stadium fees
  const totalNetworkFeesPerDayUSD = Math.max(stadiumFeesPerDayUSD, networkFeesPerDayUSD);
  const totalNetworkFeesPerEpochUSD = totalNetworkFeesPerDayUSD * epochDays;
  
  // Calculate fee share
  const feeShare = totalNetworkFeesPerEpochUSD > 0 
    ? (stadiumFeesPerEpochUSD / totalNetworkFeesPerEpochUSD) * 100 
    : 0;
  
  return {
    stadiumFeesPerDayUSD: stadiumFeesPerDayUSD,
    stadiumFeesPerEpochUSD: stadiumFeesPerEpochUSD,
    totalNetworkFeesPerDayUSD: totalNetworkFeesPerDayUSD,
    totalNetworkFeesPerEpochUSD: totalNetworkFeesPerEpochUSD,
    feeShare: feeShare
  };
}

/**
 * Calculate Stake Share
 * 
 * @param {number} stadiumStake - Stadium's total stake in SYND
 * @param {number} totalNetworkStake - Total network stake in SYND
 * @return {object} Object with stake share calculations
 * 
 * Example: =CALCULATE_STAKE_SHARE(50000, 1000000)
 */
function CALCULATE_STAKE_SHARE(stadiumStake, totalNetworkStake) {
  // Convert to numbers
  stadiumStake = Number(stadiumStake);
  totalNetworkStake = Number(totalNetworkStake);
  
  if (isNaN(stadiumStake) || isNaN(totalNetworkStake) || totalNetworkStake <= 0) {
    return 'ERROR: Total network stake must be greater than 0';
  }
  
  const stakeShare = (stadiumStake / totalNetworkStake) * 100;
  const stakeShareDecimal = stakeShare / 100;
  
  return {
    stadiumStake: stadiumStake,
    totalNetworkStake: totalNetworkStake,
    stakeShare: stakeShare,
    stakeShareDecimal: stakeShareDecimal
  };
}

/**
 * Comprehensive Emission Simulation
 * 
 * Simulates emissions with scaling scenarios for network activity and fees
 * 
 * @param {number} additionalStake - Additional stake to add to Stadium (SYND)
 * @param {number} currentStake - Current Stadium stake (SYND)
 * @param {number} totalNetworkStake - Current total network stake (SYND)
 * @param {number} transactionsPerDay - Stadium transactions per day
 * @param {number} feePerTransactionUSD - Fee per transaction in USD
 * @param {number} networkFeesPerDayUSD - Total network fees per day in USD
 * @param {number} totalEmissionPerEpoch - Total emission per epoch (default: 1666667)
 * @param {number} appchainPoolShare - Appchain pool share (default: 0.40)
 * @param {number} performancePoolShare - Performance pool share (default: 0.30)
 * @param {number} epochDays - Epoch duration in days (default: 30)
 * @param {number} priceUSD - SYND price in USD (optional, for USD calculations)
 * @return {object} Comprehensive emission calculations
 * 
 * Example: =SIMULATE_EMISSIONS(50000, 50000, 1000000, 220, 0.5, 10000, 1666667, 0.4, 0.3, 30, 0.10)
 */
function SIMULATE_EMISSIONS(
  additionalStake,
  currentStake,
  totalNetworkStake,
  transactionsPerDay,
  feePerTransactionUSD,
  networkFeesPerDayUSD,
  totalEmissionPerEpoch,
  appchainPoolShare,
  performancePoolShare,
  epochDays,
  priceUSD
) {
  // Use defaults if not provided
  additionalStake = (additionalStake === undefined || additionalStake === null || additionalStake === '') ? 0 : Number(additionalStake);
  currentStake = (currentStake === undefined || currentStake === null || currentStake === '') ? 0 : Number(currentStake);
  totalNetworkStake = (totalNetworkStake === undefined || totalNetworkStake === null || totalNetworkStake === '') ? 0 : Number(totalNetworkStake);
  transactionsPerDay = (transactionsPerDay === undefined || transactionsPerDay === null || transactionsPerDay === '') ? 0 : Number(transactionsPerDay);
  feePerTransactionUSD = (feePerTransactionUSD === undefined || feePerTransactionUSD === null || feePerTransactionUSD === '') ? 0 : Number(feePerTransactionUSD);
  networkFeesPerDayUSD = (networkFeesPerDayUSD === undefined || networkFeesPerDayUSD === null || networkFeesPerDayUSD === '') ? 0 : Number(networkFeesPerDayUSD);
  totalEmissionPerEpoch = (totalEmissionPerEpoch === undefined || totalEmissionPerEpoch === null || totalEmissionPerEpoch === '') ? EPOCH_CONFIG.TOTAL_EMISSION_PER_EPOCH : Number(totalEmissionPerEpoch);
  appchainPoolShare = (appchainPoolShare === undefined || appchainPoolShare === null || appchainPoolShare === '') ? EPOCH_CONFIG.APPCHAIN_POOL_SHARE : Number(appchainPoolShare);
  performancePoolShare = (performancePoolShare === undefined || performancePoolShare === null || performancePoolShare === '') ? EPOCH_CONFIG.PERFORMANCE_POOL_SHARE : Number(performancePoolShare);
  epochDays = (epochDays === undefined || epochDays === null || epochDays === '') ? EPOCH_CONFIG.EPOCH_DURATION_DAYS : Number(epochDays);
  priceUSD = (priceUSD === undefined || priceUSD === null || priceUSD === '') ? 0 : Number(priceUSD);
  // Calculate new stake totals
  const newStadiumStake = currentStake + additionalStake;
  const newTotalNetworkStake = totalNetworkStake + additionalStake;
  
  // Calculate stake share
  const stakeShareResult = CALCULATE_STAKE_SHARE(newStadiumStake, newTotalNetworkStake);
  if (typeof stakeShareResult === 'string' && stakeShareResult.startsWith('ERROR:')) {
    return stakeShareResult;
  }
  const stakeShare = stakeShareResult.stakeShare;
  
  // Calculate fee share
  const feeShareResult = CALCULATE_FEE_SHARE(
    transactionsPerDay,
    feePerTransactionUSD,
    networkFeesPerDayUSD,
    epochDays
  );
  const feeShare = feeShareResult.feeShare;
  
  // Calculate appchain pool emissions
  const appchainResult = CALCULATE_APPCHAIN_EMISSIONS(
    stakeShare,
    totalEmissionPerEpoch,
    appchainPoolShare,
    epochDays
  );
  
  // Check for errors
  if (typeof appchainResult === 'string' && appchainResult.startsWith('ERROR:')) {
    return appchainResult;
  }
  
  // Calculate performance pool emissions
  const performanceResult = CALCULATE_PERFORMANCE_EMISSIONS(
    stakeShare,
    feeShare,
    totalEmissionPerEpoch,
    performancePoolShare,
    epochDays
  );
  
  // Check for errors
  if (typeof performanceResult === 'string' && performanceResult.startsWith('ERROR:')) {
    return performanceResult;
  }
  
  // Calculate USD values if price is provided
  const appchainEpochUSD = priceUSD > 0 ? appchainResult.stadiumEmissionPerEpoch * priceUSD : 0;
  const appchainDayUSD = priceUSD > 0 ? appchainResult.stadiumEmissionPerDay * priceUSD : 0;
  const performanceEpochUSD = priceUSD > 0 ? performanceResult.stadiumPerformancePerEpoch * priceUSD : 0;
  const performanceDayUSD = priceUSD > 0 ? performanceResult.stadiumPerformancePerDay * priceUSD : 0;
  const totalEpochUSD = appchainEpochUSD + performanceEpochUSD;
  const totalDayUSD = appchainDayUSD + performanceDayUSD;
  
  return {
    // Inputs
    additionalStake: additionalStake,
    currentStake: currentStake,
    newStadiumStake: newStadiumStake,
    totalNetworkStake: totalNetworkStake,
    newTotalNetworkStake: newTotalNetworkStake,
    transactionsPerDay: transactionsPerDay,
    feePerTransactionUSD: feePerTransactionUSD,
    networkFeesPerDayUSD: networkFeesPerDayUSD,
    priceUSD: priceUSD,
    
    // Shares
    stakeShare: stakeShare,
    feeShare: feeShare,
    performanceShare: performanceResult.performanceShare,
    
    // Appchain Pool Emissions (SYND)
    appchainPoolTotalPerEpoch: appchainResult.appchainPoolTotalPerEpoch,
    appchainEmissionPerEpoch: appchainResult.stadiumEmissionPerEpoch,
    appchainEmissionPerDay: appchainResult.stadiumEmissionPerDay,
    
    // Appchain Pool Emissions (USD)
    appchainEpochUSD: appchainEpochUSD,
    appchainDayUSD: appchainDayUSD,
    
    // Performance Pool Emissions (SYND)
    performancePoolTotalPerEpoch: performanceResult.performancePoolTotalPerEpoch,
    performanceEmissionPerEpoch: performanceResult.stadiumPerformancePerEpoch,
    performanceEmissionPerDay: performanceResult.stadiumPerformancePerDay,
    
    // Performance Pool Emissions (USD)
    performanceEpochUSD: performanceEpochUSD,
    performanceDayUSD: performanceDayUSD,
    
    // Total Emissions
    totalEmissionPerEpoch: appchainResult.stadiumEmissionPerEpoch + performanceResult.stadiumPerformancePerEpoch,
    totalEmissionPerDay: appchainResult.stadiumEmissionPerDay + performanceResult.stadiumPerformancePerDay,
    totalEpochUSD: totalEpochUSD,
    totalDayUSD: totalDayUSD,
    
    // Fee Details
    stadiumFeesPerDayUSD: feeShareResult.stadiumFeesPerDayUSD,
    stadiumFeesPerEpochUSD: feeShareResult.stadiumFeesPerEpochUSD,
    totalNetworkFeesPerDayUSD: feeShareResult.totalNetworkFeesPerDayUSD,
    totalNetworkFeesPerEpochUSD: feeShareResult.totalNetworkFeesPerEpochUSD
  };
}

/**
 * Get Epoch Configuration
 * 
 * Returns the current epoch configuration constants
 * 
 * @return {object} Epoch configuration
 * 
 * Example: =GET_EPOCH_CONFIG()
 */
function GET_EPOCH_CONFIG() {
  return {
    totalEmissionPerEpoch: EPOCH_CONFIG.TOTAL_EMISSION_PER_EPOCH,
    epochDurationDays: EPOCH_CONFIG.EPOCH_DURATION_DAYS,
    appchainPoolShare: EPOCH_CONFIG.APPCHAIN_POOL_SHARE,
    performancePoolShare: EPOCH_CONFIG.PERFORMANCE_POOL_SHARE,
    basePoolShare: EPOCH_CONFIG.BASE_POOL_SHARE,
    performanceFeeWeight: EPOCH_CONFIG.PERFORMANCE_FEE_WEIGHT,
    performanceStakeWeight: EPOCH_CONFIG.PERFORMANCE_STAKE_WEIGHT,
    appchainPoolEmissionPerEpoch: EPOCH_CONFIG.TOTAL_EMISSION_PER_EPOCH * EPOCH_CONFIG.APPCHAIN_POOL_SHARE,
    performancePoolEmissionPerEpoch: EPOCH_CONFIG.TOTAL_EMISSION_PER_EPOCH * EPOCH_CONFIG.PERFORMANCE_POOL_SHARE,
    basePoolEmissionPerEpoch: EPOCH_CONFIG.TOTAL_EMISSION_PER_EPOCH * EPOCH_CONFIG.BASE_POOL_SHARE
  };
}

/**
 * Helper function to format results as a table-friendly string
 * Useful for displaying results in a single cell
 * 
 * @param {object} result - Result object from any calculation function
 * @return {string} Formatted string representation
 */
function FORMAT_RESULT(result) {
  if (typeof result === 'string' && result.startsWith('ERROR:')) {
    return result;
  }
  if (result.error) {
    return 'ERROR: ' + result.error;
  }
  
  let output = [];
  for (let key in result) {
    if (typeof result[key] === 'number') {
      output.push(key + ': ' + result[key].toFixed(4));
    } else {
      output.push(key + ': ' + result[key]);
    }
  }
  return output.join('\n');
}

/**
 * TEST FUNCTION - Use this to verify the script is working
 * 
 * @return {string} Test result
 * 
 * Example: =TEST_EMISSIONS_SCRIPT()
 */
function TEST_EMISSIONS_SCRIPT() {
  try {
    // Test basic calculation
    const result = CALCULATE_APPCHAIN_EMISSIONS(5.5);
    if (typeof result === 'string' && result.startsWith('ERROR:')) {
      return 'FAILED: ' + result;
    }
    return 'SUCCESS: Script is working! Try: =CALCULATE_APPCHAIN_EMISSIONS(5.5)';
  } catch (e) {
    return 'ERROR: ' + e.toString();
  }
}

