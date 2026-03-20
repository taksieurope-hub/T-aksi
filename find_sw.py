import glob, os
for path in glob.glob("**\sw.js", recursive=True):
    print(path)
