import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { mezoMainnet, mezoTestnet } from "./chains";

/**
 * Injected wallets only, discovered via EIP-6963 (MetaMask, Rabby, OKX… appear
 * automatically). Testnet is the default chain for wallet features; mainnet is
 * read for balances only.
 */
export const wagmiConfig = createConfig({
  chains: [mezoTestnet, mezoMainnet],
  connectors: [injected({ shimDisconnect: true })],
  multiInjectedProviderDiscovery: true,
  transports: {
    [mezoTestnet.id]: http("https://rpc.test.mezo.org"),
    [mezoMainnet.id]: http("https://mezo.drpc.org"),
  },
  ssr: true,
});

declare module "wagmi" {
  interface Register {
    config: typeof wagmiConfig;
  }
}
