import { DisconnectReason } from '@whiskeysockets/baileys';
import {
  canResetWhatsAppCredentials,
  getReconnectDelayMs,
  isTerminalDisconnect,
  resolveReconnectEligibility,
  shouldReconnect
} from '../src/services/whatsapp.service.js';

describe('WhatsApp reconnect policy', () => {
  it.each([
    ['connected', null],
    ['logged_out', 'logged_out'],
    ['bad_session', 'bad_session'],
    ['disconnected', 'fatal']
  ] as const)(
    'allows credential reset for eligible state %s with %s classification',
    (state, lastDisconnectClassification) => {
      expect(
        canResetWhatsAppCredentials({
          state,
          lastDisconnectClassification,
          isShuttingDown: false
        })
      ).toBe(true);
    }
  );

  it.each(['connecting', 'qr_required', 'reconnecting'] as const)(
    'blocks credential reset while state is %s',
    (state) => {
      expect(
        canResetWhatsAppCredentials({
          state,
          lastDisconnectClassification: null,
          isShuttingDown: false
        })
      ).toBe(false);
    }
  );

  it('blocks credential reset while service is shutting down', () => {
    expect(
      canResetWhatsAppCredentials({
        state: 'logged_out',
        lastDisconnectClassification: 'logged_out',
        isShuttingDown: true
      })
    ).toBe(false);
  });

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

  it('never offers manual reconnect after a fatal disconnect', () => {
    expect(
      resolveReconnectEligibility({
        state: 'disconnected',
        isShuttingDown: false,
        hasScheduledReconnect: false,
        reconnectInFlight: false,
        lastDisconnectClassification: 'fatal'
      })
    ).toEqual({
      eligible: false,
      disabledReason: 'terminal_disconnect'
    });
  });

  it('still offers manual reconnect after a recoverable disconnect', () => {
    expect(
      resolveReconnectEligibility({
        state: 'disconnected',
        isShuttingDown: false,
        hasScheduledReconnect: false,
        reconnectInFlight: false,
        lastDisconnectClassification: 'recoverable'
      })
    ).toEqual({
      eligible: true,
      disabledReason: null
    });
  });
});
