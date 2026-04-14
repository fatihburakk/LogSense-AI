"""
LogSense AI — Log Producer (Simülasyon)
Gerçekçi sunucu logları üretip FastAPI backend'e gönderir.
Kaynak tipleri: apache, mongodb, mssql, mysql, postgres

Kullanım:
    python producer.py
    python producer.py --url http://localhost:8000/api/logs --interval 1.5
"""

import random
import time
import argparse
import os
import json
from datetime import datetime, timezone

import httpx
from dotenv import load_dotenv, find_dotenv

load_dotenv(find_dotenv())

API_KEY = os.getenv("LOGSENSE_API_KEY", "")


# ──────────────────────────────────────────────
# Yeni Kaynak Tipleri (Eğitilmiş Modellere Uyumlu)
# ──────────────────────────────────────────────
SOURCES = ["apache", "mongodb", "mssql", "mysql", "postgres"]

LOG_TEMPLATES = {
    # ─── Apache / Web ─────────────────────────
    "apache": {
        "INFO": [
            '192.168.1.{ip} - - [{date}] "GET /index.html HTTP/1.1" 200 4523',
            '10.0.0.{ip} - user{user_id} [{date}] "POST /api/v1/login HTTP/1.1" 200 312',
            '172.16.0.{ip} - - [{date}] "GET /assets/style.css HTTP/1.1" 200 8901',
            '192.168.1.{ip} - - [{date}] "GET /api/v1/users/{user_id} HTTP/1.1" 200 1024',
            '10.0.0.{ip} - - [{date}] "GET /health HTTP/1.1" 200 15',
            'Apache/2.4.41 (Ubuntu) Server started on port 80',
            'AH00558: apache2: Could not reliably determine the server fully qualified domain name',
        ],
        "WARN": [
            '192.168.1.{ip} - - [{date}] "GET /old-page HTTP/1.1" 301 512',
            'AH01630: client denied by server configuration: /var/www/html/.htaccess',
            '10.0.0.{ip} - - [{date}] "GET /api/v1/search?q=test HTTP/1.1" 429 128 - Rate limited',
            'mod_ssl: SSL handshake interrupted by system - connection was reset',
        ],
        "ERROR": [
            '192.168.1.{ip} - - [{date}] "POST /api/v1/upload HTTP/1.1" 500 0 - Internal Server Error',
            'AH00124: Request exceeded the limit of 10 internal redirects',
            '[error] [client 10.0.0.{ip}] File does not exist: /var/www/html/favicon.ico',
            'AH01797: client denied by server configuration: proxy:http://backend:8080/api',
            '192.168.1.{ip} - - [{date}] "GET /admin HTTP/1.1" 403 287 - Forbidden',
        ],
        "CRITICAL": [
            'AH00060: seg fault or similar nasty error detected in the parent process {proc}',
            'AH00144: couldn\'t grab the accept mutex - Loss of lock (attempt {count})',
            '[crit] ({ms})No space left on device: AH00023: Couldn\'t create the ssl-cache mutex',
            'Segmentation fault (core dumped) - Apache child process crashed: instance {user_id}',
        ],
    },

    # ─── MongoDB ──────────────────────────────
    "mongodb": {
        "INFO": [
            'connection accepted from 192.168.1.{ip}:5{port} #42 (3 connections now open)',
            'Successfully authenticated as principal admin@admin on admin from client 127.0.0.1:{port}',
            'Index build completed: orders.idx_user_id with key pattern {{ user_id: 1 }}',
            'Waiting for replication to replicate to 2 secondaries',
            'Replica set member 192.168.1.101:{port} transitioned to PRIMARY',
        ],
        "WARN": [
            'Slow query detected: {{ find: "orders", filter: {{ status: "pending" }} }} planSummary: COLLSCAN keysExamined:0 docsExamined:{docs} {ms}ms',
            'Access control is not enabled for the database. Read and write access to data is unrestricted',
            'Connection pool for 192.168.1.102:{port} is almost full ({pool}/100)',
        ],
        "ERROR": [
            'MongoTimeoutError: Server selection timed out after 30000ms',
            'E REPL [replexec-0] Error in heartbeat request to 192.168.1.103:{port}; ExceededTimeLimit: operation exceeded time limit',
            'SocketException: remote host refused connection to 192.168.1.102:{port}',
            'Write operation failed: E11000 duplicate key error collection: db.users index: email_1 dup key: {{ email: "user@test.com" }}',
        ],
        "CRITICAL": [
            'STORAGE [WiredTiger] WT_ERROR: {ms} out of memory or disk space - aborting',
            'Fatal assertion {docs} - Unable to step up as primary, replication interrupted',
            'Data corruption detected in collection users - checksum mismatch at offset {docs}',
        ],
    },

    # ─── MSSQL ────────────────────────────────
    "mssql": {
        "INFO": [
            'Login succeeded for user "sa". Connection made using SQL Server authentication [CLIENT: 192.168.1.{ip}]',
            'Database "ProductionDB" started successfully',
            'Backup completed successfully. Database: ProductionDB, {size} MB processed',
            'Recovery of database "TempDB" (4) is 100% complete (elapsed {ms} seconds)',
            'CHECKDB for database "ProductionDB" finished without errors',
        ],
        "WARN": [
            'SQL Server has encountered {count} occurrence(s) of cachestore flush',
            'The query processor could not produce a query plan because of missing statistics on table "orders"',
            'Autogrow of file "ProductionDB_log" in database "ProductionDB" took {ms} milliseconds',
            'SQL Server performance counter "Buffer cache hit ratio" dropped below 90%',
        ],
        "ERROR": [
            'Error: 18456, Severity: 14, State: 8. Login failed for user "app_user". Reason: Password did not match',
            'Error: 1205, Severity: 13. Transaction (Process ID {proc}) was deadlocked on lock resources with another process',
            'Error: 9002, Severity: 17. The transaction log for database "ProductionDB" is full',
            'Error: 823, Severity: 24. I/O error (bad page ID) detected during read at offset {docs} in file "ProductionDB.mdf"',
        ],
        "CRITICAL": [
            'Error: 17058, Severity: 16. initerrlog: Could not open error log file. Operating system error = 112 (disk full)',
            'SQL Server is shutting down due to fatal exception c0000005. Error: 0x80004005',
            'Error: 3624, Severity: 20. A system assertion check has failed - possible database corruption',
        ],
    },

    # ─── MySQL ────────────────────────────────
    "mysql": {
        "INFO": [
            '[Note] /usr/sbin/mysqld: ready for connections. Version: 8.0.33-0ubuntu0.22.04.1',
            'Connect user{user_id}@192.168.1.{ip} on ProductionDB using TCP/IP',
            '[Note] InnoDB: Buffer pool(s) load completed at {date}',
            'Slow query completed: SELECT * FROM orders WHERE created_at > NOW() - INTERVAL 30 DAY; Time: {ms}ms Rows: {docs}',
        ],
        "WARN": [
            '[Warning] Aborted connection {count} to db: "ProductionDB" user: "app_user" host: "192.168.1.{ip}" (Got timeout reading communication packets)',
            '[Warning] InnoDB: Tablespace is full, cannot allocate more pages',
            '[Warning] Changed limits: max_connections = 214 (requested {count})',
            'Sort buffer overflow, increase sort_buffer_size to at least {size}',
        ],
        "ERROR": [
            'ERROR 1045 (28000): Access denied for user "root"@"192.168.1.{ip}" (using password: YES)',
            'ERROR 2002 (HY000): Can\'t connect to local MySQL server through socket "/var/run/mysqld/mysqld.sock"',
            'ERROR 1213 (40001): Deadlock found when trying to get lock; try restarting transaction',
            'ERROR 1062 (23000): Duplicate entry "{user_id}" for key "PRIMARY"',
        ],
        "CRITICAL": [
            'InnoDB: Fatal error: ib_logfile0 is of different size 50331648 bytes than specified in the .cnf file',
            'mysqld got signal 11; This could be because you hit a bug. Thread pointer: 0x0',
            'InnoDB: Assertion failure in thread {proc} in file buf0buf.cc line 2838',
        ],
    },

    # ─── PostgreSQL ───────────────────────────
    "postgres": {
        "INFO": [
            'LOG: database system is ready to accept connections',
            'LOG: connection authorized: user=app_user database=production_db host=192.168.1.{ip}',
            'LOG: autovacuum: found 234 removable, {docs} nonremovable rows in table "public.orders"',
            'LOG: checkpoint complete: wrote {count} buffers (12.5%); 0 WAL file(s) added',
            'LOG: duration: {ms}.123 ms statement: SELECT * FROM users WHERE id = {user_id}',
        ],
        "WARN": [
            'WARNING: could not open statistics file "pg_stat_tmp/global.stat": Operation not permitted',
            'WARNING: max_connections ({count}) has been reached. New connections are being rejected',
            'WARNING: autovacuum launcher started when it was not expected to be running',
            'LOG: temporary file: path "base/pgsql_tmp/pgsql_tmp4821.{count}", size {size}',
        ],
        "ERROR": [
            'ERROR: relation "nonexistent_table" does not exist at character 15',
            'FATAL: password authentication failed for user "app_user"',
            'ERROR: deadlock detected - Process {proc} waits for ShareLock on transaction {count}',
            'FATAL: could not open file "base/16384/123456": No such file or directory',
            'ERROR: canceling statement due to statement timeout',
        ],
        "CRITICAL": [
            'PANIC: could not write to log file: No space left on device',
            'PANIC: WAL contains records past the consistency point - database may be corrupted',
            'FATAL: the database system is in recovery mode',
        ],
    },
}

# Ağırlıklı dağılım: %65 INFO, %15 WARN, %13 ERROR, %7 CRITICAL
LEVEL_WEIGHTS = {
    "INFO": 65,
    "WARN": 15,
    "ERROR": 13,
    "CRITICAL": 7,
}


def generate_log() -> dict:
    """Ağırlıklı rastgele bir log satırı üretir."""
    source = random.choice(SOURCES)

    levels = list(LEVEL_WEIGHTS.keys())
    weights = list(LEVEL_WEIGHTS.values())
    level = random.choices(levels, weights=weights, k=1)[0]

    template = random.choice(LOG_TEMPLATES[source][level])

    now = datetime.now(timezone.utc)
    date_str = now.strftime("%d/%b/%Y:%H:%M:%S +0000")

    # Placeholder'ları gerçekçi değerlerle doldur
    message = template.format(
        user_id=random.randint(1000, 9999),
        ip=random.randint(1, 254),
        port=random.randint(10000, 65535),
        ms=random.randint(2, 8500),
        pool=random.randint(60, 99),
        docs=random.randint(100, 999999),
        count=random.randint(1, 500),
        size=random.randint(50, 5000),
        proc=random.randint(1000, 9999),
        date=date_str,
    )

    return {
        "timestamp": now.isoformat(),
        "level": level,
        "message": message,
        "source": source,
    }


def send_log(url: str, log_data: dict) -> bool:
    """Logu backend'e POST eder. X-API-KEY header ile gönderir."""
    headers = {"Content-Type": "application/json"}
    if API_KEY:
        headers["X-API-KEY"] = API_KEY
    try:
        response = httpx.post(url, json=log_data, headers=headers, timeout=5.0)
        if response.status_code == 403:
            print(f"⚠️  API Key reddedildi (403). LOGSENSE_API_KEY değişkenini kontrol et.")
            return False
        return response.status_code in (200, 202)
    except httpx.ConnectError:
        print(f"⚠️  Backend'e bağlanılamadı: {url}")
        return False
    except Exception as e:
        print(f"❌ Hata: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(description="LogSense AI — Log Producer")
    parser.add_argument("--url", default="http://localhost:8000/api/logs", help="Backend log endpoint URL")
    parser.add_argument("--interval", type=float, default=1.0, help="Loglar arası bekleme süresi (saniye)")
    parser.add_argument("--burst", action="store_true", help="Hızlı burst modu (interval 0.1s)")
    args = parser.parse_args()

    interval: float = 1.0
    if args.burst:
        interval = 0.1
    else:
        interval = float(args.interval)

    url: str = str(args.url)

    print("=" * 60)
    print("🔧 LogSense AI — Log Producer v2.0")
    print(f"📡 Hedef: {url}")
    print(f"⏱️  Aralık: {interval}s")
    print(f"📦 Kaynaklar: {', '.join(SOURCES)}")
    print("=" * 60)
    print("Loglar üretiliyor... (Ctrl+C ile durdur)\n")

    count: int = 0
    errors: int = 0

    try:
        while True:
            log = generate_log()
            success = send_log(url, log)
            count += 1

            level_icons = {
                "INFO": "📋",
                "WARN": "⚠️",
                "ERROR": "🔴",
                "CRITICAL": "💀",
            }
            icon = level_icons.get(log["level"], "📋")

            if success:
                print(f"  {icon} [{log['source']:10s}] [{log['level']:8s}] {log['message'][:80]}")
            else:
                errors += 1
                print(f"  ❌ Gönderilemedi: [{log['level']}] {log['message'][:50]}")

            # Hata loglarından sonra bazen burst üret (gerçekçi simülasyon)
            if log["level"] in ("ERROR", "CRITICAL") and random.random() < 0.3:
                burst_count = random.randint(2, 5)
                print(f"  ⚡ Hata sonrası burst: {burst_count} ek log üretiliyor...")
                for i in range(burst_count):
                    burst_log = generate_log()
                    # Burst loglarını birbirinden ayırmak için başına küçük bir ID ekleyelim
                    burst_log["message"] = f"[{i+1}/{burst_count}] " + burst_log["message"]
                    send_log(url, burst_log)
                    count += 1
                    time.sleep(0.05)

            time.sleep(interval)

    except KeyboardInterrupt:
        print(f"\n{'=' * 60}")
        print(f"🛑 Producer durduruldu.")
        print(f"📊 Toplam: {count} log gönderildi, {errors} hata")
        print(f"{'=' * 60}")


if __name__ == "__main__":
    main()
