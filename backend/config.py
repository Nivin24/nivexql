# config.py
import os

# Global in-memory session (thread-safe operations should use locking,
# but for local single-user analytics/BI workspace, simple dict works)
_session = {
    "engine": None,
    "current_db": None,
    "dialect": None,
    "ssh_tunnel": None
}

# Load LLM settings with fallback defaults for self-hosted or cloud services
_llm_config = {
    "provider": os.getenv("NIVEXQL_LLM_PROVIDER", "ollama"),
    "model": os.getenv("NIVEXQL_LLM_MODEL", "qwen3:14b"),
    "api_key": os.getenv("NIVEXQL_LLM_API_KEY", ""),
    "endpoint": os.getenv("NIVEXQL_LLM_ENDPOINT", "http://localhost:11434")
}
