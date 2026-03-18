path = 'backend/server.py'
c = open(path, 'r', encoding='utf-8').read()
changes = []

old = 'async def register_rider(data: UserRegister, response: Response, x_phone_verified: Optional[str] = Header(None)):'
new = 'async def register_rider(data: UserRegister, response: Response):'
if old in c:
    c = c.replace(old, new)
    changes.append('cleaned rider signature')

old = 'async def register_driver(data: UserRegister, response: Response, x_phone_verified: Optional[str] = Header(None)):'
new = 'async def register_driver(data: UserRegister, response: Response):'
if old in c:
    c = c.replace(old, new)
    changes.append('cleaned driver signature')

open(path, 'w', encoding='utf-8').write(c)
print('Applied:', changes)
