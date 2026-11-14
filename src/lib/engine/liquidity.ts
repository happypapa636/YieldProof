import { d, Decimal, DecimalInput, EngineInputError, ONE, ZERO } from "./decimal";

/**
 * Liquidity & exit analysis for Mezo Pools (Solidly/Aerodrome-style AMM).
 *
 * Exact bigint ports of the on-chain Pool.getAmountOut so that YieldProof's
 * exit estimates reproduce the contract to the wei (verified in tests against
 * live mainnet quotes):
 *
 *   fee:      amountIn' = amountIn − amountIn · fee / 10_000
 *   volatile: x · y = k            → out = amountIn' · reserveOut / (reserveIn + amountIn')
 *   stable:   x³y + xy³ = k        → out solved with Newton's method on normalised (1e18) reserves
 */

export interface PoolState {
  reserve0: bigint;
  reserve1: bigint;
  /** 10 ** decimals of token0/token1, exactly as Pool.metadata() returns them. */
  scale0: bigint;
  scale1: bigint;
  stable: boolean;
  /** Fee in basis points of 10_000 (Mezo: volatile 30 = 0.30%, stable 2 = 0.02%). */
  feeBps: bigint;
}

const E18 = 10n ** 18n;

function k(pool: PoolState, x: bigint, y: bigint): bigint {
  if (pool.stable) {
    const _x = (x * E18) / pool.scale0;
    const _y = (y * E18) / pool.scale1;
    const _a = (_x * _y) / E18;
    const _b = (_x * _x) / E18 + (_y * _y) / E18;
    return (_a * _b) / E18;
  }
  return x * y;
}

function f(x0: bigint, y: bigint): bigint {
  const _a = (x0 * y) / E18;
  const _b = (x0 * x0) / E18 + (y * y) / E18;
  return (_a * _b) / E18;
}

function dFn(x0: bigint, y: bigint): bigint {
  return (3n * x0 * ((y * y) / E18)) / E18 + (((x0 * x0) / E18) * x0) / E18;
}

/** Port of Pool._get_y, including its `_k(x0, y + 1)` call on already-normalised values. */
function getY(pool: PoolState, x0: bigint, xy: bigint, yStart: bigint): bigint {
  let y = yStart;
  for (let i = 0; i < 255; i++) {
    const kk = f(x0, y);
    if (kk < xy) {
      let dy = ((xy - kk) * E18) / dFn(x0, y);
      if (dy === 0n) {
        if (kk === xy) return y;
        if (k(pool, x0, y + 1n) > xy) return y + 1n;
        dy = 1n;
      }
      y = y + dy;
    } else {
      let dy = ((kk - xy) * E18) / dFn(x0, y);
      if (dy === 0n) {
        if (kk === xy || f(x0, y - 1n) < xy) return y;
        dy = 1n;
      }
      y = y - dy;
    }
  }
  throw new EngineInputError("pool", "stable-swap solver did not converge (!y)");
}

function rawAmountOut(pool: PoolState, amountIn: bigint, tokenInIsToken0: boolean): bigint {
  const { reserve0, reserve1, scale0, scale1 } = pool;
  if (pool.stable) {
    const xy = k(pool, reserve0, reserve1);
    const r0 = (reserve0 * E18) / scale0;
    const r1 = (reserve1 * E18) / scale1;
    const [reserveA, reserveB] = tokenInIsToken0 ? [r0, r1] : [r1, r0];
    const amtIn = tokenInIsToken0 ? (amountIn * E18) / scale0 : (amountIn * E18) / scale1;
    const y = reserveB - getY(pool, amtIn + reserveA, xy, reserveB);
    return (y * (tokenInIsToken0 ? scale1 : scale0)) / E18;
  }
  const [reserveA, reserveB] = tokenInIsToken0 ? [reserve0, reserve1] : [reserve1, reserve0];
  return (amountIn * reserveB) / (reserveA + amountIn);
}

function validatePool(pool: PoolState) {
  if (pool.reserve0 <= 0n || pool.reserve1 <= 0n) throw new EngineInputError("pool", "pool has no liquidity");
  if (pool.feeBps < 0n || pool.feeBps > 300n) throw new EngineInputError("pool.feeBps", "fee outside the factory's 0–3% range");
  for (const s of [pool.scale0, pool.scale1]) {
    if (!/^10*$/.test(s.toString())) throw new EngineInputError("pool.scale", "token scale must be a power of ten");
  }
}

/** Exact on-chain-equivalent swap quote (base units in → base units out). */
export function getAmountOut(pool: PoolState, amountIn: bigint, tokenInIsToken0: boolean): bigint {
  validatePool(pool);
  if (amountIn < 0n) throw new EngineInputError("amountIn", "must be ≥ 0");
  if (amountIn === 0n) return 0n;
  const afterFee = amountIn - (amountIn * pool.feeBps) / 10_000n;
  return rawAmountOut(pool, afterFee, tokenInIsToken0);
}

/** Marginal (spot) price of tokenIn in units of tokenOut, from normalised reserves. Excludes fees. */
export function spotPrice(pool: PoolState, tokenInIsToken0: boolean): Decimal {
  validatePool(pool);
  const x = new Decimal(pool.reserve0.toString()).dividedBy(pool.scale0.toString());
  const y = new Decimal(pool.reserve1.toString()).dividedBy(pool.scale1.toString());
  let p0in1: Decimal; // price of token0 in token1
  if (pool.stable) {
    // For k = x³y + xy³, |dy/dx| = (3x²y + y³) / (x³ + 3xy²)
    p0in1 = x.pow(2).times(y).times(3).plus(y.pow(3)).dividedBy(x.pow(3).plus(x.times(y.pow(2)).times(3)));
  } else {
    p0in1 = y.dividedBy(x);
  }
  return tokenInIsToken0 ? p0in1 : ONE.dividedBy(p0in1);
}

export interface SwapQuote {
  amountIn: Decimal;
  amountOut: Decimal;
  spotOut: Decimal; // what the trade would return at the marginal price with no fee/impact
  feePaid: Decimal; // in tokenIn units
  priceImpactPct: Decimal; // impact excluding the fee
  totalSlippagePct: Decimal; // shortfall vs spot including fee
}

/** Human-unit quote with slippage decomposition. */
export function quoteSwap(pool: PoolState, amountInHuman: DecimalInput, tokenInIsToken0: boolean): SwapQuote {
  const inScale = tokenInIsToken0 ? pool.scale0 : pool.scale1;
  const outScale = tokenInIsToken0 ? pool.scale1 : pool.scale0;
  const amountIn = d(amountInHuman, "amountIn");
  if (!amountIn.greaterThan(0)) throw new EngineInputError("amountIn", "must be > 0");
  const amountInBase = BigInt(amountIn.times(inScale.toString()).floor().toFixed(0));
  const outBase = getAmountOut(pool, amountInBase, tokenInIsToken0);
  const amountOut = new Decimal(outBase.toString()).dividedBy(outScale.toString());
  const spot = spotPrice(pool, tokenInIsToken0);
  const spotOut = amountIn.times(spot);
  const fee = new Decimal(pool.feeBps.toString()).dividedBy(10_000);
  const feePaid = amountIn.times(fee);
  const totalSlippagePct = spotOut.isZero() ? ZERO : ONE.minus(amountOut.dividedBy(spotOut));
  const noFeeOut = amountIn.minus(feePaid).times(spot);
  const priceImpactPct = noFeeOut.isZero() ? ZERO : ONE.minus(amountOut.dividedBy(noFeeOut));
  return { amountIn, amountOut, spotOut, feePaid, priceImpactPct, totalSlippagePct };
}

/**
 * Exit an LP position worth `positionValue` (valued in token `target`) back into
 * that single token: burn pro-rata, then swap the other leg through the same pool
 * (whose reserves are reduced by the burn). Returns value received and slippage.
 */
export function lpExitToSingle(pool: PoolState, shareOfPool: DecimalInput, targetIsToken0: boolean) {
  validatePool(pool);
  const share = d(shareOfPool, "shareOfPool");
  if (!share.greaterThan(0) || share.greaterThan(1)) throw new EngineInputError("shareOfPool", "must be in (0, 1]");
  const s = BigInt(share.times(1e18).floor().toFixed(0));
  const out0 = (pool.reserve0 * s) / E18;
  const out1 = (pool.reserve1 * s) / E18;
  const after: PoolState = { ...pool, reserve0: pool.reserve0 - out0, reserve1: pool.reserve1 - out1 };
  if (after.reserve0 <= 0n || after.reserve1 <= 0n) {
    return { received: null as Decimal | null, fairValue: null as Decimal | null, slippagePct: null as Decimal | null, drainsPool: true };
  }
  const spotBefore = spotPrice(pool, !targetIsToken0); // price of the other token in target units
  const otherAmount = targetIsToken0 ? out1 : out0;
  const swapped = getAmountOut(after, otherAmount, !targetIsToken0);
  const targetScale = targetIsToken0 ? pool.scale0 : pool.scale1;
  const otherScale = targetIsToken0 ? pool.scale1 : pool.scale0;
  const direct = new Decimal((targetIsToken0 ? out0 : out1).toString()).dividedBy(targetScale.toString());
  const received = direct.plus(new Decimal(swapped.toString()).dividedBy(targetScale.toString()));
  const fairValue = direct.plus(new Decimal(otherAmount.toString()).dividedBy(otherScale.toString()).times(spotBefore));
  return { received, fairValue, slippagePct: ONE.minus(received.dividedBy(fairValue)), drainsPool: false };
}

/** Total value of pool reserves in units of token1 (or token0) at the pool's own spot price. */
export function poolValueIn(pool: PoolState, inToken0: boolean): Decimal {
  const x = new Decimal(pool.reserve0.toString()).dividedBy(pool.scale0.toString());
  const y = new Decimal(pool.reserve1.toString()).dividedBy(pool.scale1.toString());
  const p0in1 = spotPrice(pool, true);
  return inToken0 ? x.plus(y.dividedBy(p0in1)) : y.plus(x.times(p0in1));
}

/** Share of reserves held in token0 by value — a simple imbalance / depeg-exposure indicator. */
export function reserveBalance(pool: PoolState): Decimal {
  const x = new Decimal(pool.reserve0.toString()).dividedBy(pool.scale0.toString());
  const total = poolValueIn(pool, false);
  return x.times(spotPrice(pool, true)).dividedBy(total);
}

/**
 * Impermanent loss of a 50/50 constant-product position vs holding, for a price
 * ratio r = P_end / P_start:  IL = 2·√r / (1 + r) − 1   (≤ 0)
 */
export function impermanentLoss(priceRatio: DecimalInput): Decimal {
  const r = d(priceRatio, "priceRatio");
  if (!r.greaterThan(0)) throw new EngineInputError("priceRatio", "must be > 0");
  return r.sqrt().times(2).dividedBy(ONE.plus(r)).minus(1);
}

/** Slippage curve for a list of exit sizes (human units of tokenIn). */
export function slippageCurve(pool: PoolState, sizes: DecimalInput[], tokenInIsToken0: boolean) {
  return sizes.map((s) => {
    try {
      const q = quoteSwap(pool, s, tokenInIsToken0);
      return { size: d(s), quote: q };
    } catch {
      return { size: d(s), quote: null };
    }
  });
}
