# Security policy

YieldProof is read-only analytics. It never holds funds or keys, deploys no
contract of its own, and only writes on Mezo **testnet** when a user signs a
Stability Pool deposit or withdrawal in their own wallet. See
[Security model](README.md#security-model) for how sessions, inputs and
exports are protected.

## Reporting a vulnerability

Please do not open a public issue for security problems. Use
**Security → Report a vulnerability** on this repository instead. If that
option is not available, open an issue that only asks for a private contact,
without details.

Useful reports include the affected route or page, steps to reproduce, and
what an attacker could do (for example: act as another wallet, read another
user's watchlist or alerts, bypass SIWE checks, or inject formulas into CSV
exports).

## Scope

- In scope: the code in this repository and https://yieldproof-mezo.vercel.app.
- Out of scope: Mezo, MUSD, DefiLlama and RPC providers themselves. Report
  those to their maintainers.
