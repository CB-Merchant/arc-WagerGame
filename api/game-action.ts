import type { VercelRequest, VercelResponse } from '@vercel/node'
import { store, publishToRoom, checkTTTWinner, rpsResult, type TriviaState, type RPSState, type NumberGuessState, type TicTacToeState } from './_gameLogic'

function finishGame(room: ReturnType<typeof store.getRoom> & object, winner: string | null) {
  if (!room) return
  room.status = 'FINISHED'
  room.winner = winner
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') { res.status(204).end(); return }
  if (req.method !== 'POST') { res.status(405).end(); return }

  const { roomId, address, action, payload } = req.body as {
    roomId: string; address: string; action: string; payload: Record<string, unknown>
  }

  const room = store.getRoom(roomId)
  if (!room || room.status !== 'ACTIVE' || !room.gameState) {
    res.status(400).json({ error: 'Game not active' }); return
  }

  const addr = address.toLowerCase()
  const gs = room.gameState
  const p1 = room.player1
  const p2 = room.player2!

  if (gs.type === 'TRIVIA' && action === 'answer') {
    const tgs = gs as TriviaState
    if (tgs.answered[addr] !== null) { res.status(400).json({ error: 'Already answered' }); return }
    const q = tgs.questions[tgs.currentQuestion]
    tgs.answered[addr] = payload.answerIndex as number
    if (payload.answerIndex === q.correct) tgs.scores[addr] = (tgs.scores[addr] || 0) + 1
    if (tgs.answered[p1] !== null && tgs.answered[p2] !== null) {
      tgs.roundComplete = true
      if (tgs.currentQuestion + 1 >= tgs.questions.length) {
        const winner = tgs.scores[p1] > tgs.scores[p2] ? p1 : tgs.scores[p2] > tgs.scores[p1] ? p2 : null
        finishGame(room, winner)
        await publishToRoom(roomId, 'game_finished', { room, winner })
      } else {
        await publishToRoom(roomId, 'game_state', { room })
        setTimeout(async () => {
          tgs.currentQuestion++
          tgs.answered = { [p1]: null, [p2]: null }
          tgs.roundComplete = false
          store.setRoom(roomId, room)
          await publishToRoom(roomId, 'game_state', { room })
        }, 2500)
      }
    }
  }

  else if (gs.type === 'RPS' && action === 'choice') {
    const rgs = gs as RPSState
    rgs.choices[addr] = payload.choice as 'rock' | 'paper' | 'scissors'
    if (rgs.choices[p1] && rgs.choices[p2]) {
      const res1 = rpsResult(rgs.choices[p1]!, rgs.choices[p2]!)
      if (res1 === 'win') rgs.scores[p1]++
      else if (res1 === 'lose') rgs.scores[p2]++
      rgs.roundResult = `${rgs.choices[p1]} vs ${rgs.choices[p2]}`
      if (rgs.round >= rgs.maxRounds || rgs.scores[p1] > rgs.maxRounds / 2 || rgs.scores[p2] > rgs.maxRounds / 2) {
        const winner = rgs.scores[p1] > rgs.scores[p2] ? p1 : rgs.scores[p2] > rgs.scores[p1] ? p2 : null
        finishGame(room, winner)
        await publishToRoom(roomId, 'game_finished', { room, winner })
      } else {
        await publishToRoom(roomId, 'game_state', { room })
        setTimeout(async () => {
          rgs.round++
          rgs.choices = { [p1]: null, [p2]: null }
          rgs.roundResult = null
          store.setRoom(roomId, room)
          await publishToRoom(roomId, 'game_state', { room })
        }, 2000)
      }
    }
  }

  else if (gs.type === 'NUMBER_GUESS' && action === 'guess') {
    const ngs = gs as NumberGuessState
    if (ngs.guesses[addr] !== null) { res.status(400).json({ error: 'Already guessed' }); return }
    ngs.guesses[addr] = payload.guess as number
    if (ngs.guesses[p1] !== null && ngs.guesses[p2] !== null) {
      ngs.revealed = true
      const d1 = Math.abs((ngs.guesses[p1] ?? 0) - ngs.targetNumber)
      const d2 = Math.abs((ngs.guesses[p2] ?? 0) - ngs.targetNumber)
      if (d1 < d2) ngs.scores[p1]++
      else if (d2 < d1) ngs.scores[p2]++
      if (ngs.round >= ngs.maxRounds) {
        const winner = ngs.scores[p1] > ngs.scores[p2] ? p1 : ngs.scores[p2] > ngs.scores[p1] ? p2 : null
        finishGame(room, winner)
        await publishToRoom(roomId, 'game_finished', { room, winner })
      } else {
        await publishToRoom(roomId, 'game_state', { room })
        setTimeout(async () => {
          ngs.round++
          ngs.targetNumber = Math.floor(Math.random() * 100) + 1
          ngs.guesses = { [p1]: null, [p2]: null }
          ngs.revealed = false
          store.setRoom(roomId, room)
          await publishToRoom(roomId, 'game_state', { room })
        }, 2500)
      }
    }
  }

  else if (gs.type === 'TICTACTOE' && action === 'move') {
    const tgs = gs as TicTacToeState
    if (tgs.currentTurn !== addr) { res.status(400).json({ error: 'Not your turn' }); return }
    const idx = payload.index as number
    if (tgs.board[idx] !== null) { res.status(400).json({ error: 'Cell taken' }); return }
    tgs.board[idx] = addr
    tgs.moveCount++
    const tttWinner = checkTTTWinner(tgs.board)
    if (tttWinner) {
      finishGame(room, tttWinner)
      await publishToRoom(roomId, 'game_finished', { room, winner: tttWinner })
    } else if (tgs.moveCount === 9) {
      finishGame(room, null)
      await publishToRoom(roomId, 'game_finished', { room, winner: null })
    } else {
      tgs.currentTurn = tgs.currentTurn === p1 ? p2 : p1
      await publishToRoom(roomId, 'game_state', { room })
    }
  }

  store.setRoom(roomId, room)
  res.status(200).json({ ok: true })
}
