# Stadium Chain Emissions Calculator - Google Sheets Guide

## Overview

This Google Apps Script provides comprehensive emissions calculations for Stadium Chain, including:
- **Appchain Pool Emissions** (based on stake share)
- **Performance Pool Emissions** (based on 40% fee share + 60% stake share)
- **Scaling Simulations** with network activity and fees

## Installation

1. Open your Google Sheet
2. Go to **Extensions** → **Apps Script**
3. Delete any default code
4. Copy and paste the entire contents of `emissions-calculator.gs`
5. Click **Save** (💾 icon)
6. Give your project a name (e.g., "Stadium Emissions Calculator")

## Available Functions

### 1. `CALCULATE_APPCHAIN_EMISSIONS`
Calculates appchain pool emissions based on stake share.

**Syntax:**
```
=CALCULATE_APPCHAIN_EMISSIONS(stakeShare, [totalEmissionPerEpoch], [appchainPoolShare], [epochDays])
```

**Parameters:**
- `stakeShare` (required): Stadium's share of total network stake as percentage (e.g., 5.5 for 5.5%)
- `totalEmissionPerEpoch` (optional): Default is 1,666,667 SYND
- `appchainPoolShare` (optional): Default is 0.40 (40%)
- `epochDays` (optional): Default is 30 days

**Example:**
```
=CALCULATE_APPCHAIN_EMISSIONS(5.5)
```

**Returns:** Object with:
- `appchainPoolTotalPerEpoch`: Total appchain pool emissions per epoch
- `stadiumEmissionPerEpoch`: Stadium's emissions per epoch (SYND)
- `stadiumEmissionPerDay`: Stadium's emissions per day (SYND)
- `stakeShare`: Input stake share
- `stakeShareDecimal`: Stake share as decimal

---

### 2. `CALCULATE_PERFORMANCE_EMISSIONS`
Calculates performance pool emissions based on stake share and fee share.

**Syntax:**
```
=CALCULATE_PERFORMANCE_EMISSIONS(stakeShare, [feeShare], [totalEmissionPerEpoch], [performancePoolShare], [epochDays])
```

**Parameters:**
- `stakeShare` (required): Stadium's stake share as percentage
- `feeShare` (optional): Stadium's fee share as percentage (default: 0)
- `totalEmissionPerEpoch` (optional): Default is 1,666,667 SYND
- `performancePoolShare` (optional): Default is 0.30 (30%)
- `epochDays` (optional): Default is 30 days

**Example:**
```
=CALCULATE_PERFORMANCE_EMISSIONS(5.5, 3.2)
```

**Returns:** Object with:
- `performancePoolTotalPerEpoch`: Total performance pool emissions per epoch
- `stadiumPerformancePerEpoch`: Stadium's performance emissions per epoch (SYND)
- `stadiumPerformancePerDay`: Stadium's performance emissions per day (SYND)
- `performanceShare`: Calculated performance share (40% fee + 60% stake)
- `stakeShare`: Input stake share
- `feeShare`: Input fee share

---

### 3. `CALCULATE_FEE_SHARE`
Calculates fee share from transaction data.

**Syntax:**
```
=CALCULATE_FEE_SHARE(transactionsPerDay, feePerTransactionUSD, networkFeesPerDayUSD, [epochDays])
```

**Parameters:**
- `transactionsPerDay` (required): Stadium transactions per day
- `feePerTransactionUSD` (required): Fee per transaction in USD
- `networkFeesPerDayUSD` (required): Total network fees per day in USD
- `epochDays` (optional): Default is 30 days

**Example:**
```
=CALCULATE_FEE_SHARE(220, 0.5, 10000)
```

**Returns:** Object with:
- `stadiumFeesPerDayUSD`: Stadium fees per day
- `stadiumFeesPerEpochUSD`: Stadium fees per epoch
- `totalNetworkFeesPerDayUSD`: Total network fees per day
- `totalNetworkFeesPerEpochUSD`: Total network fees per epoch
- `feeShare`: Stadium's fee share as percentage

---

### 4. `CALCULATE_STAKE_SHARE`
Calculates stake share from stake amounts.

**Syntax:**
```
=CALCULATE_STAKE_SHARE(stadiumStake, totalNetworkStake)
```

**Parameters:**
- `stadiumStake` (required): Stadium's total stake in SYND
- `totalNetworkStake` (required): Total network stake in SYND

**Example:**
```
=CALCULATE_STAKE_SHARE(50000, 1000000)
```

**Returns:** Object with:
- `stadiumStake`: Input Stadium stake
- `totalNetworkStake`: Input total network stake
- `stakeShare`: Stadium's stake share as percentage
- `stakeShareDecimal`: Stake share as decimal

---

### 5. `SIMULATE_EMISSIONS` ⭐ **RECOMMENDED**
Comprehensive simulation function that calculates all emissions with scaling scenarios.

**Syntax:**
```
=SIMULATE_EMISSIONS(
  additionalStake,
  currentStake,
  totalNetworkStake,
  transactionsPerDay,
  feePerTransactionUSD,
  networkFeesPerDayUSD,
  [totalEmissionPerEpoch],
  [appchainPoolShare],
  [performancePoolShare],
  [epochDays],
  [priceUSD]
)
```

**Parameters:**
- `additionalStake` (required): Additional stake to add to Stadium (SYND)
- `currentStake` (required): Current Stadium stake (SYND)
- `totalNetworkStake` (required): Current total network stake (SYND)
- `transactionsPerDay` (required): Stadium transactions per day
- `feePerTransactionUSD` (required): Fee per transaction in USD
- `networkFeesPerDayUSD` (required): Total network fees per day in USD
- `totalEmissionPerEpoch` (optional): Default is 1,666,667 SYND
- `appchainPoolShare` (optional): Default is 0.40
- `performancePoolShare` (optional): Default is 0.30
- `epochDays` (optional): Default is 30
- `priceUSD` (optional): SYND price in USD (for USD calculations)

**Example:**
```
=SIMULATE_EMISSIONS(50000, 50000, 1000000, 220, 0.5, 10000, 1666667, 0.4, 0.3, 30, 0.10)
```

**Returns:** Comprehensive object with all calculations including:
- Input values
- Share calculations (stake, fee, performance)
- Appchain pool emissions (SYND and USD)
- Performance pool emissions (SYND and USD)
- Total emissions
- Fee details

---

### 6. `GET_EPOCH_CONFIG`
Returns the current epoch configuration constants.

**Syntax:**
```
=GET_EPOCH_CONFIG()
```

**Returns:** Object with all epoch configuration values.

---

## Using Results in Google Sheets

### Option 1: Display Full Object
When you use a function like `=SIMULATE_EMISSIONS(...)`, Google Sheets will display the object structure. You can then reference specific fields:

```
=SIMULATE_EMISSIONS(50000, 50000, 1000000, 220, 0.5, 10000, 1666667, 0.4, 0.3, 30, 0.10).totalEmissionPerEpoch
```

### Option 2: Extract Specific Values
Create a table structure in your sheet:

| Label | Formula |
|-------|---------|
| Total Emission/Epoch | `=SIMULATE_EMISSIONS(...).totalEmissionPerEpoch` |
| Total Emission/Day | `=SIMULATE_EMISSIONS(...).totalEmissionPerDay` |
| Appchain Emission/Epoch | `=SIMULATE_EMISSIONS(...).appchainEmissionPerEpoch` |
| Performance Emission/Epoch | `=SIMULATE_EMISSIONS(...).performanceEmissionPerEpoch` |

### Option 3: Use Named Ranges
1. Create input cells with named ranges:
   - `CurrentStake` → B2
   - `TotalNetworkStake` → B3
   - `TransactionsPerDay` → B4
   - etc.

2. Reference them in formulas:
   ```
   =SIMULATE_EMISSIONS(
     AdditionalStake,
     CurrentStake,
     TotalNetworkStake,
     TransactionsPerDay,
     FeePerTransaction,
     NetworkFeesPerDay,
     1666667, 0.4, 0.3, 30, PriceUSD
   )
   ```

## Sample Sheet Structure

Here's a recommended structure for your Google Sheet:

### Sheet 1: Configuration
| Parameter | Value |
|-----------|-------|
| Total Emission/Epoch | 1666667 |
| Epoch Duration (Days) | 30 |
| Appchain Pool Share | 0.40 |
| Performance Pool Share | 0.30 |
| Base Pool Share | 0.30 |
| SYND Price (USD) | 0.10 |

### Sheet 2: Current State
| Metric | Value |
|--------|-------|
| Current Stadium Stake | 50000 |
| Total Network Stake | 1000000 |
| Stadium Stake Share | `=B2/B3*100` |
| Transactions/Day | 220 |
| Fee per Transaction (USD) | 0.5 |
| Network Fees/Day (USD) | 10000 |

### Sheet 3: Simulations
| Scenario | Additional Stake | Total Emission/Epoch | Total Emission/Day | Total USD/Epoch |
|----------|------------------|---------------------|-------------------|-----------------|
| Baseline | 0 | `=SIMULATE_EMISSIONS(...).totalEmissionPerEpoch` | ... | ... |
| +50K SYND | 50000 | ... | ... | ... |
| +100K SYND | 100000 | ... | ... | ... |

## Tips for Efficient Use

1. **Use Named Ranges**: Create named ranges for frequently used values to make formulas cleaner.

2. **Create a Dashboard Sheet**: Use `SIMULATE_EMISSIONS` once and reference its fields across multiple cells.

3. **Data Validation**: Use data validation lists for common scenarios (e.g., stake amounts: 0, 50K, 100K, 200K).

4. **Conditional Formatting**: Apply conditional formatting to highlight scenarios that meet certain thresholds.

5. **Charts**: Create charts to visualize how emissions change with different stake amounts or transaction volumes.

## Performance Pool Calculation Details

The performance pool uses a weighted formula:
```
Performance Share = (Fee Share × 40%) + (Stake Share × 60%)
```

This means:
- If Stadium has 5% stake share and 3% fee share:
  - Performance Share = (3% × 0.4) + (5% × 0.6) = 1.2% + 3% = 4.2%

## Troubleshooting

**Error: "Stake share must be between 0 and 100"**
- Ensure stake share is entered as a percentage (e.g., 5.5, not 0.055)

**Error: "Total network stake must be greater than 0"**
- Check that total network stake is a positive number

**Functions not appearing:**
- Make sure you saved the Apps Script
- Refresh your Google Sheet
- Check that function names are spelled correctly (case-sensitive)

## Need Help?

If you need to modify the calculations or add new features, you can edit the script in **Extensions** → **Apps Script**.

