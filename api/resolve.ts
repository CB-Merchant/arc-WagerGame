import type { VercelRequest, VercelResponse } from '@vercel/node';

// On testnet the contract resolver is the platform deployer wallet.
// This endpoint logs the result for auditing — actual USDC transfer
// happens when the resolver calls resolveGame() on-chain.
export default function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  const { roomId, winner } = req.body as { roomId: string; winner: string };
  if (!roomId || !winner) return res.status(400).json({ error: 'Missing roomId or winner' });
  console.log(`[resolve] room=${roomId} winner=${winner}`);
  return res.status(200).json({ status: 'recorded', roomId, winner });
}
