path = 'frontend/src/components/RiderPortal.jsx'
c = open(path, 'r', encoding='utf-8').read()

old = '  useEffect(() => {\n    if (pickup.lat) fetchSurgeStatus();\n  }, [pickup.lat, pickup.lng]); // eslint-disable-line'
new = '  useEffect(() => {\n    if (pickup.lat && destination.lat) fetchSurgeStatus();\n  }, [pickup.lat, pickup.lng, destination.lat]); // eslint-disable-line'

if old in c:
    c = c.replace(old, new)
    print('OK: surge now only triggers when both pickup and destination are set')
else:
    print('MISS')

open(path, 'w', encoding='utf-8', newline='\n').write(c)
