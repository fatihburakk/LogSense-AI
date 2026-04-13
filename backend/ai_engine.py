"""
LogSense AI — Multi-Model AI Engine
Colab'da eğitilmiş modelleri (Apache, MongoDB, MSSQL, MySQL, Postgres) yükler.
Gelen logu ilgili modele sorar, anomali tespit ederse LLM'e derinlemesine analiz yaptırır.

IsolationForest Kuralı:
    predict() →  1 = Normal (inlier)
    predict() → -1 = Anomali (outlier)
"""

import os
import pickle
import joblib
from pathlib import Path

from openai import OpenAI
from dotenv import load_dotenv
from loguru import logger

# ──────────────────────────────────────────────
# Ortam değişkenleri
# ──────────────────────────────────────────────
load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
ANOMALY_THRESHOLD = float(os.getenv("ANOMALY_THRESHOLD", "0.5"))

# ──────────────────────────────────────────────
# Desteklenen model tipleri
# ──────────────────────────────────────────────
MODEL_TYPES = ["apache", "mongodb", "mssql", "mysql", "postgres"]

# source → model eşleştirme tablosu
SOURCE_TO_MODEL = {
    # Apache / Web
    "apache":          "apache",
    "api-gateway":     "apache",
    "web-server":      "apache",
    "auth-service":    "apache",
    "file-service":    "apache",
    "payment-service": "apache",
    # MongoDB
    "mongodb":         "mongodb",
    "mongo":           "mongodb",
    # MSSQL
    "mssql":           "mssql",
    "sqlserver":       "mssql",
    # MySQL
    "mysql":           "mysql",
    # PostgreSQL
    "postgres":        "postgres",
    "postgresql":      "postgres",
    "db-manager":      "postgres",
    # Cache (varsayılan olarak apache modeli)
    "cache-layer":     "apache",
}


class AIEngine:
    """
    Çoklu model destekleyen AI motoru.
    Her model tipi için bir vectorizer ve bir sınıflandırma modeli yüklenir.
    """

    def __init__(self):
        self.models: dict = {}       # {"apache": model_obj, ...}
        self.vectorizers: dict = {}  # {"apache": vectorizer_obj, ...}
        self.client = None           # OpenAI istemcisi

        self._load_ml_models()
        self._init_llm()

    # ─── ML Model Yükleme ────────────────────
    def _load_ml_models(self):
        """ai_models klasöründeki tüm .pkl dosyalarını yükler."""
        models_dir = Path(__file__).parent / "ai_models"

        if not models_dir.exists():
            logger.warning("ai_models klasörü bulunamadı!")
            return

        loaded = 0
        for model_type in MODEL_TYPES:
            model_path = models_dir / f"{model_type}_model.pkl"
            vec_path   = models_dir / f"{model_type}_vectorizer.pkl"

            if model_path.exists() and vec_path.exists():
                try:
                    # Joblib ile yükleme (pickle uyumluluğu için daha güvenli)
                    self.models[model_type] = joblib.load(model_path)
                    self.vectorizers[model_type] = joblib.load(vec_path)
                    loaded += 1
                    logger.info(f"  ✅ {model_type:12s} model + vectorizer yüklendi")
                except Exception as e:
                    logger.error(f"  {model_type} yüklenirken hata: {e}")
            else:
                logger.warning(f"  {model_type} model dosyası bulunamadı, atlanıyor.")

        logger.info(f"🤖 AI Engine başlatıldı — {loaded}/{len(MODEL_TYPES)} model aktif")

    # ─── LLM Başlatma ────────────────────────
    def _init_llm(self):
        """OpenAI istemcisini kurar."""
        if not OPENAI_API_KEY:
            logger.warning("OPENAI_API_KEY bulunamadı — LLM analizi devre dışı.")
            return

        try:
            self.client = OpenAI(api_key=OPENAI_API_KEY)
            logger.info("🧠 OpenAI LLM bağlantısı kuruldu.")
        except Exception as e:
            logger.error(f"LLM başlatma hatası: {e}")

    # ─── Kaynak → Model Eşleştirme ───────────
    def _resolve_model_type(self, source: str) -> str:
        """Gelen logun source alanına göre hangi modelin kullanılacağını belirler."""
        source_lower = source.lower().strip()
        return SOURCE_TO_MODEL.get(source_lower, "apache")

    # ─── Ana İşleme Fonksiyonu ───────────────
    def process_log(self, log_entry: dict) -> dict:
        """
        Gelen logu işler:
        1. Kaynak (source) bilgisine göre doğru modeli seçer
        2. Vectorizer ile metni dönüştürür, model ile anomali tespit eder
        3. Anomali skoru yüksekse LLM'e derinlemesine analiz yaptırır

        IsolationForest kuralı:
            prediction ==  1 → Normal (inlier)
            prediction == -1 → Anomali (outlier)
        """
        source  = log_entry.get("source", "unknown")
        message = log_entry.get("message", "")
        level   = log_entry.get("level", "INFO")

        model_type = self._resolve_model_type(source)

        # ── ML Anomali Tespiti ──
        is_anomaly = False
        anomaly_score = 0.0
        model_used = model_type

        if model_type in self.models and model_type in self.vectorizers:
            try:
                vectorizer = self.vectorizers[model_type]
                model      = self.models[model_type]

                # Metni vektöre çevir
                X = vectorizer.transform([message])

                # Tahmin yap
                prediction = model.predict(X)
                raw_prediction = int(prediction[0])

                # IsolationForest: 1 = Normal, -1 = Anomali
                is_anomaly = (raw_prediction == -1)

                logger.debug(f"[{model_type}] prediction={raw_prediction}, is_anomaly={is_anomaly}, level={level}")

                # Anomali skoru hesapla
                if hasattr(model, "decision_function"):
                    raw_score = model.decision_function(X)[0]
                    anomaly_score = max(0.0, min(1.0, 0.5 - float(raw_score)))
                    logger.debug(f"[{model_type}] raw_score={raw_score:.4f}, anomaly_score={anomaly_score:.4f}")
                elif hasattr(model, "score_samples"):
                    raw_score = model.score_samples(X)[0]
                    anomaly_score = max(0.0, min(1.0, 0.5 - float(raw_score)))
                    logger.debug(f"[{model_type}] score_samples={raw_score:.4f}, anomaly_score={anomaly_score:.4f}")
                else:
                    anomaly_score = 0.95 if is_anomaly else 0.05
                    logger.debug(f"[{model_type}] fallback anomaly_score={anomaly_score}")

            except Exception as e:
                logger.error(f"ML tahmini hatası ({model_type}): {e}")
                anomaly_score = self._fallback_score(level)
                is_anomaly = (anomaly_score >= ANOMALY_THRESHOLD)
        else:
            # Model yoksa seviye bazlı fallback
            anomaly_score = self._fallback_score(level)
            is_anomaly = (anomaly_score >= ANOMALY_THRESHOLD)

        # ── LLM Derinlemesine Analiz ──
        llm_comment = None
        # LLM çağrı koşulu:
        #   1. ML anomali tespiti + skor eşiğin üstünde
        #   2. VEYA log seviyesi ERROR/CRITICAL (model ne derse desin)
        should_call_llm = (is_anomaly and anomaly_score >= ANOMALY_THRESHOLD) or level in ("ERROR", "CRITICAL")

        logger.debug(f"LLM karar: anomaly={is_anomaly}, score={anomaly_score:.4f}, level={level}, should_call={should_call_llm}")

        if should_call_llm:
            logger.info(f"🧠 LLM çağrılıyor — {source}/{model_type} | skor={anomaly_score:.2f}")
            llm_comment = self._ask_llm(source, message, level, model_type, anomaly_score)
            if llm_comment:
                logger.info(f"✅ LLM analizi alındı ({len(llm_comment)} karakter)")
            else:
                logger.warning(f"LLM boş yanıt döndürdü — {source}/{model_type}")
        else:
            logger.debug(f"LLM atlandı: score={anomaly_score:.4f}, level={level}")

        # ERROR/CRITICAL için minimum anomali skoru garantisi
        if level in ("ERROR", "CRITICAL") and anomaly_score < 0.5:
            anomaly_score = max(anomaly_score, self._fallback_score(level))
            is_anomaly = True

        return {
            "model_used":    model_used,
            "ml_prediction": "anomaly" if is_anomaly else "normal",
            "anomaly_score": round(anomaly_score, 4),
            "llm_analysis":  llm_comment,
        }

    # ─── LLM Sorgulama ──────────────────────
    def _ask_llm(self, source: str, message: str, level: str,
                 model_type: str, score: float) -> str | None:
        """Anomalili logu LLM'e (OpenAI GPT-4o) gönderip kök neden analizi yaptırır."""
        if not self.client:
            return None

        prompt = f"""Bir Kıdemli Site Reliability Engineer (SRE) ve Sistem Mimarı olarak aşağıdaki sistem logunda tespit edilen anomaliyi analiz et.

[ BAĞLAM VE KANITLAR ]
📌 Kaynak:  {source} ({model_type} modeli)
📌 Seviye:  {level}
📌 Skor:    {score:.2f}
📌 Log:     {message}

[ GÖREV VE KURALLAR ]
Sadece elindeki log metninde yazan teknik kanıtlara dayanarak, hiçbir varsayımda (hallucination) bulunmadan aşağıdaki soruları SIFIR hata payı ile yanıtla. Eğer log mesajında kesin bir kanıt yoksa, "Log detayı yetersiz, en olası durum şudur:" şeklinde belirt.

Aşağıdaki formatı harfiyen kullanarak KISA, NET ve PROFESYONEL Türkçe yanıt ver:
1. **Kök Neden**: (Hatanın teknik ve gerçek sebebi)
2. **Etki**:      (Sisteme, servise veya network'e anlık etkisi)
3. **Çözüm**:     (Bu sorunu izole etmek ve gidermek için atılacak ilk 2 KESİN operasyonel adım)"""

        try:
            response = self.client.chat.completions.create(
                model="gpt-4o",
                messages=[
                    {"role": "system", "content": "Sen kıdemli bir DevOps/SRE ve Cloud Mimarı uzmanısın. Yalnızca elindeki verilere (log, source, level) odaklanıp, teknik kanıta (evidence-based) dayalı, nokta atışı ve çok net Türkçe analizler yaparsın. Asla genel geçer, yuvarlak veya varsayımsal cümleler kurmazsın."},
                    {"role": "user", "content": prompt}
                ],
                max_tokens=300,
                temperature=0.1  # Çok daha tutarlı ve stabil yanıtlar için düşük sıcaklık
            )
            return response.choices[0].message.content.strip()
        except Exception as e:
            logger.error(f"LLM sorgu hatası: {e}")
            return None

    # ─── Fallback Skor Hesaplama ─────────────
    def _fallback_score(self, level: str) -> float:
        """Model yüklenemediğinde seviye bazlı basit skor döner."""
        scores = {
            "INFO": 0.05,
            "WARN": 0.30,
            "ERROR": 0.75,
            "CRITICAL": 0.98,
        }
        return scores.get(level, 0.1)


# ──────────────────────────────────────────────
# Singleton Instance — Sunucu başlarken 1 kez oluşturulur
# ──────────────────────────────────────────────
ai_engine = AIEngine()
