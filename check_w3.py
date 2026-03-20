path = "backend/server.py"
lines = open(path, encoding="utf-8").read().splitlines()
for j in range(2593, 2640):
    print(str(j+1) + ": " + lines[j])
