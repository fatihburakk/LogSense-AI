# LogSense AI 🔍🧠

**LogSense AI** is a next-generation AIOps platform designed for real-time log monitoring, intelligent anomaly detection, and automated root cause analysis. 

Built with **FastAPI** and **Next.js**, it leverages **Salesforce LogAI** for machine learning-based anomaly detection and **GPT-4o** to translate complex system errors into human-readable insights.

---

## 🚀 Key Features

- **Real-time Log Stream**: Live monitoring of system logs via WebSockets.
- **AI-Powered Anomaly Detection**: Uses Isolation Forest models to detect unusual system behavior.
- **Intelligent Root Cause Analysis**: Integrated with GPT-4o to provide technical context and solutions in plain language.
- **Event Correlation**: Automatically links related failures (e.g., Disk Full -> DB Error -> API Timeout) into causal chains.
- **Interactive Dashboard**: Modern, premium dark-mode interface with live charts and deep-dive capabilities.
- **Multi-Source Support**: Specialized analysis for Apache, MongoDB, MSSQL, MySQL, and PostgreSQL.

## 🛠️ Tech Stack

- **Backend**: Python, FastAPI, SQLModel (SQLite), Salesforce LogAI, OpenAI SDK
- **Frontend**: Next.js 15, React 19, Recharts, CSS Modules
- **Simulation**: Custom Log Producer for realistic traffic scenarios

---

## 📦 Getting Started

### Prerequisites

- Python 3.10+
- Node.js 18+
- OpenAI API Key (for intelligent analysis)

### 1. Backend Setup
```bash
cd backend
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
pip install -r requirements.txt
```
*Create a `.env` file in the `backend` folder and add your `OPENAI_API_KEY`.*

### 2. Frontend Setup
```bash
cd frontend
npm install
npm run dev
```

### 3. Run Simulation
```bash
cd backend
python producer.py
```

---

## 🏗️ Architecture

The system consists of four main layers:
1. **Producer**: Simulates realistic server logs.
2. **Analysis Engine**: Enriches logs and applies ML models.
3. **Correlation Engine**: Connects events chronologically and logically.
4. **Dashboard**: The visual command center for system health.

---

## 🔒 Security Note

The `.gitignore` file is configured to exclude sensitive files like `backend/.env` and `backend/logs.db`. Ensure your API keys are never pushed to public repositories.

---

Developed as a modern AIOps solution. 🚀
