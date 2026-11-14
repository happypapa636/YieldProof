import {
  assertFraction,
  assertNonNegative,
  assertPositive,
  d,
  Decimal,
  DecimalInput,
  EngineInputError,
  ONE,
  ZERO,
} from "./decimal";
import { validateHorizon } from "./returns";

/**
 * Leverage analytics.
 *
 * Generic (lending-market style):
 *   health factor   HF = collateralValue × liquidationThreshold / debt
 *   liquidation px  P* = debt / (collateralAmount × liquidationThreshold)
 *
 * MUSD (Liquity-v1 style CDP on Mezo, parameters read live on-chain):
 *   net debt        = borrowed × (1 + issuanceFee)
 *   recorded debt   = net debt + gas compensation (200 MUSD, escrowed, refunded on close)
 *   ICR             = collateral × price / recorded debt
 *   health factor   = ICR / MCR                       (liquidatable when < 1)
 *   liquidation px  = recorded debt × MCR / collateral
 *   interest        = recorded debt × APR × days/365  (simple, fixed at open; accrues on the
 *                                                      full recorded principal, verified on-chain)
 */

export interface GenericLeverageInput {
  collateralAmount: DecimalInput;
  collateralPrice: DecimalInput;
  debt: DecimalInput;
  /** Liquidation threshold as a fraction (0.8 = liquidated when debt > 80% of collateral value). */
  liquidationThreshold: DecimalInput;
}

export interface GenericLeverageResult {
  collateralValue: Decimal;
  healthFactor: Decimal | null;
  liquidationPrice: Decimal | null;
  distanceToLiquidation: Decimal | null;
  loanToValue: Decimal;
}

export function genericLeverage(input: GenericLeverageInput): GenericLeverageResult {
  const amt = assertPositive(d(input.collateralAmount, "collateralAmount"), "collateralAmount");
  const px = assertPositive(d(input.collateralPrice, "collateralPrice"), "collateralPrice");
  const debt = assertNonNegative(d(input.debt, "debt"), "debt");
  const lt = assertFraction(d(input.liquidationThreshold, "liquidationThreshold"), "liquidationThreshold", { allowOne: true });
  const collateralValue = amt.times(px);
  if (debt.isZero()) {
    return { collateralValue, healthFactor: null, liquidationPrice: null, distanceToLiquidation: null, loanToValue: ZERO };
  }
  const healthFactor = collateralValue.times(lt).dividedBy(debt);
  const liquidationPrice = lt.isZero() ? null : debt.dividedBy(amt.times(lt));
  return {
    collateralValue,
    healthFactor,
    liquidationPrice,
    distanceToLiquidation: liquidationPrice ? ONE.minus(liquidationPrice.dividedBy(px)) : null,
    loanToValue: debt.dividedBy(collateralValue),
  };
}

export interface MusdParams {
  /** Minimum collateral ratio, e.g. 1.1 */
  mcr: DecimalInput;
  /** Critical collateral ratio (recovery mode threshold), e.g. 1.5 */
  ccr: DecimalInput;
  /** One-time issuance fee fraction, e.g. 0.001 */
  issuanceFeePct: DecimalInput;
  /** Gas compensation added to recorded debt, MUSD, e.g. 200 */
  gasCompensation: DecimalInput;
  /** Minimum net debt, MUSD, e.g. 1800 */
  minNetDebt: DecimalInput;
  /** Borrow interest, simple APR fraction, e.g. 0.01 */
  interestApr: DecimalInput;
}

export interface MusdLeverageInput {
  collateralBtc: DecimalInput;
  btcPrice: DecimalInput;
  borrowMusd: DecimalInput;
  params: MusdParams;
  /** Simple APR earned on the deployed MUSD. */
  strategyApr: DecimalInput;
  days: number;
  /** Total transaction costs in MUSD (open + deploy + exit + close). */
  txCosts?: DecimalInput;
  /** Slippage when unwinding the deployed MUSD position, fraction. */
  exitSlippagePct?: DecimalInput;
  /** Scenario knobs. */
  priceShockPct?: DecimalInput; // −0.2 = BTC falls 20%
  borrowRateShock?: DecimalInput; // +0.02 = +2 percentage points
  yieldShockPct?: DecimalInput; // −0.5 = strategy yield halves
}

export interface MusdLeverageWarning {
  code: "below_min_net_debt" | "below_mcr" | "below_ccr" | "liquidated_in_scenario" | "negative_carry";
  message: string;
}

export interface MusdLeverageResult {
  collateralValue: Decimal;
  netDebt: Decimal;
  recordedDebt: Decimal;
  icr: Decimal;
  healthFactor: Decimal;
  liquidationPrice: Decimal;
  distanceToLiquidation: Decimal;
  maxBorrowAtMcr: Decimal;
  equity: Decimal;
  leverageRatio: Decimal;
  grossYield: Decimal;
  borrowInterest: Decimal;
  issuanceFee: Decimal;
  txCosts: Decimal;
  exitSlippage: Decimal;
  netYield: Decimal;
  netReturnOnEquity: Decimal;
  annualizedOnEquity: Decimal;
  breakEvenStrategyApr: Decimal;
  /** Scenario-adjusted copies of the headline inputs. */
  scenario: { btcPrice: Decimal; interestApr: Decimal; strategyApr: Decimal };
  warnings: MusdLeverageWarning[];
}

export function analyzeMusdLeverage(input: MusdLeverageInput): MusdLeverageResult {
  const warnings: MusdLeverageWarning[] = [];
  const coll = assertPositive(d(input.collateralBtc, "collateralBtc"), "collateralBtc");
  const basePrice = assertPositive(d(input.btcPrice, "btcPrice"), "btcPrice");
  const borrow = assertPositive(d(input.borrowMusd, "borrowMusd"), "borrowMusd");
  const days = validateHorizon(input.days);
  const t = new Decimal(days).dividedBy(365);

  const mcr = assertPositive(d(input.params.mcr, "mcr"), "mcr");
  const ccr = assertPositive(d(input.params.ccr, "ccr"), "ccr");
  const fee = assertFraction(d(input.params.issuanceFeePct, "issuanceFeePct"), "issuanceFeePct");
  const gasComp = assertNonNegative(d(input.params.gasCompensation, "gasCompensation"), "gasCompensation");
  const minNetDebt = assertNonNegative(d(input.params.minNetDebt, "minNetDebt"), "minNetDebt");
  const baseInterest = assertNonNegative(d(input.params.interestApr, "interestApr"), "interestApr");
  const baseStrategy = d(input.strategyApr, "strategyApr");

  const priceShock = d(input.priceShockPct ?? 0, "priceShockPct");
  if (priceShock.lessThanOrEqualTo(-1)) throw new EngineInputError("priceShockPct", "price cannot fall 100% or more");
  const rateShock = d(input.borrowRateShock ?? 0, "borrowRateShock");
  const yieldShock = d(input.yieldShockPct ?? 0, "yieldShockPct");
  if (yieldShock.lessThan(-1)) throw new EngineInputError("yieldShockPct", "yield cannot fall more than 100%");

  const price = basePrice.times(ONE.plus(priceShock));
  const interestApr = Decimal.max(baseInterest.plus(rateShock), ZERO);
  const strategyApr = baseStrategy.times(ONE.plus(yieldShock));
  const txCosts = assertNonNegative(d(input.txCosts ?? 0, "txCosts"), "txCosts");
  const exitSlipPct = assertFraction(d(input.exitSlippagePct ?? 0, "exitSlippagePct"), "exitSlippagePct");

  const issuanceFee = borrow.times(fee);
  const netDebt = borrow.plus(issuanceFee);
  const recordedDebt = netDebt.plus(gasComp);
  const collateralValue = coll.times(price);
  const icr = collateralValue.dividedBy(recordedDebt);
  const healthFactor = icr.dividedBy(mcr);
  const liquidationPrice = recordedDebt.times(mcr).dividedBy(coll);
  const distanceToLiquidation = ONE.minus(liquidationPrice.dividedBy(price));
  const maxBorrowAtMcr = Decimal.max(collateralValue.dividedBy(mcr).minus(gasComp).dividedBy(ONE.plus(fee)), ZERO);

  if (netDebt.lessThan(minNetDebt)) {
    warnings.push({
      code: "below_min_net_debt",
      message: `Net debt ${netDebt.toFixed(2)} MUSD is below the protocol minimum of ${minNetDebt.toFixed(0)} MUSD — this trove could not be opened.`,
    });
  }
  if (icr.lessThan(mcr)) {
    warnings.push({
      code: priceShock.isZero() ? "below_mcr" : "liquidated_in_scenario",
      message: priceShock.isZero()
        ? `Collateral ratio ${icr.times(100).toFixed(1)}% is below the ${mcr.times(100).toFixed(0)}% minimum — the trove could not be opened.`
        : `At this BTC price the collateral ratio falls to ${icr.times(100).toFixed(1)}% (< ${mcr.times(100).toFixed(0)}%): the trove would be liquidatable and the collateral lost.`,
    });
  } else if (icr.lessThan(ccr)) {
    warnings.push({
      code: "below_ccr",
      message: `Collateral ratio ${icr.times(100).toFixed(1)}% is below the ${ccr.times(100).toFixed(0)}% critical ratio: in Recovery Mode this trove could be liquidated.`,
    });
  }

  // Gross asset exposure: collateral + deployed MUSD; equity = exposure − net debt.
  // The 200 MUSD gas deposit is excluded from equity maths: it is escrowed and refunded on close.
  const exposure = collateralValue.plus(borrow);
  const equityAfterDebt = exposure.minus(netDebt);
  const leverageRatio = equityAfterDebt.greaterThan(0) ? exposure.dividedBy(equityAfterDebt) : new Decimal(Infinity);

  const grossYield = borrow.times(strategyApr).times(t);
  const borrowInterest = recordedDebt.times(interestApr).times(t);
  const exitSlippage = Decimal.max(borrow.plus(grossYield), ZERO).times(exitSlipPct);
  const netYield = grossYield.minus(borrowInterest).minus(issuanceFee).minus(txCosts).minus(exitSlippage);
  const eq = equityAfterDebt.greaterThan(0) ? equityAfterDebt : null;
  const netReturnOnEquity = eq ? netYield.dividedBy(eq) : ZERO;
  const annualizedOnEquity = netReturnOnEquity.times(365).dividedBy(days);
  // Solve B·r·t − I − F − T − (B + B·r·t)·s = 0 for r.
  const breakEvenStrategyApr = borrowInterest
    .plus(issuanceFee)
    .plus(txCosts)
    .plus(borrow.times(exitSlipPct))
    .dividedBy(borrow.times(t).times(ONE.minus(exitSlipPct)));

  if (netYield.isNegative()) {
    warnings.push({
      code: "negative_carry",
      message: "Borrowing costs exceed the strategy yield under these assumptions: the leveraged position loses money even before any price move.",
    });
  }

  return {
    collateralValue,
    netDebt,
    recordedDebt,
    icr,
    healthFactor,
    liquidationPrice,
    distanceToLiquidation,
    maxBorrowAtMcr,
    equity: equityAfterDebt,
    leverageRatio,
    grossYield,
    borrowInterest,
    issuanceFee,
    txCosts,
    exitSlippage,
    netYield,
    netReturnOnEquity,
    annualizedOnEquity,
    breakEvenStrategyApr,
    scenario: { btcPrice: price, interestApr, strategyApr },
    warnings,
  };
}

export interface StressRow {
  label: string;
  kind: "price" | "yield" | "borrow" | "liquidity";
  shock: string;
  result: MusdLeverageResult;
  liquidatable: boolean;
}

/** Standard stress grid required by the spec. */
export function musdStressTests(input: MusdLeverageInput): StressRow[] {
  const rows: StressRow[] = [];
  const base = { ...input, priceShockPct: 0, borrowRateShock: 0, yieldShockPct: 0 };
  const mcr = d(input.params.mcr, "mcr");
  for (const s of ["-0.1", "-0.2", "-0.3", "-0.4", "-0.5"]) {
    const r = analyzeMusdLeverage({ ...base, priceShockPct: s });
    rows.push({ label: `BTC ${Number(s) * 100}%`, kind: "price", shock: s, result: r, liquidatable: r.icr.lessThan(mcr) });
  }
  for (const s of ["-0.25", "-0.5", "-1"]) {
    const r = analyzeMusdLeverage({ ...base, yieldShockPct: s });
    rows.push({ label: `Strategy yield ${Number(s) * 100}%`, kind: "yield", shock: s, result: r, liquidatable: r.icr.lessThan(mcr) });
  }
  for (const s of ["0.01", "0.02", "0.04"]) {
    const r = analyzeMusdLeverage({ ...base, borrowRateShock: s });
    rows.push({ label: `Borrow APR +${Number(s) * 100} pts`, kind: "borrow", shock: s, result: r, liquidatable: r.icr.lessThan(mcr) });
  }
  for (const s of ["0.01", "0.03", "0.05"]) {
    const r = analyzeMusdLeverage({ ...base, exitSlippagePct: s });
    rows.push({ label: `Exit slippage ${Number(s) * 100}%`, kind: "liquidity", shock: s, result: r, liquidatable: r.icr.lessThan(mcr) });
  }
  return rows;
}

/** How a BTC move changes equity with and without the leveraged leg (amplification). */
export function equitySensitivity(collateralBtc: DecimalInput, btcPrice: DecimalInput, netDebt: DecimalInput, deployedMusd: DecimalInput, movePct: DecimalInput) {
  const coll = d(collateralBtc, "collateralBtc");
  const px = d(btcPrice, "btcPrice");
  const debt = d(netDebt, "netDebt");
  const deployed = d(deployedMusd, "deployedMusd");
  const move = d(movePct, "movePct");
  const before = coll.times(px).plus(deployed).minus(debt);
  const after = coll.times(px.times(ONE.plus(move))).plus(deployed).minus(debt);
  const unleveredBefore = coll.times(px);
  const unleveredAfter = coll.times(px.times(ONE.plus(move)));
  return {
    leveredChangePct: before.isZero() ? null : after.minus(before).dividedBy(before),
    unleveredChangePct: unleveredAfter.minus(unleveredBefore).dividedBy(unleveredBefore),
  };
}
