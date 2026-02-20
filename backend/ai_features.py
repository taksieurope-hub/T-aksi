# ai_features.py - AI Chat, Translation, Support Bot, and Advanced Features
# Part of T'aksi Galactic

import os
import asyncio
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

# Emergent Integrations for Gemini
# backend/ai_features.py

try:
    # Try to load the logic you want
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    HAS_AI = True
except ImportError:
    # If it's missing (like on Render), don't crash!
    print("⚠️ AI Library missing. Using fallback logic.")
    HAS_AI = False

# Now, keep all your functions below, but add a simple 'if' check:
async def translate_text(text, source_lang, target_lang):
    if not HAS_AI:
        return text  # Just return original text if AI is offline
    
    # ... your original logic continues here ...

EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")

# ============ PYDANTIC MODELS ============

class TranslateRequest(BaseModel):
    text: str
    source_lang: str = "auto"
    target_lang: str = "en"

class SupportMessage(BaseModel):
    message: str
    user_id: Optional[str] = None
    category: Optional[str] = None  # faq, trip, payment, safety, other

class SupportTicket(BaseModel):
    id: str
    user_id: str
    user_name: str
    user_phone: str
    message: str
    ai_response: Optional[str] = None
    status: str  # open, ai_handled, escalated, resolved
    priority: str  # low, medium, high, urgent
    category: str
    created_at: str
    updated_at: str
    admin_notes: Optional[str] = None

class RatingRequest(BaseModel):
    rating: int  # 1-5
    comment: Optional[str] = None
    tags: Optional[List[str]] = None  # ["clean_car", "friendly", "fast", etc.]

class FavoriteLocation(BaseModel):
    name: str  # "Home", "Work", "Gym", etc.
    address: str
    lat: float
    lng: float
    icon: Optional[str] = "star"

class ScheduledRideRequest(BaseModel):
    pickup_address: str
    pickup_lat: float
    pickup_lng: float
    destination_address: str
    destination_lat: float
    destination_lng: float
    scheduled_time: str  # ISO datetime
    car_type: str = "economy"
    payment_method: str = "cash"
    stops: Optional[List[dict]] = []

class SOSRequest(BaseModel):
    ride_id: Optional[str] = None
    lat: float
    lng: float
    message: Optional[str] = "Emergency! Need help!"

class ShareTripRequest(BaseModel):
    ride_id: str
    recipient_phone: Optional[str] = None
    recipient_email: Optional[str] = None

class ReferralCodeRequest(BaseModel):
    code: str

class TipRequest(BaseModel):
    amount: float
    ride_id: str

# ============ AI TRANSLATION SERVICE ============

async def translate_text(text: str, source_lang: str, target_lang: str) -> str:
    """Translate text using Gemini 3 Flash"""
    try:
        chat = LlmChat(
            api_key=EMERGENT_KEY,
            session_id=f"translate_{datetime.now().timestamp()}",
            system_message="""You are a professional translator. Translate the given text accurately while preserving tone and meaning. 
            Only respond with the translation, nothing else. Do not add explanations or notes."""
        ).with_model("gemini", "gemini-3-flash-preview")
        
        prompt = f"Translate from {source_lang} to {target_lang}: {text}"
        if source_lang == "auto":
            prompt = f"Detect the language and translate to {target_lang}: {text}"
        
        response = await chat.send_message(UserMessage(text=prompt))
        return response.strip()
    except Exception as e:
        print(f"Translation error: {e}")
        return text  # Return original if translation fails

# ============ AI SUPPORT CHATBOT ============

SUPPORT_SYSTEM_PROMPT = """You are T'aksi's AI Support Assistant - friendly, helpful, and efficient.

Your role:
1. Answer common questions about the T'aksi ride-hailing app
2. Help with trip issues, payments, and app navigation
3. Identify urgent/safety issues that need human attention

Guidelines:
- Be concise and helpful
- Use a friendly, professional tone
- For safety emergencies, immediately flag for escalation
- For payment disputes over ₾50, escalate to human
- For driver/rider complaints about behavior, escalate
- Provide clear step-by-step guidance when helping

Topics you handle:
- How to book a ride, track driver, cancel ride
- Payment methods (cash, card), fare calculation
- Driver ratings, trip history
- App features (scheduled rides, favorite locations, sharing trips)
- General FAQs about the service

Topics to ESCALATE (respond with "ESCALATE:" prefix):
- Safety concerns or emergencies
- Harassment or inappropriate behavior reports
- Payment disputes over ₾50
- Account suspension issues
- Driver document/approval issues
- Technical bugs affecting multiple users

Response format:
- If handling: Provide helpful response
- If escalating: Start with "ESCALATE: [PRIORITY]" where priority is HIGH or URGENT, then explain why"""

async def process_support_message(message: str, user_context: dict = None) -> dict:
    """Process support message through AI and determine if escalation needed"""
    try:
        context_info = ""
        if user_context:
            context_info = f"\nUser info: {user_context.get('name', 'Unknown')}, Phone: {user_context.get('phone', 'N/A')}, Total rides: {user_context.get('ride_count', 0)}"
        
        chat = LlmChat(
            api_key=EMERGENT_KEY,
            session_id=f"support_{datetime.now().timestamp()}",
            system_message=SUPPORT_SYSTEM_PROMPT + context_info
        ).with_model("gemini", "gemini-3-flash-preview")
        
        response = await chat.send_message(UserMessage(text=message))
        
        # Check if AI flagged for escalation
        needs_escalation = response.strip().upper().startswith("ESCALATE:")
        priority = "medium"
        
        if needs_escalation:
            if "URGENT" in response.upper()[:50]:
                priority = "urgent"
            elif "HIGH" in response.upper()[:50]:
                priority = "high"
        
        return {
            "ai_response": response,
            "needs_escalation": needs_escalation,
            "priority": priority,
            "category": categorize_message(message)
        }
    except Exception as e:
        print(f"Support AI error: {e}")
        return {
            "ai_response": "I apologize, but I'm having trouble processing your request. A support agent will assist you shortly.",
            "needs_escalation": True,
            "priority": "medium",
            "category": "error"
        }

def categorize_message(message: str) -> str:
    """Simple categorization of support messages"""
    message_lower = message.lower()
    
    if any(word in message_lower for word in ["emergency", "sos", "help", "danger", "unsafe", "accident"]):
        return "safety"
    elif any(word in message_lower for word in ["payment", "charge", "refund", "money", "card", "wallet"]):
        return "payment"
    elif any(word in message_lower for word in ["driver", "rider", "rude", "behavior", "complaint"]):
        return "complaint"
    elif any(word in message_lower for word in ["book", "ride", "trip", "cancel", "track"]):
        return "trip"
    elif any(word in message_lower for word in ["app", "bug", "error", "crash", "login"]):
        return "technical"
    else:
        return "general"

# ============ CHAT AUTO-TRANSLATION ============

async def translate_chat_message(message: str, sender_lang: str, recipient_lang: str) -> dict:
    """Translate chat message between rider and driver"""
    if sender_lang == recipient_lang:
        return {"original": message, "translated": message, "was_translated": False}
    
    translated = await translate_text(message, sender_lang, recipient_lang)
    return {
        "original": message,
        "translated": translated,
        "was_translated": True,
        "from_lang": sender_lang,
        "to_lang": recipient_lang
    }

# ============ HELPER FUNCTIONS ============

def generate_referral_code(user_id: str) -> str:
    """Generate unique referral code for user"""
    import hashlib
    hash_input = f"{user_id}_{datetime.now().timestamp()}"
    return "TAKSI" + hashlib.md5(hash_input.encode()).hexdigest()[:6].upper()

def generate_share_link(ride_id: str) -> str:
    """Generate shareable trip tracking link"""
    return f"https://taksi.ge/track/{ride_id}"

def calculate_referral_bonus(is_new_user: bool) -> dict:
    """Calculate referral bonuses"""
    return {
        "referrer_bonus": 5.0 if is_new_user else 0,  # ₾5 for referrer
        "referee_bonus": 3.0 if is_new_user else 0,   # ₾3 for new user
        "currency": "GEL"
    }

RATING_TAGS = {
    "positive": ["clean_car", "friendly", "professional", "fast", "safe_driving", "good_music", "helpful"],
    "negative": ["dirty_car", "rude", "slow", "unsafe_driving", "wrong_route", "late"]
}

def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
