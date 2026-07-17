export class ChatbotService {
  getReply(input: string | undefined | null): string {
    const text = input?.trim().toLowerCase() ?? '';

    if (text === 'ping') {
      return 'pong';
    }

    if (['halo', 'hai', 'hello'].includes(text)) {
      return 'Halo! Ada yang bisa saya bantu?';
    }

    if (text === 'menu') {
      return ['Daftar perintah chatbot:', '- ping', '- halo / hai / hello', '- menu', '- jam'].join('\n');
    }

    if (text === 'jam') {
      return `Waktu server saat ini: ${new Date().toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })}`;
    }

    return 'Pesan kamu sudah diterima. Ini masih chatbot versi awal.';
  }
}
