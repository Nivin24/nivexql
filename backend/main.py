# main.py
import uvicorn
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

import database
import llm
from config import _session
from logger import logger

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup Events
    logger.info("Initializing NivexQL Analytics Engine Backend Services...")
    yield
    # Shutdown Events: Graceful clean-up of database connections and SSH tunnels
    logger.info("Tearing down NivexQL Backend Services...")
    if _session.get("engine"):
        try:
            logger.info("Disposing active database engine pool...")
            _session["engine"].dispose()
        except Exception as e:
            logger.error(f"Error disposing database engine: {e}")
            
    if _session.get("ssh_tunnel"):
        try:
            logger.info("Stopping active SSH Tunnel forwarder...")
            _session["ssh_tunnel"].stop()
        except Exception as e:
            logger.error(f"Error stopping SSH Tunnel: {e}")

app = FastAPI(
    title="NivexQL Analytics Platform Backend",
    description="Secure, stateless SQL execution and LLM-assisted analysis gateway.",
    version="1.0.0",
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include Routers
app.include_router(database.router, tags=["Database Operations"])
app.include_router(llm.router, tags=["AI & LLM Services"])

if __name__ == "__main__":
    import sys
    port = int(database.os.getenv("NIVEXQL_PORT", "8081"))
    logger.info(f"Starting server on http://127.0.0.1:{port}")
    is_frozen = getattr(sys, "frozen", False)
    if is_frozen:
        uvicorn.run(app, host="127.0.0.1", port=port)
    else:
        uvicorn.run("main:app", host="127.0.0.1", port=port, reload=True)
