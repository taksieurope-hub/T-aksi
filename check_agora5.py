path = "backend/server.py"
lines = open(path, "r", encoding="utf-8").read().splitlines()
for i in range(1283, 1315):
    print(str(i+1) + ": " + repr(lines[i]))
