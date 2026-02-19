# driver_campaigns.py - Driver Incentive Campaigns System
# Part of T'aksi Galactic

from datetime import datetime, timezone
from typing import Optional, List
from pydantic import BaseModel
from enum import Enum

class CampaignType(str, Enum):
    RIDES_COUNT = "rides_count"           # Complete X rides
    EARNINGS_TARGET = "earnings_target"    # Earn X amount
    PEAK_HOURS = "peak_hours"             # Complete rides during peak hours
    ACCEPTANCE_RATE = "acceptance_rate"    # Maintain X% acceptance rate
    RATING_BONUS = "rating_bonus"         # Maintain X+ rating
    NEW_DRIVER = "new_driver"             # Bonus for new drivers
    STREAK = "streak"                     # Complete rides on consecutive days
    AREA_BONUS = "area_bonus"             # Rides in specific area

class CampaignStatus(str, Enum):
    DRAFT = "draft"
    ACTIVE = "active"
    PAUSED = "paused"
    COMPLETED = "completed"
    CANCELLED = "cancelled"

class CreateCampaignRequest(BaseModel):
    title: str
    description: str
    campaign_type: CampaignType
    target_value: float  # e.g., 10 rides, ₾100 earnings
    bonus_amount: float  # Reward in GEL
    start_date: str  # ISO datetime
    end_date: str    # ISO datetime
    min_rating: Optional[float] = None  # Minimum rating to qualify
    area_coords: Optional[dict] = None  # For area-based campaigns
    peak_hours: Optional[List[int]] = None  # e.g., [8, 9, 17, 18, 19] for peak
    max_participants: Optional[int] = None  # Limit number of drivers
    is_recurring: bool = False
    icon: Optional[str] = "gift"  # Campaign icon
    color: Optional[str] = "#00d4ff"  # Campaign color

class UpdateCampaignRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    bonus_amount: Optional[float] = None
    end_date: Optional[str] = None
    status: Optional[CampaignStatus] = None

class CampaignProgressUpdate(BaseModel):
    driver_id: str
    campaign_id: str
    increment: float = 1.0  # How much to add to progress

# Campaign templates for quick creation
CAMPAIGN_TEMPLATES = {
    "weekend_warrior": {
        "title": "Weekend Warrior",
        "description": "Complete 20 rides this weekend and earn bonus!",
        "campaign_type": "rides_count",
        "target_value": 20,
        "bonus_amount": 30,
        "icon": "trophy",
        "color": "#fbbf24"
    },
    "rush_hour_hero": {
        "title": "Rush Hour Hero", 
        "description": "Complete 10 rides during peak hours (8-10 AM, 5-8 PM)",
        "campaign_type": "peak_hours",
        "target_value": 10,
        "bonus_amount": 25,
        "peak_hours": [8, 9, 17, 18, 19],
        "icon": "zap",
        "color": "#f97316"
    },
    "five_star_driver": {
        "title": "5-Star Excellence",
        "description": "Maintain 4.8+ rating for 50 rides",
        "campaign_type": "rating_bonus",
        "target_value": 50,
        "bonus_amount": 40,
        "min_rating": 4.8,
        "icon": "star",
        "color": "#eab308"
    },
    "daily_streak": {
        "title": "7-Day Streak",
        "description": "Complete at least 5 rides every day for 7 days",
        "campaign_type": "streak",
        "target_value": 7,
        "bonus_amount": 50,
        "icon": "flame",
        "color": "#ef4444"
    },
    "earnings_milestone": {
        "title": "Earnings Milestone",
        "description": "Earn ₾500 this week",
        "campaign_type": "earnings_target",
        "target_value": 500,
        "bonus_amount": 35,
        "icon": "banknote",
        "color": "#22c55e"
    },
    "new_driver_welcome": {
        "title": "Welcome Bonus",
        "description": "Complete your first 25 rides within 7 days",
        "campaign_type": "new_driver",
        "target_value": 25,
        "bonus_amount": 75,
        "icon": "rocket",
        "color": "#8b5cf6"
    }
}

def calculate_campaign_progress(campaign_type: str, driver_stats: dict, campaign_data: dict) -> dict:
    """Calculate driver's progress towards a campaign goal"""
    
    progress = 0.0
    target = campaign_data.get("target_value", 0)
    
    if campaign_type == "rides_count":
        progress = driver_stats.get("campaign_rides", 0)
    
    elif campaign_type == "earnings_target":
        progress = driver_stats.get("campaign_earnings", 0)
    
    elif campaign_type == "peak_hours":
        progress = driver_stats.get("peak_hour_rides", 0)
    
    elif campaign_type == "acceptance_rate":
        progress = driver_stats.get("acceptance_rate", 0)
    
    elif campaign_type == "rating_bonus":
        # Only count if rating is above minimum
        min_rating = campaign_data.get("min_rating", 4.5)
        current_rating = driver_stats.get("rating", 0)
        if current_rating >= min_rating:
            progress = driver_stats.get("rated_rides", 0)
        else:
            progress = 0
    
    elif campaign_type == "streak":
        progress = driver_stats.get("consecutive_days", 0)
    
    elif campaign_type == "area_bonus":
        progress = driver_stats.get("area_rides", 0)
    
    percentage = min((progress / target) * 100, 100) if target > 0 else 0
    
    return {
        "current": progress,
        "target": target,
        "percentage": round(percentage, 1),
        "completed": progress >= target,
        "remaining": max(target - progress, 0)
    }

def get_campaign_emoji(icon: str) -> str:
    """Get emoji for campaign icon"""
    icons = {
        "gift": "🎁",
        "trophy": "🏆",
        "zap": "⚡",
        "star": "⭐",
        "flame": "🔥",
        "banknote": "💰",
        "rocket": "🚀",
        "target": "🎯",
        "clock": "⏰",
        "medal": "🏅"
    }
    return icons.get(icon, "🎁")
