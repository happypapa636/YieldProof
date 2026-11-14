import { parseAbi } from "viem";

/**
 * Every contract address YieldProof touches, with the minimal ABI fragments it
 * calls. Sources:
 *  - Testnet MUSD system: github.com/mezo-org/musd → solidity/artifacts/deployments/matsnet
 *    (MUSD address matches the official contracts reference).
 *  - Mainnet MUSD system: same repo → deployments/mainnet; BorrowerOperations is
 *    confirmed on-chain as an authorised MUSD minter (MUSD.mintList).
 *  - Mainnet pools: official "Contracts and Token Addresses" page (Pool Contracts).
 *  - sMUSD vault / gauge, veBTC, veMEZO: DefiLlama pool ids map to these contracts;
 *    each is a verified contract on explorer.mezo.org.
 * YieldProof deploys NO contract of its own and never custodies funds.
 */

export const TESTNET = {
  MUSD: "0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503",
  BorrowerOperations: "0xCdF7028ceAB81fA0C6971208e83fa7872994beE5",
  TroveManager: "0xE47c80e8c23f6B4A1aE41c34837a0599D5D16bb0",
  PriceFeed: "0x86bCF0841622a5dAC14A313a15f96A95421b9366",
  StabilityPool: "0x1CCA7E410eE41739792eA0A24e00349Dd247680e",
  InterestRateManager: "0xD4D6c36A592A2c5e86035A6bca1d57747a567f37",
  /** Lowest-ICR trove lookup (getLast); same address the e2e suite uses. */
  SortedTroves: "0x722E4D24FD6Ff8b0AC679450F3D91294607268fA",
} as const;

export const sortedTrovesAbi = parseAbi(["function getLast() view returns (address)"]);

export const MAINNET = {
  MUSD: "0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186",
  BTC: "0x7b7C000000000000000000000000000000000000",
  MEZO: "0x7B7c000000000000000000000000000000000001",
  mUSDC: "0x04671C72Aab5AC02A03c1098314b1BB6B560c197",
  mUSDT: "0xeB5a5d39dE4Ea42C2Aa6A57EcA2894376683bB8E",
  BorrowerOperations: "0x44b1bac67dDA612a41a58AAf779143B181dEe031",
  TroveManager: "0x94AfB503dBca74aC3E4929BACEeDfCe19B93c193",
  PriceFeed: "0xc5aC5A8892230E0A3e1c473881A2de7353fFcA88",
  StabilityPool: "0x73245Eff485aB3AAc1158B3c4d8f4b23797B0e32",
  InterestRateManager: "0x4a453700d157717Fe02fB62E7700ED7845048285",
  PoolFactory: "0x83FE469C636C4081b87bA5b3Ae9991c6Ed104248",
  sMUSD: "0xb4D498029af77680cD1eF828b967f010d06C51CC",
  sMUSDGauge: "0x677817bF3e44b90E8F95222F75e2950b7904a401",
  veBTC: "0x3D4b1b884A7a1E59fE8589a3296EC8f8cBB6f279",
  veMEZO: "0xb90fdAd3DFD180458D62Cc6acedc983D78E20122",
} as const;

export interface PoolConfig {
  id: string;
  address: `0x${string}`;
  label: string;
  token0: { symbol: string; address: `0x${string}`; decimals: number };
  token1: { symbol: string; address: `0x${string}`; decimals: number };
  stable: boolean;
}

/** Official MUSD pools on Mezo Pools (Solidly/Aerodrome-style AMM). Token order verified on-chain. */
export const MAINNET_POOLS: PoolConfig[] = [
  {
    id: "pool-btc-musd",
    address: "0x52e604c44417233b6CcEDDDc0d640A405Caacefb",
    label: "BTC/MUSD (volatile)",
    token0: { symbol: "BTC", address: MAINNET.BTC, decimals: 18 },
    token1: { symbol: "MUSD", address: MAINNET.MUSD, decimals: 18 },
    stable: false,
  },
  {
    id: "pool-musdc-musd",
    address: "0xEd812AEc0Fecc8fD882Ac3eccC43f3aA80A6c356",
    label: "mUSDC/MUSD (stable)",
    token0: { symbol: "mUSDC", address: MAINNET.mUSDC, decimals: 6 },
    token1: { symbol: "MUSD", address: MAINNET.MUSD, decimals: 18 },
    stable: true,
  },
  {
    id: "pool-musd-musdt",
    address: "0x10906a9E9215939561597b4C8e4b98F93c02031A",
    label: "MUSD/mUSDT (stable)",
    token0: { symbol: "MUSD", address: MAINNET.MUSD, decimals: 18 },
    token1: { symbol: "mUSDT", address: MAINNET.mUSDT, decimals: 6 },
    stable: true,
  },
];

export const erc20Abi = parseAbi([
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)",
  "function totalSupply() view returns (uint256)",
  "function allowance(address owner, address spender) view returns (uint256)",
  "function approve(address spender, uint256 amount) returns (bool)",
  "event Transfer(address indexed from, address indexed to, uint256 value)",
]);

export const poolAbi = parseAbi([
  "function metadata() view returns (uint256 dec0, uint256 dec1, uint256 r0, uint256 r1, bool st, address t0, address t1)",
  "function getReserves() view returns (uint256 _reserve0, uint256 _reserve1, uint256 _blockTimestampLast)",
  "function getAmountOut(uint256 amountIn, address tokenIn) view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function index0() view returns (uint256)",
  "function index1() view returns (uint256)",
  "event Fees(address indexed sender, uint256 amount0, uint256 amount1)",
  "event Swap(address indexed sender, address indexed to, uint256 amount0In, uint256 amount1In, uint256 amount0Out, uint256 amount1Out)",
]);

export const poolFactoryAbi = parseAbi([
  "function getFee(address pool, bool _stable) view returns (uint256)",
  "function isPool(address pool) view returns (bool)",
  "function allPoolsLength() view returns (uint256)",
]);

export const savingsRateAbi = parseAbi([
  "function yieldIndex() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function claimableYield(address) view returns (uint256)",
]);

export const vaultGaugeAbi = parseAbi([
  "function rewardRate() view returns (uint256)",
  "function totalSupply() view returns (uint256)",
  "function periodFinish() view returns (uint256)",
  "function rewardToken() view returns (address)",
]);

export const priceFeedAbi = parseAbi(["function fetchPrice() view returns (uint256)"]);

export const interestRateManagerAbi = parseAbi(["function interestRate() view returns (uint16)"]);

export const borrowerOperationsAbi = parseAbi([
  "function borrowingRate() view returns (uint256)",
  "function MCR() view returns (uint256)",
  "function CCR() view returns (uint256)",
  "function minNetDebt() view returns (uint256)",
  "function MUSD_GAS_COMPENSATION() view returns (uint256)",
]);

export const troveManagerAbi = parseAbi([
  "function getTroveOwnersCount() view returns (uint256)",
  "function getTCR(uint256 _price) view returns (uint256)",
  "function checkRecoveryMode(uint256 _price) view returns (bool)",
  "function getEntireSystemDebt() view returns (uint256)",
  "function getEntireSystemColl() view returns (uint256)",
  "function getTroveStatus(address _borrower) view returns (uint256)",
  "function getEntireDebtAndColl(address _borrower) view returns (uint256 coll, uint256 principal, uint256 interest, uint256 pendingCollateral, uint256 pendingPrincipal, uint256 pendingInterest)",
  "function getCurrentICR(address _borrower, uint256 _price) view returns (uint256)",
  "function getTroveInterestRate(address _borrower) view returns (uint16)",
]);

export const stabilityPoolAbi = parseAbi([
  "function getTotalMUSDDeposits() view returns (uint256)",
  "function getCollateralBalance() view returns (uint256)",
  "function getCompoundedMUSDDeposit(address _depositor) view returns (uint256)",
  "function getDepositorCollateralGain(address _depositor) view returns (uint256)",
  "function provideToSP(uint256 _amount)",
  "function withdrawFromSP(uint256 _amount)",
]);

/** Trove status enum from TroveManager. */
export const TROVE_STATUS = ["nonExistent", "active", "closedByOwner", "closedByLiquidation", "closedByRedemption"] as const;

/** Gas floors per the Mezo EIP-7623 calldata-floor gotcha: gas = max(estimate × 1.3, floor). */
export const GAS_FLOORS = {
  erc20: 90_000n,
  stabilityPool: 400_000n,
} as const;
