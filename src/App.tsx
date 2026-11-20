import { useCallback, useEffect, useRef, useState } from 'react';
import { AchievementMedalIcon } from './components/AchievementBadge';
import { AchievementsModal } from './components/AchievementsModal';
import { HandRankingsModal } from './components/HandRankingsModal';
import { type CameraPreset, PokerScene3D } from './components/PokerScene3D';
import { PokerTable } from './components/PokerTable';
import { TitleScreen } from './components/TitleScreen';
import { useAuth } from './context/AuthContext';
import {
  ACHIEVEMENT_MAP,
  sanitizeAchievementIds,
  type AchievementDatesMap,
  type AchievementId,
} from './shared/achievements';
import { sanitizeAvatar } from './shared/avatarUtils';
import { appendChatHistory, MAX_CHAT_HISTORY } from './shared/chatUtils';
import type {
  ChatMessage,
  ClientTableView,
  ClientWsMessage,
  LeaderboardEntry,
  PlayerAction,
  PlayerNudgeEvent,
  RoomSummary,
  ServerWsMessage,
} from './shared/types';
import { type ChipActionKind, soundFx } from './utils/soundFx';

const SERVER_BASE_URL = (
  (import.meta.env.VITE_SERVER_URL as string | undefined) ?? ''
)
  .trim()
  .replace(/\/+$/, '');

function getApiUrl(path: string): string {
  return SERVER_BASE_URL ? `${SERVER_BASE_URL}${path}` : path;
}

function getWsUrl(): string {
  if (SERVER_BASE_URL) {
    try {
      const parsed = new URL(SERVER_BASE_URL);
      const protocol = parsed.protocol === 'https:' ? 'wss:' : 'ws:';
      return `${protocol}//${parsed.host}/ws`;
    } catch {
      // Fall back to current origin if VITE_SERVER_URL is invalid
    }
  }
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocol}//${window.location.host}/ws`;
}

function getOrCreatePlayerId(): string {
  const key = 'velvet_holdem_player_id';
  let id = sessionStorage.getItem(key);
  if (!id) {
    id = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    sessionStorage.setItem(key, id);
  }
  return id;
}

function getOrCreateSeatSecret(): string {
  const key = 'velvet_holdem_seat_secret';
  let secret = sessionStorage.getItem(key);
  if (!secret) {
    const bytes = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(bytes);
      secret = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    } else {
      secret = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
    }
    sessionStorage.setItem(key, secret);
  }
  return secret;
}

export default function App() {
  const [playerId] = useState<string>(() => getOrCreatePlayerId());
  const [seatSecret] = useState<string>(() => getOrCreateSeatSecret());
  const [playerName, setPlayerName] = useState<string>(() => {
    return localStorage.getItem('velvet_holdem_name') ?? '';
  });
  const [playerAvatar, setPlayerAvatar] = useState<string>(() => {
    return sanitizeAvatar(localStorage.getItem('velvet_holdem_avatar') ?? 'default');
  });
  const [activeRoomId, setActiveRoomId] = useState<string>(() => {
    const params = new URLSearchParams(window.location.search);
    return (params.get('room') || 'CLUB01').toUpperCase();
  });
  const [isDesktop, setIsDesktop] = useState<boolean>(() => {
    if (typeof window === 'undefined') return true;
    return window.matchMedia('(min-width: 768px)').matches;
  });

  const [screen, setScreen] = useState<'title' | 'playing'>('title');
  const [table, setTable] = useState<ClientTableView | null>(null);
  const [rooms, setRooms] = useState<RoomSummary[]>([
    {
      roomId: 'CLUB01',
      tableName: '俱乐部大厅桌',
      playerCount: 0,
      phase: 'waiting',
      smallBlind: 10,
      bigBlind: 20,
      startingChips: 2000,
      createdAt: Date.now(),
    },
  ]);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [achievementsOpen, setAchievementsOpen] = useState(false);
  const [rankingsOpen, setRankingsOpen] = useState(false);
  const [rankingsTab, setRankingsTab] = useState<'rankings' | 'gallery'>('rankings');
  const [unlockedToast, setUnlockedToast] = useState<AchievementId[]>([]);
  const [muted, setMuted] = useState(() => soundFx.isMuted());
  const [bgmEnabled, setBgmEnabled] = useState(() => soundFx.isBgmEnabled());
  const [webglFailed, setWebglFailed] = useState(false);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('classic');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [lastNudge, setLastNudge] = useState<PlayerNudgeEvent | null>(null);
  const [nudgePulse, setNudgePulse] = useState<{ targetPlayerId: string; key: number } | null>(null);

  const {
    profile,
    updatePreferences,
    syncMatchOutcomeToCloud,
  } = useAuth();

  const wsRef = useRef<WebSocket | null>(null);
  const joinedRoomRef = useRef<{ roomId: string; name: string; avatar: string } | null>(null);
  const prevPhaseRef = useRef<string>('waiting');
  const prev2dDealRef = useRef<{ roomId: string; handNumber: number; communityCount: number } | null>(null);
  const lastAudioPotStepRef = useRef<{
    roomId: string;
    handNumber: number;
    step: number;
  } | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const lastCloudSyncedStampRef = useRef<string>('');
  const hydratedProfileUidRef = useRef<string | null>(null);

  // Hydrate user profile preferences from verified email account
  useEffect(() => {
    if (!profile) {
      hydratedProfileUidRef.current = null;
      return;
    }
    if (hydratedProfileUidRef.current === profile.uid) return;
    hydratedProfileUidRef.current = profile.uid;

    if (!playerName.trim() && profile.displayName) {
      setPlayerName(profile.displayName);
      localStorage.setItem('velvet_holdem_name', profile.displayName);
    }
    if (profile.avatar && playerAvatar === 'default') {
      const safe = sanitizeAvatar(profile.avatar);
      setPlayerAvatar(safe);
      localStorage.setItem('velvet_holdem_avatar', safe);
    }
    setBgmEnabled(profile.bgmEnabled);
    soundFx.setBgmEnabled(profile.bgmEnabled);
  }, [profile, playerName, playerAvatar]);

  // Track desktop (>=768px) vs mobile (<768px) to keep mobile completely 2D
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 768px)');
    const update = () => setIsDesktop(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Fade in Jazz Lounge ambient music cleanly on first user interaction
  useEffect(() => {
    const unlockAudio = () => {
      soundFx.notifyUserInteraction();
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
    window.addEventListener('pointerdown', unlockAudio, { passive: true });
    window.addEventListener('keydown', unlockAudio, { passive: true });
    return () => {
      window.removeEventListener('pointerdown', unlockAudio);
      window.removeEventListener('keydown', unlockAudio);
    };
  }, []);

  // Mirror state machine to document.body.dataset.state
  useEffect(() => {
    document.body.dataset.state = screen;
  }, [screen]);

  const sendWs = useCallback((msg: ClientWsMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    }
  }, []);

  // Connect WebSocket with exponential backoff reconnection & 15s keepalive heartbeat
  useEffect(() => {
    let disposed = false;
    let reconnectTimer: number | null = null;
    let heartbeatTimer: number | null = null;
    let reconnectAttempt = 0;

    const clearHeartbeat = () => {
      if (heartbeatTimer !== null) {
        window.clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
    };

    const connect = () => {
      if (disposed) return;
      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        reconnectAttempt = 0;
        setWsStatus('connected');
        setErrorMsg(null);
        clearHeartbeat();
        heartbeatTimer = window.setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' } satisfies ClientWsMessage));
          }
        }, 15_000);

        if (joinedRoomRef.current) {
          ws.send(
            JSON.stringify({
              type: 'join_room',
              roomId: joinedRoomRef.current.roomId,
              playerId,
              seatSecret,
              playerName: joinedRoomRef.current.name,
              avatar: joinedRoomRef.current.avatar,
            } satisfies ClientWsMessage)
          );
        }
      };

      ws.onmessage = (event) => {
        let msg: ServerWsMessage;
        try {
          msg = JSON.parse(event.data) as ServerWsMessage;
        } catch {
          return;
        }

        if (msg.type === 'rooms_update') {
          setRooms(msg.rooms);
        } else if (msg.type === 'leaderboard_update') {
          setLeaderboard(msg.entries);
        } else if (msg.type === 'table_state') {
          setTable(msg.state);
          setScreen('playing');
          setErrorMsg(null);
        } else if (msg.type === 'chat_history') {
          setChatMessages(msg.messages);
        } else if (msg.type === 'chat_message') {
          setChatMessages((prev) =>
            appendChatHistory(prev, msg.message, MAX_CHAT_HISTORY)
          );
        } else if (msg.type === 'player_nudged') {
          setLastNudge(msg.nudge);
          setNudgePulse({
            targetPlayerId: msg.nudge.targetPlayerId,
            key: msg.nudge.createdAt,
          });
          soundFx.playNudge();
        } else if (msg.type === 'achievement_unlocked') {
          setUnlockedToast(msg.achievementIds);
          if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
          toastTimerRef.current = window.setTimeout(() => {
            setUnlockedToast([]);
          }, 4800);
        } else if (msg.type === 'room_deleted') {
          joinedRoomRef.current = null;
          setTable(null);
          setChatMessages([]);
          setLastNudge(null);
          setScreen('title');
          setErrorMsg(msg.reason);
        } else if (msg.type === 'error') {
          setErrorMsg(msg.message);
        }
      };

      ws.onclose = () => {
        clearHeartbeat();
        if (!disposed) {
          setWsStatus('reconnecting');
          const delayMs = Math.min(8000, 1000 * Math.pow(2, reconnectAttempt));
          reconnectAttempt = Math.min(reconnectAttempt + 1, 4);
          reconnectTimer = window.setTimeout(connect, delayMs);
        }
      };
    };

    connect();

    fetch(getApiUrl('/api/leaderboard'))
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.entries)) setLeaderboard(d.entries);
      })
      .catch(() => {});

    fetch(getApiUrl('/api/rooms'))
      .then((r) => r.json())
      .then((d) => {
        if (Array.isArray(d.rooms)) setRooms(d.rooms);
      })
      .catch(() => {});

    return () => {
      disposed = true;
      clearHeartbeat();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
      wsRef.current?.close();
    };
  }, [playerId, seatSecret]);

  // Support ?autostart=1 for instant entry into table
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get('autostart') === '1' && !joinedRoomRef.current) {
      const autoName =
        playerName.trim() || `牌手${Math.floor(100 + Math.random() * 900)}`;
      const room = (params.get('room') || 'CLUB01').toUpperCase();
      setPlayerName(autoName);
      setActiveRoomId(room);
      joinedRoomRef.current = { roomId: room, name: autoName, avatar: playerAvatar };
      sendWs({
        type: 'join_room',
        roomId: room,
        playerId,
        seatSecret,
        playerName: autoName,
        avatar: playerAvatar,
      });
    }
  }, [playerId, seatSecret, playerName, playerAvatar, sendWs]);

  // Trigger win fanfare on showdown transition and sync cloud profile stats
  useEffect(() => {
    if (!table) return;
    if (table.phase === 'showdown' && prevPhaseRef.current !== 'showdown') {
      soundFx.playWin();
      if (profile) {
        const cleanName = playerName.trim() || profile.displayName;
        const entry = leaderboard.find((e) => e.playerName === cleanName);
        const stamp = `${table.roomId}:${table.handNumber}:${entry?.updatedAt ?? 0}`;
        if (entry && lastCloudSyncedStampRef.current !== stamp) {
          lastCloudSyncedStampRef.current = stamp;
          void syncMatchOutcomeToCloud(entry, playerAvatar);
        }
      }
    }
    prevPhaseRef.current = table.phase;
  }, [table, profile, playerName, playerAvatar, leaderboard, syncMatchOutcomeToCloud]);

  // Trigger denomination-weighted physical chip collision audio on every Call, Raise/Bet, and All-in
  useEffect(() => {
    if (!table) {
      lastAudioPotStepRef.current = null;
      return;
    }

    const timeline = table.analytics?.currentPotTimeline ?? [];
    const latestStep = timeline.length > 0 ? timeline[timeline.length - 1].step : 0;
    const prev = lastAudioPotStepRef.current;

    // First snapshot on room join/switch: establish baseline without replaying past audio
    if (!prev || prev.roomId !== table.roomId) {
      lastAudioPotStepRef.current = {
        roomId: table.roomId,
        handNumber: table.handNumber,
        step: latestStep,
      };
      return;
    }

    const isNewHand = prev.handNumber !== table.handNumber;
    const baselineStep = isNewHand ? 0 : prev.step;
    const newEvents = timeline.filter(
      (pt) => pt.step > baselineStep && pt.amountAdded > 0
    );

    lastAudioPotStepRef.current = {
      roomId: table.roomId,
      handNumber: table.handNumber,
      step: latestStep,
    };

    if (newEvents.length === 0) return;

    // Prioritize player actions (call / bet / raise / allin); blinds play softly when starting a hand
    const actionable = newEvents.filter((ev) => ev.actionType !== 'blind');
    const eventsToPlay = actionable.length > 0 ? actionable : newEvents.slice(-1);
    const use3DTable = isDesktop && !webglFailed;
    const baseDelay = use3DTable ? 190 : 25;

    eventsToPlay.forEach((ev, idx) => {
      let actionKind: ChipActionKind = 'call';
      if (ev.actionType === 'allin') actionKind = 'allin';
      else if (ev.actionType === 'raise' || ev.actionType === 'bet') actionKind = 'raise';
      else if (ev.actionType === 'blind') actionKind = 'blind';

      soundFx.playChipAction({
        amount: ev.amountAdded,
        actionKind,
        bigBlind: table.bigBlind,
        pot: Math.max(0, ev.potAfter - ev.amountAdded),
        delayMs: baseDelay + idx * 95,
      });
    });
  }, [table, isDesktop, webglFailed]);

  // Play shuffle and community-card snap audio in 2D / mobile / WebGL-fallback mode
  useEffect(() => {
    const use3DTable = isDesktop && !webglFailed;
    if (!table || use3DTable) {
      prev2dDealRef.current = table
        ? {
            roomId: table.roomId,
            handNumber: table.handNumber,
            communityCount: table.communityCards.length,
          }
        : null;
      return;
    }

    const prev = prev2dDealRef.current;
    const commCount = table.communityCards.length;
    prev2dDealRef.current = {
      roomId: table.roomId,
      handNumber: table.handNumber,
      communityCount: commCount,
    };

    if (!prev || prev.roomId !== table.roomId) return;
    if (table.handNumber > prev.handNumber && table.phase !== 'waiting') {
      soundFx.playShuffle();
      soundFx.playCardSnap(120, 'hole');
      soundFx.playCardSnap(210, 'hole');
    } else if (table.handNumber === prev.handNumber && commCount > prev.communityCount) {
      for (let i = prev.communityCount; i < commCount; i++) {
        const stage = i < 3 ? 'flop' : i === 3 ? 'turn' : 'river';
        soundFx.playCardSnap((i - prev.communityCount) * 70, stage);
      }
    }
  }, [table, isDesktop, webglFailed]);

  // Global M shortcut to mute SFX/BGM audio (ignores Ctrl/Meta/Alt combos and editable elements)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (e.key.toLowerCase() === 'm') {
        setMuted((prev) => {
          const next = !prev;
          soundFx.setMuted(next);
          return next;
        });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const handleEnterTable = useCallback(
    (name: string, room: string, avatar: string) => {
      soundFx.notifyUserInteraction();
      const cleanName = name.trim();
      const cleanRoom = room.trim().toUpperCase() || 'CLUB01';
      const cleanAvatar = sanitizeAvatar(avatar);
      localStorage.setItem('velvet_holdem_name', cleanName);
      try {
        localStorage.setItem('velvet_holdem_avatar', cleanAvatar);
      } catch {
        // Ignore storage quota errors for oversized custom avatars
      }
      setPlayerName(cleanName);
      setPlayerAvatar(cleanAvatar);
      setActiveRoomId(cleanRoom);
      setChatMessages([]);
      setLastNudge(null);
      joinedRoomRef.current = { roomId: cleanRoom, name: cleanName, avatar: cleanAvatar };
      if (profile) {
        void updatePreferences({ displayName: cleanName, avatar: cleanAvatar });
      }
      sendWs({
        type: 'join_room',
        roomId: cleanRoom,
        playerId,
        seatSecret,
        playerName: cleanName,
        avatar: cleanAvatar,
        achievements: profile?.achievements,
        achievementDates: profile?.achievementDates,
      });
    },
    [playerId, seatSecret, sendWs, profile, updatePreferences]
  );

  const handleCreateRoom = useCallback(
    async (params: {
      tableName: string;
      roomId?: string;
      smallBlind: number;
      bigBlind: number;
      startingChips: number;
    }): Promise<RoomSummary | null> => {
      try {
        const res = await fetch(getApiUrl('/api/rooms'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Player-Id': playerId,
          },
          body: JSON.stringify(params),
        });
        const data = (await res.json()) as { room?: RoomSummary; error?: string };
        if (!res.ok || !data.room) {
          setErrorMsg(data.error ?? '创建牌桌失败');
          return null;
        }
        const created = data.room;
        setRooms((prev) => {
          if (prev.some((r) => r.roomId === created.roomId)) return prev;
          return [created, ...prev];
        });
        setActiveRoomId(created.roomId);
        setErrorMsg(null);
        return created;
      } catch {
        setErrorMsg('无法连接服务器，请检查网络或服务器地址');
        return null;
      }
    },
    [playerId]
  );

  const handleDeleteRoom = useCallback(
    async (roomId: string) => {
      try {
        const res = await fetch(getApiUrl(`/api/rooms/${encodeURIComponent(roomId)}`), {
          method: 'DELETE',
          headers: {
            'X-Player-Id': playerId,
          },
        });
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as { error?: string };
          setErrorMsg(data.error ?? '删除牌桌失败');
          return;
        }
        setRooms((prev) => prev.filter((r) => r.roomId !== roomId));
        setErrorMsg(null);
      } catch {
        setErrorMsg('删除牌桌失败，无法连接服务器');
      }
    },
    [playerId]
  );

  const handleLeaveRoom = useCallback(() => {
    joinedRoomRef.current = null;
    sendWs({ type: 'leave_room' });
    setTable(null);
    setChatMessages([]);
    setLastNudge(null);
    setScreen('title');
  }, [sendWs]);

  const handleAction = useCallback(
    (action: PlayerAction) => {
      soundFx.notifyUserInteraction();
      if (action.type === 'fold') soundFx.playFold();
      else if (action.type === 'check') soundFx.playCheck();
      sendWs({ type: 'player_action', action });
    },
    [sendWs]
  );

  const handleRevealCards = useCallback(() => {
    soundFx.playReveal();
    sendWs({ type: 'reveal_cards' });
  }, [sendWs]);

  const handleToggleMute = useCallback(() => {
    setMuted((prev) => {
      const next = !prev;
      soundFx.setMuted(next);
      return next;
    });
  }, []);

  const handleToggleBgm = useCallback(() => {
    soundFx.notifyUserInteraction();
    setBgmEnabled((prev) => {
      const next = !prev;
      soundFx.setBgmEnabled(next);
      if (profile) {
        void updatePreferences({ bgmEnabled: next });
      }
      return next;
    });
  }, [profile, updatePreferences]);

  const handleToggleCameraPreset = useCallback(() => {
    setCameraPreset((prev) => (prev === 'classic' ? 'overhead' : 'classic'));
  }, []);

  const isLobby = screen === 'title' || !table;
  const selfTablePlayer = table?.players.find((p) => p.id === playerId) ?? null;

  const matchedLeaderboardEntry =
    leaderboard.find((e) => e.playerName === playerName.trim()) ?? null;
  const currentAchievements = sanitizeAchievementIds([
    ...(selfTablePlayer?.achievements ?? []),
    ...(profile?.achievements ?? []),
    ...(matchedLeaderboardEntry?.achievements ?? []),
  ]);
  const currentAchievementDates: AchievementDatesMap = {
    ...(matchedLeaderboardEntry?.achievementDates ?? {}),
    ...(profile?.achievementDates ?? {}),
    ...(selfTablePlayer?.achievementDates ?? {}),
  };
  const currentWinStreak =
    selfTablePlayer?.winStreak ??
    profile?.currentWinStreak ??
    matchedLeaderboardEntry?.currentWinStreak ??
    0;

  const use3D = isDesktop && !webglFailed;

  return (
    <div className="relative min-h-dvh bg-[#090B0C]">
      {/* Desktop (>=768px) Three.js 3D Poker Table; falls back cleanly to 2D if WebGL is unavailable */}
      {use3D && (
        <div className="fixed inset-0 z-0">
          <PokerScene3D
            table={table}
            myPlayerId={playerId}
            cameraPreset={cameraPreset}
            ambientOnly={isLobby}
            nudgePulse={nudgePulse}
            onWebGlUnavailable={() => setWebglFailed(true)}
          />
        </div>
      )}

      {isLobby ? (
        <TitleScreen
          initialName={playerName}
          initialRoom={activeRoomId}
          initialAvatar={playerAvatar}
          isDesktop={use3D}
          rooms={rooms}
          errorMessage={errorMsg}
          onEnterTable={handleEnterTable}
          onCreateRoom={handleCreateRoom}
          onDeleteRoom={handleDeleteRoom}
          onOpenAchievements={() => setAchievementsOpen(true)}
          onOpenCardGallery={() => {
            setRankingsTab('gallery');
            setRankingsOpen(true);
          }}
        />
      ) : (
        <PokerTable
          table={table}
          myPlayerId={playerId}
          chatMessages={chatMessages}
          lastNudge={lastNudge}
          muted={muted}
          bgmEnabled={bgmEnabled}
          isDesktop={use3D}
          externalModalOpen={achievementsOpen || rankingsOpen}
          cameraPreset={cameraPreset}
          onToggleCameraPreset={handleToggleCameraPreset}
          onToggleMute={handleToggleMute}
          onToggleBgm={handleToggleBgm}
          onOpenAchievements={() => setAchievementsOpen(true)}
          onOpenRankings={() => {
            setRankingsTab('rankings');
            setRankingsOpen(true);
          }}
          onLeaveRoom={handleLeaveRoom}
          onStartHand={() => sendWs({ type: 'start_hand' })}
          onRevealCards={handleRevealCards}
          onToggleAutoNext={(enabled) => sendWs({ type: 'toggle_auto_next', enabled })}
          onNudgePlayer={(targetPlayerId) => sendWs({ type: 'nudge_player', targetPlayerId })}
          onAddBot={() => sendWs({ type: 'add_bot' })}
          onRemoveBot={(botId) => sendWs({ type: 'remove_bot', botId })}
          onRebuy={() => sendWs({ type: 'rebuy' })}
          onUpdateBlindSettings={(params) =>
            sendWs({
              type: 'update_blind_settings',
              smallBlind: params.smallBlind,
              bigBlind: params.bigBlind,
              manualBlindTarget: params.manualBlindTarget,
            })
          }
          onAction={handleAction}
          onSendChat={(text) => sendWs({ type: 'send_chat', text })}
        />
      )}

      {/* Achievement Unlocked Celebration Toast */}
      {unlockedToast.length > 0 && (
        <div
          role="status"
          data-testid="achievement-toast"
          className="fixed top-14 left-1/2 z-40 flex -translate-x-1/2 items-center gap-2.5 rounded-md border border-[#D4A853]/65 bg-[#121614]/96 px-4 py-2.5 shadow-2xl animate-chip-impact"
        >
          <AchievementMedalIcon id={unlockedToast[0]} size="md" />
          <div className="text-xs">
            <div className="font-bold text-[#F5E4B8]">
              解锁新成就 · {ACHIEVEMENT_MAP.get(unlockedToast[0])?.name}
              {unlockedToast.length > 1 ? ` 等 ${unlockedToast.length} 项` : ''}
            </div>
            <div className="text-[11px] text-[#9EB0A6]">
              {ACHIEVEMENT_MAP.get(unlockedToast[0])?.description}
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              setUnlockedToast([]);
              setAchievementsOpen(true);
            }}
            className="ml-1 rounded border border-[#D4A853]/40 bg-[#D4A853]/15 px-2 py-1 text-[11px] font-semibold text-[#F5E4B8] hover:bg-[#D4A853]/25 transition-colors whitespace-nowrap"
          >
            查看
          </button>
        </div>
      )}

      {/* Subtle transient reconnecting banner when connection drops mid-table */}
      {screen === 'playing' && wsStatus === 'reconnecting' && (
        <div
          role="status"
          data-testid="ws-reconnecting-banner"
          className="fixed top-14 left-1/2 z-50 -translate-x-1/2 rounded border border-[#D4A853]/50 bg-[#14110B]/95 px-3.5 py-1.5 text-xs font-medium text-[#F0DFB3] shadow-xl"
        >
          网络连接波动，正在自动重连牌桌…
        </div>
      )}

      {/* Subtle transient error/notice banner when inside table */}
      {screen === 'playing' && errorMsg && (
        <div
          role="alert"
          className="fixed bottom-4 right-4 z-40 flex items-center gap-3 rounded border border-[#DC2626]/40 bg-[#231214] px-4 py-2.5 text-sm text-[#FCA5A5] shadow-xl"
        >
          <span>{errorMsg}</span>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-xs underline hover:text-white"
          >
            关闭
          </button>
        </div>
      )}

      <AchievementsModal
        open={achievementsOpen}
        playerName={playerName}
        unlockedIds={currentAchievements}
        achievementDates={currentAchievementDates}
        winStreak={currentWinStreak}
        stats={matchedLeaderboardEntry?.stats ?? null}
        onClose={() => setAchievementsOpen(false)}
      />

      <HandRankingsModal
        open={rankingsOpen}
        initialTab={rankingsTab}
        onClose={() => setRankingsOpen(false)}
      />
    </div>
  );
}
