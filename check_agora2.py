import os, glob

for path in glob.glob("frontend/src/**/*.jsx", recursive=True):
    try:
        lines = open(path, "r", encoding="utf-8").read().splitlines()
    except: continue
    hits = []
    for i, line in enumerate(lines):
        if any(x in line for x in ["agora", "Agora", "AgoraRTC", "AGORA", "voiceCall", "VoiceCall", "InCallModal", "startCall", "joinChannel", "createMicrophoneAudioTrack"]):
            hits.append(str(i+1) + ": " + line)
    if hits:
        print(f"\n=== {path} ===")
        for h in hits: print(h)
