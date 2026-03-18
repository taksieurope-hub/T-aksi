path = "frontend/src/i18n/translations.js"
c = open(path, "r", encoding="utf-8").read()
changes = []

new_keys = {
    "ka": {"pending_review": "განხილვის პროცესში", "save_iban": "შეინახეთ IBAN გატანისთვის", "paid_commission": "გადახდილი საკომისიო", "get_help": "მიიღე დახმარება", "describe_problem": "აღწერე პრობლემა", "fill": "შევსება", "under_review": "განხილვის პროცესში", "notify_approved": "შეგატყობინებთ დამტკიცებისთანავე"},
    "en": {"pending_review": "Pending Review", "save_iban": "Save your IBAN for withdrawals", "paid_commission": "Commission Paid", "get_help": "Get Help", "describe_problem": "Describe your problem", "fill": "Top Up", "under_review": "Under Review", "notify_approved": "We'll notify you once approved"},
    "ru": {"pending_review": "На рассмотрении", "save_iban": "Сохраните IBAN для вывода средств", "paid_commission": "Оплаченная комиссия", "get_help": "Получить помощь", "describe_problem": "Опишите проблему", "fill": "Пополнить", "under_review": "На рассмотрении", "notify_approved": "Мы уведомим вас после одобрения"},
    "hi": {"pending_review": "समीक्षा में", "save_iban": "निकासी के लिए IBAN सहेजें", "paid_commission": "भुगतान किया कमीशन", "get_help": "सहायता प्राप्त करें", "describe_problem": "समस्या का वर्णन करें", "fill": "टॉप अप", "under_review": "समीक्षा में", "notify_approved": "अनुमोदन के बाद हम आपको सूचित करेंगे"},
    "zh": {"pending_review": "审核中", "save_iban": "保存您的IBAN以便提款", "paid_commission": "已支付佣金", "get_help": "获取帮助", "describe_problem": "描述问题", "fill": "充值", "under_review": "审核中", "notify_approved": "批准后我们会通知您"},
    "nl": {"pending_review": "In behandeling", "save_iban": "Sla uw IBAN op voor opnames", "paid_commission": "Betaalde commissie", "get_help": "Hulp krijgen", "describe_problem": "Beschrijf uw probleem", "fill": "Opladen", "under_review": "In behandeling", "notify_approved": "We stellen u op de hoogte zodra het is goedgekeurd"},
    "fr": {"pending_review": "En cours d'examen", "save_iban": "Enregistrez votre IBAN pour les retraits", "paid_commission": "Commission payee", "get_help": "Obtenir de l'aide", "describe_problem": "Decrivez votre probleme", "fill": "Recharger", "under_review": "En cours d'examen", "notify_approved": "Nous vous notifierons une fois approuve"},
    "de": {"pending_review": "In Pruefung", "save_iban": "Speichern Sie Ihre IBAN fuer Auszahlungen", "paid_commission": "Gezahlte Provision", "get_help": "Hilfe erhalten", "describe_problem": "Beschreiben Sie Ihr Problem", "fill": "Aufladen", "under_review": "In Pruefung", "notify_approved": "Wir benachrichtigen Sie nach der Genehmigung"},
    "pl": {"pending_review": "W trakcie przegladu", "save_iban": "Zapisz swoj IBAN do wyplat", "paid_commission": "Zaplacona prowizja", "get_help": "Uzyskaj pomoc", "describe_problem": "Opisz swoj problem", "fill": "Doladuj", "under_review": "W trakcie przegladu", "notify_approved": "Powiadomimy Cie po zatwierdzeniu"},
    "af": {"pending_review": "Onder oorweging", "save_iban": "Stoor jou IBAN vir onttrekkings", "paid_commission": "Betaalde kommissie", "get_help": "Kry hulp", "describe_problem": "Beskryf jou probleem", "fill": "Laai op", "under_review": "Onder oorweging", "notify_approved": "Ons sal jou in kennis stel sodra dit goedgekeur is"},
    "zu": {"pending_review": "Iphendulwa", "save_iban": "Gcina i-IBAN yakho ukuze uthole imali", "paid_commission": "Ikhomishini ekhokhelwe", "get_help": "Thola usizo", "describe_problem": "Chaza inkinga yakho", "fill": "Gcwalisa", "under_review": "Iphendulwa", "notify_approved": "Sizokunazisa uma kuvunyiwe"},
    "xh": {"pending_review": "Phantsi kophononongo", "save_iban": "Gcina i-IBAN yakho ukuze uthole imali", "paid_commission": "Ikhomishini ehlawulweyo", "get_help": "Fumana uncedo", "describe_problem": "Chaza ingxaki yakho", "fill": "Gcwalisa", "under_review": "Phantsi kophononongo", "notify_approved": "Siya kukwazisa xa kuvunyiwe"},
}

anchors = ["commission_breakdown:", "withdraw:", "support:", "balance:", "overview:", "top_up:"]

for lang, keys in new_keys.items():
    lang_marker = "  " + lang + ": {"
    lang_idx = c.find(lang_marker)
    if lang_idx == -1:
        changes.append("MISS lang: " + lang)
        continue
    for key, value in keys.items():
        if key + ":" in c[lang_idx:lang_idx+15000]:
            changes.append("SKIP: " + lang + "." + key)
            continue
        inserted = False
        for anchor in anchors:
            anchor_idx = c.find("    " + anchor, lang_idx)
            if anchor_idx != -1 and anchor_idx < lang_idx + 15000:
                insert_line = '    ' + key + ': "' + value + '",\n'
                c = c[:anchor_idx] + insert_line + c[anchor_idx:]
                changes.append("OK: " + lang + "." + key)
                inserted = True
                break
        if not inserted:
            changes.append("MISS anchor: " + lang + "." + key)

open(path, "w", encoding="utf-8", newline="\n").write(c)
print("\n".join(changes))
