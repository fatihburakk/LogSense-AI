# 🛡️ LogSense AI

**Akıllı Sistem Gözlemleme ve Anomali Tespit Platformu**

LogSense AI, sistem loglarını gerçek zamanlı olarak izleyen, makine öğrenmesi ile anomali tespit eden ve OpenAI GPT-4 ile otomatik analiz yapan modern bir observability (gözlemlenebilirlik) platformudur.

## 🚀 Özellikler

- **Gerçek Zamanlı İzleme** — WebSocket üzerinden anlık log akışı
- **ML ile Anomali Tespiti** — Apache, MySQL, PostgreSQL, MSSQL, MongoDB log modelleri
- **AI Analizi** — GPT-4o ile log yorumlama ve çözüm önerileri
- **Korelasyon Motoru** — Birden fazla servisteki olayları ilişkilendirme
- **Uyarı Sistemi** — Eşik değere göre otomatik uyarı oluşturma
- **Sistem Yönetimi** — Yedekleme, veri temizleme ve bakım araçları
- **Modern Arayüz** — Next.js 16 ile hızlı ve duyarlı dashboard

---

## 🏗️ Mimari

```
logAI/
├── backend/          # FastAPI (Python 3.12)
│   ├── app/
│   │   ├── api/      # logs, alerts, stats, correlations, system
│   │   ├── core/     # Konfigürasyon
│   │   └── services/ # WebSocket, Celery Worker
│   ├── Dockerfile
│   └── main.py
├── frontend/         # Next.js 16 (Standalone)
│   ├── src/
│   │   ├── app/
│   │   └── components/
│   └── Dockerfile
├── k8s/
│   └── deployment.yaml
├── .github/
│   └── workflows/
│       └── deploy.yml
└── docker-compose.yml
```

---

## 💻 Seçenek 1: Yerel Kurulum (Local Development)

Kendi bilgisayarınızda geliştirme yapmak veya test etmek için bu yöntemi kullanın.

### Gereksinimler

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (Windows/Mac/Linux)
- [Git](https://git-scm.com/)
- OpenAI API Anahtarı ([alın](https://platform.openai.com/api-keys))

### Adım 1: Depoyu Klonlayın

```bash
git clone https://github.com/<YOUR_GITHUB_USERNAME>/LogSense-AI.git
cd LogSense-AI
```

### Adım 2: `.env` Dosyasını Düzenleyin

Proje kök dizininde `.env` adında bir dosya mevcuttur. Açıp kendi değerlerinizle doldurun:

```env
# OpenAI API anahtarınızı buraya yapıştırın
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxxxxx

# Sisteme log göndermek için API anahtarı (istediğiniz bir değer)
LOGSENSE_API_KEY=logsense_secure_key_2024

# Anomali tespiti için eşik değeri (0.0 - 1.0)
ANOMALY_THRESHOLD=0.5

# GPT-4 maksimum bekleme süresi (saniye)
LLM_TIMEOUT_SECONDS=12

# WebSocket buffer'ı - maksimum log sayısı
BUFFER_SIZE=100
```

> ⚠️ **Önemli:** `.env` dosyasını asla Git'e eklemeyin. `.gitignore` dosyasında zaten eklenmiştir.

### Adım 3: Docker ile Başlatın

```bash
docker-compose up --build
```

Bu komut şu servisleri ayağa kaldırır:
| Servis | Port | Açıklama |
|---|---|---|
| `frontend` | 3000 | Next.js Arayüzü |
| `backend` | 8000 | FastAPI Sunucusu |
| `db` | 5432 | PostgreSQL Veritabanı |
| `redis` | 6379 | Önbellek & Pub/Sub |
| `celery_worker` | — | Arkaplan İş Kuyruğu |
| `celery_beat` | — | Zamanlanmış Görevler |

### Adım 4: Tarayıcıda Açın

```
http://localhost:3000       → Uygulama Arayüzü
http://localhost:8000       → Backend API
http://localhost:8000/docs  → Swagger API Dokümantasyonu
```

### Adım 5: İlk Log Gönderin (Test)

Sistemi test etmek için örnek bir log gönderebilirsiniz:

```bash
curl -X POST http://localhost:8000/api/logs \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: logsense_secure_key_2024" \
  -d '{
    "source": "apache",
    "level": "ERROR",
    "message": "Connection refused to database"
  }'
```

### Servisleri Durdurmak

```bash
# Durdurmak için
docker-compose down

# Durdurup tüm verileri silmek için
docker-compose down -v
```

---

## ☁️ Seçenek 2: Sunucu Kurulumu (Production — K3s / Kubernetes)

Bu yöntem GitHub Actions ile tam otomatik bir CI/CD süreci sağlar. `main` branch'ine her `push` yaptığınızda sistem otomatik olarak güncellenir.

### Gereksinimler

- Ubuntu 22.04 sunucu (minimum 2 GB RAM, 20 GB SSD)
- SSH erişimi
- GitHub hesabı

---

### Adım 1: Sunucuya K3s Kurun (SSH ile Sunucuda)

Sunucunuza SSH ile bağlanın:

```bash
ssh ubuntu@<SUNUCU_IP>
```

K3s'i kurun:

```bash
curl -sfL https://get.k3s.io | sh -
```

Kurulumu doğrulayın (birkaç saniye sonra `Ready` yazmalı):

```bash
sudo kubectl get nodes
```

---

### Adım 2: kubectl Yetkisini Ayarlayın (Sunucuda)

`sudo` olmadan `kubectl` kullanabilmek için:

```bash
sudo chmod 644 /etc/rancher/k3s/k3s.yaml
```

Test edin:

```bash
kubectl get nodes
# NAME       STATUS   ROLES                  AGE   VERSION
# sunucu     Ready    control-plane,master   1m    v1.xx.x
```

---

### Adım 3: SSH Anahtarı Oluşturun (Yerel Bilgisayarınızda)

GitHub Actions'ın sunucuya bağlanabilmesi için SSH anahtar çifti gereklidir. **Kendi bilgisayarınızda** şunu çalıştırın:

```bash
ssh-keygen -t ed25519 -C "github-actions-logsense" -f ~/.ssh/logsense_deploy
```

Bu komut iki dosya oluşturur:
- `~/.ssh/logsense_deploy` → **Özel Anahtar** (GitHub'a eklenecek)
- `~/.ssh/logsense_deploy.pub` → **Genel Anahtar** (Sunucuya eklenecek)

---

### Adım 4: Genel Anahtarı Sunucuya Ekleyin (Sunucuda)

```bash
# Genel anahtar içeriğini kopyalayın
cat ~/.ssh/logsense_deploy.pub
```

Kopyaladığınız içeriği sunucuda şuraya ekleyin:

```bash
echo "YAPISTIRDIGINIZ_GENEL_ANAHTAR" >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

---

### Adım 5: GitHub Secrets Ekleyin

GitHub deponuza gidin: **Settings → Secrets and variables → Actions → New repository secret**

Şu üç secret'ı ekleyin:

| Secret Adı | Değer | Açıklama |
|---|---|---|
| `SERVER_IP` | `<SUNUCU_IP>` | Sunucunuzun IP adresi |
| `SERVER_USER` | `ubuntu` | SSH kullanıcı adı |
| `SSH_PRIVATE_KEY` | `~/.ssh/logsense_deploy` içeriği | Özel SSH anahtarı |

> ⚠️ **Önemli:** SSH anahtarını eklerken `-----BEGIN OPENSSH PRIVATE KEY-----` satırını da dahil edin.

---

### Adım 6: GitHub Personal Access Token (PAT) Oluşturun

K3s sunucusunun GitHub Container Registry'den imaj çekebilmesi için bir token gereklidir.

1. GitHub'da [Settings → Developer Settings → Personal Access Tokens → Tokens (classic)](https://github.com/settings/tokens/new) sayfasına gidin.
2. **"read:packages"** yetkisini seçin.
3. Token'ı oluşturup kopyalayın.

---

### Adım 7: Kubernetes Secret'larını Sunucuda Oluşturun (Bir Kez Yapılır)

Sunucunuza SSH ile bağlanın ve şu komutları çalıştırın:

**Namespace oluşturun:**
```bash
kubectl create namespace logsense
```

**GitHub Registry erişim anahtarı (imaj çekmek için):**
```bash
kubectl create secret docker-registry ghcr-secret \
  --docker-server=https://ghcr.io \
  --docker-username=<YOUR_GITHUB_USERNAME> \
  --docker-password=<PAT_TOKEN_BURAYA> \
  --namespace=logsense
```

**Uygulama şifreleri (OpenAI API Key vb.):**
```bash
kubectl create secret generic logsense-secrets \
  --from-literal=OPENAI_API_KEY='sk-proj-xxxxxxxx' \
  --from-literal=LOGSENSE_API_KEY='logsense_secure_key_2024' \
  --namespace=logsense
```

Kurulumu doğrulayın:
```bash
kubectl get secrets -n logsense
# NAME              TYPE                             DATA   AGE
# ghcr-secret       kubernetes.io/dockerconfigjson   1      10s
# logsense-secrets  Opaque                           2      5s
```

---

### Adım 8: İlk Dağıtımı Başlatın

Artık her şey hazır. Kendi bilgisayarınızda (lokalde) şu komutları çalıştırın:

```bash
git add .
git commit -m "feat: initial production deployment"
git push origin main
```

GitHub Actions otomatik olarak:
1. Backend ve Frontend Docker imajlarını oluşturur.
2. GitHub Container Registry'ye yükler.
3. `deployment.yaml` içindeki IP adresini günceller.
4. Sunucuya SCP ile dosyayı gönderir.
5. `kubectl apply` ile dağıtımı uygular.

---

### Adım 9: Durumu İzleyin (Sunucuda)

```bash
# Pod'ların durumunu izleyin
kubectl get pods -n logsense -w

# Durum çıktısı (başarılı):
# NAME                       READY   STATUS    RESTARTS   AGE
# backend-xxxxxxxxx-xxxxx    1/1     Running   0          2m
# frontend-xxxxxxxx-xxxxx    1/1     Running   0          2m
```

---

### Adım 10: Uygulamaya Erişin

```
http://<SUNUCU_IP>:30001   → Frontend Arayüzü
http://<SUNUCU_IP>:30000   → Backend API
```

---

## 🔧 Sorun Giderme

### Pod'lar neden `ImagePullBackOff` hatası veriyor?
`ghcr-secret` anahtarının doğru oluşturulduğunu kontrol edin:
```bash
kubectl get secret ghcr-secret -n logsense
```
Yoksa Adım 7'yi tekrarlayın.

### Pod'lar neden `CrashLoopBackOff` hatası veriyor?
Uygulama loglarını inceleyin:
```bash
kubectl logs -l app=backend -n logsense --tail=50
```

### Backend'e erişilemiyor?
Sunucu güvenlik duvarında 30000 ve 30001 portlarının açık olduğundan emin olun:
```bash
sudo ufw allow 30000
sudo ufw allow 30001
```

---

## 📊 API Kullanımı

### Log Gönderme

```bash
curl -X POST http://<SUNUCU_IP>:30000/api/logs \
  -H "Content-Type: application/json" \
  -H "X-API-KEY: logsense_secure_key_2024" \
  -d '{
    "source": "apache",
    "level": "ERROR",
    "message": "Connection refused"
  }'
```

### Uyarıları Listeleme

```bash
curl http://<SUNUCU_IP>:30000/api/alerts \
  -H "X-API-KEY: logsense_secure_key_2024"
```

---

## 📄 Lisans

Bu proje MIT Lisansı ile lisanslanmıştır.
