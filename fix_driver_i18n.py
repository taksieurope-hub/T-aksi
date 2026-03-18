c = open("frontend/src/components/DriverPortal.jsx", "r", encoding="utf-8").read()

# Fix tab labels
c = c.replace('{ id: "rides",    icon: Activity,  label: "Rides"   },', '{ id: "rides",    icon: Activity,  label: t("rides")   },')
c = c.replace('{ id: "nearby",   icon: Crosshair, label: "Nearby"  },', '{ id: "nearby",   icon: Crosshair, label: t("nearby")  },')
c = c.replace('{ id: "earnings", icon: Wallet,    label: "Wallet"  },', '{ id: "earnings", icon: Wallet,    label: t("wallet")  },')
c = c.replace('{ id: "history",  icon: History,   label: "History" },', '{ id: "history",  icon: History,   label: t("history") },')
c = c.replace('{ id: "more",     icon: Settings,  label: "More"    },', '{ id: "more",     icon: Settings,  label: t("more")    },')

# Fix MorePanel menu items
c = c.replace('{ id: "campaigns", label: "Campaigns",  icon: Award,      desc: "Challenges & bonuses",', '{ id: "campaigns", label: t("campaigns"),  icon: Award,      desc: t("campaigns_subtitle"),')
c = c.replace('{ id: "fleet",     label: "Fleet",      icon: Truck,      desc: "Manage your vehicles",', '{ id: "fleet",     label: t("fleet_management"),      icon: Truck,      desc: t("fleet_subtitle"),')
c = c.replace('{ id: "referrals", label: "Referrals",  icon: Gift,       desc: "Invite & earn",', '{ id: "referrals", label: t("referrals"),  icon: Gift,       desc: t("invite_friend_desc"),')
c = c.replace('{ id: "support",   label: "Support",    icon: Headphones, desc: "Get help",', '{ id: "support",   label: t("support"),    icon: Headphones, desc: t("support_subtitle"),')
c = c.replace('label: "Feedback", \n  icon: ThumbsUp,', 'label: t("feedback"), \n  icon: ThumbsUp,')
c = c.replace('  desc: "Share your thoughts",', '  desc: t("describe_issue"),')

# Fix SOS card
c = c.replace('<p className="text-white font-semibold text-sm">Emergency SOS</p>', '<p className="text-white font-semibold text-sm">{t("emergency_sos")}</p>')
c = c.replace('<p className="text-white/40 text-xs">Alert support instantly</p>', '<p className="text-white/40 text-xs">{t("alert_support_instantly")}</p>')

# Fix rides tab strings
c = c.replace('<p className="text-white font-semibold">Searching for rides...</p>', '<p className="text-white font-semibold">{t("searching_for_rides")}</p>')
c = c.replace('<p className="text-white/30 text-sm mt-1">New requests will appear automatically</p>', '<p className="text-white/30 text-sm mt-1">{t("new_requests_will_appear")}</p>')
c = c.replace('"You\'re Offline"', '{t("offline")}')
c = c.replace('"Toggle online to receive rides"', '{t("go_online")}')

# Fix earnings tab strings  
c = c.replace('"Commission Breakdown"', '{t("commission_breakdown")}')
c = c.replace('"Platform cut"', 't("platform_cut")')
c = c.replace('"Your share"', 't("your_share")')

# Fix Language label in More tab
c = c.replace('<p className="text-white font-semibold text-sm">Language</p>', '<p className="text-white font-semibold text-sm">{t("language")}</p>')

open("frontend/src/components/DriverPortal.jsx", "w", encoding="utf-8").write(c)
print("Done")
