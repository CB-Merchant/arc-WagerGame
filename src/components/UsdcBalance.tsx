import { useReadContract } from 'wagmi'
import { getUsdc } from '@/onchain-facts'
import { formatUsdc } from '@/onchain-money'

const ARC_TESTNET_CHAIN_ID = 5042002

const ERC20_ABI = [
  {
    name: 'balanceOf',
    type: 'function',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ name: '', type: 'uint256' }],
  },
] as const

interface UsdcBalanceProps {
  address: string
  chainId: number
}

export function UsdcBalance({ address, chainId }: UsdcBalanceProps) {
  const usdc = getUsdc(ARC_TESTNET_CHAIN_ID)
  const isRightChain = chainId === ARC_TESTNET_CHAIN_ID

  const { data: rawBalance, isLoading } = useReadContract({
    address: usdc?.address as `0x${string}` | undefined,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
    chainId: ARC_TESTNET_CHAIN_ID,
    query: {
      // Enable even on wrong chain — Arc RPC works regardless
      enabled: !!usdc && !!address,
      refetchInterval: 8_000,
      staleTime: 5_000,
    },
  })

  if (!usdc) return null

  const display = (() => {
    if (!isRightChain) return 'Wrong network'
    if (isLoading) return 'Loading...'
    if (rawBalance === undefined) return '0.00'
    try {
      // formatUsdc expects a raw 6-decimal bigint — format to 2dp
      const formatted = formatUsdc(rawBalance)
      // formatUsdc returns e.g. "12.5" — pad to 2 decimal places
      const parts = formatted.split('.')
      const decimals = parts[1] ?? ''
      return `${parts[0]}.${decimals.padEnd(2, '0').slice(0, 2)}`
    } catch {
      return '0.00'
    }
  })()

  const isError = !isRightChain

  return (
    <div
      className="flex items-center gap-2 rounded-xl px-3 py-1.5"
      style={{
        background: 'rgba(255,255,255,0.72)',
        backdropFilter: 'blur(12px)',
        border: `1.5px solid ${isError ? '#f59e0b' : 'rgba(255,255,255,0.8)'}`,
      }}
    >
      {/* Green dot when live */}
      {!isError && (
        <div className="h-1.5 w-1.5 rounded-full" style={{ background: isLoading ? '#f59e0b' : '#22c55e' }} />
      )}
      <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Balance</span>
      <span className="text-sm font-bold" style={{ color: isError ? '#b45309' : 'var(--ink)' }}>
        {display}
        {!isError && <span className="ml-1 font-medium" style={{ color: 'var(--muted)' }}>USDC</span>}
      </span>
    </div>
  )
}
