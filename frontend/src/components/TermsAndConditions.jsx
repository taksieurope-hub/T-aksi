// T'aksi Terms & Conditions + Privacy Policy
// Multi-language, legally hardened platform-not-provider language
// Supports: ka, en, ru, hi, zh, nl, fr, de, pl, af

import React, { useState } from "react";
import { X, Globe, ChevronDown, ChevronUp, Shield } from "lucide-react";

const LANGUAGES = {
  en: { label: "English", flag: "🇺🇸" },
  ka: { label: "ქართული", flag: "🇬🇪" },
  ru: { label: "Русский", flag: "🇷🇺" },
  fr: { label: "Français", flag: "🇫🇷" },
  de: { label: "Deutsch", flag: "🇩🇪" },
  nl: { label: "Nederlands", flag: "🇳🇱" },
  pl: { label: "Polski", flag: "🇵🇱" },
};

const CONTENT = {
  en: {
    title: "T'aksi Terms & Conditions",
    privacy_title: "T'aksi Privacy Policy",
    updated: "Last Updated: March 2026",
    tabs: ["Terms & Conditions", "Privacy Policy"],
    terms: [
      {
        heading: "1. Nature of the Platform — T'aksi Is Not a Transport Provider",
        body: `T'aksi is a technology company that operates a digital platform connecting independent Drivers with Riders seeking transportation. T'aksi does not provide, operate, or control any transportation service.

T'aksi is not a taxi company, transport operator, courier service, or carrier of any kind under the laws of Georgia or any other jurisdiction. T'aksi does not own or operate vehicles and does not employ Drivers.

All transportation services are provided exclusively by independent third-party Drivers who use the Platform at their own discretion. T'aksi has no control over Driver conduct, route selection, driving behaviour, vehicle condition, or the outcome of any journey.

By using the Platform you acknowledge and agree that T'aksi is solely a technology intermediary and that any contract for transportation is formed directly between you and the Driver.`,
      },
      {
        heading: "2. Independent Contractor Status of Drivers",
        body: `Drivers are independent contractors and are not employees, agents, partners, or representatives of T'aksi. Nothing in these Terms creates any employment, partnership, joint venture, or agency relationship between T'aksi and any Driver.

Drivers are solely responsible for:
• Owning and maintaining a roadworthy vehicle
• Holding valid driving licences and all applicable permits
• Carrying adequate and valid vehicle insurance including third-party liability
• Paying all applicable taxes, fees, and levies
• Complying with all transport, road safety, and regulatory laws of Georgia
• Their conduct and behaviour during rides

T'aksi does not guarantee, warrant, or represent the suitability, competence, fitness, or legality of any Driver. While T'aksi performs document checks during onboarding, it cannot verify the ongoing validity or authenticity of submitted documents and expressly disclaims liability for any inaccuracy, forgery, or lapse in Driver documentation.`,
      },
      {
        heading: "3. No Guarantee of Ride Availability or Safety",
        body: `T'aksi makes no guarantee that a Driver will be available at any time or in any location. Submitting a ride request does not guarantee a ride will be provided.

T'aksi does not guarantee the safety of any journey. Users travel at their own risk. T'aksi provides an SOS feature as a courtesy but this does not constitute a safety guarantee, an emergency service, or a commitment of any emergency response.

T'aksi is not liable for personal injury, death, property damage, or any other harm arising from or in connection with a journey arranged through the Platform.`,
      },
      {
        heading: "4. User Eligibility and Accounts",
        body: `To use the Platform you must be at least 18 years of age and legally capable of entering into binding contracts under Georgian law.

You are responsible for maintaining the confidentiality of your account credentials and for all activity conducted under your account. T'aksi may suspend or permanently terminate accounts at any time without prior notice for any reason including but not limited to fraud, abuse, safety concerns, or legal compliance obligations.`,
      },
      {
        heading: "5. Payments, Pricing, and Surge Fares",
        body: `Fares are calculated based on distance, time, vehicle class, and demand. Fare estimates shown in the application are indicative only and final fares may differ.

T'aksi operates dynamic pricing. When ride requests in an area exceed half the available Drivers in that area, surge pricing will apply automatically. The applicable multiplier will be shown before you confirm a booking. By confirming a booking during a surge period you explicitly consent to paying the displayed surge fare.

Payments are processed by third-party payment processors including PayPal. T'aksi does not store full card details. T'aksi is not responsible for errors, failures, or delays caused by payment processors.

T'aksi charges Drivers a platform commission on completed rides. This commission is disclosed to Drivers at registration.`,
      },
      {
        heading: "6. Cancellation and No-Show Fees",
        body: `Riders may cancel a ride request before a Driver has accepted it at no charge. If a Rider cancels after a Driver has accepted the ride and arrived at the pickup location, a no-show fee of GEL 3.00 will be charged to the Rider's wallet balance.

Cancellation fees compensate Drivers for time and fuel expended and are non-refundable.`,
      },
      {
        heading: "7. Refunds and Credits",
        body: `All completed ride payments are final and non-refundable except where required by applicable law.

Where T'aksi determines in its sole discretion that a refund or compensation is appropriate, it will be issued exclusively as T'aksi Platform Credit. T'aksi Platform Credit:
• Has no monetary or cash value
• Cannot be withdrawn, transferred, or redeemed for cash
• Can only be used within the T'aksi Platform
• May expire at T'aksi's discretion`,
      },
      {
        heading: "8. User Conduct",
        body: `All users must at all times:
• Treat other users with respect and dignity
• Not harass, threaten, or abuse Drivers or Riders
• Not damage or soil any vehicle
• Not transport illegal substances or items
• Not use the Platform for any unlawful purpose
• Not attempt to circumvent, hack, or interfere with the Platform

Violation of these conduct standards may result in immediate and permanent suspension without refund.`,
      },
      {
        heading: "9. Ratings and Reviews",
        body: `Ratings displayed on the Platform are submitted by users and reflect their personal opinions. T'aksi does not verify, endorse, or take responsibility for the accuracy or fairness of any rating or review. T'aksi is not liable for any consequence arising from ratings including Driver deactivation decisions which are made at T'aksi's sole discretion.`,
      },
      {
        heading: "10. Insurance",
        body: `T'aksi does not hold or provide any vehicle insurance, passenger liability insurance, or any other insurance cover for rides arranged through the Platform.

Drivers are solely responsible for holding valid and adequate insurance including mandatory third-party liability insurance as required under Georgian law. T'aksi expressly disclaims all liability for any personal injury, property damage, or financial loss arising from any road traffic incident, accident, or event during a journey.

Riders are advised to satisfy themselves as to the insurance position of any Driver before travelling.`,
      },
      {
        heading: "11. Limitation of Liability",
        body: `To the fullest extent permitted by the laws of Georgia, T'aksi, its owners, directors, employees, contractors, and affiliates shall not be liable for:
• Personal injury or death
• Property damage
• Driver or Rider misconduct
• Road traffic accidents or incidents
• Loss of earnings, profits, or business
• Data loss or corruption
• Platform unavailability or service interruption
• Any indirect, consequential, special, or punitive damages

In all cases, the total aggregate liability of T'aksi shall not exceed the value of the single ride transaction giving rise to the claim.`,
      },
      {
        heading: "12. Indemnification",
        body: `You agree to fully indemnify and hold harmless T'aksi and its owners, directors, employees, agents, and affiliates from and against any and all claims, losses, damages, liabilities, costs, and expenses (including legal fees) arising out of or related to your use of the Platform, your violation of these Terms, your conduct during a ride, or any dispute between you and another user.`,
      },
      {
        heading: "13. Lost Property",
        body: `T'aksi accepts no responsibility for items lost or left in a vehicle. Users must contact the Driver directly through the Platform to recover lost items. T'aksi may assist in facilitating contact but is not liable for any loss, damage, or failure to recover property.`,
      },
      {
        heading: "14. Intellectual Property",
        body: `All software, code, branding, logos, designs, and content forming part of the T'aksi Platform are the intellectual property of T'aksi. Users may not copy, reverse engineer, decompile, modify, resell, or distribute any part of the Platform.`,
      },
      {
        heading: "15. Platform Availability",
        body: `T'aksi does not guarantee uninterrupted access to the Platform. The Platform may be unavailable due to maintenance, updates, third-party service outages, or factors beyond T'aksi's control. T'aksi is not liable for any loss arising from Platform unavailability.`,
      },
      {
        heading: "16. Force Majeure",
        body: `T'aksi shall not be liable for any failure or delay in performing its obligations caused by events beyond its reasonable control including natural disasters, acts of government, war, civil unrest, pandemic, internet outages, or cyber attacks.`,
      },
      {
        heading: "17. Governing Law and Disputes",
        body: `These Terms are governed by and construed in accordance with the laws of Georgia. Any dispute arising from or related to these Terms or the use of the Platform shall be subject to the exclusive jurisdiction of the courts of Tbilisi, Georgia.

Before commencing legal proceedings, users agree to attempt to resolve disputes by contacting T'aksi support at taksigeorgia@gmail.com.`,
      },
      {
        heading: "18. Changes to These Terms",
        body: `T'aksi may modify these Terms at any time. Changes will be communicated through the Platform. Continued use of the Platform after changes are posted constitutes your acceptance of the updated Terms.`,
      },
      {
        heading: "19. Contact",
        body: `For legal notices or Terms-related queries: taksigeorgia@gmail.com\n© 2026 T'aksi. All rights reserved. Tbilisi, Georgia.`,
      },
    ],
    privacy: [
      {
        heading: "1. Data Controller",
        body: `T'aksi operates as the data controller for personal data collected through the Platform. Contact: taksigeorgia@gmail.com`,
      },
      {
        heading: "2. Information We Collect",
        body: `We collect: name, phone number, profile photo, email address, device information, IP address, GPS location data (foreground and background while using the app), ride history, payment references, and communication with support.`,
      },
      {
        heading: "3. Legal Basis for Processing",
        body: `We process your data on the following legal bases under the Georgian Law on Personal Data Protection: performance of a contract (to provide the Platform service), legitimate interest (fraud prevention, safety), legal obligation (compliance), and consent (marketing communications where applicable).`,
      },
      {
        heading: "4. How We Use Your Data",
        body: `To match Riders with Drivers, process payments, provide customer support, prevent fraud, ensure safety, improve the Platform, and comply with legal obligations. We do not sell personal data to advertisers or third-party marketers.`,
      },
      {
        heading: "5. Data Sharing",
        body: `Limited data is shared between Riders and Drivers (name, location, vehicle info) as necessary to complete rides. We use third-party providers for payment processing, cloud hosting, push notifications, and analytics. These providers are contractually bound to process data only as instructed.`,
      },
      {
        heading: "6. Location Data",
        body: `The Platform collects precise GPS location to match Riders with Drivers, enable navigation, provide safety features, and improve service quality. Location may be collected in the background while the app is active. You may disable location permissions in device settings but this will prevent core Platform functionality.`,
      },
      {
        heading: "7. Data Retention",
        body: `We retain personal data for as long as your account is active and for a reasonable period thereafter for legal compliance, dispute resolution, and fraud prevention purposes.`,
      },
      {
        heading: "8. Your Rights",
        body: `Under Georgian data protection law you have the right to access, correct, delete, and restrict processing of your personal data. Submit requests to: taksigeorgia@gmail.com`,
      },
      {
        heading: "9. Security",
        body: `We implement reasonable technical and organisational security measures. No digital system is entirely secure and we cannot guarantee absolute security of your data.`,
      },
      {
        heading: "10. Children",
        body: `The Platform is not intended for persons under 18. We do not knowingly collect data from minors.`,
      },
      {
        heading: "11. International Transfers",
        body: `Data may be processed on servers located outside Georgia. By using the Platform you consent to such transfers in accordance with applicable law.`,
      },
      {
        heading: "12. Policy Updates",
        body: `This Privacy Policy may be updated. Changes will be notified through the Platform. Contact: taksigeorgia@gmail.com`,
      },
    ],
  },
  ka: {
    title: "T'aksi წესები და პირობები",
    privacy_title: "T'aksi კონფიდენციალურობის პოლიტიკა",
    updated: "ბოლო განახლება: მარტი 2026",
    tabs: ["წესები და პირობები", "კონფიდენციალურობა"],
    terms: [
      {
        heading: "1. პლატფორმის ბუნება — T'aksi არ არის სატრანსპორტო მომსახურება",
        body: `T'aksi არის ტექნოლოგიური კომპანია, რომელიც მართავს ციფრულ პლატფორმას, რომელიც დამოუკიდებელ მძღოლებს მგზავრებს უკავშირებს. T'aksi არ უწევს, არ მართავს და არ აკონტროლებს სატრანსპორტო მომსახურებას.

T'aksi არ არის ტაქსის კომპანია, სატრანსპორტო ოპერატორი ან გადამზიდავი საქართველოს კანონმდებლობის ან სხვა იურისდიქციის მიხედვით. T'aksi არ ფლობს მანქანებს და არ ასაქმებს მძღოლებს.

ყველა სატრანსპორტო მომსახურება ექსკლუზიურად მოწოდებულია დამოუკიდებელი მესამე მხარის მძღოლების მიერ. T'aksi-ს არ აქვს კონტროლი მძღოლის ქცევაზე, მარშრუტზე, სამართავ ქცევაზე, ავტომობილის მდგომარეობაზე ან მგზავრობის შედეგზე.`,
      },
      {
        heading: "2. მძღოლების დამოუკიდებელი კონტრაქტორის სტატუსი",
        body: `მძღოლები არიან დამოუკიდებელი კონტრაქტორები და არ არიან T'aksi-ის თანამშრომლები, აგენტები, პარტნიორები ან წარმომადგენლები.

მძღოლები პასუხისმგებელნი არიან:
• მანქანის ფლობასა და მოვლაზე
• მოქმედი მართვის მოწმობებისა და ნებართვების ქონაზე
• სავალდებულო სადაზღვევო პოლისის ქონაზე
• ყველა გადასახადის გადახდაზე
• საქართველოს სატრანსპორტო კანონმდებლობასთან შესაბამისობაზე`,
      },
      {
        heading: "3. მგზავრობის ხელმისაწვდომობის ან უსაფრთხოების გარანტია არ არსებობს",
        body: `T'aksi არ იძლევა გარანტიას, რომ მძღოლი ხელმისაწვდომი იქნება. T'aksi არ იძლევა მგზავრობის უსაფრთხოების გარანტიას. მომხმარებლები მგზავრობენ საკუთარი რისკით. T'aksi არ არის პასუხისმგებელი პირადი დაზიანების, გარდაცვალების, ქონების დაზიანების ან სხვა ზიანისთვის, რომელიც წარმოიქმნება პლატფორმის მეშვეობით ორგანიზებული მგზავრობიდან.`,
      },
      {
        heading: "4. მომხმარებლის კვალიფიკაცია და ანგარიშები",
        body: `პლატფორმის გამოსაყენებლად უნდა გქონდეთ მინიმუმ 18 წელი. თქვენ პასუხისმგებელი ხართ თქვენი ანგარიშის უსაფრთხოებაზე. T'aksi-ს შეუძლია ანგარიშების შეჩერება ან შეწყვეტა ნებისმიერ დროს.`,
      },
      {
        heading: "5. გადახდები, ფასები და ზედნადები ტარიფები",
        body: `ტარიფები გამოითვლება მანძილის, დროის, ავტომობილის კლასისა და მოთხოვნის მიხედვით. როდესაც რეგიონში მგზავრობის მოთხოვნები გადააჭარბებს ადგილობრივი მძღოლების ნახევარს, ავტომატურად დაწესდება ზედნადები ტარიფი. ჯავშნის დადასტურებით ზედნადები პერიოდის განმავლობაში, თქვენ პირდაპირ ეთანხმებით ნაჩვენები ტარიფის გადახდას.`,
      },
      {
        heading: "6. გაუქმება და არმოსვლის საფასური",
        body: `თუ მგზავრი გააუქმებს მძღოლის ჩამოსვლის შემდეგ, დაეკისრება 3.00 ლარის არმოსვლის საფასური.`,
      },
      {
        heading: "7. თანხის დაბრუნება და კრედიტები",
        body: `დასრულებული მგზავრობის ყველა გადახდა საბოლოოა. სადაც T'aksi მიიჩნევს კომპენსაციას შესაბამისად, ის გაიცემა ექსკლუზიურად T'aksi პლატფორმის კრედიტად, რომელსაც არ გააჩნია ფულადი ღირებულება.`,
      },
      {
        heading: "8. მომხმარებელთა ქცევა",
        body: `ყველა მომხმარებელი ვალდებულია მოექცეს სხვებს პატივისცემით, არ დააზიანოს ავტომობილი, არ გადაიტანოს უკანონო ნივთები და არ გამოიყენოს პლატფორმა უკანონო მიზნებისთვის.`,
      },
      {
        heading: "9. დაზღვევა",
        body: `T'aksi არ ინახავს და არ გთავაზობს სატრანსპორტო დაზღვევას. მძღოლები პასუხისმგებელნი არიან მოქმედი სადაზღვევო პოლისის ქონაზე.`,
      },
      {
        heading: "10. პასუხისმგებლობის შეზღუდვა",
        body: `T'aksi არ არის პასუხისმგებელი პირადი დაზიანებისთვის, ქონების დაზიანებისთვის, მოგების დაკარგვისთვის ან სხვა ზიანისთვის. T'aksi-ს საერთო პასუხისმგებლობა არ გადააჭარბებს სადავო ერთი მგზავრობის ღირებულებას.`,
      },
      {
        heading: "11. კანონმდებლობა",
        body: `ეს წესები მართავს საქართველოს კანონმდებლობა. კონტაქტი: taksigeorgia@gmail.com`,
      },
    ],
    privacy: [
      {
        heading: "1. მონაცემების კონტროლერი",
        body: `T'aksi არის მონაცემების კონტროლერი. კონტაქტი: taksigeorgia@gmail.com`,
      },
      {
        heading: "2. შეგროვებული ინფორმაცია",
        body: `ჩვენ ვაგროვებთ: სახელს, ტელეფონის ნომერს, პროფილის ფოტოს, GPS მდებარეობის მონაცემებს, მგზავრობის ისტორიას და გადახდის მითითებებს.`,
      },
      {
        heading: "3. მონაცემების გამოყენება",
        body: `მგზავრებისა და მძღოლების დასაკავშირებლად, გადახდების დასამუშავებლად, თაღლითობის თავიდან ასაცილებლად და უსაფრთხოების უზრუნველყოფისთვის. ჩვენ არ ვყიდით პერსონალურ მონაცემებს.`,
      },
      {
        heading: "4. თქვენი უფლებები",
        body: `საქართველოს მონაცემთა დაცვის კანონმდებლობის შესაბამისად, გაქვთ უფლება შეხვიდეთ, შეასწოროთ და წაშალოთ თქვენი პერსონალური მონაცემები. მოთხოვნები: taksigeorgia@gmail.com`,
      },
    ],
  },
  ru: {
    title: "T'aksi Условия использования",
    privacy_title: "T'aksi Политика конфиденциальности",
    updated: "Последнее обновление: март 2026",
    tabs: ["Условия использования", "Конфиденциальность"],
    terms: [
      {
        heading: "1. Характер платформы — T'aksi не является транспортным перевозчиком",
        body: `T'aksi — технологическая компания, управляющая цифровой платформой для связи независимых водителей с пассажирами. T'aksi не предоставляет, не управляет и не контролирует транспортные услуги.

T'aksi не является таксомоторной компанией, транспортным оператором или перевозчиком по законодательству Грузии. T'aksi не владеет автомобилями и не нанимает водителей.

Все транспортные услуги предоставляются исключительно независимыми водителями. T'aksi не несёт ответственности за поведение водителей, выбор маршрута, состояние автомобиля или результат поездки.`,
      },
      {
        heading: "2. Статус независимого подрядчика",
        body: `Водители являются независимыми подрядчиками и не являются сотрудниками, агентами или представителями T'aksi.

Водители несут ответственность за: содержание автомобиля, наличие действующих прав и разрешений, страхование, уплату налогов и соблюдение законодательства Грузии.`,
      },
      {
        heading: "3. Отсутствие гарантий доступности и безопасности",
        body: `T'aksi не гарантирует наличие водителя в любое время. T'aksi не гарантирует безопасность поездок. Пользователи путешествуют на свой страх и риск. T'aksi не несёт ответственности за травмы, гибель, ущерб имуществу или иной вред.`,
      },
      {
        heading: "4. Аккаунты пользователей",
        body: `Для использования платформы необходимо быть не моложе 18 лет. Вы несёте ответственность за безопасность своего аккаунта. T'aksi вправе приостановить или удалить аккаунт в любое время.`,
      },
      {
        heading: "5. Оплата и динамическое ценообразование",
        body: `Тарифы рассчитываются исходя из расстояния, времени, класса автомобиля и спроса. При превышении числа запросов на поездки половины доступных водителей в районе автоматически применяется повышающий коэффициент. Подтверждая заказ в период повышенного спроса, вы соглашаетесь с отображаемым тарифом.`,
      },
      {
        heading: "6. Отмена и штраф за неявку",
        body: `Если пассажир отменяет поездку после прибытия водителя к месту подачи, взимается штраф в размере 3,00 GEL.`,
      },
      {
        heading: "7. Возвраты и кредиты",
        body: `Все платежи за завершённые поездки являются окончательными. Компенсации выдаются исключительно в виде кредитов платформы T'aksi без денежной стоимости.`,
      },
      {
        heading: "8. Поведение пользователей",
        body: `Запрещается: оскорблять других пользователей, повреждать автомобили, перевозить запрещённые предметы, использовать платформу в незаконных целях.`,
      },
      {
        heading: "9. Страхование",
        body: `T'aksi не предоставляет страховое покрытие для поездок. Водители обязаны иметь действующую страховку, включая обязательное страхование гражданской ответственности.`,
      },
      {
        heading: "10. Ограничение ответственности",
        body: `T'aksi не несёт ответственности за личный ущерб, ущерб имуществу, упущенную прибыль или иной косвенный ущерб. Совокупная ответственность T'aksi не превышает стоимости одной поездки.`,
      },
      {
        heading: "11. Применимое право",
        body: `Настоящие условия регулируются законодательством Грузии. Контакт: taksigeorgia@gmail.com`,
      },
    ],
    privacy: [
      {
        heading: "1. Контроллер данных",
        body: `T'aksi является контроллером персональных данных. Контакт: taksigeorgia@gmail.com`,
      },
      {
        heading: "2. Собираемые данные",
        body: `Мы собираем: имя, номер телефона, фото профиля, данные GPS-местоположения, историю поездок и платёжные реквизиты.`,
      },
      {
        heading: "3. Использование данных",
        body: `Для соединения пассажиров с водителями, обработки платежей, предотвращения мошенничества и обеспечения безопасности. Мы не продаём персональные данные.`,
      },
      {
        heading: "4. Ваши права",
        body: `В соответствии с законодательством Грузии о защите персональных данных вы вправе получать доступ, исправлять и удалять свои данные. Запросы направляйте на: taksigeorgia@gmail.com`,
      },
    ],
  },
  fr: {
    title: "T'aksi Conditions d'utilisation",
    privacy_title: "T'aksi Politique de confidentialité",
    updated: "Dernière mise à jour : mars 2026",
    tabs: ["Conditions d'utilisation", "Confidentialité"],
    terms: [
      {
        heading: "1. Nature de la plateforme — T'aksi n'est pas un transporteur",
        body: `T'aksi est une société technologique exploitant une plateforme numérique mettant en relation des conducteurs indépendants avec des passagers. T'aksi ne fournit, n'exploite ni ne contrôle aucun service de transport.

T'aksi n'est pas une société de taxi, un opérateur de transport ou un transporteur au sens de la loi géorgienne. T'aksi ne possède pas de véhicules et n'emploie pas de conducteurs.

Tous les services de transport sont fournis exclusivement par des conducteurs indépendants. T'aksi n'est pas responsable du comportement des conducteurs, du choix d'itinéraire ou de l'issue du trajet.`,
      },
      {
        heading: "2. Statut de sous-traitant indépendant",
        body: `Les conducteurs sont des entrepreneurs indépendants et non des employés ou représentants de T'aksi. Ils sont seuls responsables de l'entretien du véhicule, des licences, de l'assurance et du respect de la législation géorgienne.`,
      },
      {
        heading: "3. Absence de garantie de disponibilité ou de sécurité",
        body: `T'aksi ne garantit pas la disponibilité d'un conducteur. T'aksi ne garantit pas la sécurité des trajets. Les utilisateurs voyagent à leurs propres risques. T'aksi décline toute responsabilité pour les blessures, décès ou dommages matériels.`,
      },
      {
        heading: "4. Tarification dynamique",
        body: `Lorsque les demandes de trajet dépassent la moitié des conducteurs disponibles dans une zone, une majoration tarifaire est automatiquement appliquée. En confirmant une réservation durant une période de forte demande, vous acceptez expressément le tarif majoré affiché.`,
      },
      {
        heading: "5. Assurance",
        body: `T'aksi ne fournit aucune couverture d'assurance pour les trajets. Les conducteurs sont tenus de disposer d'une assurance valide.`,
      },
      {
        heading: "6. Limitation de responsabilité",
        body: `T'aksi ne saurait être tenu responsable des dommages corporels, matériels ou financiers. La responsabilité totale de T'aksi est limitée à la valeur d'un seul trajet. Contact : taksigeorgia@gmail.com`,
      },
    ],
    privacy: [
      {
        heading: "1. Responsable du traitement",
        body: `T'aksi est responsable du traitement des données personnelles. Contact : taksigeorgia@gmail.com`,
      },
      {
        heading: "2. Données collectées",
        body: `Nom, numéro de téléphone, photo de profil, données de localisation GPS, historique des trajets et références de paiement.`,
      },
      {
        heading: "3. Vos droits",
        body: `Conformément à la législation géorgienne sur la protection des données, vous disposez du droit d'accès, de rectification et de suppression. Demandes : taksigeorgia@gmail.com`,
      },
    ],
  },
  de: {
    title: "T'aksi Nutzungsbedingungen",
    privacy_title: "T'aksi Datenschutzrichtlinie",
    updated: "Zuletzt aktualisiert: März 2026",
    tabs: ["Nutzungsbedingungen", "Datenschutz"],
    terms: [
      {
        heading: "1. Plattformcharakter — T'aksi ist kein Transportdienstleister",
        body: `T'aksi ist ein Technologieunternehmen, das eine digitale Plattform betreibt, die unabhängige Fahrer mit Fahrgästen verbindet. T'aksi erbringt, betreibt oder kontrolliert keine Transportdienstleistungen.

T'aksi ist weder ein Taxiunternehmen noch ein Transportunternehmen im Sinne des georgischen Rechts. T'aksi besitzt keine Fahrzeuge und beschäftigt keine Fahrer.

Alle Transportleistungen werden ausschließlich von unabhängigen Fahrern erbracht. T'aksi haftet nicht für das Verhalten der Fahrer, die Routenwahl oder den Ausgang der Fahrt.`,
      },
      {
        heading: "2. Status als unabhängiger Auftragnehmer",
        body: `Fahrer sind unabhängige Auftragnehmer und keine Angestellten oder Vertreter von T'aksi. Sie sind allein verantwortlich für Fahrzeugunterhalt, Lizenzen, Versicherung und die Einhaltung des georgischen Rechts.`,
      },
      {
        heading: "3. Dynamische Preisgestaltung",
        body: `Übersteigen die Fahrtanfragen die Hälfte der verfügbaren Fahrer in einem Gebiet, wird automatisch ein Aufpreis erhoben. Mit der Bestätigung einer Buchung in Stoßzeiten stimmen Sie dem angezeigten Aufpreis ausdrücklich zu.`,
      },
      {
        heading: "4. Versicherung",
        body: `T'aksi bietet keinen Versicherungsschutz für Fahrten. Fahrer sind verpflichtet, eine gültige Kfz-Haftpflichtversicherung zu unterhalten.`,
      },
      {
        heading: "5. Haftungsbeschränkung",
        body: `T'aksi haftet nicht für Personenschäden, Sachschäden oder Vermögensschäden. Die Gesamthaftung von T'aksi ist auf den Wert einer einzelnen Fahrt begrenzt. Kontakt: taksigeorgia@gmail.com`,
      },
    ],
    privacy: [
      {
        heading: "1. Verantwortlicher",
        body: `T'aksi ist Verantwortlicher für personenbezogene Daten. Kontakt: taksigeorgia@gmail.com`,
      },
      {
        heading: "2. Erhobene Daten",
        body: `Name, Telefonnummer, Profilfoto, GPS-Standortdaten, Fahrtenverlauf und Zahlungsreferenzen.`,
      },
      {
        heading: "3. Ihre Rechte",
        body: `Sie haben das Recht auf Auskunft, Berichtigung und Löschung Ihrer Daten. Anfragen: taksigeorgia@gmail.com`,
      },
    ],
  },
  nl: {
    title: "T'aksi Gebruiksvoorwaarden",
    privacy_title: "T'aksi Privacybeleid",
    updated: "Laatst bijgewerkt: maart 2026",
    tabs: ["Gebruiksvoorwaarden", "Privacy"],
    terms: [
      {
        heading: "1. Aard van het platform — T'aksi is geen vervoerder",
        body: `T'aksi is een technologiebedrijf dat een digitaal platform exploiteert dat onafhankelijke chauffeurs verbindt met reizigers. T'aksi verleent, exploiteert of beheert geen vervoersdiensten.

T'aksi is geen taxibedrijf of vervoersmaatschappij onder Georgisch recht. T'aksi bezit geen voertuigen en heeft geen chauffeurs in dienst. Alle vervoersdiensten worden uitsluitend verleend door onafhankelijke chauffeurs.`,
      },
      {
        heading: "2. Dynamische prijsstelling",
        body: `Wanneer het aantal ritaanvragen de helft van de beschikbare chauffeurs in een gebied overschrijdt, wordt automatisch een toeslag toegepast. Door een boeking te bevestigen tijdens een periode van hoge vraag, stemt u uitdrukkelijk in met het weergegeven tarief.`,
      },
      {
        heading: "3. Beperking van aansprakelijkheid",
        body: `T'aksi is niet aansprakelijk voor persoonlijk letsel, materiële schade of financieel verlies. De totale aansprakelijkheid van T'aksi is beperkt tot de waarde van één enkele rit. Contact: taksigeorgia@gmail.com`,
      },
    ],
    privacy: [
      {
        heading: "1. Verwerkingsverantwoordelijke",
        body: `T'aksi is verwerkingsverantwoordelijke voor persoonsgegevens. Contact: taksigeorgia@gmail.com`,
      },
      {
        heading: "2. Uw rechten",
        body: `U heeft het recht op inzage, correctie en verwijdering van uw gegevens. Verzoeken: taksigeorgia@gmail.com`,
      },
    ],
  },
  pl: {
    title: "T'aksi Regulamin",
    privacy_title: "T'aksi Polityka prywatności",
    updated: "Ostatnia aktualizacja: marzec 2026",
    tabs: ["Regulamin", "Prywatność"],
    terms: [
      {
        heading: "1. Charakter platformy — T'aksi nie jest przewoźnikiem",
        body: `T'aksi to firma technologiczna prowadząca cyfrową platformę łączącą niezależnych kierowców z pasażerami. T'aksi nie świadczy, nie prowadzi ani nie kontroluje żadnych usług transportowych.

T'aksi nie jest firmą taksówkową ani przewoźnikiem w rozumieniu prawa gruzińskiego. T'aksi nie posiada pojazdów i nie zatrudnia kierowców. Wszystkie usługi transportowe świadczone są wyłącznie przez niezależnych kierowców.`,
      },
      {
        heading: "2. Dynamiczne ceny",
        body: `Gdy liczba zamówień przewyższy połowę dostępnych kierowców w danym rejonie, automatycznie zostanie naliczona dopłata. Potwierdzając rezerwację w okresie wzmożonego popytu, wyrażasz wyraźną zgodę na wyświetlaną stawkę.`,
      },
      {
        heading: "3. Ograniczenie odpowiedzialności",
        body: `T'aksi nie ponosi odpowiedzialności za szkody osobowe, majątkowe ani finansowe. Łączna odpowiedzialność T'aksi nie przekracza wartości jednego przejazdu. Kontakt: taksigeorgia@gmail.com`,
      },
    ],
    privacy: [
      {
        heading: "1. Administrator danych",
        body: `T'aksi jest administratorem danych osobowych. Kontakt: taksigeorgia@gmail.com`,
      },
      {
        heading: "2. Twoje prawa",
        body: `Masz prawo dostępu, sprostowania i usunięcia swoich danych. Wnioski: taksigeorgia@gmail.com`,
      },
    ],
  },
};

// ─── Component ───────────────────────────────────────────────────────────────

export default function TermsAndConditions({ onClose, initialTab = 0 }) {
  const [lang, setLang] = useState("en");
  const [tab, setTab] = useState(initialTab);
  const [showLangMenu, setShowLangMenu] = useState(false);
  const [expanded, setExpanded] = useState({});

  const content = CONTENT[lang] || CONTENT.en;
  const sections = tab === 0 ? content.terms : content.privacy;

  const toggle = (i) => setExpanded((prev) => ({ ...prev, [i]: !prev[i] }));

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      background: "rgba(0,0,0,0.85)", backdropFilter: "blur(8px)",
      display: "flex", alignItems: "flex-end", justifyContent: "center",
    }}>
      <div style={{
        width: "100%", maxWidth: 600,
        background: "#0d0d1a",
        border: "1px solid rgba(255,255,255,0.08)",
        borderRadius: "20px 20px 0 0",
        maxHeight: "92vh",
        display: "flex", flexDirection: "column",
        overflow: "hidden",
      }}>
        {/* Header */}
        <div style={{
          padding: "18px 20px 14px",
          borderBottom: "1px solid rgba(255,255,255,0.07)",
          flexShrink: 0,
        }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <Shield style={{ width: 20, height: 20, color: "#00ff88" }} />
              <span style={{ color: "white", fontWeight: 800, fontSize: 16 }}>T'aksi Legal</span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {/* Language selector */}
              <div style={{ position: "relative" }}>
                <button
                  onClick={() => setShowLangMenu(!showLangMenu)}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 8, padding: "5px 10px",
                    color: "white", fontSize: 12, cursor: "pointer",
                  }}
                >
                  <Globe style={{ width: 13, height: 13 }} />
                  {LANGUAGES[lang]?.flag} {LANGUAGES[lang]?.label}
                  <ChevronDown style={{ width: 12, height: 12 }} />
                </button>
                {showLangMenu && (
                  <div style={{
                    position: "absolute", top: "110%", right: 0,
                    background: "#1a1a2e", border: "1px solid rgba(255,255,255,0.12)",
                    borderRadius: 10, overflow: "hidden", zIndex: 100, minWidth: 140,
                  }}>
                    {Object.entries(LANGUAGES).map(([code, { label, flag }]) => (
                      <button key={code} onClick={() => { setLang(code); setShowLangMenu(false); setExpanded({}); }}
                        style={{
                          width: "100%", display: "flex", alignItems: "center", gap: 8,
                          padding: "9px 14px", background: lang === code ? "rgba(0,255,136,0.08)" : "transparent",
                          border: "none", color: lang === code ? "#00ff88" : "rgba(255,255,255,0.7)",
                          fontSize: 13, cursor: "pointer", textAlign: "left",
                        }}>
                        {flag} {label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {onClose && (
                <button onClick={onClose} style={{
                  background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.1)",
                  borderRadius: 8, padding: 6, color: "rgba(255,255,255,0.6)", cursor: "pointer",
                }}>
                  <X style={{ width: 16, height: 16 }} />
                </button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: "flex", gap: 6 }}>
            {content.tabs.map((label, i) => (
              <button key={i} onClick={() => { setTab(i); setExpanded({}); }}
                style={{
                  flex: 1, padding: "8px 4px", borderRadius: 10,
                  border: `1px solid ${tab === i ? "rgba(0,255,136,0.4)" : "rgba(255,255,255,0.08)"}`,
                  background: tab === i ? "rgba(0,255,136,0.08)" : "transparent",
                  color: tab === i ? "#00ff88" : "rgba(255,255,255,0.4)",
                  fontWeight: 700, fontSize: 12, cursor: "pointer",
                }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <div style={{ padding: "14px 20px 8px", flexShrink: 0 }}>
          <div style={{ color: "white", fontWeight: 900, fontSize: 17 }}>
            {tab === 0 ? content.title : content.privacy_title}
          </div>
          <div style={{ color: "rgba(255,255,255,0.3)", fontSize: 11, marginTop: 2 }}>{content.updated}</div>
        </div>

        {/* Sections - scrollable */}
        <div style={{ overflowY: "auto", flex: 1, padding: "4px 20px 32px" }}>
          {sections.map((section, i) => (
            <div key={i} style={{
              borderBottom: "1px solid rgba(255,255,255,0.05)",
              marginBottom: 2,
            }}>
              <button
                onClick={() => toggle(i)}
                style={{
                  width: "100%", display: "flex", alignItems: "flex-start",
                  justifyContent: "space-between", gap: 10,
                  padding: "13px 0", background: "none", border: "none",
                  cursor: "pointer", textAlign: "left",
                }}
              >
                <span style={{ color: "rgba(255,255,255,0.85)", fontSize: 13, fontWeight: 700, lineHeight: 1.4 }}>
                  {section.heading}
                </span>
                {expanded[i]
                  ? <ChevronUp style={{ width: 15, height: 15, color: "#00ff88", flexShrink: 0, marginTop: 2 }} />
                  : <ChevronDown style={{ width: 15, height: 15, color: "rgba(255,255,255,0.3)", flexShrink: 0, marginTop: 2 }} />
                }
              </button>
              {expanded[i] && (
                <div style={{
                  color: "rgba(255,255,255,0.55)", fontSize: 12.5, lineHeight: 1.75,
                  paddingBottom: 14, whiteSpace: "pre-line",
                }}>
                  {section.body}
                </div>
              )}
            </div>
          ))}

          <div style={{
            marginTop: 20, padding: "12px 14px",
            background: "rgba(0,255,136,0.04)",
            border: "1px solid rgba(0,255,136,0.12)",
            borderRadius: 10,
            color: "rgba(255,255,255,0.3)", fontSize: 11, textAlign: "center",
          }}>
            © 2026 T'aksi · Tbilisi, Georgia · taksigeorgia@gmail.com
          </div>
        </div>
      </div>
    </div>
  );
}
