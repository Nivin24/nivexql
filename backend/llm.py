# llm.py
import os
import json
import httpx
import time
from fastapi import APIRouter, HTTPException

from config import _llm_config
from schemas import GenerateRequest, FixRequest, AnalyzeRequest, PlannerRequest
from logger import logger

router = APIRouter()

def _get_favorites_path():
    return os.path.join(os.path.expanduser("~"), ".sql_viewer_favorites.json")

def _load_favorites():
    path = _get_favorites_path()
    if os.path.exists(path):
        try:
            with open(path, 'r') as f:
                return json.load(f)
        except Exception as e:
            logger.warning(f"Failed to read favorites file at {path}: {e}")
            return []
    return []

def _save_favorites(queries):
    path = _get_favorites_path()
    try:
        with open(path, 'w') as f:
            json.dump(queries, f)
    except Exception as e:
        logger.error(f"Failed to write favorites file at {path}: {e}")

@router.get("/api/llm/config")
def get_llm_config():
    logger.info("Fetching active LLM provider configurations.")
    return _llm_config

@router.post("/api/llm/config")
def update_llm_config(config: dict):
    logger.info(f"Updating LLM config. New Provider: '{config.get('provider')}', Model: '{config.get('model')}'")
    _llm_config.update(config)
    return _llm_config

@router.get("/api/llm/status")
async def get_llm_status():
    provider = _llm_config.get("provider", "ollama")
    endpoint = _llm_config.get("endpoint", "http://localhost:11434")
    logger.info(f"Checking LLM status for provider: '{provider}'")
    
    if provider == "ollama":
        try:
            async with httpx.AsyncClient(timeout=5) as client:
                res = await client.get(endpoint)
                if res.status_code == 200:
                    return {"status": "ok", "provider": provider, "endpoint": endpoint, "models": []}
        except Exception as e:
            logger.warning(f"Ollama status check failed: {e}")
            pass
        return {"status": "error", "provider": provider, "endpoint": endpoint, "models": []}
    return {"status": "ok", "provider": provider, "models": []}

@router.get("/api/llm/models")
async def get_llm_models():
    provider = _llm_config.get("provider", "ollama")
    endpoint = _llm_config.get("endpoint", "http://localhost:11434")
    logger.info(f"Fetching models lists from provider: '{provider}'")
    
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
                    logger.info(f"Ollama returned {len(models)} installed models.")
                    return {"models": models}
        except Exception as e:
            logger.error(f"Failed to query Ollama models: {e}")
            return {"models": []}
            
    # For openai/gemini we could hardcode some common ones
    if provider == "openai":
        return {"models": [{"name": "gpt-4o", "size": 0, "modified": ""}, {"name": "gpt-4-turbo", "size": 0, "modified": ""}]}
    if provider == "gemini":
        return {"models": [{"name": "gemini-1.5-pro", "size": 0, "modified": ""}, {"name": "gemini-1.5-flash", "size": 0, "modified": ""}]}
    return {"models": []}

@router.post("/api/generate")
async def generate_sql(req: GenerateRequest):
    logger.info(f"AI SQL generation request received. Prompt: '{req.prompt}'")
    start_time = time.time()
    
    schema_limit = 4000
    schema_text = ""
    for tbl in req.db_schema:
        cols = ", ".join(f"{c['name']} ({c['type']})" for c in tbl.get("columns", []))
        entry = f"Table {tbl['name']}: {cols}\n"
        if len(schema_text) + len(entry) > schema_limit:
            schema_text += "... (truncated)"
            break
        schema_text += entry

    context_block = ""
    if req.context.strip():
        logger.info(f"Global business context rule sets found and formatted. Len: {len(req.context)}")
        context_block = (
            "\n══════════════════════════════════════════\n"
            "STRICT USER-DEFINED RULES — YOU MUST FOLLOW ALL OF THESE:\n"
            "══════════════════════════════════════════\n"
            + "\n".join(f"{i+1}. {line.strip()}" for i, line in enumerate(req.context.strip().splitlines()) if line.strip())
            + "\n\nThese rules override any default behavior. If a rule says to exclude certain columns "
            "(e.g. IDs, UUIDs, internal fields), you MUST NOT include those columns in the SELECT clause, "
            "even if they exist in the schema. Never violate these rules.\n"
            "══════════════════════════════════════════\n"
        )

    system_prompt = (
        "You are an expert SQL assistant. Given a database schema and a natural language question:\n"
        "1. Generate a valid SQL SELECT query.\n"
        "2. Suggest a meaningful, short name (3-5 words) for this analysis cell based on the user's intent.\n"
        "3. Suggest the best visualization type ('bar', 'line', 'scatter', 'pie', 'area', or 'bubble') based on the data structure.\n\n"
        "Return ONLY a JSON object in this format:\n"
        '{"sql": "...", "suggested_name": "...", "suggested_viz": "..."}\n'
        + context_block
        + f"\nSchema:\n{schema_text}"
    )

    messages = [{"role": "system", "content": system_prompt}]
    if req.chat_history:
        for msg in req.chat_history:
            role = msg.get("role")
            content = msg.get("content", "")
            sql = msg.get("sql")
            if role == "assistant" and sql:
                content = f"{content}\n\nGenerated SQL:\n{sql}"
            messages.append({"role": role, "content": content})
            
    user_content = req.prompt
    if req.context.strip():
        user_content += "\n\n[Reminder: strictly follow the user-defined rules above. Do not include excluded columns.]"
    messages.append({"role": "user", "content": user_content})

    provider = _llm_config["provider"]
    model = _llm_config["model"]
    api_key = _llm_config["api_key"]
    response_text = ""

    logger.info(f"Routing generation request to '{provider}' using model: '{model}'")
    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            if provider == "ollama":
                resp = await client.post(f"{_llm_config['endpoint']}/api/chat", json={
                    "model": model, 
                    "messages": messages, 
                    "stream": False
                })
                response_text = resp.json()["message"]["content"].strip()
            elif provider == "openai":
                resp = await client.post("https://api.openai.com/v1/chat/completions", headers={"Authorization": f"Bearer {api_key}"}, json={
                    "model": model, 
                    "messages": messages
                })
                response_text = resp.json()["choices"][0]["message"]["content"].strip()
            elif provider == "gemini":
                # For Gemini, consolidate chat history into a single structured prompt text
                history_text = "\n\nConversation History:\n"
                if req.chat_history:
                    for msg in req.chat_history:
                        role_label = "User" if msg.get("role") == "user" else "Assistant"
                        sql_text = f"\nGenerated SQL:\n{msg.get('sql')}" if msg.get('sql') else ""
                        history_text += f"{role_label}: {msg.get('content')}{sql_text}\n"
                else:
                    history_text = ""
                
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
                payload = {"contents": [{"parts": [{"text": f"{system_prompt}{history_text}\n\nUser Question: {req.prompt}"}]}]}
                resp = await client.post(url, json=payload)
                response_text = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
    except Exception as e:
        logger.error(f"LLM API Gateway error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    duration = int(time.time() - start_time)
    logger.info(f"Received LLM response in {duration}s. Parsing JSON response...")
    
    try:
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0].strip()
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0].strip()
        result = json.loads(response_text)
        logger.info(f"AI SQL generation completed successfully. Sug. Name: '{result.get('suggested_name')}'")
        return {
            "sql": result.get("sql", ""), 
            "suggested_name": result.get("suggested_name", ""),
            "suggested_viz": result.get("suggested_viz", "bar"), 
            "model": model
        }
    except Exception as parse_err:
        logger.warning(f"Failed to parse JSON response. Falling back to plain text return. Error: {parse_err}")
        return {"sql": response_text, "suggested_viz": "bar", "model": model}

@router.post("/api/generate/fix")
async def fix_sql(req: FixRequest):
    logger.info(f"AI SQL debugging fix request received. Error description: '{req.error}'")
    schema_text = ""
    for tbl in req.db_schema:
        cols = ", ".join(f"{c['name']} ({c['type']})" for c in tbl.get("columns", []))
        schema_text += f"Table {tbl['name']}: {cols}\n"

    context_block = ""
    if req.context.strip():
        context_block = (
            "\n══════════════════════════════════════════\n"
            "STRICT USER-DEFINED RULES — YOU MUST FOLLOW ALL OF THESE:\n"
            "══════════════════════════════════════════\n"
            + "\n".join(f"{i+1}. {line.strip()}" for i, line in enumerate(req.context.strip().splitlines()) if line.strip())
            + "\n\nThese rules override any default behavior. If a rule says to exclude certain columns "
            "(e.g. IDs, UUIDs, internal fields), your corrected SQL MUST NOT include those columns either.\n"
            "══════════════════════════════════════════\n"
        )

    system_prompt = (
        "You are an expert SQL debugger. A user tried to run a query that failed with an error.\n"
        "Return ONLY the corrected SQL SELECT query — no explanation, no markdown fences.\n"
        + context_block
        + f"\nSchema:\n{schema_text}"
    )
    user_message = f"Prompt: {req.prompt}\nFailing SQL: {req.sql}\nError: {req.error}"
    
    provider = _llm_config["provider"]
    model = _llm_config["model"]
    api_key = _llm_config["api_key"]
    sql = ""
    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_message}]

    logger.info(f"Routing debug correction to '{provider}' using model: '{model}'")
    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
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
        logger.error(f"SQL debugger LLM error: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    if sql.startswith("```"):
        sql = sql.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
    logger.info("AI debug SQL correction successful.")
    return {"sql": sql, "model": model}

@router.post("/api/analyze")
async def analyze_results(req: AnalyzeRequest):
    logger.info(f"AI data insights requested for {len(req.results)} result rows.")
    data_sample = req.results[:100]
    system_prompt = "You are an expert data analyst. Provide a concise (2-3 sentences) summary of key findings."
    user_message = f"Context: {req.prompt}\nColumns: {req.columns}\nData: {json.dumps(data_sample)}"
    
    provider = _llm_config["provider"]
    model = _llm_config["model"]
    api_key = _llm_config["api_key"]
    insights = ""

    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
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
        logger.error(f"Analysis failed: {e}")
        insights = f"Analysis failed: {e}"
    return {"insights": insights}

@router.get("/api/favorites")
def get_favorites():
    return {"queries": _load_favorites()}

@router.post("/api/favorites")
def save_favorites(queries: list[str]):
    _save_favorites(queries)
    return {"status": "saved"}

@router.post("/api/followups")
async def generate_followups(req: dict):
    prompt = req.get("prompt", "")
    columns = req.get("columns", [])
    results = req.get("results", [])[:20]
    
    provider = _llm_config["provider"]
    model = _llm_config["model"]
    api_key = _llm_config.get("api_key", "")
    
    logger.info("AI requesting follow-up data analysis suggestions...")
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
            
            start = response_text.find("[")
            end = response_text.rfind("]") + 1
            if start >= 0 and end > start:
                suggestions = json.loads(response_text[start:end])
                logger.info(f"AI follow-up suggestions generated: {suggestions[:3]}")
                return {"suggestions": suggestions[:3]}
    except Exception as e:
        logger.warning(f"Failed to generate followups: {e}")
        pass
    return {"suggestions": []}

@router.post("/api/planner/niches")
async def plan_dashboard_niches(req: PlannerRequest):
    logger.info("AI dashboard niches planning request received.")
    start_time = time.time()
    
    schema_limit = 4000
    schema_text = ""
    for tbl in req.db_schema:
        cols = ", ".join(f"{c['name']} ({c['type']})" for c in tbl.get("columns", []))
        entry = f"Table {tbl['name']}: {cols}\n"
        if len(schema_text) + len(entry) > schema_limit:
            schema_text += "... (truncated)"
            break
        schema_text += entry

    context_block = ""
    if req.context.strip():
        logger.info(f"Global business context rule sets found and formatted for planner. Len: {len(req.context)}")
        context_block = (
            "\n══════════════════════════════════════════\n"
            "STRICT USER-DEFINED RULES — YOU MUST FOLLOW ALL OF THESE:\n"
            "══════════════════════════════════════════\n"
            + "\n".join(f"{i+1}. {line.strip()}" for i, line in enumerate(req.context.strip().splitlines()) if line.strip())
            + "\n══════════════════════════════════════════\n"
        )

    system_prompt = (
        "You are an expert business intelligence architect. Analyze the provided database schema "
        "and suggest exactly 3 storytelling dashboard niches (e.g. Sales Performance, User Growth, Inventory Operational Efficiency) "
        "that would be highly relevant and valuable for this database.\n\n"
        "For each niche, suggest exactly 4 highly specific, ready-to-run SQL queries that answer key analytical questions. "
        "Each query should tell a clear story, utilize correct SQL syntax (based on standard SQL), "
        "and refer ONLY to the tables and columns present in the schema.\n\n"
        "Return ONLY a JSON object in this format:\n"
        "{\n"
        '  "niches": [\n'
        "    {\n"
        '      "name": "Niche Name (e.g. Revenue & Growth Analytics)",\n'
        '      "description": "Short explanation of the business objective and storytelling angle of this niche.",\n'
        '      "queries": [\n'
        "        {\n"
        '          "title": "Query Title (e.g. Monthly Revenue Trends)",\n'
        '          "question": "The question this query answers.",\n'
        '          "sql": "SELECT ...",\n'
        '          "viz": "bar" // Recommended visualization: bar, line, pie, area, scatter, or pivot\n'
        "        }\n"
        "      ]\n"
        "    }\n"
        "  ]\n"
        "}\n\n"
        + context_block
        + f"\nSchema:\n{schema_text}"
    )

    messages = [{"role": "system", "content": system_prompt}, {"role": "user", "content": "Suggest storytelling dashboard niches and matching queries based on my database schema."}]

    provider = _llm_config["provider"]
    model = _llm_config["model"]
    api_key = _llm_config["api_key"]
    response_text = ""

    logger.info(f"Routing planning request to '{provider}' using model: '{model}'")
    try:
        async with httpx.AsyncClient(timeout=300.0) as client:
            if provider == "ollama":
                resp = await client.post(f"{_llm_config['endpoint']}/api/chat", json={
                    "model": model, 
                    "messages": messages, 
                    "stream": False
                })
                response_text = resp.json()["message"]["content"].strip()
            elif provider == "openai":
                resp = await client.post("https://api.openai.com/v1/chat/completions", headers={"Authorization": f"Bearer {api_key}"}, json={
                    "model": model, 
                    "messages": messages
                })
                response_text = resp.json()["choices"][0]["message"]["content"].strip()
            elif provider == "gemini":
                url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent?key={api_key}"
                payload = {"contents": [{"parts": [{"text": system_prompt}]}]}
                resp = await client.post(url, json=payload)
                response_text = resp.json()["candidates"][0]["content"]["parts"][0]["text"].strip()
    except Exception as e:
        logger.error(f"LLM API Gateway error in planner: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=str(e))

    duration = int(time.time() - start_time)
    logger.info(f"Received LLM response for planner in {duration}s. Parsing JSON response...")
    
    try:
        if "```json" in response_text:
            response_text = response_text.split("```json")[1].split("```")[0].strip()
        elif "```" in response_text:
            response_text = response_text.split("```")[1].split("```")[0].strip()
        
        # Clean up any leading/trailing garbage before JSON start/end
        start_idx = response_text.find("{")
        end_idx = response_text.rfind("}") + 1
        if start_idx >= 0 and end_idx > start_idx:
            response_text = response_text[start_idx:end_idx]
            
        result = json.loads(response_text)
        logger.info(f"AI dashboard niches planning completed successfully. Suggested {len(result.get('niches', []))} niches.")
        return result
    except Exception as parse_err:
        logger.error(f"Failed to parse JSON response for planner. Raw text: {response_text}. Error: {parse_err}")
        raise HTTPException(status_code=500, detail="AI generated an invalid planner format. Please try again.")
