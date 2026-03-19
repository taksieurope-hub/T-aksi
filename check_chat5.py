for path in ["frontend/src/components/ChatWidget.jsx", "frontend/src/components/RideCommunication.jsx"]:
    lines = open(path, "r", encoding="utf-8").read().splitlines()
    print(f"\n=== {path} ({len(lines)} lines) ===")
    for i, line in enumerate(lines):
        print(str(i+1) + ": " + line)
