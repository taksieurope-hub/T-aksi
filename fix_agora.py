import subprocess, sys

# Check what agora packages are installed
result = subprocess.run([sys.executable, "-m", "pip", "list"], capture_output=True, text=True)
for line in result.stdout.splitlines():
    if "agora" in line.lower():
        print(line)

# Try importing both variants
try:
    from agora_token_builder import RtcTokenBuilder
    print("agora_token_builder OK")
except ImportError as e:
    print(f"agora_token_builder MISSING: {e}")

try:
    from agora_token import RtcTokenBuilder
    print("agora_token OK")
except ImportError as e:
    print(f"agora_token MISSING: {e}")
