path = "frontend/src/components/AdminPortal.jsx"
c = open(path, "r", encoding="utf-8").read()

# Add financials tab to the tab list
old_tabs = '                { value: "sos",         icon: Siren,          label: "SOS",         badge: sosCount, badgeColor: "bg-red-500" },'
new_tabs = '                { value: "sos",         icon: Siren,          label: "SOS",         badge: sosCount, badgeColor: "bg-red-500" },\n                { value: "financials",  icon: BarChart3,      label: "Financials" },'

if old_tabs in c:
    c = c.replace(old_tabs, new_tabs)
    print("OK: financials tab added")
else:
    print("MISS tabs")

# Add the financials tab content before closing of the Tabs component
old_end = '          </Tabs>\n        </div>\n      </div>\n    </div>\n  );\n};\n\nexport default'
new_end = '''          <TabsContent value="financials">
            <FinancialsPanel />
          </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
};

export default'''

if old_end in c:
    c = c.replace(old_end, new_end)
    print("OK: financials tab content added")
else:
    print("MISS tab content - searching...")
    idx = c.find("</Tabs>")
    print(f"Found </Tabs> at line ~{c[:idx].count(chr(10))}")

open(path, "w", encoding="utf-8").write(c)
print("Saved!")
