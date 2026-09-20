# NivexQL: Privacy-First Agentic SQL Analytics Platform

NivexQL is an enterprise-grade, local-first SQL analytics environment that combines cell-based notebook ergonomics with agentic artificial intelligence. Designed for data analysts, analytics engineers, and data leaders, NivexQL allows users to query, analyze, and visualize complex relational databases through natural language interaction and automated SQL generation—without transferring database schemas or query results outside the local environment.

---

## Executive Overview and Vision

Traditional database administration tools and SQL IDEs are designed primarily for transactional operations rather than rapid analytical discovery and executive narrative building. Conversely, cloud-hosted AI SQL assistants often require transferring sensitive database schema definitions, metadata, and query samples to external cloud APIs, violating enterprise data governance and privacy policies.

NivexQL resolves this fundamental tradeoff by combining three core principles:
1. Absolute Privacy: Zero data persistence and 100% local inference utilizing local Large Language Models (LLMs) via Ollama.
2. Interactive Analytical Ergonomics: Cell-wise execution, flexible split grids, visual query profiling, and dynamic chart recommendations.
3. Executive Presentation Quality: Built-in theme marketplace supporting light and dark modes tailored for client deliverables.

---

## Conceptual Origins

The concept behind NivexQL emerged from analyzing the operational gaps between four distinct software paradigms:

1. Interactive Computational Notebooks (Jupyter, Hex, Deepnote): The cell-based execution flow that allows analysts to construct step-by-step analytical narratives rather than running isolated SQL queries in a single window.
2. Production Database Administration Clients (DataGrip, DBeaver): The deep schema inspection, session management, and multi-dialect database connectivity required for production database systems.
3. Autonomous AI Coding Assistants: The capability to not only generate code from natural language prompts, but to autonomously inspect execution errors, perform differential comparison, and re-execute auto-fixed SQL queries.
4. Executive Dashboard Systems: High-contrast, presentation-ready design frameworks (such as Donezo Forest Light and Obsidian Dark) that allow technical outputs to be transformed directly into stakeholder-facing deliverables without third-party design tools.

---

## Core Capabilities

### 1. Local Agentic SQL Engine
- Natural Language to SQL Translation: Converts plain language questions into optimized dialect-specific SQL queries.
- Autonomous Auto-Correction: Detects database execution errors (syntax errors, missing columns, invalid joins), analyzes the database error message, generates an auto-fix diff, and re-executes the query without manual intervention.
- Performance Profiling: Runs query explain plans (`EXPLAIN` and `EXPLAIN ANALYZE`) to provide execution metrics and performance optimization insights.

### 2. Cell-Based Notebook Workspace
- Multi-Cell Execution: Independent execution state, pinned cells, drag-and-drop cell reordering, and cell history versioning.
- Split-Pane Interface: Resizable side-by-side layout pairing code editors, AI chat assistants, and version diffs directly alongside data tables, pivot views, and visualizations.
- Monaco Editor Integration: Full SQL syntax highlighting, auto-completion, formatting, and theme synchronization.

### 3. Automated Data Visualization
- D3.js Visualization Engine: Native rendering of bar charts, line graphs, area charts, scatter plots, pie charts, heatmaps, treemaps, and combo charts.
- Intelligent Chart Recommendation: Automatically inspects query result column data types and cardinality to select the optimal visualization style.
- Interactive Pivot & Data Grid: Client-side sorting, pagination, global filtering, and CSV/JSON export capabilities.

### 4. Dynamic Theme Marketplace
- Theme Adaptation: Supports five distinct themes (Donezo Forest Light, Obsidian Dark, Cosmic Indigo, Executive Light, and Cyberpunk Neon).
- Full Theme Sync: Every interface element—sidebar, cell header, Monaco editor instance, tab bar, and data visualization—synchronizes automatically to the selected theme token variables.

### 5. Multi-Dialect & SSH Connectivity
- Supported Dialects: Native support for PostgreSQL, MySQL, and SQLite.
- SSH Tunneling: Built-in support for connecting to remote database instances behind Bastion hosts via encrypted SSH tunnels.
- Live Database Inspection: Real-time table statistics, size breakdowns, row count tracking, lock inspection, and active connection termination.

---

## Security and Privacy Architecture

NivexQL operates under a strict Zero Data Persistence architecture:
- Local LLM Execution: All prompt evaluation and query generation are executed locally via Ollama endpoints (`http://localhost:11434`).
- No External Telemetry: Database credentials, connection strings, schema definitions, and query results remain strictly within local system memory.
- Ephemeral Application State: Session configurations, schema trees, and history reside in application memory and local storage, ensuring complete isolation from third-party servers.

---

## Technical Stack

### Frontend
- Core Framework: React 19, TypeScript, Vite
- State Management: Zustand (with JSON persistence)
- Code Editor: Monaco Editor
- Styling: Vanilla CSS custom properties (Design Tokens) and Tailwind CSS
- Data Visualization: D3.js (Native SVG/Canvas rendering)
- Iconography: Lucide React

### Backend
- Framework: Python 3.10+, FastAPI, Uvicorn
- Database Engine: SQLAlchemy, PyMySQL, psycopg2-binary
- LLM Integration: LangChain / Ollama API client

---

## Getting Started

### Prerequisites
- Node.js (v18.0.0 or higher)
- Python (v3.10 or higher)
- Ollama (Running locally with models such as `qwen2.5-coder` or `llama3`)
- Target Database (PostgreSQL, MySQL, or SQLite instance)

### 1. Backend Service Setup

Navigate to the backend directory, configure the Python environment, and start the FastAPI service:

```bash
cd backend
python -m venv venv
source venv/bin/activate
pip install -r requirements.txt
python main.py
```

Alternatively, launch directly via Uvicorn:

```bash
uvicorn main:app --reload --port 8082
```

The backend API server will run on `http://127.0.0.1:8082`.

### 2. Frontend Application Setup

In a separate terminal window, navigate to the frontend directory, install dependencies, and start the development server:

```bash
cd frontend
npm install
npm run dev
```

The web interface will launch on `http://localhost:5188`.

---

## Development Roadmap

- Phase 1 (Completed): Core Cell Execution Model, Drag-and-Drop Notebook Grid, Agentic SQL Auto-Fix Engine, D3 Visualization Engine, Theme Marketplace, Multi-Dialect Support.
- Phase 2 (Current Focus): Advanced Multi-Turn AI Chat Sessions, Custom Business Context Definitions, Local Session Export/Import.
- Phase 3 (Planned): Embedded Python Execution Cells, Cross-Database Federated Queries, Automated PDF/HTML Report Generation.

---

## License

Copyright (c) 2026 NivexQL. All rights reserved.
