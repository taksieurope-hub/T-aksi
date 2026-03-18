from PIL import Image
import os

src = "frontend/public/logo192.png"
pub = "frontend/public"

try:
    img = Image.open(src)
    img.resize((32, 32), Image.LANCZOS).save(os.path.join(pub, "favicon-32x32.png"))
    img.resize((16, 16), Image.LANCZOS).save(os.path.join(pub, "favicon-16x16.png"))
    img.resize((180, 180), Image.LANCZOS).save(os.path.join(pub, "apple-touch-icon.png"))
    print("OK: favicons created")
except Exception as e:
    print("ERROR: " + str(e))
    print("Install Pillow: pip install Pillow --break-system-packages")
