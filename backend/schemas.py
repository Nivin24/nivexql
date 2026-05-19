# schemas.py
from pydantic import BaseModel
from typing import Optional

class ConnectionRequest(BaseModel):
    dialect: str
    host: Optional[str] = None
    port: Optional[int] = None
    user: Optional[str] = None
    password: Optional[str] = None
    database: Optional[str] = None
    sqlite_path: Optional[str] = None
    
    use_ssh: bool = False
    ssh_host: Optional[str] = None
    ssh_port: int = 22
    ssh_user: Optional[str] = None
    ssh_password: Optional[str] = None
    ssh_key_path: Optional[str] = None

class QueryRequest(BaseModel):
    sql: str

class GenerateRequest(BaseModel):
    prompt: str
    db_schema: list[dict]
    context: str = ""
    chat_history: Optional[list[dict]] = None

class FavoritesPayload(BaseModel):
    queries: list[str]

class FixRequest(BaseModel):
    prompt: str
    sql: str
    error: str
    db_schema: list[dict]
    context: str = ""

class AnalyzeRequest(BaseModel):
    prompt: str
    results: list[dict]
    columns: list[str]
