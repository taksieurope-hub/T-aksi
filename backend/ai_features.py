# ai_features.py - AI Chat, Translation, Support Bot, and Advanced Features
# Part of T'aksi Galactic

import os
import asyncio
from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel
from dotenv import load_dotenv

load_dotenv()

try:
    from emergentintegrations.llm.chat import LlmChat, UserMessage
    HAS_AI = True
    print("✅ AI Library loaded successfully.")
except ImportError:
    print("⚠️ AI Library missing. Using fallback logic.")
    HAS_AI = False

EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")

# ============ PYDANTIC MODELS ============

class TranslateRequest(BaseModel):
    text: str
    source_lang: str = "auto"
    target_lang: str = "en"

class SupportMessage(BaseModel):
    message: str
    user_id: Optional[str] = None
    category: Optional[str] = None

class SupportTicket(BaseModel):
    id: str
    user_id: str
    user_name: str
    user_phone: str
    message: str
    ai_response: Optional[str] = None
    status: str
    priority: str
    category: str
    created_at: str
    updated_at: str
    admin_notes: Optional[str] = None

class RatingRequest(BaseModel):
    rating: int
    comment: Optional[str] = None
    tags: Optional[List[str]] = None

class FavoriteLocation(BaseModel):
    name: str
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
    scheduled_time: str
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


# ============ CATEGORIZATION & PRIORITY ============

# Issues that MUST go to admin portal immediately
ESCALATION_RULES = {
    "safety": {
        "keywords": ["emergency", "sos", "help", "danger", "unsafe", "accident", "assault",
                     "threat", "violence", "hurt", "injured", "attack", "stalking", "harass"],
        "priority": "urgent",
        "admin_tag": "🚨 SAFETY",
    },
    "harassment": {
        "keywords": ["rude", "inappropriate", "inappropriate behavior", "sexual", "threatening",
                     "offensive", "abusive", "racist", "discriminat"],
        "priority": "high",
        "admin_tag": "⚠️ HARASSMENT",
    },
    "fraud": {
        "keywords": ["fraud", "scam", "stolen", "unauthorized charge", "overcharged", "double charge",
                     "didn't take the route", "fake ride", "ghost ride"],
        "priority": "high",
        "admin_tag": "💳 FRAUD",
    },
    "large_payment_dispute": {
        "keywords": ["refund", "dispute", "wrong charge", "overcharge"],
        "priority": "high",
        "admin_tag": "💰 PAYMENT DISPUTE",
        "amount_threshold": 50.0,  # escalate if mentioned amount > ₾50
    },
    "account_issue": {
        "keywords": ["suspended", "banned", "blocked", "can't login", "account locked",
                     "deactivated", "access denied"],
        "priority": "high",
        "admin_tag": "🔒 ACCOUNT",
    },
    "driver_approval": {
        "keywords": ["documents", "approval", "rejected", "pending review", "license", "registration"],
        "priority": "medium",
        "admin_tag": "📋 DRIVER DOCS",
    },
    "technical_critical": {
        "keywords": ["app crash", "can't book", "payment failed", "stuck", "frozen", "not working",
                     "lost connection", "gps wrong", "location wrong"],
        "priority": "medium",
        "admin_tag": "🔧 TECHNICAL",
    },
}

# Issues the AI can handle autonomously
AI_HANDLEABLE_TOPICS = [
    "how to book", "cancel ride", "track driver", "payment methods", "wallet topup",
    "fare estimate", "rating", "referral code", "scheduled ride", "favorite location",
    "share trip", "app features", "how does", "what is", "general question"
]

def categorize_message(message: str) -> str:
    """Categorize support message by topic."""
    message_lower = message.lower()
    if any(w in message_lower for w in ["emergency", "sos", "danger", "unsafe", "accident", "hurt"]):
        return "safety"
    elif any(w in message_lower for w in ["payment", "charge", "refund", "money", "card", "wallet"]):
        return "payment"
    elif any(w in message_lower for w in ["driver", "rider", "rude", "behavior", "complaint", "inappropriate"]):
        return "complaint"
    elif any(w in message_lower for w in ["book", "ride", "trip", "cancel", "track"]):
        return "trip"
    elif any(w in message_lower for w in ["app", "bug", "error", "crash", "login", "not working"]):
        return "technical"
    elif any(w in message_lower for w in ["document", "approval", "license", "pending"]):
        return "driver_docs"
    else:
        return "general"


def determine_escalation(message: str, user_context: dict = None) -> dict:
    """
    Determine if a message should be escalated to admin.
    Returns: { needs_escalation, priority, reason, admin_tag, category }
    """
    message_lower = message.lower()
    
    for category, rules in ESCALATION_RULES.items():
        matched_keywords = [kw for kw in rules["keywords"] if kw in message_lower]
        if matched_keywords:
            # Extra check: if it's a payment issue, look for large amounts
            if category == "large_payment_dispute":
                import re
                amounts = re.findall(r'₾?(\d+(?:\.\d+)?)', message)
                has_large_amount = any(float(a) >= rules.get("amount_threshold", 50) for a in amounts)
                # Still escalate payment disputes even without large amount — better safe
                return {
                    "needs_escalation": True,
                    "priority": rules["priority"],
                    "reason": f"Payment dispute detected (keywords: {', '.join(matched_keywords)})",
                    "admin_tag": rules["admin_tag"],
                    "category": categorize_message(message),
                    "matched_keywords": matched_keywords,
                }
            return {
                "needs_escalation": True,
                "priority": rules["priority"],
                "reason": f"Escalation triggered: {category} (keywords: {', '.join(matched_keywords)})",
                "admin_tag": rules["admin_tag"],
                "category": categorize_message(message),
                "matched_keywords": matched_keywords,
            }
    
    return {
        "needs_escalation": False,
        "priority": "low",
        "reason": "AI can handle",
        "admin_tag": None,
        "category": categorize_message(message),
        "matched_keywords": [],
    }


# ============ AI TRANSLATION SERVICE ============

async def translate_text(text: str, source_lang: str, target_lang: str) -> str:
    """Translate text using Gemini Flash."""
    if not HAS_AI or not EMERGENT_KEY:
        return text  # Fallback: return original

    try:
        chat = LlmChat(
            api_key=EMERGENT_KEY,
            session_id=f"translate_{datetime.now().timestamp()}",
            system_message=(
                "You are a professional translator. Translate the given text accurately "
                "while preserving tone and meaning. Only respond with the translation, "
                "nothing else. Do not add explanations or notes."
            ),
        ).with_model("gemini", "gemini-2-flash")

        prompt = (
            f"Translate from {source_lang} to {target_lang}: {text}"
            if source_lang != "auto"
            else f"Detect the language and translate to {target_lang}: {text}"
        )

        response = await chat.send_message(UserMessage(text=prompt))
        return response.strip()
    except Exception as e:
        print(f"Translation error: {e}")
        return text


# ============ AI SUPPORT CHATBOT ============

SUPPORT_SYSTEM_PROMPT = """You are T'aksi's AI Support Assistant — friendly, helpful, and efficient.

Your role:
1. Answer common questions about the T'aksi ride-hailing app
2. Help with trip issues, payments, and app navigation
3. Give clear, actionable guidance

Guidelines:
- Be concise and warm
- Respond in the same language the user writes in
- Provide step-by-step guidance when needed
- Do NOT promise refunds or account changes — only humans can do that
- Do NOT handle safety, harassment, fraud, or large payment disputes yourself

Topics you CAN handle:
- How to book a ride, track driver, cancel ride
- Payment methods (cash, card), fare calculation, wallet top-up
- Driver ratings, trip history, receipts
- App features: scheduled rides, favorite locations, trip sharing
- Referral codes and bonuses
- General FAQs about the service

IMPORTANT: If the conversation contains any safety, harassment, fraud, or major dispute issue,
acknowledge the user with empathy and tell them their case is being escalated to a human agent
who will contact them shortly. Do not attempt to resolve these yourself.

Keep responses under 150 words unless the user asks for detailed instructions."""


async def get_ai_response(message: str, user_context: dict = None, chat_history: list = None) -> str:
    """Get AI response for a support message."""
    if not HAS_AI or not EMERGENT_KEY:
        return (
            "Thank you for reaching out to T'aksi Support. "
            "Our team has received your message and will get back to you shortly."
        )

    try:
        context_info = ""
        if user_context:
            context_info = (
                f"\n\nUser context: Name={user_context.get('name', 'Unknown')}, "
                f"Phone={user_context.get('phone', 'N/A')}, "
                f"Total rides={user_context.get('ride_count', 0)}, "
                f"User type={user_context.get('user_type', 'rider')}"
            )

        chat = LlmChat(
            api_key=EMERGENT_KEY,
            session_id=f"support_{datetime.now().timestamp()}",
            system_message=SUPPORT_SYSTEM_PROMPT + context_info,
        ).with_model("gemini", "gemini-2-flash")

        # Replay chat history for context
        if chat_history:
            for msg in chat_history[-6:]:  # last 6 messages for context
                role = msg.get("role", "user")
                content = msg.get("content", "")
                if role == "user" and content:
                    await chat.send_message(UserMessage(text=content))

        response = await chat.send_message(UserMessage(text=message))
        return response.strip()

    except Exception as e:
        print(f"Support AI error: {e}")
        return (
            "I'm having trouble processing your request right now. "
            "Your message has been forwarded to our support team and someone will assist you shortly."
        )


async def process_support_message(message: str, user_context: dict = None, chat_history: list = None) -> dict:
    """
    Main support processing function.
    - Determines if the issue needs human escalation.
    - Gets an AI response appropriate to the situation.
    - Returns full metadata for ticket creation.
    """
    escalation = determine_escalation(message, user_context)
    
    if escalation["needs_escalation"]:
        # For high-priority issues, AI gives empathetic acknowledgement only
        priority = escalation["priority"]
        
        if priority == "urgent":
            ai_response = (
                "⚠️ This looks like an emergency. Your case has been immediately escalated "
                "to our safety team. A T'aksi agent will contact you right away. "
                "If you are in immediate danger, please call emergency services (112)."
            )
        elif priority == "high":
            ai_response = (
                "We take this very seriously. Your report has been escalated to our team "
                "and a human agent will review it and contact you as soon as possible. "
                "Thank you for bringing this to our attention."
            )
        else:
            ai_response = (
                "Your request has been received and forwarded to our support team. "
                "A T'aksi agent will review your case and get back to you shortly."
            )
    else:
        # AI handles it directly
        ai_response = await get_ai_response(message, user_context, chat_history)

    return {
        "ai_response": ai_response,
        "needs_escalation": escalation["needs_escalation"],
        "priority": escalation["priority"],
        "category": escalation["category"],
        "admin_tag": escalation.get("admin_tag"),
        "escalation_reason": escalation.get("reason"),
        "matched_keywords": escalation.get("matched_keywords", []),
    }


# ============ CHAT AUTO-TRANSLATION ============

async def translate_chat_message(message: str, sender_lang: str, recipient_lang: str) -> dict:
    """Translate in-ride chat message between rider and driver."""
    if sender_lang == recipient_lang:
        return {"original": message, "translated": message, "was_translated": False}

    translated = await translate_text(message, sender_lang, recipient_lang)
    return {
        "original": message,
        "translated": translated,
        "was_translated": True,
        "from_lang": sender_lang,
        "to_lang": recipient_lang,
    }


# ============ HELPER FUNCTIONS ============

def generate_referral_code(user_id: str) -> str:
    import hashlib
    hash_input = f"{user_id}_{datetime.now().timestamp()}"
    return "TAKSI" + hashlib.md5(hash_input.encode()).hexdigest()[:6].upper()


def generate_share_link(ride_id: str) -> str:
    return f"https://taksi.ge/track/{ride_id}"


def calculate_referral_bonus(is_new_user: bool) -> dict:
    return {
        "referrer_bonus": 5.0 if is_new_user else 0,
        "referee_bonus": 3.0 if is_new_user else 0,
        "currency": "GEL",
    }


RATING_TAGS = {
    "positive": ["clean_car", "friendly", "professional", "fast", "safe_driving", "good_music", "helpful"],
    "negative": ["dirty_car", "rude", "slow", "unsafe_driving", "wrong_route", "late"],
}


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()