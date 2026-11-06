import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createWalletClient, createPublicClient, http, defineChain } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

const arcMainnet = defineChain({
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: ['https://rpc.mainnet.arc.io'] } }, // arc-studio-allow-onchain-literal
});

const RESOLVE_GAME_ABI = [
  {
    type: 'function',
    name: 'resolveGame',
    inputs: [
      { name: 'roomId', type: 'bytes32' },
      { name: 'winner', type: 'address' },
    ],
    outputs: [],
    stateMutability: 'nonpayable',
  },
] as const;

function buildRpcUrl(chainName: string): string {
  const base = process.env.RPC_PROXY_BASE_URL;
  const token = process.env.RPC_PROXY_TOKEN;
  const covered = (process.env.RPC_PROXY_CHAINS ?? '').split(',').map(s => s.trim());
  if (base && token && covered.includes(chainName)) {
    return `${base}/api/rpc/${chainName}?_rpc_token=${token}`;
  }
  // Fallback for environments without the proxy (e.g. direct Vercel prod)
  return 'https://rpc.mainnet.arc.io'; // arc-studio-allow-onchain-literal
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { roomId, winner } = req.body as { roomId: string; winner: string };
  if (!roomId || !winner) return res.status(400).json({ error: 'Missing roomId or winner' });

  const resolverKey = process.env.RESOLVER_PRIVATE_KEY;
  const contractAddress = process.env.VITE_WAGER_CONTRACT;

  if (!resolverKey || !contractAddress) {
    // Fallback: log only — fires when env vars not yet configured
    console.log(`[resolve] WARN: no resolver key — logging only. room=${roomId} winner=${winner}`);
    return res.status(200).json({ status: 'recorded', roomId, winner });
  }

  try {
    const rpcUrl = buildRpcUrl('Arc');
    const transport = http(rpcUrl);
    const account = privateKeyToAccount(resolverKey as `0x${string}`);
    const walletClient = createWalletClient({ account, chain: arcMainnet, transport });
    const publicClient = createPublicClient({ chain: arcMainnet, transport });

    const hash = await walletClient.writeContract({
      address: contractAddress as `0x${string}`,
      abi: RESOLVE_GAME_ABI,
      functionName: 'resolveGame',
      args: [roomId as `0x${string}`, winner as `0x${string}`],
    });

    const receipt = await publicClient.waitForTransactionReceipt({ hash });
    console.log(`[resolve] resolved room=${roomId} winner=${winner} tx=${hash} status=${receipt.status}`);
    return res.status(200).json({ status: 'resolved', roomId, winner, txHash: hash });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[resolve] ERROR room=${roomId} winner=${winner}: ${msg}`);
    return res.status(500).json({ error: 'Resolution failed', detail: msg });
  }
}
