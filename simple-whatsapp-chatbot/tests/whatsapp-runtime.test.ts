import { logger } from '../src/utils/logger.js';
import { WhatsAppRuntime } from '../src/services/whatsapp-runtime.service.js';

describe('WhatsAppRuntime', () => {
  it('starts initialization in the background without waiting for it', async () => {
    let resolveConnect!: () => void;
    const connect = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveConnect = resolve;
        })
    );
    const disconnect = vi.fn(async () => undefined);
    const runtime = new WhatsAppRuntime({ connect, disconnect });

    expect(runtime.start()).toBeUndefined();
    await vi.waitFor(() => expect(connect).toHaveBeenCalledOnce());

    resolveConnect();
  });

  it('observes initialization failures and leaves the process running', async () => {
    const errorLog = vi.spyOn(logger, 'error').mockImplementation(() => undefined);
    const runtime = new WhatsAppRuntime({
      connect: vi.fn(async () => {
        throw new Error('provider unavailable');
      }),
      disconnect: vi.fn(async () => undefined)
    });

    runtime.start();

    await vi.waitFor(() => {
      expect(errorLog).toHaveBeenCalledWith(
        'WhatsApp initialization failed; admin API remains available',
        { error: 'provider unavailable' }
      );
    });
  });

  it('disconnects during shutdown and never initializes twice', async () => {
    const connect = vi.fn(async () => undefined);
    const disconnect = vi.fn(async () => undefined);
    const runtime = new WhatsAppRuntime({ connect, disconnect });

    runtime.start();
    runtime.start();
    await vi.waitFor(() => expect(connect).toHaveBeenCalledOnce());
    await runtime.stop();
    runtime.start();

    expect(disconnect).toHaveBeenCalledOnce();
    expect(connect).toHaveBeenCalledOnce();
  });

  it('does not initialize when shutdown wins the startup race', async () => {
    const connect = vi.fn(async () => undefined);
    const disconnect = vi.fn(async () => undefined);
    const runtime = new WhatsAppRuntime({ connect, disconnect });

    runtime.start();
    await runtime.stop();
    await Promise.resolve();

    expect(disconnect).toHaveBeenCalledOnce();
    expect(connect).not.toHaveBeenCalled();
  });
});
