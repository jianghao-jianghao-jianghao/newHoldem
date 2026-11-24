export interface TableHotkeyEventLike {
  key: string;
  ctrlKey?: boolean;
  metaKey?: boolean;
  altKey?: boolean;
  repeat?: boolean;
  isTextInputTarget?: boolean;
  isInteractiveTarget?: boolean;
}

export interface TableHotkeyContext {
  modalBlocked: boolean;
  chatOpen: boolean;
  canStartHand: boolean;
  isReconnecting: boolean;
  hasActiveTurnActions: boolean;
}

export type TableHotkeyResult = 'toggle_chat' | 'start_next_hand' | null;

/**
 * Resolves table-level keyboard shortcuts safely without colliding with
 * text inputs, modifier combos, open modals, or focused interactive controls.
 *
 * - `T`: toggle table chat (when no modal is open)
 * - `N` / `Enter` / `Space`: start next hand when the table is in waiting/showdown
 *   and ready to deal (Issue #6)
 */
export function resolveTableHotkeyAction(
  event: TableHotkeyEventLike,
  ctx: TableHotkeyContext
): TableHotkeyResult {
  if (ctx.modalBlocked) return null;
  if (event.ctrlKey || event.metaKey || event.altKey || event.repeat) return null;
  if (event.isTextInputTarget) return null;

  const lowerKey = event.key.toLowerCase();

  if (lowerKey === 't') {
    return 'toggle_chat';
  }

  if (
    !ctx.chatOpen &&
    ctx.canStartHand &&
    !ctx.isReconnecting &&
    !ctx.hasActiveTurnActions
  ) {
    if (lowerKey === 'n') {
      return 'start_next_hand';
    }
    if ((event.key === 'Enter' || event.key === ' ') && !event.isInteractiveTarget) {
      return 'start_next_hand';
    }
  }

  return null;
}
