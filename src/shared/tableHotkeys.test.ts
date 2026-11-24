import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveTableHotkeyAction } from './tableHotkeys';

test('resolveTableHotkeyAction triggers start_next_hand on N, Enter, and Space during showdown/waiting', () => {
  const readyCtx = {
    modalBlocked: false,
    chatOpen: false,
    canStartHand: true,
    isReconnecting: false,
    hasActiveTurnActions: false,
  };

  assert.equal(resolveTableHotkeyAction({ key: 'n' }, readyCtx), 'start_next_hand');
  assert.equal(resolveTableHotkeyAction({ key: 'N' }, readyCtx), 'start_next_hand');
  assert.equal(resolveTableHotkeyAction({ key: 'Enter' }, readyCtx), 'start_next_hand');
  assert.equal(resolveTableHotkeyAction({ key: ' ' }, readyCtx), 'start_next_hand');
});

test('resolveTableHotkeyAction guards modals, chat, text inputs, active turns, and button focus', () => {
  const readyCtx = {
    modalBlocked: false,
    chatOpen: false,
    canStartHand: true,
    isReconnecting: false,
    hasActiveTurnActions: false,
  };

  // Never fire while typing or with modifier keys or key repeat
  assert.equal(resolveTableHotkeyAction({ key: 'n', isTextInputTarget: true }, readyCtx), null);
  assert.equal(resolveTableHotkeyAction({ key: 'n', ctrlKey: true }, readyCtx), null);
  assert.equal(resolveTableHotkeyAction({ key: 'n', repeat: true }, readyCtx), null);

  // Enter/Space must not double-trigger when focus is already on a button
  assert.equal(
    resolveTableHotkeyAction({ key: 'Enter', isInteractiveTarget: true }, readyCtx),
    null
  );
  assert.equal(
    resolveTableHotkeyAction({ key: ' ', isInteractiveTarget: true }, readyCtx),
    null
  );
  // Explicit N still works cleanly even if a non-input button has focus
  assert.equal(
    resolveTableHotkeyAction({ key: 'n', isInteractiveTarget: true }, readyCtx),
    'start_next_hand'
  );

  // Blocked during active turn, reconnecting, chat open, or modal open
  assert.equal(
    resolveTableHotkeyAction({ key: 'n' }, { ...readyCtx, hasActiveTurnActions: true }),
    null
  );
  assert.equal(
    resolveTableHotkeyAction({ key: 'n' }, { ...readyCtx, isReconnecting: true }),
    null
  );
  assert.equal(
    resolveTableHotkeyAction({ key: 'n' }, { ...readyCtx, chatOpen: true }),
    null
  );
  assert.equal(
    resolveTableHotkeyAction({ key: 'n' }, { ...readyCtx, modalBlocked: true }),
    null
  );

  // Chat toggle T works when no modal is open
  assert.equal(resolveTableHotkeyAction({ key: 't' }, readyCtx), 'toggle_chat');
  assert.equal(
    resolveTableHotkeyAction({ key: 't' }, { ...readyCtx, modalBlocked: true }),
    null
  );
});
