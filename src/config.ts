/**
 * wagmi + ConnectKit configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { defineChain } from 'viem'
import { getDefaultConfig } from 'connectkit'
import { registerChain } from './tracing'

const ARC_TESTNET_RPC = 'https://rpc.testnet.arc.io'

export const arcTestnet = defineChain({
  id: 5042002,
  name: 'Arc Testnet',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [ARC_TESTNET_RPC] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: 'https://explorer.testnet.arc.io' } },
  testnet: true,
})

registerChain(arcTestnet.id, ARC_TESTNET_RPC)

export const config = createConfig(
  getDefaultConfig({
    chains: [arcTestnet],
    transports: {
      [arcTestnet.id]: http(ARC_TESTNET_RPC),
    },
    walletConnectProjectId: (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined) ?? '',
    appName: 'Arc WagerGame',
    appDescription: 'Multiplayer wager games powered by USDC on Arc',
    appUrl: 'https://www.arcwagergame.fun',
    appIcon: 'https://www.arcwagergame.fun/favicon.svg',
  }),
)
