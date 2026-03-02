"""
cookie_auth_patch.py
────────────────────
Drop-in patch for server.py to make login/logout set and clear
httpOnly cookies instead of (only) returning the token in the JSON body.

This pairs with the frontend config.jsx / api.js changes that migrate
from localStorage to cookie-based auth.

HOW TO APPLY:
  1. Find the login endpoints in server.py (rider login, driver login, admin login).
  2. Replace the JSONResponse / return dict patterns shown below.
  3. The frontend api.js sends `withCredentials: true` on every request, so
     the cookie is attached automatically after login.

──────────────────────────────────────────────────────────────────────
REQUIRED IMPORT — add to the top of server.py if not already present:
──────────────────────────────────────────────────────────────────────
"""

# from fastapi.responses import JSONResponse
# from fastapi import Response

# ─── COOKIE SETTINGS ──────────────────────────────────────────────────────────
COOKIE_NAME = "token"
COOKIE_MAX_AGE = 7 * 24 * 3600      # 7 days (matches JWT expiry)
COOKIE_SECURE = True                  # HTTPS only — set False for local dev
COOKIE_SAMESITE = "strict"            # No cross-site requests
COOKIE_HTTPONLY = True                # JS cannot read — prevents XSS token theft
COOKIE_PATH = "/"


def set_auth_cookie(response: "JSONResponse", token: str) -> None:
    """
    Attach the JWT as a Set-Cookie header on the response.
    Call this in every login/register endpoint instead of returning the token in JSON.
    """
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        max_age=COOKIE_MAX_AGE,
        path=COOKIE_PATH,
        secure=COOKIE_SECURE,
        httponly=COOKIE_HTTPONLY,
        samesite=COOKIE_SAMESITE,
    )


def clear_auth_cookie(response: "JSONResponse") -> None:
    """
    Expire the auth cookie. Call this in the logout endpoint.
    """
    response.delete_cookie(
        key=COOKIE_NAME,
        path=COOKIE_PATH,
        secure=COOKIE_SECURE,
        httponly=COOKIE_HTTPONLY,
        samesite=COOKIE_SAMESITE,
    )


# ─── EXAMPLE: RIDER / DRIVER LOGIN ────────────────────────────────────────────
#
# BEFORE (current server.py pattern):
#
#   @app.post("/auth/login")
#   async def login(data: LoginRequest):
#       ...
#       token = create_access_token(user_id)
#       return {"token": token, "user": user_data}
#
# AFTER (cookie-based):
#
#   from fastapi.responses import JSONResponse
#
#   @app.post("/auth/login")
#   async def login(data: LoginRequest):
#       ...
#       token = create_access_token(user_id)
#       response = JSONResponse(content={"user": user_data})
#       set_auth_cookie(response, token)
#       return response
#
# NOTE: Keep returning the token in the JSON body as well during the transition
# period. The frontend will use the cookie if present and fall back to the
# JSON token if VITE_USE_LOCALSTORAGE_FALLBACK=true is set.


# ─── EXAMPLE: LOGOUT ENDPOINT ─────────────────────────────────────────────────
#
# Add this endpoint to server.py. The frontend calls it on logout.
#
#   @app.post("/auth/logout")
#   async def logout(response: Response):
#       clear_auth_cookie(response)
#       return {"message": "Logged out"}
#
# Note: FastAPI's Response parameter injection lets you set headers/cookies
# without returning a full JSONResponse. Either approach works.


# ─── EXAMPLE: READING THE COOKIE IN get_current_user_id ───────────────────────
#
# Your existing get_current_user_id dependency probably reads from the
# Authorization header. Update it to also accept the cookie:
#
#   from fastapi import Depends, HTTPException, status, Cookie
#   from typing import Optional
#
#   async def get_current_user_id(
#       authorization: Optional[str] = Header(default=None),
#       token: Optional[str] = Cookie(default=None),
#   ) -> str:
#       # Prefer Authorization header (for API clients / mobile), then cookie (web)
#       raw_token = None
#       if authorization and authorization.startswith("Bearer "):
#           raw_token = authorization.split(" ", 1)[1]
#       elif token:
#           raw_token = token
#
#       if not raw_token:
#           raise HTTPException(status_code=401, detail="Not authenticated")
#
#       try:
#           payload = jwt.decode(raw_token, JWT_SECRET, algorithms=["HS256"])
#           user_id: str = payload.get("sub")
#           if not user_id:
#               raise HTTPException(status_code=401, detail="Invalid token")
#           return user_id
#       except jwt.ExpiredSignatureError:
#           raise HTTPException(status_code=401, detail="Token expired")
#       except jwt.PyJWTError:
#           raise HTTPException(status_code=401, detail="Invalid token")
#
# The `Cookie(default=None)` import reads the httpOnly cookie transparently.
# Existing Bearer header auth continues working for mobile apps and API clients.


# ─── CORS UPDATE REQUIRED ─────────────────────────────────────────────────────
#
# Cookies with SameSite=Strict work in same-origin contexts only.
# If your frontend and backend are on DIFFERENT domains (e.g. t-aksi-frontend.onrender.com
# calling t-aksi.onrender.com), you need SameSite=None; Secure and explicit
# CORS allow_credentials + allow_origins (no wildcards).
#
# Your current CORS setup already has allow_credentials=True and explicit origins,
# so you're good. Just make sure the Render frontend domain is in the allowed list.
#
# In server.py the CORSMiddleware is already configured correctly:
#   allow_credentials=True
#   allow_origins=[exact list of domains]
#
# If you switch to SameSite=None for cross-origin cookies:
#   COOKIE_SAMESITE = "none"   # must be lowercase "none"
#   COOKIE_SECURE = True       # required when samesite=none