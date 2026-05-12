# 🌌 NivexQL (Agentic SQL Analytics Platform)

An entirely local, highly interactive, and beautifully designed SQL Analytics Notebook powered by Local LLMs. **NivexQL** allows data analysts and engineers to generate, execute, and visualize complex SQL queries entirely via natural language—without ever sending your sensitive database schema or data to cloud APIs.

---

## ✨ Why NivexQL?

Traditional SQL clients are built for DBAs, not for rapid analytical workflows. NivexQL brings the ergonomics of a Jupyter Notebook and merges it with Agentic AI. 

- **100% Private & Local**: Runs entirely on your hardware using Ollama / MLX. Your database credentials, schema, and query results never leave your machine.
- **Notebook Ergonomics**: Build your analytical narrative cell by cell. Drag and drop to reorder, pin important dashboards to the top, and organize your flow.
- **Agentic Auto-Correction**: If a generated query fails against your schema, the Agent intercepts the PostgreSQL error, fixes the syntax, and re-executes automatically.
- **Business Context**: Teach the agent your specific business logic ("Revenue = Price - Discount") in the Context tab, and it will apply those rules to all future queries.

## 🚀 Quick Start

### 1. Prerequisites
- **Node.js** (v18+)
- **Python** (3.10+)
- **Ollama** (Running locally on `http://localhost:11434` with `qwen2.5-coder:7b` or `llama3`)
- **PostgreSQL** (Your target database)

### 2. Backend Setup
The backend is a stateless FastAPI server that handles database connections and LLM orchestration.
```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```
*Server runs on `http://127.0.0.1:8081`*

### 3. Frontend Setup
The frontend is a React 19 + Vite application (electron-ready) using Tailwind CSS.
```bash
cd frontend
npm install
npm run dev
```
*App runs on `http://localhost:5173`*

## 🛠 Tech Stack

- **Frontend**: React 19, Vite, Tailwind CSS, Zustand, Monaco Editor, Lucide Icons.
- **Visualizations**: D3.js (Native).
- **Backend**: Python, FastAPI, SQLAlchemy, LangChain/Ollama integrations.
- **Design System**: Glassmorphism, 100vh/100vw responsive layout, custom `nvn-dark` theme.

## 📚 Documentation

Detailed documentation on how to maximize your workflow with NivexQL can be found in the `/DOCS` directory:

1. [Features & Usage Guide](./DOCS/FEATURES_AND_USAGE.md) - Learn how to use Drill-downs, Cell Pinning, and AI Context.
2. [Architecture Overview](./DOCS/ARCHITECTURE.md) - Understand the stateless design and agentic execution loop.

## 🗺 Roadmap

- **Phase 1 (Complete)**: Core UI, Notebook Ergonomics, Drag/Drop, Table Filtering, Split Panes.
- **Phase 2 (In Progress)**: Local Persistence, Multi-turn Chat Mode.
- **Phase 3 (Upcoming)**: Interactive Pivot Tables, Fullscreen Dashboards, SSH Tunnels.

---
*Built for speed. Built for privacy. Built for local hardware.*
