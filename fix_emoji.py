path = 'frontend/src/components/RiderPortal.jsx'
c = open(path, 'r', encoding='utf-8').read()

# Fix corrupted emoji in the file
fixes = {
    'ðŸŽ\x81': '\U0001f381',
    'ðŸŽ‰': '\U0001f389',
    '\xf0\x9f\x8e\x81': '\U0001f381',
    '\xf0\x9f\x8e\x89': '\U0001f389',
}

count = 0
for bad, good in fixes.items():
    if bad in c:
        c = c.replace(bad, good)
        print('Fixed: ' + repr(bad) + ' -> ' + good)
        count += 1

print('Total fixes: ' + str(count))
open(path, 'w', encoding='utf-8', newline='\n').write(c)
print('Done!')
