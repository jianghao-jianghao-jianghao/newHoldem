import { useCallback, useEffect, useRef, useState } from 'react';
import { AchievementUnlockBanner } from './components/AchievementUnlockBanner';
import { EmailOtpModal } from './components/EmailOtpModal';
import { HandRankingsModal } from './components/HandRankingsModal';
import type { SessionReviewFetchResult } from './components/HandReviewModal';
import {
  PersonalCenterModal,
  type PersonalCenterTab,
} from './components/PersonalCenterModal';
import { type CameraPreset, PokerScene3D } from './components/PokerScene3D';
import { PokerTable } from './components/PokerTable';
import { TitleScreen } from './components/TitleScreen';
import { type AccountProfile, useAuth } from './context/AuthContext';
import {
  ACHIEVEMENT_MAP,
  sanitizeAchievementIds,
  sanitizeEquippedAchievement,
  type AchievementDatesMap,
  type AchievementId,
  type EquippedAchievementPref,
} from './shared/achievements';
import { sanitizeAvatar } from './shared/avatarUtils';
import { appendChatHistory, MAX_CHAT_HISTORY } from './shared/chatUtils';
import type {
  BotChatStatus,
  ChatMessage,
  ClientTableView,
  ClientWsMessage,
  LeaderboardEntry,
  PlayerAction,
  PlayerNudgeEvent,
  RoomSummary,
  ServerWsMessage,
} from './shared/types';
import type { BotChatConfigRequest } from './components/TableChatPanel';
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
  let id = localStorage.getItem(key) || sessionStorage.getItem(key);
  if (!id) {
    id = `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  }
  try {
    localStorage.setItem(key, id);
  } catch {
    // Ignore storage quota errors
  }
  return id;
}

function getOrCreateSeatSecret(): string {
  const key = 'velvet_holdem_seat_secret';
  let secret = localStorage.getItem(key) || sessionStorage.getItem(key);
  if (!secret) {
    const bytes = new Uint8Array(16);
    if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
      crypto.getRandomValues(bytes);
      secret = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    } else {
      secret = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}_${Math.random().toString(36).slice(2)}`;
    }
  }
  try {
    localStorage.setItem(key, secret);
  } catch {
    // Ignore storage quota errors
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
  const [equippedPref, setEquippedPref] = useState<EquippedAchievementPref | undefined>(() => {
    return sanitizeEquippedAchievement(localStorage.getItem('velvet_holdem_equipped_medal'));
  });
  const [invitedRoomId, setInvitedRoomId] = useState<string | null>(() => {
    const raw = new URLSearchParams(window.location.search).get('room')?.trim().toUpperCase();
    return raw ? raw.slice(0, 12) : null;
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
  const [rooms, setRooms] = useState<RoomSummary[]>([]);
  const [lobbyFadingOut, setLobbyFadingOut] = useState(false);
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [personalCenterOpen, setPersonalCenterOpen] = useState(false);
  const [personalCenterTab, setPersonalCenterTab] = useState<PersonalCenterTab>('achievements');
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [rankingsOpen, setRankingsOpen] = useState(false);
  const [rankingsTab, setRankingsTab] = useState<'rankings' | 'gallery'>('rankings');
  const [unlockedToast, setUnlockedToast] = useState<AchievementId[]>([]);
  const [muted, setMuted] = useState(() => soundFx.isMuted());
  const [bgmEnabled, setBgmEnabled] = useState(() => soundFx.isBgmEnabled());
  const [webglFailed, setWebglFailed] = useState(false);
  const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'reconnecting'>('connecting');
  const [cameraPreset, setCameraPreset] = useState<CameraPreset>('classic');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [botChatStatus, setBotChatStatus] = useState<BotChatStatus>({
    enabled: false,
    configured: false,
    source: 'none',
  });
  const [lastNudge, setLastNudge] = useState<PlayerNudgeEvent | null>(null);
  const [nudgePulse, setNudgePulse] = useState<{ targetPlayerId: string; key: number } | null>(null);

  const {
    profile,
    updatePreferences,
    syncMatchOutcomeToCloud,
  } = useAuth();

  const wsRef = useRef<WebSocket | null>(null);
  const joinedRoomRef = useRef<{ roomId: string; name: string; avatar: string } | null>(null);
  const lobbyFadeTimerRef = useRef<number | null>(null);
  const prevIsLobbyRef = useRef<boolean>(true);
  const prevPhaseRef = useRef<string>('waiting');
  const prev2dDealRef = useRef<{ roomId: string; handNumber: number; communityCount: number } | null>(null);
  const lastAudioPotStepRef = useRef<{
    roomId: string;
    handNumber: number;
    step: number;
  } | null>(null);
  const lastCloudSyncedStampRef = useRef<string>('');
  const hydratedProfileUidRef = useRef<string | null>(null);
  const latestAchievementsRef = useRef<{
    achievements?: AchievementId[];
    achievementDates?: AchievementDatesMap;
    equippedAchievement?: EquippedAchievementPref;
  }>({});
  const sessionUnlockedRef = useRef<{
    achievements: AchievementId[];
    achievementDates: AchievementDatesMap;
  }>({ achievements: [], achievementDates: {} });

  // Hydrate user profile preferences & auto-linked achievements from signed-in account
  useEffect(() => {
    if (!profile) {
      hydratedProfileUidRef.current = null;
      return;
    }
    if (hydratedProfileUidRef.current === profile.uid) return;
    hydratedProfileUidRef.current = profile.uid;

    if (profile.displayName) {
      setPlayerName(profile.displayName);
      localStorage.setItem('velvet_holdem_name', profile.displayName);
    }
    if (profile.avatar) {
      const safe = sanitizeAvatar(profile.avatar);
      setPlayerAvatar(safe);
      localStorage.setItem('velvet_holdem_avatar', safe);
    }
    if (profile.equippedAchievement !== undefined) {
      const safeEq = sanitizeEquippedAchievement(profile.equippedAchievement);
      if (safeEq) {
        setEquippedPref(safeEq);
        localStorage.setItem('velvet_holdem_equipped_medal', safeEq);
      }
    }
    setBgmEnabled(profile.bgmEnabled);
    soundFx.setBgmEnabled(profile.bgmEnabled);
  }, [profile]);

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

  // Connect WebSocket with exponential backoff reconnection & active ping/pong zombie-socket cleanup
  useEffect(() => {
    const HEARTBEAT_INTERVAL_MS = 15_000;
    const PONG_TIMEOUT_MS = 5_000;

    let disposed = false;
    let reconnectTimer: number | null = null;
    let heartbeatTimer: number | null = null;
    let pongTimeoutTimer: number | null = null;
    let reconnectAttempt = 0;

    const clearPongTimeout = () => {
      if (pongTimeoutTimer !== null) {
        window.clearTimeout(pongTimeoutTimer);
        pongTimeoutTimer = null;
      }
    };

    const clearHeartbeat = () => {
      if (heartbeatTimer !== null) {
        window.clearInterval(heartbeatTimer);
        heartbeatTimer = null;
      }
      clearPongTimeout();
    };

    const scheduleReconnect = () => {
      if (disposed || reconnectTimer !== null) return;
      setWsStatus('reconnecting');
      const delayMs = Math.min(8000, 1000 * Math.pow(2, reconnectAttempt));
      reconnectAttempt = Math.min(reconnectAttempt + 1, 4);
      reconnectTimer = window.setTimeout(() => {
        reconnectTimer = null;
        connect();
      }, delayMs);
    };

    const teardownZombieSocket = (ws: WebSocket, reason: string) => {
      if (wsRef.current !== ws) return;
      clearHeartbeat();
      wsRef.current = null;
      try {
        ws.close(4000, reason);
      } catch {
        // Ignore close error on already-broken socket
      }
      scheduleReconnect();
    };

    const sendHeartbeatPing = (ws: WebSocket) => {
      if (wsRef.current !== ws || ws.readyState !== WebSocket.OPEN) return;
      if (pongTimeoutTimer !== null) {
        teardownZombieSocket(ws, 'Heartbeat pong timeout');
        return;
      }
      try {
        ws.send(JSON.stringify({ type: 'ping' } satisfies ClientWsMessage));
      } catch {
        teardownZombieSocket(ws, 'Heartbeat ping send failed');
        return;
      }
      pongTimeoutTimer = window.setTimeout(() => {
        pongTimeoutTimer = null;
        teardownZombieSocket(ws, 'Heartbeat pong timeout');
      }, PONG_TIMEOUT_MS);
    };

    const connect = () => {
      if (disposed) return;
      clearHeartbeat();
      const ws = new WebSocket(getWsUrl());
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed || wsRef.current !== ws) {
          try {
            ws.close();
          } catch {
            // Ignore
          }
          return;
        }
        reconnectAttempt = 0;
        setWsStatus('connected');
        setErrorMsg(null);
        clearHeartbeat();
        heartbeatTimer = window.setInterval(() => {
          sendHeartbeatPing(ws);
        }, HEARTBEAT_INTERVAL_MS);

        if (joinedRoomRef.current) {
          const authToken = localStorage.getItem('velvet_holdem_auth_token') ?? undefined;
          ws.send(
            JSON.stringify({
              type: 'join_room',
              roomId: joinedRoomRef.current.roomId,
              playerId,
              seatSecret,
              authToken,
              playerName: joinedRoomRef.current.name,
              avatar: joinedRoomRef.current.avatar,
              achievements: latestAchievementsRef.current.achievements,
              achievementDates: latestAchievementsRef.current.achievementDates,
              equippedAchievement: latestAchievementsRef.current.equippedAchievement,
            } satisfies ClientWsMessage)
          );
        }
      };

      ws.onmessage = (event) => {
        if (wsRef.current !== ws) return;
        // Any server frame (including explicit pong) confirms socket liveness
        clearPongTimeout();
        let msg: ServerWsMessage;
        try {
          msg = JSON.parse(event.data) as ServerWsMessage;
        } catch {
          return;
        }

        if (msg.type === 'pong') {
          return;
        } else if (msg.type === 'rooms_update') {
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
        } else if (msg.type === 'bot_chat_status') {
          setBotChatStatus(msg.status);
        } else if (msg.type === 'player_nudged') {
          setLastNudge(msg.nudge);
          setNudgePulse({
            targetPlayerId: msg.nudge.targetPlayerId,
            key: msg.nudge.createdAt,
          });
          soundFx.playNudge();
        } else if (msg.type === 'achievement_unlocked') {
          const unlockedAt = Date.now();
          const mergedIds = sanitizeAchievementIds([
            ...sessionUnlockedRef.current.achievements,
            ...msg.achievementIds,
          ]);
          const mergedDates: AchievementDatesMap = { ...sessionUnlockedRef.current.achievementDates };
          for (const id of msg.achievementIds) {
            if (!mergedDates[id]) mergedDates[id] = unlockedAt;
          }
          sessionUnlockedRef.current = {
            achievements: mergedIds,
            achievementDates: mergedDates,
          };
          latestAchievementsRef.current = {
            achievements: sanitizeAchievementIds([
              ...(latestAchievementsRef.current.achievements ?? []),
              ...mergedIds,
            ]),
            achievementDates: {
              ...(latestAchievementsRef.current.achievementDates ?? {}),
              ...mergedDates,
            },
          };
          const sortedUnlocked = sanitizeAchievementIds(msg.achievementIds);
          if (sortedUnlocked.length > 0) {
            const topTier = ACHIEVEMENT_MAP.get(sortedUnlocked[0])?.tier ?? 'gold';
            soundFx.playAchievementUnlock(topTier);
            setUnlockedToast(sortedUnlocked);
          }
        } else if (msg.type === 'room_deleted') {
          joinedRoomRef.current = null;
          setTable(null);
          setChatMessages([]);
          setBotChatStatus({ enabled: false, configured: false, source: 'none' });
          setLastNudge(null);
          setScreen('title');
          setErrorMsg(msg.reason);
        } else if (msg.type === 'error') {
          setErrorMsg(msg.message);
        }
      };

      ws.onerror = () => {
        if (wsRef.current !== ws) return;
        teardownZombieSocket(ws, 'WebSocket error');
      };

      ws.onclose = () => {
        if (wsRef.current !== ws) return;
        clearHeartbeat();
        wsRef.current = null;
        scheduleReconnect();
      };
    };

    const handleVisibilityOrOnline = () => {
      if (disposed) return;
      if (document.visibilityState === 'hidden') return;
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        sendHeartbeatPing(ws);
      } else if (!ws || ws.readyState === WebSocket.CLOSED) {
        if (reconnectTimer !== null) {
          window.clearTimeout(reconnectTimer);
          reconnectTimer = null;
        }
        connect();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrOnline);
    window.addEventListener('online', handleVisibilityOrOnline);

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
      document.removeEventListener('visibilitychange', handleVisibilityOrOnline);
      window.removeEventListener('online', handleVisibilityOrOnline);
      if (reconnectTimer !== null) clearTimeout(reconnectTimer);
      const current = wsRef.current;
      wsRef.current = null;
      current?.close();
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
        achievements: latestAchievementsRef.current.achievements,
        achievementDates: latestAchievementsRef.current.achievementDates,
        equippedAchievement: latestAchievementsRef.current.equippedAchievement,
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
      const authToken = localStorage.getItem('velvet_holdem_auth_token') ?? undefined;
      sendWs({
        type: 'join_room',
        roomId: cleanRoom,
        playerId,
        seatSecret,
        authToken,
        playerName: cleanName,
        avatar: cleanAvatar,
        achievements: latestAchievementsRef.current.achievements ?? profile?.achievements,
        achievementDates:
          latestAchievementsRef.current.achievementDates ?? profile?.achievementDates,
        equippedAchievement: equippedPref ?? profile?.equippedAchievement,
      });
    },
    [playerId, seatSecret, sendWs, profile, updatePreferences, equippedPref]
  );

  const handleOpenPersonalCenter = useCallback((tab: PersonalCenterTab = 'achievements') => {
    setPersonalCenterTab(tab);
    setPersonalCenterOpen(true);
  }, []);

  const handleUpdateName = useCallback(
    (nextRaw: string) => {
      const cleanName = nextRaw.trim().slice(0, 18);
      if (!cleanName) return;
      setPlayerName(cleanName);
      localStorage.setItem('velvet_holdem_name', cleanName);
      if (joinedRoomRef.current) {
        joinedRoomRef.current.name = cleanName;
        sendWs({ type: 'update_profile', playerName: cleanName });
      }
      if (profile) {
        void updatePreferences({ displayName: cleanName });
      }
    },
    [profile, sendWs, updatePreferences]
  );

  const handleUpdateAvatar = useCallback(
    (nextRaw: string) => {
      const cleanAvatar = sanitizeAvatar(nextRaw);
      setPlayerAvatar(cleanAvatar);
      try {
        localStorage.setItem('velvet_holdem_avatar', cleanAvatar);
      } catch {
        // Ignore storage quota errors
      }
      if (joinedRoomRef.current) {
        joinedRoomRef.current.avatar = cleanAvatar;
        sendWs({ type: 'update_profile', avatar: cleanAvatar });
      }
      if (profile) {
        void updatePreferences({ avatar: cleanAvatar });
      }
    },
    [profile, sendWs, updatePreferences]
  );

  const handleEquipAchievement = useCallback(
    (nextPref: EquippedAchievementPref) => {
      const safe = sanitizeEquippedAchievement(nextPref);
      if (!safe) return;
      setEquippedPref(safe);
      try {
        localStorage.setItem('velvet_holdem_equipped_medal', safe);
      } catch {
        // Ignore storage errors
      }
      if (joinedRoomRef.current) {
        sendWs({ type: 'update_profile', equippedAchievement: safe });
      }
      if (profile) {
        void updatePreferences({ equippedAchievement: safe });
      }
    },
    [profile, sendWs, updatePreferences]
  );

  const handleEmailAuthSuccess = useCallback((loaded: AccountProfile) => {
    if (loaded.displayName) {
      setPlayerName(loaded.displayName);
      localStorage.setItem('velvet_holdem_name', loaded.displayName);
    }
    if (loaded.avatar) {
      const safe = sanitizeAvatar(loaded.avatar);
      setPlayerAvatar(safe);
      localStorage.setItem('velvet_holdem_avatar', safe);
    }
    if (loaded.equippedAchievement) {
      const safeEq = sanitizeEquippedAchievement(loaded.equippedAchievement);
      if (safeEq) {
        setEquippedPref(safeEq);
        localStorage.setItem('velvet_holdem_equipped_medal', safeEq);
      }
    }
    if (loaded.achievements.length > 0) {
      sessionUnlockedRef.current = {
        achievements: sanitizeAchievementIds([
          ...sessionUnlockedRef.current.achievements,
          ...loaded.achievements,
        ]),
        achievementDates: {
          ...sessionUnlockedRef.current.achievementDates,
          ...loaded.achievementDates,
        },
      };
    }
  }, []);

  const handleCreateRoom = useCallback(
    async (params: {
      tableName: string;
      roomId?: string;
      smallBlind: number;
      bigBlind: number;
      startingChips: number;
      turnTimeoutSec: number;
      allowRebuy?: boolean;
    }): Promise<RoomSummary | null> => {
      try {
        const res = await fetch(getApiUrl('/api/rooms'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Player-Id': playerId,
            'X-Seat-Secret': seatSecret,
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
    [playerId, seatSecret]
  );

  const handleDeleteRoom = useCallback(
    async (roomId: string) => {
      try {
        const res = await fetch(getApiUrl(`/api/rooms/${encodeURIComponent(roomId)}`), {
          method: 'DELETE',
          headers: {
            'X-Player-Id': playerId,
            'X-Seat-Secret': seatSecret,
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
    [playerId, seatSecret]
  );

  const handleLeaveRoom = useCallback(() => {
    if (lobbyFadeTimerRef.current !== null) {
      window.clearTimeout(lobbyFadeTimerRef.current);
      lobbyFadeTimerRef.current = null;
    }
    setLobbyFadingOut(false);
    joinedRoomRef.current = null;
    sendWs({ type: 'leave_room' });
    setTable(null);
    setChatMessages([]);
    setBotChatStatus({ enabled: false, configured: false, source: 'none' });
    setLastNudge(null);
    setScreen('title');
  }, [sendWs]);

  const handleConfigureBotChat = useCallback(
    async (
      params: BotChatConfigRequest
    ): Promise<{ ok: boolean; error?: string; status?: BotChatStatus }> => {
      const targetRoomId = table?.roomId ?? joinedRoomRef.current?.roomId;
      if (!targetRoomId) {
        return { ok: false, error: '当前未加入牌桌' };
      }
      try {
        const res = await fetch(
          getApiUrl(`/api/rooms/${encodeURIComponent(targetRoomId)}/bot-chat/config`),
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Player-Id': playerId,
              'X-Seat-Secret': seatSecret,
            },
            body: JSON.stringify(params),
          }
        );
        const data = (await res.json().catch(() => ({}))) as {
          ok?: boolean;
          error?: string;
          status?: BotChatStatus;
        };
        if (!res.ok || !data.status) {
          return { ok: false, error: data.error ?? '保存陪练对话设置失败' };
        }
        setBotChatStatus(data.status);
        return { ok: true, status: data.status };
      } catch {
        return { ok: false, error: '无法连接服务器，请稍后重试' };
      }
    },
    [table?.roomId, playerId, seatSecret]
  );

  const handleFetchSessionReview = useCallback(
    async (bookmarkedHandNumbers: number[]): Promise<SessionReviewFetchResult> => {
      const targetRoomId = table?.roomId ?? joinedRoomRef.current?.roomId;
      if (!targetRoomId) {
        return { ok: false, error: '当前未加入牌桌' };
      }
      try {
        const res = await fetch(
          getApiUrl(`/api/rooms/${encodeURIComponent(targetRoomId)}/session-review`),
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Player-Id': playerId,
              'X-Seat-Secret': seatSecret,
            },
            body: JSON.stringify({
              playerId,
              seatSecret,
              bookmarkedHandNumbers,
            }),
          }
        );
        const data = (await res.json().catch(() => ({}))) as SessionReviewFetchResult;
        if (!res.ok || !data.ok || !data.summary || !data.reportsByHand) {
          return { ok: false, error: data.error ?? '生成整场复盘失败' };
        }
        return data;
      } catch {
        return { ok: false, error: '无法连接服务器，请稍后重试' };
      }
    },
    [table?.roomId, playerId, seatSecret]
  );

  const handleAction = useCallback(
    (action: PlayerAction) => {
      if (wsStatus !== 'connected') return;
      soundFx.notifyUserInteraction();
      if (action.type === 'fold') soundFx.playFold();
      else if (action.type === 'check') soundFx.playCheck();
      sendWs({ type: 'player_action', action });
    },
    [sendWs, wsStatus]
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
    if (muted) {
      setMuted(false);
      soundFx.setMuted(false);
      setBgmEnabled(true);
      soundFx.setBgmEnabled(true);
      if (profile) {
        void updatePreferences({ bgmEnabled: true });
      }
      return;
    }
    setBgmEnabled((prev) => {
      const next = !prev;
      soundFx.setBgmEnabled(next);
      if (profile) {
        void updatePreferences({ bgmEnabled: next });
      }
      return next;
    });
  }, [muted, profile, updatePreferences]);

  const handleToggleCameraPreset = useCallback(() => {
    setCameraPreset((prev) => (prev === 'classic' ? 'overhead' : 'classic'));
  }, []);

  const handleInspectAchievementToast = useCallback(() => {
    setUnlockedToast([]);
    handleOpenPersonalCenter('achievements');
  }, [handleOpenPersonalCenter]);

  const handleDismissAchievementToast = useCallback(() => {
    setUnlockedToast([]);
  }, []);

  const isLobby = screen === 'title' || !table;

  // Trigger smooth fade-out transition whenever transitioning from TitleScreen into the live table
  useEffect(() => {
    const wasLobby = prevIsLobbyRef.current;
    prevIsLobbyRef.current = isLobby;
    if (wasLobby && !isLobby) {
      if (lobbyFadeTimerRef.current !== null) {
        window.clearTimeout(lobbyFadeTimerRef.current);
      }
      setLobbyFadingOut(true);
      lobbyFadeTimerRef.current = window.setTimeout(() => {
        lobbyFadeTimerRef.current = null;
        setLobbyFadingOut(false);
      }, 440);
    } else if (isLobby) {
      if (lobbyFadeTimerRef.current !== null) {
        window.clearTimeout(lobbyFadeTimerRef.current);
        lobbyFadeTimerRef.current = null;
      }
      setLobbyFadingOut(false);
    }
  }, [isLobby]);

  useEffect(() => {
    return () => {
      if (lobbyFadeTimerRef.current !== null) {
        window.clearTimeout(lobbyFadeTimerRef.current);
      }
    };
  }, []);

  const selfTablePlayer = table?.players.find((p) => p.id === playerId) ?? null;

  const matchedLeaderboardEntry =
    leaderboard.find((e) => e.playerName === playerName.trim()) ?? null;
  const currentAchievements = sanitizeAchievementIds([
    ...(selfTablePlayer?.achievements ?? []),
    ...(profile?.achievements ?? []),
    ...(matchedLeaderboardEntry?.achievements ?? []),
    ...sessionUnlockedRef.current.achievements,
  ]);
  const currentAchievementDates: AchievementDatesMap = {
    ...(matchedLeaderboardEntry?.achievementDates ?? {}),
    ...(profile?.achievementDates ?? {}),
    ...(selfTablePlayer?.achievementDates ?? {}),
    ...sessionUnlockedRef.current.achievementDates,
  };
  const currentWinStreak =
    selfTablePlayer?.winStreak ??
    profile?.currentWinStreak ??
    matchedLeaderboardEntry?.currentWinStreak ??
    0;
  const effectiveEquippedPref =
    equippedPref ??
    sanitizeEquippedAchievement(selfTablePlayer?.equippedAchievement) ??
    sanitizeEquippedAchievement(profile?.equippedAchievement) ??
    sanitizeEquippedAchievement(matchedLeaderboardEntry?.equippedAchievement);

  const currentBehaviorStats = (() => {
    const a = profile?.behaviorStats ?? null;
    const b = matchedLeaderboardEntry?.behaviorStats ?? null;
    if (a && b) return a.handsPlayed >= b.handsPlayed ? a : b;
    return a ?? b ?? null;
  })();

  latestAchievementsRef.current = {
    achievements: currentAchievements.length > 0 ? currentAchievements : undefined,
    achievementDates:
      Object.keys(currentAchievementDates).length > 0 ? currentAchievementDates : undefined,
    equippedAchievement: effectiveEquippedPref,
  };

  const use3D = isDesktop && !webglFailed;

  const handleDismissInvite = useCallback(() => {
    setInvitedRoomId(null);
    if (window.location.search.includes('room=')) {
      const url = new URL(window.location.href);
      url.searchParams.delete('room');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
  }, []);

  const titleScreenElement = (fadingOut: boolean) => (
    <TitleScreen
      initialName={playerName}
      initialRoom={activeRoomId}
      invitedRoomId={invitedRoomId}
      initialAvatar={playerAvatar}
      achievements={currentAchievements}
      achievementDates={currentAchievementDates}
      equippedPref={effectiveEquippedPref}
      isDesktop={use3D}
      rooms={rooms}
      leaderboard={leaderboard}
      errorMessage={errorMsg}
      fadingOut={fadingOut}
      onEnterTable={handleEnterTable}
      onDismissInvite={handleDismissInvite}
      onCreateRoom={handleCreateRoom}
      onDeleteRoom={handleDeleteRoom}
      onOpenPersonalCenter={handleOpenPersonalCenter}
      onOpenEmailLogin={() => setEmailModalOpen(true)}
      onOpenCardGallery={() => {
        setRankingsTab('gallery');
        setRankingsOpen(true);
      }}
    />
  );

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
        titleScreenElement(false)
      ) : (
        <div className="pointer-events-none animate-table-enter">
          <PokerTable
          table={table}
          myPlayerId={playerId}
          leaderboard={leaderboard}
          selfProfileFallback={{
            avatar: playerAvatar,
            achievements: currentAchievements,
            achievementDates: currentAchievementDates,
            equippedAchievement: effectiveEquippedPref,
          }}
          chatMessages={chatMessages}
          lastNudge={lastNudge}
          botChatStatus={botChatStatus}
          muted={muted}
          bgmEnabled={bgmEnabled}
          isDesktop={use3D}
          externalModalOpen={personalCenterOpen || rankingsOpen || emailModalOpen}
          isReconnecting={wsStatus === 'reconnecting'}
          cameraPreset={cameraPreset}
          onToggleCameraPreset={handleToggleCameraPreset}
          onToggleMute={handleToggleMute}
          onToggleBgm={handleToggleBgm}
          onOpenAchievements={() => handleOpenPersonalCenter('achievements')}
          onOpenPersonalInsights={() => handleOpenPersonalCenter('insights')}
          onFetchSessionReview={handleFetchSessionReview}
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
          onConfigureBotChat={handleConfigureBotChat}
        />
        </div>
      )}

      {/* Smooth Fade-Out Veil of TitleScreen into the Live Table */}
      {!isLobby && lobbyFadingOut && titleScreenElement(true)}

      {/* Dynamic Achievement Unlocked Celebration Banner */}
      <AchievementUnlockBanner
        achievementIds={unlockedToast}
        onInspect={handleInspectAchievementToast}
        onDismiss={handleDismissAchievementToast}
      />

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

      <PersonalCenterModal
        open={personalCenterOpen}
        initialTab={personalCenterTab}
        playerName={playerName}
        playerAvatar={playerAvatar}
        unlockedIds={currentAchievements}
        achievementDates={currentAchievementDates}
        equippedPref={effectiveEquippedPref}
        winStreak={currentWinStreak}
        stats={matchedLeaderboardEntry?.stats ?? null}
        behaviorStats={currentBehaviorStats}
        leaderboard={leaderboard}
        onUpdateName={handleUpdateName}
        onUpdateAvatar={handleUpdateAvatar}
        onEquipAchievement={handleEquipAchievement}
        onRequestEmailLogin={() => setEmailModalOpen(true)}
        onClose={() => setPersonalCenterOpen(false)}
      />

      <EmailOtpModal
        open={emailModalOpen}
        defaultDisplayName={playerName.trim() || undefined}
        defaultAvatar={playerAvatar}
        localAchievements={currentAchievements}
        localAchievementDates={currentAchievementDates}
        onClose={() => setEmailModalOpen(false)}
        onSuccess={handleEmailAuthSuccess}
      />

      <HandRankingsModal
        open={rankingsOpen}
        initialTab={rankingsTab}
        onClose={() => setRankingsOpen(false)}
      />
    </div>
  );
}
