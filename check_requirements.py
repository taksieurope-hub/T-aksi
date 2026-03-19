import os

for fname in ["backend/requirements.txt", "requirements.txt"]:
    if os.path.exists(fname):
        print(f"=== {fname} ===")
        for line in open(fname).read().splitlines():
            print(line)
