#!/bin/bash

# 1. Attempt to find the uvicorn executable
if command -v uvicorn &> /dev/null; then
    echo "Starting with direct uvicorn command..."
    exec uvicorn server:app --host 0.0.0.0 --port $PORT

# 2. If that fails, try using python module
elif command -v python3.13 &> /dev/null; then
    echo "Starting with python3.13 module..."
    exec python3.13 -m uvicorn server:app --host 0.0.0.0 --port $PORT

# 3. Fallback to generic python3
else
    echo "Starting with generic python3 module..."
    exec python3 -m uvicorn server:app --host 0.0.0.0 --port $PORT
fi
