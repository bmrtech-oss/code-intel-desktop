# Code-Intel Backend Setup & Desktop Connection Guide

This guide walks you through the step-by-step process of installing and running the `code-intel` FastAPI backend server on port `8000` using SQLite as a local, lightweight bitemporal database engine, so that the `code-intel-desktop` Tauri application can establish a secure, live connection.

---

## 📋 Prerequisites

Ensure you have the following installed on your machine:
- **Python**: version 3.11 or greater (we tested on Python 3.12.13)
- **uv**: Fast python package installer (or alternatively standard `pip` / `venv`)
- **Git**: To clone the backend repository

---

## 🛠️ Step-by-Step Setup

### 1. Clone the Backend Repository
Clone the `code-intel` backend service to your preferred directory (e.g., `/home/jules/code-intel` or any custom workspace path):
```bash
git clone https://github.com/bmrtech-oss/code-intel /home/jules/code-intel
```

### 2. Set Up Virtual Environment & Dependencies
Navigate to the backend repository, create a virtual environment, and install package dependencies:
```bash
cd /home/jules/code-intel
uv venv
source .venv/bin/activate
uv pip install -e .
```

### 3. Apply SQLite Compatibility Patch (Required for Local SQLite Mode)
Because SQLite does not natively support PostgreSQL's `ARRAY(BigInteger)` type, we apply a lightweight custom type wrapper in `code_intel/core/models.py`. This ensures perfect local execution with zero complex PostgreSQL service setups.

Create and execute the following Python patch script:
```python
import os

filepath = "code_intel/core/models.py"
with open(filepath, "r") as f:
    content = f.read()

new_imports = """from sqlalchemy import Column, String, Integer, DateTime, Text, BigInteger, Float, UniqueConstraint, Boolean, ARRAY, JSON
from sqlalchemy.types import TypeDecorator
import json
import os

db_url = os.getenv("DATABASE_URL", "")
if "sqlite" in db_url:
    class SQLiteArray(TypeDecorator):
        impl = Text
        def process_bind_param(self, value, dialect):
            if value is not None:
                return json.dumps(value)
            return None
        def process_result_value(self, value, dialect):
            if value is not None:
                try:
                    return json.loads(value)
                except Exception:
                    return []
            return None
    ARRAY_BigInteger = SQLiteArray()
else:
    ARRAY_BigInteger = ARRAY(BigInteger)
"""

content = content.replace("from sqlalchemy import Column, String, Integer, DateTime, Text, BigInteger, Float, UniqueConstraint, Boolean, ARRAY", new_imports)
content = content.replace("depends_on = Column(ARRAY(BigInteger))", "depends_on = Column(ARRAY_BigInteger)")
content = content.replace("depends_on_derived = Column(ARRAY(BigInteger))", "depends_on_derived = Column(ARRAY_BigInteger)")
content = content.replace("grounded_in = Column(ARRAY(BigInteger))", "grounded_in = Column(ARRAY_BigInteger)")

with open(filepath, "w") as f:
    f.write(content)

print("SQLite Compatibility Patch applied!")
```

### 4. Start the FastAPI Server on Port 8000
Run the server using `uvicorn` with `DATABASE_URL` pointed to local SQLite:
```bash
DATABASE_URL=sqlite+aiosqlite:///codeintel.db uvicorn code_intel.api.server:app --host 127.0.0.1 --port 8000
```

You should see output indicating uvicorn is running successfully:
```text
INFO:     Started server process [...]
INFO:     Waiting for application startup.
...
INFO:     Application startup complete.
INFO:     Uvicorn running on http://127.0.0.1:8000 (Press CTRL+C to quit)
```

---

## ⚡ Verifying Desktop Handshake & Connection

1. Open the **Code-Intel Desktop** application.
2. The UI automatically runs an asynchronous DOM handshake to `http://localhost:8000/api/status` or `http://127.0.0.1:8000/api/status`.
3. If connected successfully, the top offline warning banner will immediately hide, and the bottom status bar will display **"Connected"** with a green dot!
4. If the backend is stopped or goes offline at any point, the desktop client will gracefully display a centered warning banner at the top of the viewport: `⚠️ Server Disconnected — Viewing Offline Local Cache.` and turn the status indicator red, while keeping any already-rendered Cytoscape graph fully active and interactive!
