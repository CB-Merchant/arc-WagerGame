import { useReadContract } from 'wagmi'
import { getUsdc } from '@/onchain-facts'
import { formatUsdc } from '@/onchain-money'

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
  const usdc = getUsdc(chainId)

  const { data: rawBalance, isLoading } = useReadContract({
    address: usdc?.address as `0x${string}` | undefined,
    abi: ERC20_ABI,
    functionName: 'balanceOf',
    args: [address as `0x${string}`],
    query: {
      enabled: !!usdc && !!address,
      refetchInterval: 10_000,
    },
  })

  if (!usdc) return null

  const display = (() => {
    if (isLoading) return '...'
    if (rawBalance === undefined) return '—'
    try {
      return formatUsdc(rawBalance)
    } catch {
      return '—'
    }
  })()

  return (
    <div
      className="flex items-center gap-1.5 rounded-xl px-3 py-1.5"
      style={{
        background: 'rgba(255,255,255,0.72)',
        backdropFilter: 'blur(12px)',
        border: '1.5px solid rgba(255,255,255,0.8)',
      }}
    >
      <span className="text-xs font-medium" style={{ color: 'var(--muted)' }}>Balance</span>
      <span className="text-sm font-bold" style={{ color: 'var(--ink)' }}>
        {display} <span style={{ color: 'var(--muted)', fontWeight: 500 }}>USDC</span>
      </span>
    </div>
  )
}
