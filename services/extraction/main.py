"""06A Step 0: extraction microservice scaffold.

Empty hosting shell only. Health-check endpoint, no extraction, NER,
embedding, or entity-resolution logic (those land in Steps 1-5).
"""
from fastapi import FastAPI

app = FastAPI(title="mop-extraction", version="0.0.0-step0")


@app.get("/health")
def health() -> dict:
    return {
        "status": "ok",
        "service": "mop-extraction",
        "step": "06A-step0",
        "capabilities": [],
    }
