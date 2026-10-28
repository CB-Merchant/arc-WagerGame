/**
 * wagmi + ConnectKit configuration with full multi-wallet support
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arcTestnet } from 'viem/chains'
import { getDefaultConfig } from 'connectkit'
import { registerChain } from './tracing'

// Pre-register chain RPC URLs so trace events show correct chain names immediately
registerChain(arcTestnet.id, arcTestnet.rpcUrls.default.http[0])

export const config = createConfig(
  getDefaultConfig({
    chains: [arcTestnet, mainnet],
    transports: {
      [arcTestnet.id]: http(),
      [mainnet.id]: http(),
    },
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    walletConnectProjectId: import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ?? '',
    appName: 'Arc WagerGame',
    appDescription: 'Multiplayer wager games powered by USDC on Arc',
    appUrl: 'https://www.arcwagergame.fun',
    appIcon: 'https://www.arcwagergame.fun/favicon.ico',
  }),
)
