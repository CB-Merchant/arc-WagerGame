/**
 * wagmi + ConnectKit configuration
 * Built with Arc Studio — https://studio.arc.io
 */

import { http, createConfig } from 'wagmi'
import { defineChain } from 'viem'
import { getDefaultConfig } from 'connectkit'
import { registerChain } from './tracing'

const ARC_MAINNET_RPC = 'https://rpc.mainnet.arc.io' // arc-studio-allow-onchain-literal

export const arcMainnet = defineChain({
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [ARC_MAINNET_RPC] } },
  blockExplorers: { default: { name: 'Arc Explorer', url: 'https://explorer.arc.io' } },
  testnet: false,
})

registerChain(arcMainnet.id, ARC_MAINNET_RPC)

export const config = createConfig(
  getDefaultConfig({
    chains: [arcMainnet],
    transports: {
      [arcMainnet.id]: http(ARC_MAINNET_RPC),
    },
    walletConnectProjectId: (import.meta.env.VITE_WALLETCONNECT_PROJECT_ID as string | undefined) ?? '',
    appName: 'Arc WagerGame',
    appDescription: 'Multiplayer wager games powered by USDC on Arc',
    appUrl: 'https://www.arcwagergame.fun',
    appIcon: 'https://www.arcwagergame.fun/favicon.svg',
  }),
)
