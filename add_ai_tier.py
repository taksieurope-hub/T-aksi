path = "backend/server.py"
c = open(path, "r", encoding="utf-8").read()
changes = []

# Add anthropic import near top
old = "import uuid"
new = "import uuid\nimport anthropic"
if old in c and "import anthropic" not in c:
    c = c.replace(old, new, 1)
    changes.append("OK: anthropic imported")
else:
    changes.append("SKIP: already imported or not found")

# Add AI tier detection function before register_vehicle
old2 = 'async def register_vehicle('
new2 = '''def detect_vehicle_tier_ai(car_make: str, car_model: str, car_year: int) -> str:
    """Use Claude to automatically detect the correct vehicle tier."""
    try:
        client = anthropic.Anthropic()
        message = client.messages.create(
            model="claude-haiku-4-5-20251001",
            max_tokens=10,
            messages=[
                {
                    "role": "user",
                    "content": (
                        f"Classify this car into exactly one tier: economy, comfort, suv, jumpstart, or personal.\\n"
                        f"Car: {car_year} {car_make} {car_model}\\n"
                        f"Rules:\\n"
                        f"- economy: standard sedans, hatchbacks, basic cars (Toyota Corolla, Hyundai Elantra, etc)\\n"
                        f"- comfort: premium sedans, executive cars (Mercedes E-Class, BMW 5-Series, Toyota Camry, etc)\\n"
                        f"- suv: SUVs, minivans, large vehicles (Toyota Land Cruiser, BMW X5, Ford Explorer, etc)\\n"
                        f"- jumpstart: any electric or hybrid vehicle\\n"
                        f"- personal: luxury/sports cars (Mercedes S-Class, BMW 7-Series, Porsche, etc)\\n"
                        f"Reply with ONLY the single word tier, nothing else."
                    )
                }
            ]
        )
        tier = message.content[0].text.strip().lower()
        if tier in ["economy", "comfort", "suv", "jumpstart", "personal"]:
            return tier
        return "economy"
    except Exception as e:
        logger.warning(f"AI tier detection failed: {e}")
        return "economy"


async def register_vehicle('''

if "detect_vehicle_tier_ai" not in c:
    c = c.replace('async def register_vehicle(', new2, 1)
    changes.append("OK: AI tier detection function added")
else:
    changes.append("SKIP: already exists")

# Use AI detection instead of manual tier
old3 = '        "tier": vehicle_tier.lower() if vehicle_tier in ["economy","comfort","suv","jumpstart","personal"] else "economy",'
new3 = '        "tier": detect_vehicle_tier_ai(car_make, car_model, car_year),'
if old3 in c:
    c = c.replace(old3, new3)
    changes.append("OK: vehicle registration uses AI tier detection")
else:
    changes.append("MISS: tier assignment")

# Fix return to show actual tier
old4 = '    return {"message": "Vehicle added successfully!", "tier": "economy"}'
new4 = '    return {"message": "Vehicle added successfully!", "tier": vehicle_data["tier"]}'
if old4 in c:
    c = c.replace(old4, new4)
    changes.append("OK: return shows actual tier")
else:
    changes.append("MISS: return statement")

open(path, "w", encoding="utf-8", newline="\n").write(c)
print("\n".join(changes))
