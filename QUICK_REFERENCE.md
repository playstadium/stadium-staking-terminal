# Quick Reference - Stadium Emissions Calculator

## Installation
1. Open Google Sheet → **Extensions** → **Apps Script**
2. Paste `emissions-calculator.gs` code
3. Save and return to sheet

## Main Function (Recommended)

### `SIMULATE_EMISSIONS`
**One function to calculate everything:**

```
=SIMULATE_EMISSIONS(
  additionalStake,      // e.g., 50000
  currentStake,          // e.g., 50000
  totalNetworkStake,     // e.g., 1000000
  transactionsPerDay,    // e.g., 220
  feePerTransactionUSD,  // e.g., 0.5
  networkFeesPerDayUSD,  // e.g., 10000
  [1666667],             // optional: total emission/epoch
  [0.4],                 // optional: appchain pool share
  [0.3],                 // optional: performance pool share
  [30],                  // optional: epoch days
  [0.10]                 // optional: SYND price USD
)
```

**Extract values:**
- `=SIMULATE_EMISSIONS(...).totalEmissionPerEpoch` → Total SYND per epoch
- `=SIMULATE_EMISSIONS(...).totalEmissionPerDay` → Total SYND per day
- `=SIMULATE_EMISSIONS(...).totalEpochUSD` → Total USD per epoch
- `=SIMULATE_EMISSIONS(...).appchainEmissionPerEpoch` → Appchain pool SYND
- `=SIMULATE_EMISSIONS(...).performanceEmissionPerEpoch` → Performance pool SYND

## Individual Functions

### Appchain Pool Only
```
=CALCULATE_APPCHAIN_EMISSIONS(stakeShare)
// Example: =CALCULATE_APPCHAIN_EMISSIONS(5.5)
```

### Performance Pool Only
```
=CALCULATE_PERFORMANCE_EMISSIONS(stakeShare, feeShare)
// Example: =CALCULATE_PERFORMANCE_EMISSIONS(5.5, 3.2)
```

### Calculate Fee Share
```
=CALCULATE_FEE_SHARE(transactionsPerDay, feePerTransactionUSD, networkFeesPerDayUSD)
// Example: =CALCULATE_FEE_SHARE(220, 0.5, 10000)
```

### Calculate Stake Share
```
=CALCULATE_STAKE_SHARE(stadiumStake, totalNetworkStake)
// Example: =CALCULATE_STAKE_SHARE(50000, 1000000)
```

## Default Values
- Total Emission/Epoch: **1,666,667 SYND**
- Epoch Duration: **30 days**
- Appchain Pool Share: **40%**
- Performance Pool Share: **30%**
- Base Pool Share: **30%**
- Performance Formula: **40% fee share + 60% stake share**

## Performance Pool Formula
```
Performance Share = (Fee Share × 40%) + (Stake Share × 60%)
```

## Example Sheet Setup

| A | B | C |
|---|---|---|
| Current Stake | 50000 | `=B1` |
| Network Stake | 1000000 | `=B2` |
| Transactions/Day | 220 | `=B3` |
| Fee/Transaction | 0.5 | `=B4` |
| Network Fees/Day | 10000 | `=B5` |
| Price USD | 0.10 | `=B6` |
| | | |
| **Results** | | |
| Total/Epoch | `=SIMULATE_EMISSIONS(0,B1,B2,B3,B4,B5,,,30,B6).totalEmissionPerEpoch` | |
| Total/Day | `=SIMULATE_EMISSIONS(0,B1,B2,B3,B4,B5,,,30,B6).totalEmissionPerDay` | |

## Tips
1. Use **named ranges** for input cells (e.g., `CurrentStake`, `NetworkStake`)
2. Create a **scenario table** with different stake amounts
3. Use **data validation** for common values
4. Reference the same `SIMULATE_EMISSIONS` call multiple times (Google Sheets caches it)

