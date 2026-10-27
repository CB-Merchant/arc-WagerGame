// Ably token auth endpoint — keeps the secret key server-side
import type { VercelRequest, VercelResponse } from '@vercel/node'
import Ably from 'ably'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }

  const { clientId } = req.query
  if (!clientId || typeof clientId !== 'string') {
    res.status(400).json({ error: 'clientId required' }); return
  }

  const ably = new Ably.Rest(process.env.ABLY_API_KEY!)
  const tokenRequest = await ably.auth.createTokenRequest({ clientId })
  res.status(200).json(tokenRequest)
}
