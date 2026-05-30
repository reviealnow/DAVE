"""Convenience entry point: python run_backend.py [--host X] [--port Y]"""
from app.main import app  # noqa: F401 — imported for uvicorn string reference

if __name__ == "__main__":
    import os
    from argparse import ArgumentParser

    import uvicorn

    p = ArgumentParser()
    p.add_argument("--host", default=os.getenv("APP_HOST", "127.0.0.1"))
    p.add_argument("--port", type=int, default=int(os.getenv("APP_PORT", "8765")))
    p.add_argument("--reload", action="store_true")
    args = p.parse_args()
    uvicorn.run("app.main:app", host=args.host, port=args.port, reload=args.reload)
