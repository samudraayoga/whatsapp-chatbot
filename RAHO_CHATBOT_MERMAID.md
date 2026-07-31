# Alur Chatbot RAHO

Diagram ini merangkum data FAQ dari `Data Google Search.docx` menjadi alur
chatbot WhatsApp bertingkat. Jawaban kesehatan harus bersifat informatif,
tidak mendiagnosis, tidak menjanjikan hasil, dan tetap mengarahkan pengguna
ke konsultasi dokter.

```mermaid
flowchart TD
    START([Pengguna mengirim pesan]) --> NORMALIZE["Normalisasi input<br/>trim, lowercase, dan alias kata kunci"]
    NORMALIZE --> SAFETY{"Ada kondisi darurat<br/>atau keluhan medis berat?"}

    SAFETY -- "Ya" --> EMERGENCY["Sampaikan bahwa chatbot tidak menangani kondisi darurat<br/>dan arahkan ke fasilitas atau layanan darurat terdekat"]
    EMERGENCY --> HUMAN["Handoff ke Admin RAHO"]

    SAFETY -- "Tidak" --> INTENT{"Intent dikenali?"}
    INTENT -- "Sapaan / menu" --> MENU
    INTENT -- "Booking langsung" --> BOOKING
    INTENT -- "Minta admin" --> HUMAN
    INTENT -- "FAQ dikenali" --> ROUTER
    INTENT -- "Tidak dikenali" --> FALLBACK["Maaf, pertanyaan belum dikenali.<br/>Tampilkan menu dan tawarkan bantuan Admin."]
    FALLBACK --> MENU
    FALLBACK --> HUMAN

    MENU["MENU UTAMA<br/>1. Tentang RAHO<br/>2. Layanan dan Terapi<br/>3. Harga dan Membership<br/>4. Lokasi Cabang<br/>5. Kredibilitas dan Keamanan<br/>6. Nano Bubble dan Edukasi<br/>7. Kesehatan dan Kelayakan<br/>8. Booking dan Konsultasi<br/>9. Produk dan Paket<br/>10. Karier<br/>0. Hubungi Admin"] --> ROUTER

    ROUTER{"Pilih kategori atau<br/>deteksi kata kunci"}

    ROUTER -- "1 / tentang / perusahaan / club" --> C1
    ROUTER -- "2 / layanan / terapi / infus / homecare" --> C2
    ROUTER -- "3 / harga / biaya / paket / membership / promo" --> C3
    ROUTER -- "4 / lokasi / cabang / parkir / maps" --> C4
    ROUTER -- "5 / aman / resmi / izin / penelitian / penipuan" --> C5
    ROUTER -- "6 / nano bubble / IGDS / gas / mikrosirkulasi" --> C6
    ROUTER -- "7 / penyakit / lansia / pemulihan / jumlah sesi" --> C7
    ROUTER -- "8 / booking / reservasi / jadwal / konsultasi" --> BOOKING
    ROUTER -- "9 / produk / booster" --> C9
    ROUTER -- "10 / karier / lowongan / melamar" --> C10
    ROUTER -- "0 / admin / manusia / CS" --> HUMAN

    subgraph KNOWLEDGE["KNOWLEDGE BASE RAHO"]
        direction TB

        C1["TENTANG RAHO<br/>• RAHO Premier<br/>• Bidang wellness dan preventive health<br/>• Perbedaan RAHO Club dan Premier<br/>• Reverse Aging dan Homeostasis<br/>• Terapi pendukung, bukan pengganti medis"]

        C2["LAYANAN DAN TERAPI<br/>• Nano Bubble Therapy<br/>• Terapi klinik atau homecare<br/>• Manfaat dan cara kerja umum<br/>• Durasi sekitar 30–45 menit<br/>• Pemberian melalui infus<br/>• Konsultasi dan evaluasi dokter"]

        C3["HARGA DAN MEMBERSHIP<br/>• Paket 7 sesi: Rp12.500.000<br/>• Paket 15 sesi: Rp22.500.000<br/>• Booster: Rp1.000.000 per booster<br/>• Membership mengikuti program terapi<br/>• Tidak ada biaya membership terpisah<br/>• Promo mengikuti kanal resmi"]

        C4["LOKASI CABANG<br/>• Tanyakan kota pengguna<br/>• Carikan cabang terdekat<br/>• Bagikan alamat dan Google Maps<br/>• Jelaskan ketersediaan parkir<br/>• Rujuk ke rahopremier.id atau Admin"]

        C5["KREDIBILITAS DAN KEAMANAN<br/>• Proses konsultasi sebelum terapi<br/>• Dilaksanakan tenaga profesional<br/>• Informasi izin melalui tim RAHO<br/>• Bukti ilmiah berbeda untuk tiap indikasi<br/>• Testimoni bukan jaminan hasil<br/>• Terapi bersifat supportive therapy"]

        C6["NANO BUBBLE DAN EDUKASI<br/>• Gelembung gas berukuran nano<br/>• Oksigen dan gasotransmitter<br/>• Mikrosirkulasi dan fungsi sel<br/>• Intelligent Gas Delivery System<br/>• Pendekatan disesuaikan evaluasi dokter<br/>• Hindari klaim menyembuhkan"]

        C7["KESEHATAN DAN KELAYAKAN<br/>• Orang sehat, dewasa, dan lansia<br/>• Kondisi kronis wajib dievaluasi dokter<br/>• Mendukung pemulihan, bukan mengganti pengobatan<br/>• Jumlah sesi bergantung kondisi dan tujuan<br/>• Respons dan hasil setiap orang berbeda"]

        C9["PRODUK DAN PAKET<br/>• Fokus RAHO adalah program terapi<br/>• Paket 7 atau 15 sesi<br/>• Booster bersifat opsional<br/>• Pengiriman atau layanan luar kota perlu konsultasi"]

        C10["KARIER<br/>• Informasi lowongan melalui kanal resmi<br/>• Posisi: Nakes, MSO, dokter peneliti, marketing/sales<br/>• Lamaran mengikuti petunjuk lowongan<br/>• Email HR: humancapitalrahopremier@gmail.com"]
    end

    C1 --> AFTER_ANSWER
    C2 --> DISCLAIMER
    C3 --> AFTER_ANSWER
    C4 --> LOCATION
    C5 --> DISCLAIMER
    C6 --> DISCLAIMER
    C7 --> DISCLAIMER
    C9 --> AFTER_ANSWER
    C10 --> AFTER_ANSWER

    DISCLAIMER["Disclaimer wajib<br/>Informasi bersifat umum dan terapi bukan pengganti<br/>diagnosis, pengobatan, atau tindakan medis dokter."] --> AFTER_ANSWER

    LOCATION["Minta kota atau lokasi pengguna"] --> LOCATION_FOUND{"Cabang ditemukan?"}
    LOCATION_FOUND -- "Ya" --> MAPS["Kirim alamat, titik Google Maps,<br/>jam operasional, dan opsi reservasi"]
    LOCATION_FOUND -- "Tidak / perlu konfirmasi" --> HUMAN
    MAPS --> AFTER_ANSWER

    BOOKING["ALUR BOOKING<br/>1. Minta nama<br/>2. Pilih klinik atau homecare<br/>3. Minta kota atau cabang<br/>4. Minta tanggal dan jam pilihan<br/>5. Catat kebutuhan singkat tanpa diagnosis"] --> BOOKING_SUMMARY["Tampilkan ringkasan dan minta konfirmasi"]
    BOOKING_SUMMARY --> HUMAN

    AFTER_ANSWER{"Apa langkah berikutnya?"}
    AFTER_ANSWER -- "Pertanyaan lain" --> MENU
    AFTER_ANSWER -- "Reservasi" --> BOOKING
    AFTER_ANSWER -- "Bicara dengan Admin" --> HUMAN
    AFTER_ANSWER -- "Selesai" --> END(["Tutup percakapan dengan sopan"])

    HUMAN --> QUEUE["Buat handoff task<br/>sertakan kategori, ringkasan, dan konteks percakapan"]
    QUEUE --> END

    classDef startEnd fill:#123524,stroke:#59e391,color:#ffffff,stroke-width:2px;
    classDef decision fill:#2a2418,stroke:#f7c948,color:#ffffff,stroke-width:1.5px;
    classDef category fill:#10271d,stroke:#3fa66a,color:#eef7f1;
    classDef warning fill:#351c1a,stroke:#ff7067,color:#ffffff;
    classDef action fill:#15231d,stroke:#70a987,color:#ffffff;

    class START,END startEnd;
    class SAFETY,INTENT,ROUTER,LOCATION_FOUND,AFTER_ANSWER decision;
    class C1,C2,C3,C4,C5,C6,C7,C9,C10 category;
    class EMERGENCY,DISCLAIMER,FALLBACK warning;
    class MENU,BOOKING,BOOKING_SUMMARY,LOCATION,MAPS,HUMAN,QUEUE,NORMALIZE action;
```

## Aturan routing yang disarankan

1. Nomor menu dan kata kunci natural-language harus mengarah ke intent yang
   sama.
2. Pertanyaan lanjutan tetap membawa konteks kategori sebelumnya.
3. Pertanyaan tentang penyakit atau keamanan tidak boleh menghasilkan
   diagnosis, rekomendasi personal, atau jaminan hasil.
4. Harga, promo, alamat, jadwal dokter, dan jam operasional sebaiknya berasal
   dari data yang dapat diperbarui, bukan teks statis.
5. Jika confidence intent rendah atau pengguna meminta manusia, buat handoff
   ke Admin dengan ringkasan percakapan.
6. Setelah setiap jawaban, selalu sediakan pilihan kembali ke menu, booking,
   atau berbicara dengan Admin.
