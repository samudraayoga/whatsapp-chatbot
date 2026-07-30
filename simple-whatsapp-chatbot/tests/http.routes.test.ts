import request from 'supertest';
import { createApp } from '../src/app.js';
import type { MessageService } from '../src/services/message.service.js';
import type { WhatsAppService } from '../src/services/whatsapp.service.js';

type MockServicesOptions = {
  status?: 'connecting' | 'connected' | 'disconnected';
};

const createMockServices = ({ status = 'connected' }: MockServicesOptions = {}) => {
  const whatsappService = {
    getStatus: vi.fn(() => status),
    sendText: vi.fn(async () => ({
      key: { id: 'provider-outgoing-1' }
    }))
  } as unknown as WhatsAppService;

  const messageService = {
    saveMessage: vi.fn(async () => ({ inserted: true }))
  } as unknown as MessageService;

  return { whatsappService, messageService };
};

describe('HTTP route characterization', () => {
  it('reports database and WhatsApp health independently', async () => {
    const services = createMockServices({ status: 'disconnected' });
    const app = createApp({
      ...services,
      databaseHealthCheck: async () => true
    });

    const response = await request(app).get('/health').expect(200);

    expect(response.body).toEqual({
      success: true,
      service: 'simple-whatsapp-chatbot',
      database: 'connected',
      whatsapp: 'disconnected'
    });
  });

  it('returns the current WhatsApp status', async () => {
    const app = createApp({
      ...createMockServices({ status: 'connecting' }),
      databaseHealthCheck: async () => true
    });

    const response = await request(app).get('/api/whatsapp/status').expect(200);

    expect(response.body).toEqual({
      success: true,
      status: 'connecting'
    });
  });

  it('protects message sending with the API key', async () => {
    const app = createApp({
      ...createMockServices(),
      databaseHealthCheck: async () => true
    });

    await request(app)
      .post('/api/messages/send')
      .send({ phone: '081234567890', message: 'Halo' })
      .expect(401);
  });

  it.each([
    [{ message: 'Halo' }, 'phone is required'],
    [{ phone: '081234567890' }, 'message is required'],
    [{ phone: '123', message: 'Halo' }, 'Invalid phone number'],
    [
      { phone: '081234567890', message: 'a'.repeat(4097) },
      'message must be 4096 characters or less'
    ]
  ])('validates send payload %#', async (payload, errorMessage) => {
    const app = createApp({
      ...createMockServices(),
      databaseHealthCheck: async () => true
    });

    const response = await request(app)
      .post('/api/messages/send')
      .set('X-API-Key', 'test-api-key')
      .send(payload)
      .expect(400);

    expect(response.body.message).toBe(errorMessage);
  });

  it('rejects send while WhatsApp is disconnected', async () => {
    const app = createApp({
      ...createMockServices({ status: 'disconnected' }),
      databaseHealthCheck: async () => true
    });

    const response = await request(app)
      .post('/api/messages/send')
      .set('X-API-Key', 'test-api-key')
      .send({ phone: '081234567890', message: 'Halo' })
      .expect(503);

    expect(response.body.message).toBe('WhatsApp is not connected');
  });

  it('normalizes, sends, and persists a valid message', async () => {
    const services = createMockServices();
    const app = createApp({
      ...services,
      databaseHealthCheck: async () => true
    });

    const response = await request(app)
      .post('/api/messages/send')
      .set('X-API-Key', 'test-api-key')
      .send({ phone: '0812-3456-7890', message: ' Halo ' })
      .expect(200);

    expect(response.body.data.phone).toBe('6281234567890');
    expect(services.whatsappService.sendText).toHaveBeenCalledWith(
      '6281234567890@s.whatsapp.net',
      'Halo'
    );
    expect(services.messageService.saveMessage).toHaveBeenCalledWith(
      expect.objectContaining({
        whatsappMessageId: 'provider-outgoing-1',
        direction: 'outgoing',
        status: 'sent'
      })
    );
  });

  it('returns the existing 404 response envelope', async () => {
    const app = createApp({
      ...createMockServices(),
      databaseHealthCheck: async () => true
    });

    const response = await request(app).get('/not-found').expect(404);
    expect(response.body).toMatchObject({
      success: false,
      message: 'Route not found'
    });
    expect(response.body.requestId).toBe(response.headers['x-request-id']);
  });
});
