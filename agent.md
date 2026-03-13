🚀 LogSense AI: Akıllı Sistem Gözlemleme ve Anomali Tespit Sistemi
🎯 Proje Amacı
LogSense AI, karmaşık sunucu loglarını gerçek zamanlı olarak analiz eden, Salesforce LogAI kütüphanesi kullanarak anomalileri (olağan dışı durumları) tespit eden ve bu hataları LLM (Llama 3) yardımıyla insan diline çevirerek sistem mühendislerine sunan uçtan uca bir AIOps çözümüdür.

🏗️ Sistem Mimarisi
Proje, birbiriyle entegre çalışan 4 ana katmandan oluşmaktadır:

Log Producer (Python): Gerçek zamanlı log trafiğini simüle eden kaynak.

AI Analysis Engine (LogAI): Log ayrıştırma (parsing) ve anomali tespiti (anomaly detection) motoru.

Backend (FastAPI): Veri işleme, LLM entegrasyonu ve WebSocket üzerinden anlık veri iletimi.

Dashboard (Next.js): Canlı izleme, grafiksel analiz ve akıllı uyarı paneli.

-----------------------------------------
1. Sistem Mimarisi (Architectural Blueprint)
Sistemimiz dört ana katmandan oluşacak. Bu katmanlar birbirleriyle asenkron (eşzamanlı olmayan) bir şekilde haberleşerek yüksek performans sağlayacak.

Katman 1: Log Üretici (The Producer): Gerçek hayatı simüle eden Python scripti. Sisteme hem normal akışta hem de hata anında log fırlatacak.

Katman 2: Veri İşleme Merkezi (FastAPI Backend): Projenin kalbi. Gelen logları alır, LogAI motoruna sokar, anomali varsa LLM'e sorar ve sonucu Web UI'a "fırlatır".

Katman 3: Yapay Zeka Motoru (LogAI Engine): Salesforce LogAI kütüphanesini kullanarak logları parse eder (ayrıştırır) ve içindeki Isolation Forest veya LSTM modelleriyle "anormallik" skorunu hesaplar.

Katman 4: Görsel Dashboard (Next.js Frontend): Kullanıcının veriyi canlı izlediği, grafiklerin aktığı ve uyarıların patladığı "komuta merkezi" .

-----------------------------------------
2. Teknoloji Yığını (The Stack)
. Teknoloji Yığını (The Stack)BileşenTeknolojiGörevDilPython 3.10+Tüm backend ve AI süreçleri.Backend FrameworkFastAPIYüksek hızlı API ve WebSocket desteği.AI AnalizSalesforce LogAILog ayrıştırma ve anomali tespiti motoru.Hata YorumlamaGroq API (Llama 3)Anomalileri insan diline çeviren zekâ.FrontendNext.js 14/15Modern web arayüzü ve canlı veri gösterimi.VeritabanıSQLite / PostgreSQLTespit edilen hataların geçmişini tutmak için.İletişimWebSocketsSunucudan tarayıcıya anlık veri akışı.

--------------------------------------------

Detaylı To-Do List (Adım Adım Uygulama Planı)
Faz 1: Simülasyon ve Veri Akışı (1. Hafta)
[ ] Log Creator: random ve time kütüphanelerini kullanarak gerçekçi loglar üreten producer.py scriptini yaz. (Örn: [INFO] User 42 updated profile, [ERROR] Connection timeout).

[ ] FastAPI Giriş Kapısı: Logları POST isteğiyle kabul eden bir endpoint oluştur.

[ ] WebSocket Kurulumu: Gelen logları hiçbir işlem yapmadan doğrudan Next.js'e aktaran WebSocket yapısını kur.

----------------------------------------------

Faz 2: LogAI Entegrasyonu (2. Hafta)
[ ] LogAI Kurulumu: Salesforce LogAI kütüphanesini projeye dahil et.

[ ] Log Parser: Gelen ham metinleri LogAI'nin Drain veya Spell algoritmalarıyla yapılandırılmış verilere (Tablo gibi) çevir.

[ ] Anomali Modeli: LogAI içindeki Isolation Forest modelini bir veri setiyle eğit ve yeni gelen her log için bir "Anomali Skoru" (0 ile 1 arası) üret.

----------------------------------------------------

Faz 3: LLM ve "Akıllı Yorum" Katmanı (3. Hafta)
[ ] Groq/OpenAI Bağlantısı: API anahtarını al ve FastAPI'ye entegre et.

[ ] Akıllı Prompt Yazımı: Eğer anomali skoru 0.8'den yüksekse, o log satırını LLM'e gönder: "Bu bir sistem hatası mı? Eğer öyleyse teknik olmayan bir dille ne olduğunu açıkla."

[ ] Veritabanı Kaydı: Bu akıllı yorumları ve logu veritabanına kaydet.

--------------------------------------------------------

Faz 4: Next.js Dashboard ve Görselleştirme (4. Hafta)
[ ] Canlı Terminal: Siyah arka planlı, yukarı doğru akan log listesini yap.

[ ] Sağlık Grafiği: Recharts ile anomali skorlarını gösteren canlı bir çizgi grafik oluştur.

[ ] Alert Sistemi: Bir hata yakalandığında ekranın kenarında yanıp sönen bir uyarı kartı tasarla. (LLM'den gelen yorumu burada göster).

---------------------------------------------------------

4. Kritik Başarı Faktörleri (Seni Öne Çıkaracak Detaylar)
"One-Click Error" Butonu: Sunum sırasında bir butona bastığında sisteme kasten ağır bir hata (örn: Veritabanı çökmesi simülasyonu) gönder ve AI'nın bunu nasıl saniyeler içinde yakalayıp açıkladığını göster.

Salesforce LogAI Vurgusu: Sunumda "Kendi modelimi yazmak yerine dünya devi Salesforce'un kütüphanesini motor olarak kullandım ve üzerine kendi ürün katmanımı ekledim" de. Bu, "tekerleği yeniden icat etmeyen ama hazır araçları ustaca kullanan" mühendis profilidir.

Dark Mode: Dashboard mutlaka "Dark Mode" olsun; sistem izleme araçlarında bu bir standarttır ve çok profesyonel durur.