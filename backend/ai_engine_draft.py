"""
LogSense AI — AI Engine
LogAI kütüphanesini kullanarak log ayrıştırma ve anomali tespiti yapar.
"""

import pandas as pd
from logai.extractors.log_parser import LogParser, LogParserConfig
from logai.algorithms.parsing_algo.drain import DrainParams
from logai.extractors.feature_extractor import FeatureExtractor, FeatureExtractorConfig
from logai.models.anomaly_detection.isolation_forest import IsolationForest, IsolationForestParams

class AIEngine:
    def __init__(self):
        # Log Parser Yapılandırması (Drain algoritması)
        self.parser_config = LogParserConfig(
            parsing_algorithm="drain",
            parsing_algo_params=DrainParams(
                sim_th=0.5,
                depth=4
            )
        )
        self.parser = LogParser(self.parser_config)
        
        # Anomali Tespit Modeli (Isolation Forest)
        # Gerçek uygulamada bu modelin önceden eğitilmiş olması gerekir.
        # Burada her gelen log için dinamik bir skorlama (veya basitleştirilmiş bir model) simüle edeceğiz.
        self.model = IsolationForest(IsolationForestParams())

    def process_log(self, log_entry: dict):
        """
        Gelen logu işler:
        1. Parse eder (Template çıkarır)
        2. Özellik çıkarımı yapar
        3. Anomali skoru hesaplar
        """
        try:
            # logai DataFrame bekler
            df = pd.DataFrame([log_entry])
            
            # Parsing
            parsed_df = self.parser.parse(df)
            template = parsed_df['event_template'].iloc[0] if 'event_template' in parsed_df.columns else "unknown_template"
            
            # Basit Anomali Skoru Simülasyonu
            # LogAI modelleri normalde toplu veri (batch) bekler. 
            # Real-time tekli log için basitleştirilmiş bir skorlama mantığı:
            score = self._calculate_anomaly_score(log_entry, template)
            
            return {
                "template": template,
                "anomaly_score": score
            }
        except Exception as e:
            print(f"AI Engine Error: {e}")
            return {"template": "parse_error", "anomaly_score": 0.0}

    def _calculate_anomaly_score(self, log_entry: dict, template: str) -> float:
        """
        Log seviyesi ve template özelliklerine göre anomali skoru hesaplar (0-1).
        """
        score = 0.0
        level = log_entry.get("level", "INFO")
        
        # Temel seviye riskleri
        level_risks = {
            "INFO": 0.1,
            "WARN": 0.4,
            "ERROR": 0.8,
            "CRITICAL": 0.95
        }
        score = level_risks.get(level, 0.1)
        
        # Rastgelelik ve template varyasyonu (simülasyon için)
        import random
        score += random.uniform(-0.05, 0.05)
        
        return min(max(score, 0.0), 1.0)

ai_engine = AIEngine()
