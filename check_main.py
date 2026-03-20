import glob
for path in ["frontend/src/main.jsx", "frontend/src/main.tsx", "frontend/src/index.jsx", "frontend/src/index.tsx"]:
    import os
    if os.path.exists(path):
        print(f"=== {path} ===")
        print(open(path, encoding="utf-8").read())
