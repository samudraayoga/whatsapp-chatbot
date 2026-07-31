export type ChatbotTriggerType =
  | 'exact'
  | 'alias'
  | 'empty'
  | 'fallback';

export type ChatbotRuleDefinition = {
  id?: string;
  triggerType: ChatbotTriggerType;
  triggerValues: string[];
  responseText: string;
  priority: number;
  enabled: boolean;
  action: 'reply' | 'create_handoff';
};

export type StoredChatbotRule = ChatbotRuleDefinition & {
  id: string;
};

export type RuleMatch = {
  rule: StoredChatbotRule;
  normalizedInput: string;
  matchedTrigger: string | null;
};

export class ChatbotRuleValidationError extends Error {
  constructor(readonly problems: string[]) {
    super(problems.join('; '));
    this.name = 'ChatbotRuleValidationError';
  }
}

export const normalizeChatbotInput = (
  input: string | undefined | null
): string =>
  (input ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');

export const validateChatbotRules = (
  rules: ChatbotRuleDefinition[]
): ChatbotRuleDefinition[] => {
  const problems: string[] = [];
  if (rules.length < 1 || rules.length > 100) {
    problems.push('Rule count must be between 1 and 100');
  }
  const priorities = new Set<number>();
  const triggerOwners = new Map<string, number>();

  const normalized = rules.map((rule, index) => {
    if (
      !['exact', 'alias', 'empty', 'fallback'].includes(rule.triggerType)
    ) {
      problems.push(`Rule ${index + 1} has an invalid trigger type`);
    }
    if (!['reply', 'create_handoff'].includes(rule.action)) {
      problems.push(`Rule ${index + 1} has an invalid action`);
    }
    if (!Number.isInteger(rule.priority) || rule.priority < 0 || rule.priority > 9999) {
      problems.push(`Rule ${index + 1} priority must be an integer from 0 to 9999`);
    } else if (priorities.has(rule.priority)) {
      problems.push(`Priority ${rule.priority} is duplicated`);
    }
    priorities.add(rule.priority);

    const responseText = rule.responseText.replace(/\r\n?/g, '\n').trim();
    if (!responseText || responseText.length > 4096) {
      problems.push(`Rule ${index + 1} response must contain 1 to 4096 characters`);
    }
    const triggerValues = Array.from(
      new Set(rule.triggerValues.map(normalizeChatbotInput).filter(Boolean))
    );
    if (
      rule.triggerValues.length > 20 ||
      triggerValues.some((value) => value.length > 100)
    ) {
      problems.push(
        `Rule ${index + 1} may contain at most 20 triggers of 100 characters`
      );
    }
    if (
      (rule.triggerType === 'exact' || rule.triggerType === 'alias') &&
      triggerValues.length === 0
    ) {
      problems.push(`Rule ${index + 1} requires at least one trigger value`);
    }
    if (
      (rule.triggerType === 'empty' || rule.triggerType === 'fallback') &&
      triggerValues.length > 0
    ) {
      problems.push(`Rule ${index + 1} must not define trigger values`);
    }
    for (const value of triggerValues) {
      const owner = triggerOwners.get(value);
      if (owner !== undefined && rule.enabled) {
        problems.push(
          `Trigger "${value}" is duplicated by rules ${owner + 1} and ${index + 1}`
        );
      }
      if (rule.enabled) triggerOwners.set(value, index);
    }
    return {
      ...rule,
      triggerValues,
      responseText
    };
  });

  const enabledFallbacks = normalized.filter(
    (rule) => rule.enabled && rule.triggerType === 'fallback'
  );
  const enabledEmpty = normalized.filter(
    (rule) => rule.enabled && rule.triggerType === 'empty'
  );
  if (enabledFallbacks.length !== 1) {
    problems.push('Exactly one enabled fallback rule is required');
  }
  if (enabledEmpty.length !== 1) {
    problems.push('Exactly one enabled empty-input rule is required');
  }
  if (problems.length > 0) throw new ChatbotRuleValidationError(problems);
  return normalized;
};

export const matchChatbotRule = (
  rules: StoredChatbotRule[],
  input: string | undefined | null
): RuleMatch => {
  const normalizedInput = normalizeChatbotInput(input);
  const enabled = rules
    .filter((rule) => rule.enabled)
    .slice()
    .sort((left, right) => left.priority - right.priority);
  const matched = enabled.find((rule) => {
    if (rule.triggerType === 'empty') return normalizedInput === '';
    if (rule.triggerType === 'fallback') return false;
    return rule.triggerValues.includes(normalizedInput);
  });
  const fallback = enabled.find((rule) => rule.triggerType === 'fallback');
  const rule = matched ?? fallback;
  if (!rule) {
    throw new ChatbotRuleValidationError([
      'No enabled rule matched and no fallback rule exists'
    ]);
  }
  return {
    rule,
    normalizedInput,
    matchedTrigger:
      rule.triggerType === 'exact' || rule.triggerType === 'alias'
        ? normalizedInput
        : null
  };
};

const mainMenu = `Halo! 👋

Terima kasih telah menghubungi Raho Club Premier.

Saya siap membantu Anda mendapatkan informasi umum seputar RAHO.

Silakan pilih menu di bawah ini:

1. Tentang RAHO
2. Layanan dan Terapi
3. Harga dan Membership
4. Lokasi Cabang
5. Kredibilitas dan Keamanan
6. Nano Bubble dan Edukasi
7. Kesehatan dan Kelayakan
8. Booking dan Konsultasi
9. Produk dan Paket
10. Karier
0. Hubungi Admin

Balas dengan angka 0–10 atau tuliskan pertanyaan Anda.`;

export const initialChatbotRules: ChatbotRuleDefinition[] = [
  {
    triggerType: 'alias',
    triggerValues: [
      '1',
      'apa itu raho',
      'apa itu raho premier',
      'raho perusahaan apa',
      'raho bergerak di bidang apa',
      'mengapa disebut raho club'
    ],
    responseText: `RAHO adalah komunitas kesehatan yang berfokus pada edukasi kesehatan, preventive health, reverse aging, homeostasis, dan terapi pendukung.

RAHO Premier merupakan layanan premium di dalam RAHO dengan program yang lebih personal, pendampingan, evaluasi, serta pilihan layanan klinik atau homecare.

RAHO bukan pengganti fasilitas diagnosis maupun pengobatan medis. Balas *menu* untuk melihat topik lain.`,
    priority: 10,
    enabled: true,
    action: 'reply'
  },
  {
    triggerType: 'alias',
    triggerValues: [
      'apa perbedaan raho club dan raho premier',
      'beda raho club dan premier',
      'perbedaan raho dan raho premier'
    ],
    responseText: `RAHO Club adalah komunitas kesehatan yang menyediakan edukasi, pendampingan, dan terapi pendukung.

RAHO Club Premier adalah layanan premium di dalam RAHO Club dengan pendampingan lebih personal, layanan homecare, serta pilihan terapi dan booster yang disesuaikan setelah evaluasi dokter.`,
    priority: 20,
    enabled: true,
    action: 'reply'
  },
  {
    triggerType: 'alias',
    triggerValues: [
      '2',
      'apa saja layanan di raho',
      'layanan raho',
      'terapi raho seperti apa',
      'apa itu terapi raho',
      'apa itu pengobatan raho',
      'apa itu nano bubble therapy'
    ],
    responseText: `RAHO Premier menyediakan Nano Bubble Therapy sebagai terapi pendukung melalui dua pilihan:

• *Terapi di klinik* dengan konsultasi dokter dan pendampingan tenaga profesional.
• *Homecare* untuk member yang membutuhkan layanan di lokasi yang telah dijadwalkan.

Program ditentukan berdasarkan konsultasi dan evaluasi dokter. Terapi ini bukan pengganti pengobatan medis utama.`,
    priority: 30,
    enabled: true,
    action: 'reply'
  },
  {
    triggerType: 'alias',
    triggerValues: [
      'terapi di klinik',
      'layanan homecare',
      'apakah bisa homecare',
      'terapi di rumah',
      'bisa terapi di rumah'
    ],
    responseText: `Nano Bubble Therapy tersedia di klinik dan melalui layanan homecare.

Keduanya mengikuti prosedur pelayanan berdasarkan konsultasi dan evaluasi dokter. Ketersediaan homecare bergantung pada lokasi dan jadwal. Balas *8* agar Admin membantu proses booking.`,
    priority: 40,
    enabled: true,
    action: 'reply'
  },
  {
    triggerType: 'alias',
    triggerValues: [
      'apa manfaat terapi raho',
      'manfaat terapi raho',
      'bagaimana cara kerja terapi raho',
      'cara kerja terapi raho',
      'seberapa efektif terapi raho'
    ],
    responseText: `Nano Bubble Therapy dirancang sebagai terapi pendukung untuk membantu oksigenasi jaringan, mikrosirkulasi, fungsi sel, dan keseimbangan tubuh.

RAHO menggunakan pendekatan Intelligent Gas Delivery System agar komposisi gas dan program dapat disesuaikan berdasarkan evaluasi dokter.

Efektivitas dan respons dapat berbeda pada setiap orang, sehingga hasil terapi tidak dapat dijamin sama.`,
    priority: 50,
    enabled: true,
    action: 'reply'
  },
  {
    triggerType: 'alias',
    triggerValues: [
      'berapa lama satu sesi terapi',
      'durasi terapi raho',
      'apakah terapi ini sakit',
      'apakah terapi menggunakan infus',
      'apa itu infus nano bubble'
    ],
    responseText: `Satu sesi terapi umumnya berlangsung sekitar 30–45 menit, tergantung program dan kebutuhan member.

Nano Bubble Therapy diberikan melalui jalur infus. Prosedur umumnya dapat ditoleransi dengan baik, dengan kemungkinan ketidaknyamanan ringan saat pemasangan jarum. Kelayakan terapi tetap ditentukan melalui konsultasi dan evaluasi dokter.`,
    priority: 60,
    enabled: true,
    action: 'reply'
  },
  {
    triggerType: 'alias',
    triggerValues: [
      '3',
      'berapa harga terapi di raho club',
      'harga terapi raho',
      'biaya terapi raho',
      'berapa biaya terapi',
      'apakah ada paket terapi',
      'harga paket terapi',
      'harga booster'
    ],
    responseText: `Pilihan program terapi RAHO:

• Paket 7 sesi: *Rp12.500.000*
• Paket 15 sesi: *Rp22.500.000*
• Booster: *Rp1.000.000 per booster*

Booster tidak wajib. Pemilihan program disesuaikan dengan konsultasi dan evaluasi dokter. Konfirmasi harga terbaru dapat dilakukan melalui Admin.`,
    priority: 70,
    enabled: true,
    action: 'reply'
  },
  {
    triggerType: 'alias',
    triggerValues: [
      'apakah ada membership',
      'berapa biaya membership',
      'keuntungan menjadi member',
      'apa keuntungan menjadi member',
      'apakah ada promo',
      'promo raho'
    ],
    responseText: `Status member diperoleh ketika mengikuti program terapi dan tidak memiliki biaya membership terpisah.

Member memperoleh konsultasi dan evaluasi, program yang disesuaikan, pendampingan, serta kesempatan mengikuti program observasi RAHO.

Informasi promo terbaru mengikuti kanal resmi RAHO karena penawaran dapat berubah.`,
    priority: 80,
    enabled: true,
    action: 'reply'
  },
  {
    triggerType: 'alias',
    triggerValues: [
      '4',
      'cabang raho ada di mana saja',
      'lokasi raho',
      'lokasi cabang raho',
      'cabang raho terdekat',
      'bagaimana cara menuju cabang',
      'apakah tersedia parkir'
    ],
    responseText: `RAHO memiliki cabang di beberapa kota di Indonesia. Silakan kirimkan *nama kota atau area Anda* agar Admin dapat membantu memberikan cabang terdekat, alamat lengkap, titik Google Maps, dan informasi parkir.`,
    priority: 90,
    enabled: true,
    action: 'create_handoff'
  },
  {
    triggerType: 'alias',
    triggerValues: [
      '5',
      'apakah raho resmi',
      'apakah raho aman',
      'apakah raho sudah memiliki izin',
      'apakah raho penipuan',
      'legalitas raho',
      'izin raho'
    ],
    responseText: `Keamanan member merupakan prioritas RAHO. Calon member menjalani konsultasi dan evaluasi agar program sesuai dengan kondisi dan kebutuhannya, dan terapi dilaksanakan oleh tenaga profesional sesuai prosedur.

Untuk dokumen atau penjelasan legalitas dan perizinan yang spesifik, Admin RAHO dapat memberikan informasi resmi yang tersedia.`,
    priority: 100,
    enabled: true,
    action: 'reply'
  },
  {
    triggerType: 'alias',
    triggerValues: [
      'apakah terapi raho sudah diteliti',
      'apakah terapi ini memiliki dasar ilmiah',
      'apakah ada hasil penelitian',
      'bagaimana testimoni pasien',
      'apa kata dokter mengenai terapi ini',
      'bukti ilmiah terapi raho'
    ],
    responseText: `Teknologi Nano Bubble dan gasotransmitter terus diteliti, tetapi tingkat bukti ilmiah dapat berbeda untuk setiap penggunaan klinis.

Di RAHO, Nano Bubble Therapy diposisikan sebagai *supportive therapy*, bukan pengganti diagnosis atau pengobatan medis. Testimoni menggambarkan pengalaman individual dan tidak menjamin hasil yang sama pada setiap orang.`,
    priority: 110,
    enabled: true,
    action: 'reply'
  },
  {
    triggerType: 'alias',
    triggerValues: [
      '6',
      'apa itu nano bubble',
      'bagaimana nano bubble bekerja',
      'apa manfaat nano bubble',
      'mengapa nano bubble digunakan',
      'hubungan nano bubble dengan oksigen',
      'hubungan nano bubble dengan kesehatan sel'
    ],
    responseText: `Nano Bubble adalah gelembung gas berukuran sangat kecil, kurang dari 200 nm, yang digunakan sebagai media penghantaran gas dalam program terapi pendukung.

Pendekatan ini dirancang untuk membantu penghantaran gas, oksigenasi, mikrosirkulasi, dan lingkungan fungsi sel. Manfaat klinis dapat berbeda pada setiap individu dan harus dinilai melalui evaluasi dokter.`,
    priority: 120,
    enabled: true,
    action: 'reply'
  },
  {
    triggerType: 'alias',
    triggerValues: [
      'apa itu gasotransmitter',
      'apa itu mikrosirkulasi',
      'apa itu intelligent gas delivery system',
      'apa itu igds',
      'fungsi igds'
    ],
    responseText: `• *Gasotransmitter* adalah molekul gas yang berperan sebagai sinyal biologis di dalam tubuh, seperti nitric oxide, hydrogen sulfide, dan carbon monoxide.
• *Mikrosirkulasi* adalah aliran darah pada pembuluh sangat kecil yang membantu distribusi oksigen dan nutrisi.
• *IGDS* adalah metode RAHO untuk menyesuaikan proses penghantaran Nano Bubble dan komposisi gas berdasarkan kebutuhan serta evaluasi dokter.`,
    priority: 130,
    enabled: true,
    action: 'reply'
  },
  {
    triggerType: 'alias',
    triggerValues: [
      '7',
      'siapa saja yang bisa mengikuti terapi',
      'apakah terapi ini untuk orang sehat',
      'apakah terapi ini bisa untuk lansia',
      'apakah terapi aman untuk lansia',
      'apakah terapi ini aman bagi penderita penyakit kronis'
    ],
    responseText: `Terapi dapat dipertimbangkan untuk orang dewasa, lansia, individu yang ingin menjaga kebugaran, maupun orang dengan kondisi kesehatan tertentu.

Namun, setiap calon member wajib menjalani konsultasi dan evaluasi dokter terlebih dahulu. Untuk kondisi kronis, obat rutin, kehamilan, alergi, atau kondisi khusus lain, sampaikan informasi lengkap kepada dokter sebelum terapi.`,
    priority: 140,
    enabled: true,
    action: 'reply'
  },
  {
    triggerType: 'alias',
    triggerValues: [
      'terapi ini cocok untuk penyakit apa',
      'apakah terapi ini membantu pemulihan',
      'apakah hasil terapi berbeda pada setiap orang',
      'apakah terapi raho menyembuhkan',
      'hasil terapi raho'
    ],
    responseText: `Nano Bubble Therapy merupakan terapi pendukung dan tidak digunakan chatbot ini untuk mendiagnosis atau menjanjikan penyembuhan penyakit.

Kesesuaian dan hasil terapi dipengaruhi kondisi awal, tujuan terapi, gaya hidup, kepatuhan program, dan respons tubuh. Konsultasikan kondisi Anda dengan dokter RAHO serta dokter yang merawat.`,
    priority: 150,
    enabled: true,
    action: 'reply'
  },
  {
    triggerType: 'alias',
    triggerValues: [
      'berapa kali terapi yang dibutuhkan',
      'berapa sesi terapi',
      'jumlah sesi terapi',
      'pilih 7 atau 15 sesi'
    ],
    responseText: `Jumlah sesi berbeda untuk setiap orang dan ditentukan berdasarkan kondisi, tujuan, serta evaluasi dokter.

RAHO menyediakan program 7 sesi dan 15 sesi. Booster dapat dipertimbangkan apabila sesuai kebutuhan, tetapi tidak bersifat wajib.`,
    priority: 160,
    enabled: true,
    action: 'reply'
  },
  {
    triggerType: 'alias',
    triggerValues: [
      '8',
      'bagaimana cara membuat janji',
      'cara booking raho',
      'booking terapi',
      'cara reservasi',
      'saya mau reservasi',
      'saya mau booking',
      'bagaimana alur konsultasi',
      'apakah harus reservasi'
    ],
    responseText: `Untuk membuat janji, siapkan:

1. Nama
2. Kota atau cabang pilihan
3. Pilihan layanan klinik atau homecare
4. Tanggal dan jam yang diinginkan

Admin RAHO akan membantu mengecek jadwal dokter dan slot terapi. Anda juga dapat menghubungi WhatsApp CS di *0851-3622-2772*.`,
    priority: 170,
    enabled: true,
    action: 'create_handoff'
  },
  {
    triggerType: 'alias',
    triggerValues: [
      'dokter praktik kapan',
      'jadwal dokter',
      'jam operasional berapa',
      'jam buka raho',
      'apakah bisa datang langsung',
      'bisa walk in',
      'berapa lama konsultasi berlangsung'
    ],
    responseText: `Jadwal dokter dan jam operasional dapat berbeda di setiap cabang. Konsultasi umumnya berlangsung sekitar 30–60 menit.

Walk-in memungkinkan jika slot tersedia, tetapi reservasi disarankan agar jadwal dokter dan terapi dapat dipastikan. Kirimkan kota atau cabang tujuan agar Admin membantu mengecek jadwal.`,
    priority: 180,
    enabled: true,
    action: 'create_handoff'
  },
  {
    triggerType: 'alias',
    triggerValues: [
      '9',
      'apakah raho menjual produk',
      'produk apa saja yang tersedia',
      'apakah harus membeli booster',
      'apakah booster wajib',
      'apakah produk bisa dikirim ke luar kota'
    ],
    responseText: `Fokus utama RAHO adalah program terapi, bukan penjualan produk.

Program yang tersedia meliputi paket 7 sesi, paket 15 sesi, dan booster opsional. Booster tidak wajib dan hanya dipertimbangkan setelah konsultasi. Kebutuhan layanan atau pengiriman ke luar kota perlu dibahas dengan Admin terlebih dahulu.`,
    priority: 190,
    enabled: true,
    action: 'reply'
  },
  {
    triggerType: 'alias',
    triggerValues: [
      '10',
      'apakah raho sedang membuka lowongan',
      'lowongan raho',
      'bagaimana cara melamar kerja di raho',
      'posisi apa saja yang tersedia',
      'bagaimana budaya kerja di raho'
    ],
    responseText: `Informasi karier terbaru diumumkan melalui media sosial resmi RAHO, LinkedIn, atau portal lowongan kerja.

Posisi dapat mencakup Perawat atau Nakes, Member Service Officer, Medical Doctor Researcher, serta Marketing dan Sales Support. Ikuti petunjuk pada lowongan atau kirim dokumen sesuai arahan ke *humancapitalrahopremier@gmail.com*.`,
    priority: 200,
    enabled: true,
    action: 'reply'
  },
  {
    triggerType: 'alias',
    triggerValues: [
      '0',
      'admin',
      'hubungi admin',
      'cs',
      'customer service',
      'bicara dengan admin',
      'saya mau bicara dengan admin',
      'bantuan manusia'
    ],
    responseText: `Baik, permintaan Anda akan diteruskan kepada Admin RAHO. Mohon tuliskan nama, kota, dan kebutuhan singkat agar tim dapat membantu lebih cepat.`,
    priority: 210,
    enabled: true,
    action: 'create_handoff'
  },
  {
    triggerType: 'alias',
    triggerValues: ['halo', 'hai', 'hello', 'menu', 'help', 'bantuan'],
    responseText: mainMenu,
    priority: 800,
    enabled: true,
    action: 'reply'
  },
  {
    triggerType: 'empty',
    triggerValues: [],
    responseText: mainMenu,
    priority: 900,
    enabled: true,
    action: 'reply'
  },
  {
    triggerType: 'fallback',
    triggerValues: [],
    responseText: `Maaf, saya belum menemukan jawaban yang tepat untuk pertanyaan tersebut.

Balas *menu* untuk melihat daftar topik, *8* untuk booking, atau *0* agar pertanyaan diteruskan kepada Admin RAHO.`,
    priority: 1000,
    enabled: true,
    action: 'reply'
  }
];
