import { DisconnectReason } from '@whiskeysockets/baileys';
import {
  getReconnectDelayMs,
  isTerminalDisconnect,
  shouldReconnect
} from '../src/services/whatsapp.service.js';

describe('WhatsApp reconnect policy', () => {
  it.each([
    DisconnectReason.loggedOut,
    DisconnectReason.badSession,
    DisconnectReason.forbidden,
    DisconnectReason.multideviceMismatch,
    DisconnectReason.connectionReplaced,
    405
  ])(
    'does not reconnect terminal disconnect code %s',
    (statusCode) => {
      expect(isTerminalDisconnect(statusCode)).toBe(true);
      expect(shouldReconnect(statusCode, false)).toBe(false);
    }
  );

  it('reconnects recoverable and unknown disconnects', () => {
    expect(shouldReconnect(DisconnectReason.restartRequired, false)).toBe(true);
    expect(shouldReconnect(undefined, false)).toBe(true);
  });

  it('never reconnects during shutdown', () => {
    expect(shouldReconnect(DisconnectReason.restartRequired, true)).toBe(false);
  });

  it('backs off service and rate-limit failures', () => {
    expect(getReconnectDelayMs(DisconnectReason.unavailableService)).toBe(60_000);
    expect(getReconnectDelayMs(429)).toBe(300_000);
    expect(getReconnectDelayMs(undefined)).toBe(15_000);
  });
});
