# YieldProof — Show Me the Real Yield
## Complete AI Coding Agent Build Specification

### 1. Project Overview

Build a polished DeFi application called **YieldProof** that helps users discover, compare, and evaluate the real economic returns of decentralized finance strategies, with a particular focus on MUSD and the Mezo ecosystem.

Most DeFi dashboards emphasize advertised APY or APR. These numbers can hide important costs and risks, including:
- Gas and transaction fees.
- Borrowing interest.
- Deposit and withdrawal fees.
- Token incentive volatility.
- Impermanent loss, where relevant.
- Slippage.
- Smart contract risk.
- Liquidity restrictions.
- Changing yield rates.
- Potential collateral liquidation.

YieldProof must provide a transparent, evidence-based way to compare strategies after accounting for known costs and clearly explaining risks.

**Product promise:**

“Don't chase the highest APY. Understand what you could actually earn.”

The product is an analytics and decision-support platform, not a guarantee of future returns.

### 2. Core Objectives

Build a working application that allows users to:

1. Discover supported DeFi yield opportunities.
2. Compare opportunities using a consistent methodology.
3. Estimate net returns over different time periods.
4. Separate sustainable yield from token incentives.
5. Account for borrowing costs and transaction expenses.
6. Understand the risks associated with each strategy.
7. Inspect the source and timestamp of every important metric.
8. Explore MUSD-based opportunities where verified data and real integrations are available.
9. Connect a wallet to view relevant balances and positions.
10. Export a strategy comparison for further analysis.

The app must be useful even if the number of available Mezo yield opportunities is initially small.

### 3. Target Users

Design for:
- DeFi users comparing yield opportunities.
- MUSD holders exploring ways to use their stablecoin.
- Bitcoin ecosystem participants exploring DeFi.
- Users considering leveraged yield strategies.
- DeFi researchers and analysts.
- Users who want to understand risk before depositing funds.

### 4. Mandatory Mezo and MUSD Integration

YieldProof must have a meaningful connection to Mezo rather than being a generic DeFi dashboard with a token logo.

Implement the following where supported by verified data sources:

- Identify the configured Mezo network and supported wallet connections.
- Discover or configure MUSD-related liquidity pools and lending markets.
- Display MUSD-denominated yields and relevant protocol data.
- Read pool liquidity, token reserves, lending rates, or other relevant market metrics.
- Show verified transaction links for supported on-chain activity.
- Use MUSD as a primary asset in return calculators.
- Support the Mezo testnet for development and demonstration when suitable contracts and data sources are available.

First inspect the official Mezo documentation and verify the actual network, token, protocol, and contract information.

Do not assume that a particular lending market, liquidity pool, staking mechanism, or yield protocol exists. Do not invent APYs or use unverified contract addresses.

If there are insufficient live Mezo yield sources, create a clearly labeled demo dataset and a functional analytics engine. Keep simulated opportunities separate from live opportunities. Explain the limitation honestly.

### 5. Recommended Technology Stack

Use this stack unless the existing repository already contains a suitable implementation.

**Frontend**
- Next.js.
- TypeScript.
- React.
- Tailwind CSS.
- shadcn/ui.
- Recharts for data visualization.

**Blockchain integration**
- wagmi.
- viem.
- Compatible wallet connection library.
- Verified contract ABIs and network configuration.
- Configurable RPC providers.

**Backend and data**
- Next.js server routes or a lightweight Node.js service.
- PostgreSQL if persistent historical metrics and user watchlists are needed.
- A scheduled data collection process for supported market sources.
- A reliable price data provider when available.

**Testing**
- Vitest or Jest.
- Playwright.
- Appropriate contract testing tools if custom contracts are genuinely necessary.

Do not create a custom token, lending protocol, or yield vault merely to make the application look integrated. The primary product is analytics and transparent comparison.

### 6. Visual Design

Create a clean, professional financial analytics interface.

Design requirements:
- Dark navy or charcoal background with readable contrast.
- Green for positive returns.
- Amber for uncertainty or elevated risk.
- Red for critical risks or negative projected returns.
- Clear charts, consistent numeric formatting, and restrained animations.
- Responsive desktop and mobile layouts.
- Accessible controls and keyboard navigation.

Avoid flashy trading visuals. The product should feel trustworthy, analytical, and transparent.

### 7. Landing Page

Create a polished landing page with this content.

**Headline:**

“See Beyond APY.”

**Subheadline:**

“Compare DeFi strategies using estimated net returns, transparent costs, and risk-aware analytics.”

**Primary CTA:** Explore Yield Opportunities

**Secondary CTA:** Compare Strategies

Display three product benefits:
- Calculate net yield after estimated costs.
- Separate base yield from token incentives.
- Understand risks before committing funds.

Include a notice that projected returns are estimates and not guarantees.

### 8. Main Dashboard

Create a dashboard with the following sections.

#### A. Market Overview

Show:
- Number of supported yield opportunities.
- Number of verified live data sources.
- Number of opportunities involving MUSD.
- Median advertised APY for the currently displayed dataset.
- Median estimated net APY where enough comparable data exists.
- Last successful data refresh.

Do not display misleading summary statistics when the dataset is too small or inconsistent.

#### B. Yield Opportunity Table

Each opportunity should include:

- Protocol name.
- Strategy name.
- Network.
- Deposit asset.
- Advertised APY or APR.
- Estimated base yield.
- Estimated incentive yield.
- Estimated costs.
- Estimated net annualized return.
- Available liquidity, when verifiable.
- Risk level.
- Data freshness.
- Link to the protocol and relevant data source.

Provide sorting by:
- Highest estimated net return.
- Lowest estimated transaction cost.
- Highest available liquidity.
- Lowest modeled risk.
- Most recent data.

Provide filters for:
- Network.
- Asset.
- Strategy type.
- MUSD-related opportunities.
- Stablecoin strategies.
- Lending.
- Liquidity provision.
- Leveraged strategies.
- Data confidence.
- Risk category.

Never treat an unavailable metric as zero. Display “Unavailable” or “Not verified” instead.

### 9. Real Yield Calculation Engine

This is the core of YieldProof.

Implement a transparent return calculator with documented formulas and assumptions.

#### A. Basic Net Return

For a simple non-leveraged strategy, estimate net profit over a selected period as:

Net Profit = Gross Yield Earned + Realized Incentive Value − Estimated Costs

Estimated Costs may include:
- Entry transaction fees.
- Exit transaction fees.
- Protocol fees not already included in the quoted rate.
- Expected borrowing costs, if applicable.
- Estimated slippage.
- Other known strategy-specific expenses.

Do not subtract fees twice if the advertised yield already accounts for them.

#### B. Annualized Net Return

When the estimated net profit and initial capital are meaningful and comparable:

Estimated Net Return = Estimated Net Profit / Initial Capital

Annualize this estimate only when the time basis and assumptions are clearly specified.

Display the result as an estimated return, not a guaranteed APY.

If costs exceed expected yield, the calculator must show a negative net return rather than hiding the loss.

#### C. Base Yield Versus Incentives

Separate the return components:

1. Base yield from lending interest, swap fees, or another identified source.
2. Incentive yield from reward tokens.
3. Costs.
4. Estimated net result.

When incentive token prices are volatile, provide alternative scenarios such as:
- Current reference price.
- 25% lower incentive token price.
- 50% lower incentive token price.
- Zero incentive value.

These are hypothetical sensitivity tests, not price forecasts.

#### D. Compounding

Allow the user to choose:
- No compounding.
- Daily compounding.
- Weekly compounding.
- Monthly compounding.

Only show compounded returns when the strategy can realistically reinvest the proceeds at the assumed frequency. Include reinvestment fees and any relevant constraints.

If the yield source is variable, label projections as scenarios rather than forecasts.

### 10. Strategy Comparison Calculator

Allow users to select two to four strategies and compare them side by side.

Inputs:
- Initial investment amount.
- Investment duration.
- Deposit asset.
- Estimated entry cost.
- Estimated exit cost.
- Compounding preference.
- Incentive token price scenario.
- Expected rate change scenario.
- Optional borrowing amount for supported leveraged strategies.

Outputs:
- Estimated gross earnings.
- Base yield.
- Incentive earnings.
- Estimated transaction costs.
- Estimated borrowing costs.
- Estimated net profit or loss.
- Estimated ending value.
- Estimated net return.
- Key risks and assumptions.
- Liquidity limitations.
- Data confidence and freshness.

Display an easy-to-read comparison chart for projected ending value and estimated net return.

Use the same initial investment, time horizon, and cost assumptions for comparable strategies.

Do not imply that different risk profiles are equivalent simply because their estimated returns are similar.

### 11. Risk Analysis Engine

Create a transparent risk assessment system.

Evaluate each opportunity using available evidence about:

- Smart contract maturity and audit information.
- Protocol and oracle dependencies.
- Liquidity depth.
- Withdrawal restrictions.
- Historical volatility.
- Incentive dependence.
- Token concentration.
- Borrowing and liquidation risk.
- Leverage.
- Data quality and freshness.
- Relevant protocol incidents, where verifiable.

Create a risk profile containing:
- Overall modeled risk category.
- Component-level risk indicators.
- Evidence and source links.
- Missing information.
- Date of the latest assessment.

Use categories such as:
- Lower modeled risk.
- Moderate modeled risk.
- Elevated modeled risk.
- High modeled risk.
- Insufficient data.

These are product assessments, not official ratings or guarantees of safety.

Do not assign a numerical score merely because a field is missing. If there is insufficient evidence, show “Insufficient data.”

Do not describe unaudited or unverified protocols as safe.

### 12. Liquidity and Exit Analysis

High APY is not useful if a user cannot exit without a large loss.

Where data is available, estimate:
- Available pool liquidity.
- Approximate exit slippage for selected trade sizes.
- Withdrawal restrictions.
- Lockup periods.
- Redemption queues.
- Pool concentration.
- Exposure to temporary price deviations.

Allow the user to enter a hypothetical exit amount.

Display:
- Estimated exit value.
- Estimated slippage.
- Relevant withdrawal constraints.
- Source and timestamp.
- A warning when liquidity data is unavailable or stale.

Clearly state when the estimate does not account for all market conditions.

### 13. Leveraged Strategy Analyzer

Implement this module only when a supported lending protocol and reliable market data are available.

Allow users to explore a hypothetical leveraged strategy.

Inputs:
- Initial capital.
- Borrowed amount.
- Borrowing APR.
- Expected strategy yield.
- Collateral value.
- Collateral factor or liquidation threshold.
- Estimated transaction costs.
- Collateral price shock.
- Borrowing rate shock.

Outputs:
- Gross yield.
- Borrowing costs.
- Estimated net yield.
- Leverage ratio.
- Health factor or protocol-specific risk metric.
- Estimated liquidation threshold.
- Sensitivity to changes in yield, borrowing cost, and collateral price.

Include stress scenarios:
- Collateral price declines.
- Strategy yield decreases.
- Borrowing costs increase.
- Liquidity deteriorates.

Do not automatically recommend leverage. Show how leverage amplifies both gains and losses.

Do not execute leveraged transactions in the MVP unless the protocol integration has been independently verified and the transaction flow has been properly tested.

### 14. Yield History

Create a historical analytics page.

Where real historical observations exist, display:
- Advertised yield over time.
- Estimated base yield.
- Incentive yield.
- Estimated net yield.
- Available liquidity.
- Relevant token prices.

Allow the user to select time ranges such as:
- 7 days.
- 30 days.
- 90 days.
- 1 year, if sufficient data exists.

Display the sample count and data coverage.

Do not fabricate historical charts. When historical data is unavailable, show the available current observation and explain the limitation.

### 15. Data Sources and Confidence

Every important metric must be traceable.

For each opportunity, display:
- Data source.
- Source type: on-chain, API, or modeled.
- Last updated time.
- Data completeness.
- Confidence label.
- Missing or uncertain fields.

Use a simple confidence framework:
- Verified: supported by a validated on-chain source or documented reliable source.
- Partial: some important values are missing or estimated.
- Demo: synthetic data for demonstration purposes.

Do not treat an API-reported APY as a guaranteed future rate.

When multiple sources disagree, show the discrepancy and explain which source is being used.

### 16. Wallet Connection and Personal Portfolio

Allow users to connect a compatible wallet.

Provide:
- Wallet address display.
- Supported network detection.
- MUSD balance where available.
- Supported position discovery.
- Personal watchlist.
- Saved strategy comparisons.
- User-configurable investment assumptions.

The wallet is optional for browsing and simulation.

Never request private keys or seed phrases.

Do not claim to discover every position on every protocol. Clearly list the protocols and networks actually supported.

Do not imply that a user holds a position merely because they hold a protocol token unless the position can be verified.

### 17. Watchlist and Notifications

Allow users to save yield opportunities to a watchlist.

Where monitoring infrastructure is implemented, support alerts for:
- Yield falling below a chosen threshold.
- Incentive rewards declining.
- Liquidity falling below a chosen amount.
- Borrowing costs exceeding a chosen level.
- A data source becoming stale.
- A protocol parameter changing.
- Estimated net return becoming negative under configured assumptions.

Start with in-app notifications.

Add email or messaging notifications only when the delivery service is configured and tested.

Clearly display the last monitoring time. Do not claim continuous monitoring if the backend checks only periodically or when the app is opened.

### 18. MUSD Strategy Explorer

Create a dedicated MUSD section.

Show verified opportunities involving MUSD, grouped by actual use case:

- Lending.
- Liquidity provision.
- Borrowing.
- Stablecoin market activity.
- Other verified yield-generating strategies.

For every listed opportunity, explain:
- How the return is generated.
- Which assets the user must supply.
- Whether returns are variable.
- Whether incentives are included.
- Whether borrowing or leverage is involved.
- Whether funds can be withdrawn immediately.
- What can cause losses.
- What data is unavailable.

If no verified live opportunity exists for a category, display a useful empty state rather than inventing one.

The goal is to help users understand how MUSD can be used in DeFi without promising that a particular yield opportunity will always be available.

### 19. Export and Share

Allow users to export a strategy comparison as CSV.

Include:
- Strategy name.
- Protocol.
- Network.
- Initial capital.
- Time horizon.
- Estimated base earnings.
- Incentive earnings.
- Estimated costs.
- Estimated net result.
- Risk indicators.
- Assumptions.
- Data source.
- Data timestamp.

Also create a shareable comparison view that contains no private information by default.

Never include private keys, credentials, or sensitive wallet data in exports.

### 20. Security and Data Integrity

Implement the following:
- Validate all user inputs.
- Use appropriate decimal arithmetic for financial calculations.
- Use integer precision for token amounts.
- Validate token decimals and contract addresses.
- Keep API secrets on the server.
- Handle missing and stale data safely.
- Do not trust unverified token prices.
- Avoid double-counting fees.
- Avoid combining incompatible APR and APY values.
- Display all material assumptions.
- Do not silently substitute synthetic values into live analytics.
- Do not request unnecessary wallet permissions.
- Do not execute transactions without explicit user confirmation.

If a custom smart contract is not required, do not create one.

YieldProof should not custody user funds.

### 21. Required Pages

Implement the following routes:

- `/` — Landing page.
- `/dashboard` — Market overview.
- `/opportunities` — Yield opportunity explorer.
- `/opportunities/[id]` — Opportunity details.
- `/compare` — Strategy comparison calculator.
- `/risk` — Risk analysis.
- `/history` — Historical yield analytics.
- `/musd` — MUSD strategy explorer.
- `/watchlist` — Saved opportunities.
- `/portfolio` — Connected wallet portfolio.
- `/settings` — User preferences.
- `/demo` — Interactive demo.

Every page must have loading, error, empty, and responsive states as appropriate.

### 22. Demo Mode

Build a fully interactive demo that does not require a wallet.

Create four fictional opportunities:
1. A low advertised-yield lending strategy.
2. A strategy with a high incentive component.
3. A liquidity provision strategy with modeled impermanent loss.
4. A leveraged strategy with borrowing costs and liquidation risk.

Use clearly labeled synthetic data.

Allow users to change:
- Initial investment.
- Investment duration.
- Incentive token price.
- Borrowing cost.
- Estimated transaction fees.
- Yield rate.
- Liquidity exit assumptions.

Update the calculated returns and comparison charts immediately.

The demo should reveal an important insight: a strategy with the highest advertised APY can have a lower estimated net return after costs and risk assumptions.

Do not present these fictional strategies as real Mezo opportunities or real market returns.

### 23. Testing Requirements

Write automated tests for:
- Net return calculations.
- APR versus APY handling.
- Compounding.
- Variable-rate scenarios.
- Incentive token price sensitivity.
- Negative net returns.
- Entry and exit costs.
- Borrowing cost calculations.
- Leverage and health factor calculations.
- Token decimal handling.
- Missing data.
- Stale data.
- Inconsistent sources.
- Liquidity and slippage estimates.
- CSV exports.
- Demo versus live data separation.

Test calculations against manually verified examples.

### 24. Implementation Plan

**Phase 1 — Core product**
- Inspect the repository.
- Build the UI and navigation.
- Implement the demo dataset.
- Build the return calculation engine.
- Create the strategy comparison page.

**Phase 2 — Data integration**
- Inspect official Mezo documentation.
- Verify network and token details.
- Identify actual MUSD opportunities and trustworthy data sources.
- Implement the first real market adapter.
- Add data source timestamps and confidence labels.

**Phase 3 — Risk analytics**
- Implement cost-aware yield calculations.
- Add incentive sensitivity analysis.
- Add risk profiles.
- Add liquidity and exit analysis.
- Add leverage analysis where supported.

**Phase 4 — User features**
- Add wallet connection.
- Add portfolio and watchlist.
- Add export.
- Add alerts where monitoring infrastructure is available.

**Phase 5 — Polish and submission**
- Test all financial calculations.
- Test on supported networks.
- Publish a public GitHub repository.
- Deploy the app.
- Prepare a concise project deck.
- Record a two-minute demo.
- Document the data sources, methodology, limitations, and Mezo integration.

### 25. Acceptance Criteria

The project is complete when:

1. The application runs with documented setup instructions.
2. The demo mode works without a wallet.
3. Users can compare at least two strategies.
4. Net return calculations account for configured costs and incentives.
5. Variable rates and uncertain inputs are clearly labeled.
6. The app distinguishes live data from simulated data.
7. MUSD and Mezo integration is based on verified network and protocol information.
8. Risk assessments show their assumptions and sources.
9. Historical charts never fabricate real observations.
10. The application handles missing and stale data correctly.
11. Financial calculations have automated tests.
12. The GitHub repository includes setup, architecture, data-source, and methodology documentation.

### 26. Final Instruction to the Coding Agent

Build YieldProof as a working DeFi analytics product, not just a static dashboard.

Start by inspecting the repository and verifying which Mezo networks, MUSD contracts, yield protocols, lending markets, and data sources are actually available.

Then build the return calculation engine before polishing the UI.

The core feature must let users compare advertised yield with estimated net returns after costs and incentives. Every projection must be reproducible from visible assumptions. Every live metric must identify its source and timestamp.

If live Mezo yield opportunities are limited, build a strong demo and integrate the real data that is available. Never fabricate live protocol integrations, APYs, historical data, or transaction activity.

Prioritize transparent calculations, risk explanations, reliable data, and an excellent comparison experience over unnecessary features.

The final product should deliver this promise:

**“YieldProof shows you where the yield comes from, what it costs, what could go wrong, and what you might actually keep.”**
