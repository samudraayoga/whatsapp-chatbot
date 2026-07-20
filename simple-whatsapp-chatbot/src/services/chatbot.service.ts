export class ChatbotService {
  private readonly mainMenu = `Halo! 👋

Terima kasih telah menghubungi Raho Club Premier.

Saya siap membantu Anda mendapatkan informasi seputar layanan kami.

Silakan pilih menu di bawah ini:

1. Tentang Raho Club Premier
2. Layanan dan Program Kesehatan
3. Lokasi Cabang
4. Reservasi
5. Hubungi Admin 

Balas dengan angka 1–5.`;

  getReply(input: string | undefined | null): string {
    const text = input?.trim().toLowerCase() ?? '';

    switch (text) {
      case '1':
        return `Raho Club Premier adalah layanan kesehatan yang membantu masyarakat memperoleh layanan kesehatan sesuai kebutuhan.

Balas *menu* untuk kembali ke menu utama atau balas *5* jika ingin dihubungi admin.`;

      case '2':
        return `Raho Club Premier menyediakan berbagai program kesehatan yang dapat disesuaikan dengan kebutuhan Anda.

Balas *menu* untuk kembali ke menu utama atau balas *5* jika ingin dihubungi admin.`;

      case '3':
        return `Raho Club Premier menyediakan layanan konsultasi untuk membantu Anda mendapatkan layanan kesehatan yang sesuai.

Balas *5* jika Anda ingin mendapatkan penjelasan lebih lanjut dari admin.`;

      case '4':
        return `Raho Club Premier memiliki beberapa lokasi layanan yang dapat dipilih sesuai kebutuhan Anda.

Balas *5* agar admin dapat membantu memberikan informasi lokasi lebih lanjut.`;

      case '5':
        return `Terima kasih! 👋

Admin Raho Club Premier akan segera menghubungi Anda melalui nomor WhatsApp ini.`;

      case 'halo':
      case 'hai':
      case 'hello':
      case 'menu':
      case '':
        return this.mainMenu;

      default:
        return `Maaf, pilihan yang Anda masukkan belum tersedia.

Silakan balas *menu* untuk melihat menu utama atau balas *5* jika ingin dihubungi admin.`;
    }
  }
}