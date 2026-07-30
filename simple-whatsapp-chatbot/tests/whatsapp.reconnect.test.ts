import { DisconnectReason } from '@whiskeysockets/baileys';
import {
  isTerminalDisconnect,
  shouldReconnect
} from '../src/services/whatsapp.service.js';

describe('WhatsApp reconnect policy', () => {
  it.each([DisconnectReason.loggedOut, DisconnectReason.badSession])(
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
});
