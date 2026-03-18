path = "frontend/src/components/DriverPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

# Add competition tab button
old_tabs = '[ ["overview", t("overview")], ["topup", t("top_up")], ["withdraw", t("withdraw")] ]'
new_tabs = '[ ["overview", t("overview")], ["competition", "🏆 Competition"], ["topup", t("top_up")], ["withdraw", t("withdraw")] ]'
if old_tabs in c:
    c = c.replace(old_tabs, new_tabs)
    print("OK: competition tab button added")
else:
    print("MISS: tab buttons")

# Add competition tab content after overview tab
old_content = '{earningsTab === "topup" && ('
new_content = '''{earningsTab === "competition" && (
                  <CompetitionLeaderboard driverId={user?.id} />
                )}
                {earningsTab === "topup" && ('''
if old_content in c:
    c = c.replace(old_content, new_content)
    print("OK: competition tab content added")
else:
    print("MISS: tab content")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
