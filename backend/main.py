import os
import json
import httpx
import sqlite3
from typing import Optional
from fastapi import FastAPI, HTTPException, Body
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import Engine, URL

app = FastAPI(title="NivexQL Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─────────────────────────────────────────────────────────────────────────────
# In-memory session state (purged on app close)
# ─────────────────────────────────────────────────────────────────────────────
_session = {
    "engine": None,
    "current_db": None,
    "dialect": None
}

_llm_config = {
    "provider": "ollama",
    "model": "qwen3:14b",
    "api_key": "",
    "endpoint": "http://localhost:11434"
}

# ─────────────────────────────────────────────────────────────────────────────
# Models
# ─────────────────────────────────────────────────────────────────────────────
class ConnectionRequest(BaseModel):
    dialect: str
    host: Optional[str] = None
    port: Optional[int] = None
    user: Optional[str] = None
    password: Optional[str] = None
    database: Optional[str] = None
    sqlite_path: Optional[str] = None

class QueryRequest(BaseModel):
    sql: str

class GenerateRequest(BaseModel):
    prompt: str
    db_schema: list[dict]
    context: str = ""

class FavoritesPayload(BaseModel):
    queries: list[str]

# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────
def _make_url(req: ConnectionRequest):
    if req.dialect == "sqlite":
        return f"sqlite:///{req.sqlite_path}"
    
    driver = "postgresql" if req.dialect == "postgresql" else "mysql+pymysql"
    return URL.create(
        drivername=driver,
        username=req.user,
        password=req.password or None,
        host=req.host,
        port=req.port,
        database=req.database or ("postgres" if req.dialect == "postgresql" else None)
    )

def _get_favorites_path():
    # Stateless in spirit, but we can use a local temp file for session persistence
    return os.path.join(os.path.expanduser("~"), ".sql_viewer_favorites.json")

def _load_favorites():
    path = _get_favorites_path()
    if os.path.exists(path):
        try:
            with open(path, 'r') as f:
                return json.load(f)
        except:
            return []
    return []

def _save_favorites(queries):
    with open(_get_favorites_path(), 'w') as f:
        json.dump(queries, f)

# ─────────────────────────────────────────────────────────────────────────────
# API Endpoints
# ─────────────────────────────────────────────────────────────────────────────

@app.post("/api/connect")
def connect_server(req: ConnectionRequest):
    # For PostgreSQL, we might need to try a few defaults if none provided
    db_attempts = [req.database] if req.database else (["postgres", "template1"] if req.dialect == "postgresql" else [None])
    
    last_error = None
    for db in db_attempts:
        try:
            temp_req = req.model_copy(update={"database": db})
            url = _make_url(temp_req)
            engine = create_engine(url)
            
            with engine.connect() as conn:
                if req.dialect == "postgresql":
                    res = conn.execute(text("SELECT datname FROM pg_database WHERE datistemplate = false;"))
                    dbs = [r[0] for r in res]
                elif req.dialect == "mysql":
                    res = conn.execute(text("SHOW DATABASES;"))
                    dbs = [r[0] for r in res]
                elif req.dialect == "sqlite":
                    dbs = ["main"]
                
                _session["engine"] = engine
                _session["dialect"] = req.dialect
                return {"status": "connected", "databases": dbs}
        except Exception as e:
            last_error = e
            continue
            
    raise HTTPException(status_code=400, detail=f"Handshake failed: {str(last_error)}")

@app.post("/api/select")
def select_database(database: str = Body(..., embed=True)):
    engine = _session.get("engine")
    dialect = _session.get("dialect")
    if not engine:
        raise HTTPException(status_code=400, detail="Not connected to server")

    try:
        if dialect == "postgresql":
            url = engine.url.set(database=database)
            new_engine = create_engine(url)
        elif dialect == "mysql":
            url = engine.url.set(database=database)
            new_engine = create_engine(url)
        else: # sqlite
            new_engine = engine

        inspector = inspect(new_engine)
        tables = []
        for table_name in inspector.get_table_names():
            cols = []
            for col in inspector.get_columns(table_name):
                cols.append({"name": col["name"], "type": str(col["type"])})
            tables.append({"name": table_name, "columns": cols})
        
        _session["engine"] = new_engine
        _session["current_db"] = database
        return {"status": "selected", "tables": tables}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.post("/api/export")
def export_results(req: dict):
    fmt = req.get("format", "csv")
    columns = req.get("columns", [])
    rows = req.get("rows", [])
    if fmt == "csv":
        import io, csv
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
        return {"data": output.getvalue(), "filename": "export.csv", "mime": "text/csv"}
    else:
        return {"data": json.dumps(rows, indent=2), "filename": "export.json", "mime": "application/json"}

@app.post("/api/query")
def execute_query(req: QueryRequest):
    engine = _session.get("engine")
    if not engine:
        raise HTTPException(status_code=400, detail="No database selected")
    
    try:
        with engine.connect() as conn:
            res = conn.execute(text(req.sql))
            if res.returns_rows:
                columns = list(res.keys())
                rows = [dict(zip(columns, row)) for row in res]
                return {"columns": columns, "rows": rows}
            else:
                conn.commit()
                return {"columns": [], "rows": [], "message": "Query executed successfully"}
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

@app.get("/api/llm/config")
def get_llm_config():
    return _llm_config

@app.post("/api/llm/config")
def update_llm_config(config: dict):
    _llm_config.update(config)
    return _llm_config

@app.get("/api/llm/status")
async def get_llm_status():
    provider = _llm_config.get("provider", "ollama")
    endpoint = _llm_config.get("endpoint", "http://localhost:11434")
    if provider == "ollama":
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                res = await client.get(endpoint)
                if res.status_code == 200:
                    return {"status": "ok", "provider": provider, "endpoint": endpoint, "models": []}
        except:
            pass
        return {"status": "error", "provider": provider, "endpoint": endpoint, "models": []}
    return {"status": "ok", "provider": provider, "models": []}

@app.get("/api/llm/models")
async def get_llm_models():
    provider = _llm_config.get("provider", "ollama")
    endpoint = _llm_config.get("endpoint", "http://localhost:11434")
    if provider == "ollama":
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                res = await client.get(f"{endpoint}/api/tags")
                if res.status_code == 200:
                    data = res.json()
                    models = []
                    for m in data.get("models", []):
                        models.append({
                            "name": m.get("name"),
                            "size": m.get("size", 0),
                            "modified": m.get("modified_at", "")
                        })
                    return {"models": models}
        except:
            return {"models": []}
    # For openai/gemini we could hardcode some common ones
    if provider == "openai":
        return {"models": [{"name": "gpt-4o", "size": 0, "modified": ""}, {"name": "gpt-4-turbo", "size": 0, "modified": ""}]}
    if provider == "gemini":
        return {"models": [{"name": "gemini-1.5-pro", "size": 0, "modified": ""}, {"name": "gemini-1.5-flash", "size": 0, "modified": ""}]}
    return {"models": []}

@app.post("/api/generate")
async def generate_sql(req: GenerateRequest):
    schema_limit = 4000
    schema_text = ""
    for tbl in req.db_schema:
        cols = ", ".join(f"{c['name']} ({c['type']})" for c in tbl.get("columns", []))
        entry = f"Table {tbl['name']}: {cols}\n"
        if len(schema_text) + len(entry) > schema_limit:
            schema_text += "... (truncated)"
            break
        schema_text += entry

    system_prompt = (
        "You are an expert SQL assistant. Given a database schema and a natural language question:\n"
        "1. Generate a valid SQL SELECT query.\n"
        "2. Suggest a meaningful, short name (3-5 words) for this analysis cell based on the user's intent.\n"
        "3. Suggest the best visualization type ('bar', 'line', 'scatter', 'pie', 'area', or 'bubble') based on the data structure.\n\n"
        "Return ONLY a JSON object in this format:\n"
        '{"sql": "...", "suggested_name": "...", "suggested_viz": "..."}\n\n'
        f"Business Context / Rules:\n{req.context}\n\n"
        f"Schema:\n{schema_text}"
    )

    provider = _llm_config["provider"]
    model = _llm_config["model"]
    api_key = _llm_config["api_key"]
    response_text = ""

    try:
        async with httpx.AsyncClient(timeout=90) as client:
            if provider == "ollama":
                resp = await client.post(f"{_llm_config['endpoint']}/api/chat", json={
                    "model": model, "messages": [{"role": "system", "content": system_prompt}, {"role": "user", "content": req.prompt}], "stream": False
                })
                response_text = resp.json()["message"]["content"].strip()
            elif provider == "openai":
                resp = await client.post("https://api.openai.com/v1/chat/completions", headers={"Authorization": f"Bearer {api_key}"}, json={
                    "model": model, "messages": [{"role": "system", "content": system_prompt}, {"role": "user", "content": req.prompt}]
                })
                response_text = resp.json()["choices"][0]["message"]["content"].strip()
            elif provider == "gemini":
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
                payload = {"contents": [{"parts": [{"text": f"{system_prompt}\n\nUser Question: {req.prompt}"}]}]}
                resp = await client.post(url, json=payload)
                response_text = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    try:
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0].strip()
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0].strip()
        result = json.loads(response_text)
        return {
            "sql": result.get("sql", ""), 
            "suggested_name": result.get("suggested_name", ""),
            "suggested_viz": result.get("suggested_viz", "bar"), 
            "model": model
        }
    except:
        return {"sql": response_text, "suggested_viz": "bar", "model": model}

class FixRequest(BaseModel):
    prompt: str
    sql: str
    error: str
    db_schema: list[dict]
    context: str = ""

@app.post("/api/generate/fix")
async def fix_sql(req: FixRequest):
    schema_text = ""
    for tbl in req.db_schema:
        cols = ", ".join(f"{c['name']} ({c['type']})" for c in tbl.get("columns", []))
        schema_text += f"Table {tbl['name']}: {cols}\n"

    system_prompt = (
        "You are an expert SQL debugger. A user tried to run a query that failed with an error.\n"
        "Return ONLY the corrected SQL SELECT query.\n\n"
        f"Business Context / Rules:\n{req.context}\n\n"
        f"Schema:\n{schema_text}"
    )
    user_message = f"Prompt: {req.prompt}\nFailing SQL: {req.sql}\nError: {req.error}"
    
    provider = _llm_config["provider"]
    model = _llm_config["model"]
    api_key = _llm_config["api_key"]
    sql = ""
    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_message}]

    try:
        async with httpx.AsyncClient(timeout=90) as client:
            if provider == "ollama":
                resp = await client.post(f"{_llm_config['endpoint']}/api/chat", json={"model": model, "messages": messages, "stream": False})
                sql = resp.json()["message"]["content"].strip()
            elif provider == "openai":
                resp = await client.post("https://api.openai.com/v1/chat/completions", headers={"Authorization": f"Bearer {api_key}"}, json={"model": model, "messages": messages})
                sql = resp.json()["choices"][0]["message"]["content"].strip()
            elif provider == "gemini":
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
                payload = {"contents": [{"parts": [{"text": f"{system_prompt}\n\n{user_message}"}]}]}
                resp = await client.post(url, json=payload)
                sql = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    if sql.startswith("```"):
        sql = sql.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    return {"sql": sql, "model": model}

class AnalyzeRequest(BaseModel):
    prompt: str
    results: list[dict]
    columns: list[str]

@app.post("/api/analyze")
async def analyze_results(req: AnalyzeRequest):
    data_sample = req.results[:100]
    system_prompt = "You are an expert data analyst. Provide a concise (2-3 sentences) summary of key findings."
    user_message = f"Context: {req.prompt}\nColumns: {req.columns}\nData: {json.dumps(data_sample)}"
    
    provider = _llm_config["provider"]
    model = _llm_config["model"]
    api_key = _llm_config["api_key"]
    insights = ""

    try:
        async with httpx.AsyncClient(timeout=90) as client:
            if provider == "ollama":
                resp = await client.post(f"{_llm_config['endpoint']}/api/chat", json={
                    "model": model, "messages": [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_message}], "stream": False
                })
                insights = resp.json()["message"]["content"].strip()
            elif provider == "openai":
                resp = await client.post("https://api.openai.com/v1/chat/completions", headers={"Authorization": f"Bearer {api_key}"}, json={
                    "model": model, "messages": [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_message}]
                })
                insights = resp.json()["choices"][0]["message"]["content"].strip()
            elif provider == "gemini":
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
                payload = {"contents": [{"parts": [{"text": f"{system_prompt}\n\n{user_message}"}]}]}
                resp = await client.post(url, json=payload)
                insights = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
    except Exception as e:
        insights = f"Analysis failed: {e}"
    return {"insights": insights}

@app.get("/api/favorites")
def get_favorites():
    return {"queries": _load_favorites()}

@app.post("/api/favorites")
def save_favorites(queries: list[str]):
    _save_favorites(queries)
    return {"status": "saved"}

@app.post("/api/followups")
async def generate_followups(req: dict):
    prompt = req.get("prompt", "")
    columns = req.get("columns", [])
    results = req.get("results", [])[:20]
    
    provider = _llm_config["provider"]
    model = _llm_config["model"]
    api_key = _llm_config.get("api_key", "")
    
    system_prompt = (
        "You are a data analyst assistant. Given a user's question and query results, "
        "suggest exactly 3 short follow-up questions the user might want to explore next. "
        "Return ONLY a JSON array of 3 strings, no other text. "
        'Example: ["What is the average revenue?", "Which region has the highest sales?", "Show me the trend over time."]'
    )
    user_message = f"Original question: {prompt}\nResult columns: {columns}\nSample data: {json.dumps(results[:5])}"
    
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            response_text = ""
            if provider == "ollama":
                resp = await client.post(f"{_llm_config['endpoint']}/api/chat", json={
                    "model": model, "messages": [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_message}], "stream": False
                })
                response_text = resp.json()["message"]["content"].strip()
            elif provider == "openai":
                resp = await client.post("https://api.openai.com/v1/chat/completions", headers={"Authorization": f"Bearer {api_key}"}, json={
                    "model": model, "messages": [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_message}]
                })
                response_text = resp.json()["choices"][0]["message"]["content"].strip()
            elif provider == "gemini":
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
                resp = await client.post(url, json={"contents": [{"parts": [{"text": f"{system_prompt}\n\n{user_message}"}]}]})
                response_text = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
            
            # Parse JSON array
            if "```json" in response_text:
                response_text = response_text.split("```json")[1].split("```")[0].strip()
            elif "```" in response_text:
                response_text = response_text.split("```")[1].split("```")[0].strip()
            # Find array in response
            start = response_text.find("[")
            end = response_text.rfind("]") + 1
            if start >= 0 and end > start:
                suggestions = json.loads(response_text[start:end])
                return {"suggestions": suggestions[:3]}
    except Exception as e:
        pass
    return {"suggestions": []}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="127.0.0.1", port=8081, reload=True)
