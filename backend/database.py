# database.py
import os
import json
import time
from typing import Optional
from fastapi import APIRouter, HTTPException, Body
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import URL

from config import _session
from schemas import ConnectionRequest, QueryRequest
from logger import logger

try:
    from sshtunnel import SSHTunnelForwarder
except ImportError:
    SSHTunnelForwarder = None

router = APIRouter()

def _make_url(req: ConnectionRequest, local_bind_port: Optional[int] = None):
    if req.dialect == "sqlite":
        return f"sqlite:///{req.sqlite_path}"
    
    driver = "postgresql" if req.dialect == "postgresql" else "mysql+pymysql"
    host = "127.0.0.1" if local_bind_port else req.host
    port = local_bind_port if local_bind_port else req.port

    return URL.create(
        drivername=driver,
        username=req.user,
        password=req.password or None,
        host=host,
        port=port,
        database=req.database or ("postgres" if req.dialect == "postgresql" else None)
    )

@router.post("/api/connect")
def connect_server(req: ConnectionRequest):
    logger.info(f"Received database connection handshake request for dialect: {req.dialect}")
    
    if req.use_ssh:
        if SSHTunnelForwarder is None:
            logger.error("SSH Tunnel requested but sshtunnel package is missing.")
            raise HTTPException(
                status_code=500, 
                detail="sshtunnel module is not installed on the backend. Please run pip install sshtunnel"
            )
        logger.info(f"SSH Tunnel enabled. Destination Bastion: {req.ssh_host}:{req.ssh_port}")

    # Clean up existing connection
    if _session.get("engine"):
        logger.info("Cleaning up active database engine...")
        _session["engine"].dispose()
        _session["engine"] = None
    if _session.get("ssh_tunnel"):
        logger.info("Stopping active SSH tunnel...")
        _session["ssh_tunnel"].stop()
        _session["ssh_tunnel"] = None

    tunnel = None
    local_bind_port = None

    if req.use_ssh and req.ssh_host:
        try:
            ssh_kwargs = {
                "ssh_address_or_host": (req.ssh_host, req.ssh_port),
                "ssh_username": req.ssh_user,
                "remote_bind_address": (req.host, req.port or (5432 if req.dialect == "postgresql" else 3306))
            }
            if req.ssh_key_path:
                ssh_kwargs["ssh_pkey"] = os.path.expanduser(req.ssh_key_path)
            elif req.ssh_password:
                ssh_kwargs["ssh_password"] = req.ssh_password
                
            tunnel = SSHTunnelForwarder(**ssh_kwargs)
            tunnel.start()
            local_bind_port = tunnel.local_bind_port
            logger.info(f"SSH Tunnel established successfully on local port: {local_bind_port}")
        except Exception as e:
            logger.error(f"SSH Tunnel connection failure: {e}", exc_info=True)
            raise HTTPException(status_code=400, detail=f"SSH Tunnel failed: {str(e)}")

    # For PostgreSQL, we might need to try a few defaults if none provided
    db_attempts = [req.database] if req.database else (["postgres", "template1"] if req.dialect == "postgresql" else [None])
    
    last_error = None
    for db in db_attempts:
        try:
            logger.info(f"Attempting connection handshake to database: '{db}'")
            temp_req = req.model_copy(update={"database": db})
            url = _make_url(temp_req, local_bind_port)
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
                _session["ssh_tunnel"] = tunnel
                logger.info("Database connection handshake succeeded.")
                return {"status": "connected", "databases": dbs}
        except Exception as e:
            logger.warning(f"Connection attempt to database '{db}' failed: {e}")
            last_error = e
            continue
            
    if tunnel:
        logger.info("Cleaning up SSH Tunnel due to database connection failure...")
        tunnel.stop()
        
    logger.error(f"Database connection handshake failed: {last_error}", exc_info=True)
    raise HTTPException(status_code=400, detail=f"Handshake failed: {str(last_error)}")

@router.post("/api/select")
def select_database(database: str = Body(..., embed=True)):
    engine = _session.get("engine")
    dialect = _session.get("dialect")
    if not engine:
        logger.error("Select database request received without active server connection.")
        raise HTTPException(status_code=400, detail="Not connected to server")

    logger.info(f"Selecting database: '{database}' for dialect: '{dialect}'")
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
            # Get primary keys
            pk_constraint = inspector.get_pk_constraint(table_name)
            pk_cols = set(pk_constraint.get("constrained_columns", []))

            cols = []
            for col in inspector.get_columns(table_name):
                cols.append({
                    "name": col["name"],
                    "type": str(col["type"]),
                    "isPrimaryKey": col["name"] in pk_cols
                })

            # Get foreign keys
            fks = []
            for fk in inspector.get_foreign_keys(table_name):
                for local_col, ref_col in zip(fk["constrained_columns"], fk["referred_columns"]):
                    fks.append({
                        "column": local_col,
                        "referencedTable": fk["referred_table"],
                        "referencedColumn": ref_col
                    })

            # Fast count query
            row_count = 0
            try:
                with new_engine.connect() as conn:
                    res = conn.execute(text(f"SELECT COUNT(*) FROM {table_name}"))
                    row_count = res.scalar() or 0
            except Exception as e:
                logger.debug(f"Failed to fetch row count for table '{table_name}': {e}")
                pass

            tables.append({"name": table_name, "columns": cols, "foreignKeys": fks, "rowCount": row_count})

        _session["engine"] = new_engine
        _session["current_db"] = database
        logger.info(f"Successfully loaded schema for database: '{database}'. Found {len(tables)} tables.")
        return {"status": "selected", "tables": tables}
    except Exception as e:
        logger.error(f"Error selecting database '{database}': {e}", exc_info=True)
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/api/export")
def export_results(req: dict):
    fmt = req.get("format", "csv")
    columns = req.get("columns", [])
    rows = req.get("rows", [])
    logger.info(f"Exporting {len(rows)} records in format: '{fmt}'")
    
    if fmt == "csv":
        import io, csv
        output = io.StringIO()
        writer = csv.DictWriter(output, fieldnames=columns)
        writer.writeheader()
        writer.writerows(rows)
        return {"data": output.getvalue(), "filename": "export.csv", "mime": "text/csv"}
    else:
        return {"data": json.dumps(rows, indent=2), "filename": "export.json", "mime": "application/json"}

@router.post("/api/query")
def execute_query(req: QueryRequest):
    engine = _session.get("engine")
    if not engine:
        logger.error("Query execution request received but no database is currently active.")
        raise HTTPException(status_code=400, detail="No database selected")
    
    logger.info(f"Executing SQL query:\n{req.sql}")
    start_time = time.time()
    try:
        with engine.connect() as conn:
            res = conn.execute(text(req.sql))
            execution_ms = int((time.time() - start_time) * 1000)
            
            if res.returns_rows:
                columns = list(res.keys())
                rows = [dict(zip(columns, row)) for row in res]
                logger.info(f"Query returned {len(rows)} rows. Duration: {execution_ms}ms")
                return {"columns": columns, "rows": rows, "execution_ms": execution_ms}
            else:
                conn.commit()
                logger.info(f"DML/DDL query executed successfully. Duration: {execution_ms}ms")
                return {"columns": [], "rows": [], "message": "Query executed successfully", "execution_ms": execution_ms}
    except Exception as e:
        logger.error(f"SQL execution error: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/api/inspector/stats")
def get_inspector_stats():
    engine = _session.get("engine")
    dialect = _session.get("dialect")
    if not engine:
        raise HTTPException(status_code=400, detail="No database selected")
    
    logger.info("Fetching inspector database stats...")
    try:
        with engine.connect() as conn:
            if dialect == "postgresql":
                sql = """
                SELECT
                    relname AS table_name,
                    pg_size_pretty(pg_total_relation_size(c.oid)) AS total_size,
                    pg_size_pretty(pg_relation_size(c.oid)) AS table_size,
                    pg_size_pretty(pg_total_relation_size(c.oid) - pg_relation_size(c.oid)) AS index_size,
                    reltuples::bigint AS row_count
                FROM pg_class c
                LEFT JOIN pg_namespace n ON n.oid = c.relnamespace
                WHERE nspname = 'public'
                  AND relkind = 'r'
                ORDER BY pg_total_relation_size(c.oid) DESC
                LIMIT 20;
                """
                res = conn.execute(text(sql))
                stats = [dict(zip(res.keys(), row)) for row in res]
                return {"stats": stats}
            elif dialect == "mysql":
                sql = """
                SELECT 
                    table_name AS table_name,
                    ROUND(((data_length + index_length) / 1024 / 1024), 2) AS total_size_mb,
                    ROUND((data_length / 1024 / 1024), 2) AS table_size_mb,
                    ROUND((index_length / 1024 / 1024), 2) AS index_size_mb,
                    table_rows AS row_count
                FROM information_schema.TABLES
                WHERE table_schema = DATABASE()
                ORDER BY (data_length + index_length) DESC;
                """
                res = conn.execute(text(sql))
                raw_stats = [dict(zip(res.keys(), row)) for row in res]
                stats = []
                for row in raw_stats:
                    stats.append({
                        "table_name": row["table_name"],
                        "total_size": f"{row['total_size_mb']} MB",
                        "table_size": f"{row['table_size_mb']} MB",
                        "index_size": f"{row['index_size_mb']} MB",
                        "row_count": row["row_count"]
                    })
                return {"stats": stats}
            else: # sqlite
                inspector = inspect(engine)
                stats = []
                for table_name in inspector.get_table_names():
                    res = conn.execute(text(f"SELECT COUNT(*) FROM {table_name}"))
                    row_count = res.scalar() or 0
                    stats.append({
                        "table_name": table_name,
                        "total_size": "N/A",
                        "table_size": "N/A",
                        "index_size": "N/A",
                        "row_count": row_count
                    })
                return {"stats": stats}
    except Exception as e:
        logger.error(f"Error fetching inspector stats: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/api/inspector/sessions")
def get_inspector_sessions():
    engine = _session.get("engine")
    dialect = _session.get("dialect")
    if not engine:
        raise HTTPException(status_code=400, detail="No database selected")
    
    logger.info("Fetching active database sessions...")
    try:
        with engine.connect() as conn:
            if dialect == "postgresql":
                sql = """
                SELECT
                    pid,
                    usename AS user,
                    client_addr AS client,
                    backend_start::text AS start_time,
                    state,
                    query
                FROM pg_stat_activity
                WHERE datname = current_database()
                  AND pid <> pg_backend_pid()
                ORDER BY backend_start DESC;
                """
                res = conn.execute(text(sql))
                sessions = [dict(zip(res.keys(), row)) for row in res]
                return {"sessions": sessions}
            elif dialect == "mysql":
                sql = "SHOW PROCESSLIST;"
                res = conn.execute(text(sql))
                raw_sessions = [dict(zip(res.keys(), row)) for row in res]
                sessions = []
                for row in raw_sessions:
                    sessions.append({
                        "pid": row.get("Id") or row.get("id"),
                        "user": row.get("User") or row.get("user"),
                        "client": row.get("Host") or row.get("host"),
                        "start_time": f"{row.get('Time') or row.get('time')}s active",
                        "state": row.get("Command") or row.get("command"),
                        "query": row.get("Info") or row.get("info") or ""
                    })
                return {"sessions": sessions}
            else: # sqlite
                return {"sessions": [{"pid": 1, "user": "local", "client": "localhost", "start_time": "N/A", "state": "active", "query": "SQLite single process"}]}
    except Exception as e:
        logger.error(f"Error fetching sessions: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.get("/api/inspector/locks")
def get_inspector_locks():
    engine = _session.get("engine")
    dialect = _session.get("dialect")
    if not engine:
        raise HTTPException(status_code=400, detail="No database selected")
    
    logger.info("Fetching database locks...")
    try:
        with engine.connect() as conn:
            if dialect == "postgresql":
                sql = """
                SELECT
                    a.pid,
                    a.usename AS user,
                    l.relation::regclass::text AS table_name,
                    l.mode,
                    l.granted,
                    a.query
                FROM pg_stat_activity a
                JOIN pg_locks l ON l.pid = a.pid
                WHERE a.datname = current_database()
                  AND l.relation IS NOT NULL
                ORDER BY a.pid;
                """
                res = conn.execute(text(sql))
                locks = [dict(zip(res.keys(), row)) for row in res]
                return {"locks": locks}
            else:
                return {"locks": []}
    except Exception as e:
        logger.error(f"Error fetching locks: {e}")
        raise HTTPException(status_code=400, detail=str(e))

@router.post("/api/inspector/terminate")
def terminate_session(pid: int = Body(..., embed=True)):
    engine = _session.get("engine")
    dialect = _session.get("dialect")
    if not engine:
        raise HTTPException(status_code=400, detail="No database selected")
    
    logger.info(f"Terminating database session pid: {pid} for dialect: {dialect}")
    try:
        with engine.connect() as conn:
            if dialect == "postgresql":
                res = conn.execute(text("SELECT pg_terminate_backend(:pid)"), {"pid": pid})
                success = res.scalar() or False
                return {"status": "terminated" if success else "failed"}
            elif dialect == "mysql":
                conn.execute(text(f"KILL {pid}"))
                return {"status": "terminated"}
            else:
                return {"status": "unsupported"}
    except Exception as e:
        logger.error(f"Error terminating session {pid}: {e}")
        raise HTTPException(status_code=400, detail=str(e))
