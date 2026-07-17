import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../middleware/error.middleware.js';
import { MessageService } from '../services/message.service.js';
import { WhatsAppService } from '../services/whatsapp.service.js';
import { normalizePhoneNumber, toWhatsAppJid, validatePhoneNumber } from '../utils/phone.js';

type MessageControllerDeps = {
  whatsappService: WhatsAppService;
  messageService: MessageService;
};

export class MessageController {
  constructor(private readonly deps: MessageControllerDeps) {}

  sendMessage = async (request: Request, response: Response, next: NextFunction): Promise<void> => {
    try {
      const phone = typeof request.body.phone === 'string' ? request.body.phone : '';
      const message = typeof request.body.message === 'string' ? request.body.message.trim() : '';

      if (!phone) {
        throw new AppError('phone is required', 400);
      }

      if (!message) {
        throw new AppError('message is required', 400);
      }

      if (message.length > 4096) {
        throw new AppError('message must be 4096 characters or less', 400);
      }

      const normalizedPhone = normalizePhoneNumber(phone);

      if (!validatePhoneNumber(normalizedPhone)) {
        throw new AppError('Invalid phone number', 400);
      }

      if (this.deps.whatsappService.getStatus() !== 'connected') {
        throw new AppError('WhatsApp is not connected', 503);
      }

      const jid = toWhatsAppJid(normalizedPhone);
      const sentMessage = await this.deps.whatsappService.sendText(jid, message);

      await this.deps.messageService.saveMessage({
        whatsappMessageId: sentMessage?.key.id ?? null,
        whatsappJid: jid,
        direction: 'outgoing',
        content: message,
        status: 'sent'
      });

      response.status(200).json({
        success: true,
        message: 'WhatsApp message sent',
        data: {
          phone: normalizedPhone
        }
      });
    } catch (error) {
      next(error);
    }
  };
}
