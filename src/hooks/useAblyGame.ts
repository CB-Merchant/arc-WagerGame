import { useEffect, useRef, useState, useCallback } from 'react';
import Ably from 'ably';

let ablyClient: Ably.Realtime | null = null;

function getAbly(clientId: string): Ably.Realtime {
  if (!ablyClient) {
    ablyClient = new Ably.Realtime({
      authUrl: '/api/auth',
      authParams: { clientId },
      clientId,
    });
  }
  return ablyClient;
}

export function useOnlinePlayersAbly(playerId: string) {
  const [count, setCount] = useState<number | null>(null);

  useEffect(() => {
    if (!playerId) return;
    const ably = getAbly(playerId);
    const channel = ably.channels.get('lobby');

    void channel.presence.enter({ playerId });

    const updateCount = () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      void channel.presence.get().then((members: any[]) => setCount(members.length));
    };

    void channel.presence.subscribe(updateCount);
    updateCount();

    return () => {
      channel.presence.unsubscribe();
      void channel.presence.leave();
    };
  }, [playerId]);

  return count;
}

export function useAblyMatchmaking(playerId: string) {
  const [status, setStatus] = useState<'idle' | 'queued' | 'matched'>('idle');
  const [matchedRoom, setMatchedRoom] = useState<{ roomId: string; role: string } | null>(null);

  const startMatchmaking = useCallback(async (gameType: string, wagerAmount: string) => {
    setStatus('queued');

    // Enter presence on the matchmaking queue channel so server can see us
    const ably = getAbly(playerId);
    const queueChannel = ably.channels.get(`matchmaking:${gameType}:${wagerAmount}`);
    void queueChannel.presence.enter({ playerId, gameType, wagerAmount });

    // Listen on our personal channel for a match
    const playerCh = ably.channels.get(`player:${playerId}`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void playerCh.subscribe('matched', (msg: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const d = msg.data as { roomId: string; role: string };
      setMatchedRoom({ roomId: d.roomId, role: d.role });
      setStatus('matched');
      playerCh.unsubscribe();
      void queueChannel.presence.leave();
    });

    // Call server to attempt immediate match
    const res = await fetch('/api/matchmake', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, gameType, wagerAmount }),
    });
    const data = await res.json() as { status: string; roomId?: string; role?: string };
    if (data.status === 'matched' && data.roomId) {
      setMatchedRoom({ roomId: data.roomId, role: data.role ?? 'player2' });
      setStatus('matched');
      playerCh.unsubscribe();
      void queueChannel.presence.leave();
    }
    // Otherwise stay queued — Ably presence will notify the next player to join
  }, [playerId]);

  const cancelMatchmaking = useCallback(async (gameType: string, wagerAmount: string) => {
    await fetch('/api/matchmake', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ playerId, gameType, wagerAmount }),
    });
    setStatus('idle');
  }, [playerId]);

  return { status, matchedRoom, startMatchmaking, cancelMatchmaking };
}

export function useAblyRoom(roomId: string | null, playerId: string) {
  const [gameState, setGameState] = useState<unknown>(null);
  const [roomStatus, setRoomStatus] = useState<string>('WAITING');
  const [winner, setWinner] = useState<string | null>(null);
  const [opponent, setOpponent] = useState<string | null>(null);
  const channelRef = useRef<Ably.RealtimeChannel | null>(null);

  useEffect(() => {
    if (!roomId) return;
    const ably = getAbly(playerId);
    const channel = ably.channels.get(`room:${roomId}`);
    channelRef.current = channel;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void channel.subscribe('player_joined', (msg: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const d = msg.data as { room: { player1: string; player2: string; status: string; gameState: unknown } };
      setRoomStatus(d.room.status);
      setGameState(d.room.gameState);
      setOpponent(d.room.player1.toLowerCase() === playerId.toLowerCase() ? d.room.player2 : d.room.player1);
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void channel.subscribe('game_state', (msg: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const d = msg.data as { gameState: unknown; status: string };
      setGameState(d.gameState);
      setRoomStatus(d.status);
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    void channel.subscribe('game_over', (msg: any) => {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
      const d = msg.data as { gameState: unknown; winner: string | null; status: string };
      setGameState(d.gameState);
      setWinner(d.winner);
      setRoomStatus(d.status);
    });

    // Fetch current room state
    void fetch(`/api/room?id=${roomId}`)
      .then(r => r.json())
      .then((data: { room?: { status: string; gameState: unknown; player1: string; player2: string | null } }) => {
        if (data.room) {
          setRoomStatus(data.room.status);
          setGameState(data.room.gameState);
          const opp = data.room.player1.toLowerCase() === playerId.toLowerCase()
            ? data.room.player2 : data.room.player1;
          setOpponent(opp);
        }
      });

    return () => {
      channel.unsubscribe();
    };
  }, [roomId, playerId]);

  const sendAction = useCallback(async (action: string, payload: Record<string, unknown>) => {
    await fetch('/api/game-action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, playerId, action, payload }),
    });
  }, [roomId, playerId]);

  return { gameState, roomStatus, winner, opponent, sendAction };
}
