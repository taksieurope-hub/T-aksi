files = [
    "frontend/src/components/DriverPortal.jsx",
    "frontend/src/components/RiderPortal.jsx",
]

for path in files:
    lines = open(path, "r", encoding="utf-8").read().splitlines()

    # Show full RideCommunication usage (up to 10 lines)
    for i, line in enumerate(lines):
        if "<RideCommunication" in line:
            print(f"\n=== {path} line {i+1} ===")
            for j in range(i, min(len(lines), i+10)):
                print(str(j+1) + ": " + lines[j])

    # Show how user/userId is set
    print(f"\n--- user state in {path} ---")
    for i, line in enumerate(lines):
        if any(x in line for x in ["setUser", "const user", "useState(null)", "user?.id", "user.id", "userId"]):
            print(str(i+1) + ": " + line)
        if i > 50 and "setUser" not in line and "user" not in line.lower(): continue
