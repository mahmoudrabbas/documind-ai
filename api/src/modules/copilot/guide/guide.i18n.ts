import type { GuideFlow } from "./guide.contracts.js";
import { getAllGuideFlows } from "./guideFlows.js";

type Locale = "en" | "ar";

interface GuideMessage {
  en: string;
  ar: string;
}

export const GUIDE_I18N: Record<string, GuideMessage> = {
  // ── documents.upload ───────────────────────────────────────────────────────
  "copilot.guide.documents.upload.title": {
    en: "Upload a document",
    ar: "رفع مستند",
  },
  "copilot.guide.documents.upload.step1.title": {
    en: "Open Documents",
    ar: "افتح المستندات",
  },
  "copilot.guide.documents.upload.step1.instruction": {
    en: "Click Documents in the sidebar to open the documents page.",
    ar: "انقر على «المستندات» في الشريط الجانبي لفتح صفحة المستندات.",
  },
  "copilot.guide.documents.upload.step2.title": {
    en: "Start an upload",
    ar: "ابدأ عملية الرفع",
  },
  "copilot.guide.documents.upload.step2.instruction": {
    en: "Click the Upload button at the top of the page.",
    ar: "انقر على زر «رفع» في أعلى الصفحة.",
  },
  "copilot.guide.documents.upload.step3.title": {
    en: "Choose a file",
    ar: "اختر ملفًا",
  },
  "copilot.guide.documents.upload.step3.instruction": {
    en: "Drop your file into the upload area or click to browse.",
    ar: "أفلت الملف في منطقة الرفع أو انقر لاستعراض الملفات.",
  },
  "copilot.guide.documents.upload.step4.title": {
    en: "Add a title",
    ar: "أضف عنوانًا",
  },
  "copilot.guide.documents.upload.step4.instruction": {
    en: "Type a clear title for the document in the title field.",
    ar: "اكتب عنوانًا واضحًا للمستند في حقل العنوان.",
  },
  "copilot.guide.documents.upload.step5.title": {
    en: "Describe it",
    ar: "أضف وصفًا",
  },
  "copilot.guide.documents.upload.step5.instruction": {
    en: "Add a short description to help others find the document.",
    ar: "أضف وصفًا قصيرًا لمساعدة الآخرين على العثور على المستند.",
  },
  "copilot.guide.documents.upload.step6.title": {
    en: "Tag it",
    ar: "أضف وسومًا",
  },
  "copilot.guide.documents.upload.step6.instruction": {
    en: "Add tags such as department or topic to organize the document.",
    ar: "أضف وسومًا مثل القسم أو الموضوع لتنظيم المستند.",
  },
  "copilot.guide.documents.upload.step7.title": {
    en: "Finish the upload",
    ar: "أكمل الرفع",
  },
  "copilot.guide.documents.upload.step7.instruction": {
    en: "Click Upload to save the document to your knowledge base.",
    ar: "انقر على «رفع» لحفظ المستند في قاعدة المعرفة.",
  },

  // ── documents.search ───────────────────────────────────────────────────────
  "copilot.guide.documents.search.title": {
    en: "Search documents",
    ar: "البحث في المستندات",
  },
  "copilot.guide.documents.search.step1.title": {
    en: "Open Documents",
    ar: "افتح المستندات",
  },
  "copilot.guide.documents.search.step1.instruction": {
    en: "Click Documents in the sidebar to open the documents page.",
    ar: "انقر على «المستندات» في الشريط الجانبي لفتح صفحة المستندات.",
  },
  "copilot.guide.documents.search.step2.title": {
    en: "Type your search",
    ar: "اكتب بحثك",
  },
  "copilot.guide.documents.search.step2.instruction": {
    en: "Enter a keyword or phrase in the search field.",
    ar: "أدخل كلمة أو عبارة في حقل البحث.",
  },
  "copilot.guide.documents.search.step3.title": {
    en: "Run the search",
    ar: "نفّذ البحث",
  },
  "copilot.guide.documents.search.step3.instruction": {
    en: "Click the search button to see matching documents.",
    ar: "انقر على زر البحث لعرض المستندات المطابقة.",
  },

  // ── documents.delete ───────────────────────────────────────────────────────
  "copilot.guide.documents.delete.title": {
    en: "Delete a document",
    ar: "حذف مستند",
  },
  "copilot.guide.documents.delete.step1.title": {
    en: "Open Documents",
    ar: "افتح المستندات",
  },
  "copilot.guide.documents.delete.step1.instruction": {
    en: "Click Documents in the sidebar to open the documents page.",
    ar: "انقر على «المستندات» في الشريط الجانبي لفتح صفحة المستندات.",
  },
  "copilot.guide.documents.delete.step2.title": {
    en: "Open the row menu",
    ar: "افتح قائمة الصف",
  },
  "copilot.guide.documents.delete.step2.instruction": {
    en: "Find the document you want to delete and open its row actions menu.",
    ar: "ابحث عن المستند الذي تريد حذفه وافتح قائمة إجراءات الصف.",
  },
  "copilot.guide.documents.delete.step3.title": {
    en: "Confirm the deletion",
    ar: "أكّد الحذف",
  },
  "copilot.guide.documents.delete.step3.instruction": {
    en: "Choose Delete from the menu. Deleting sends the document to trash.",
    ar: "اختر «حذف» من القائمة. الحذف ينقل المستند إلى سلة المهملات.",
  },

  // ── users.invite ───────────────────────────────────────────────────────────
  "copilot.guide.users.invite.title": {
    en: "Invite a teammate",
    ar: "دعوة زميل",
  },
  "copilot.guide.users.invite.step1.title": {
    en: "Open Users",
    ar: "افتح المستخدمين",
  },
  "copilot.guide.users.invite.step1.instruction": {
    en: "Click Users in the sidebar to open the users page.",
    ar: "انقر على «المستخدمين» في الشريط الجانبي لفتح صفحة المستخدمين.",
  },
  "copilot.guide.users.invite.step2.title": {
    en: "Start an invitation",
    ar: "ابدأ الدعوة",
  },
  "copilot.guide.users.invite.step2.instruction": {
    en: "Click the Invite User button.",
    ar: "انقر على زر «دعوة مستخدم».",
  },
  "copilot.guide.users.invite.step3.title": {
    en: "Enter their name",
    ar: "أدخل اسمه",
  },
  "copilot.guide.users.invite.step3.instruction": {
    en: "Type the full name of the person you are inviting.",
    ar: "اكتب الاسم الكامل للشخص الذي تدعوه.",
  },
  "copilot.guide.users.invite.step4.title": {
    en: "Enter their email",
    ar: "أدخل بريده الإلكتروني",
  },
  "copilot.guide.users.invite.step4.instruction": {
    en: "Provide the work email address that will receive the invitation.",
    ar: "أدخل البريد الإلكتروني للعمل الذي سيستلم الدعوة.",
  },
  "copilot.guide.users.invite.step5.title": {
    en: "Choose a role",
    ar: "اختر الدور",
  },
  "copilot.guide.users.invite.step5.instruction": {
    en: "Select the role that matches the level of access they need.",
    ar: "اختر الدور الذي يناسب مستوى الصلاحيات المطلوبة.",
  },
  "copilot.guide.users.invite.step6.title": {
    en: "Send the invitation",
    ar: "أرسل الدعوة",
  },
  "copilot.guide.users.invite.step6.instruction": {
    en: "Click Send Invitation to deliver the invite by email.",
    ar: "انقر على «إرسال الدعوة» لتسليمها عبر البريد الإلكتروني.",
  },

  // ── knowledgeBase.build ────────────────────────────────────────────────────
  "copilot.guide.knowledgeBase.build.title": {
    en: "Build your knowledge base",
    ar: "ابنِ قاعدة معرفتك",
  },
  "copilot.guide.knowledgeBase.build.step1.title": {
    en: "Open Documents",
    ar: "افتح المستندات",
  },
  "copilot.guide.knowledgeBase.build.step1.instruction": {
    en: "Click Documents in the sidebar to open the documents page.",
    ar: "انقر على «المستندات» في الشريط الجانبي لفتح صفحة المستندات.",
  },
  "copilot.guide.knowledgeBase.build.step2.title": {
    en: "Start an upload",
    ar: "ابدأ عملية الرفع",
  },
  "copilot.guide.knowledgeBase.build.step2.instruction": {
    en: "Click the Upload button at the top of the page.",
    ar: "انقر على زر «رفع» في أعلى الصفحة.",
  },
  "copilot.guide.knowledgeBase.build.step3.title": {
    en: "Choose a file",
    ar: "اختر ملفًا",
  },
  "copilot.guide.knowledgeBase.build.step3.instruction": {
    en: "Drop your file into the upload area or click to browse.",
    ar: "أفلت الملف في منطقة الرفع أو انقر لاستعراض الملفات.",
  },
  "copilot.guide.knowledgeBase.build.step4.title": {
    en: "Add a title",
    ar: "أضف عنوانًا",
  },
  "copilot.guide.knowledgeBase.build.step4.instruction": {
    en: "Type a clear title so the document is easy to recognize.",
    ar: "اكتب عنوانًا واضحًا لتسهيل التعرّف على المستند.",
  },
  "copilot.guide.knowledgeBase.build.step5.title": {
    en: "Describe it",
    ar: "أضف وصفًا",
  },
  "copilot.guide.knowledgeBase.build.step5.instruction": {
    en: "Add a short description to give the document context.",
    ar: "أضف وصفًا قصيرًا لإعطاء المستند سياقًا واضحًا.",
  },
  "copilot.guide.knowledgeBase.build.step6.title": {
    en: "Tag it",
    ar: "أضف وسومًا",
  },
  "copilot.guide.knowledgeBase.build.step6.instruction": {
    en: "Add tags to make the document easier to find later.",
    ar: "أضف وسومًا لتسهيل العثور على المستند لاحقًا.",
  },
  "copilot.guide.knowledgeBase.build.step7.title": {
    en: "Finish the upload",
    ar: "أكمل الرفع",
  },
  "copilot.guide.knowledgeBase.build.step7.instruction": {
    en: "Click Upload. The document will be processed and indexed.",
    ar: "انقر على «رفع». سيتم معالجة المستند وفهرسته.",
  },

  // ── settings.open ──────────────────────────────────────────────────────────
  "copilot.guide.settings.open.title": {
    en: "Review company settings",
    ar: "مراجعة إعدادات الشركة",
  },
  "copilot.guide.settings.open.step1.title": {
    en: "Open Settings",
    ar: "افتح الإعدادات",
  },
  "copilot.guide.settings.open.step1.instruction": {
    en: "Click Settings in the sidebar to open company settings.",
    ar: "انقر على «الإعدادات» في الشريط الجانبي لفتح إعدادات الشركة.",
  },
  "copilot.guide.settings.open.step2.title": {
    en: "Review the profile",
    ar: "راجع الملف التعريفي",
  },
  "copilot.guide.settings.open.step2.instruction": {
    en: "Review the company profile section with name, logo, and preferences.",
    ar: "راجع قسم الملف التعريفي للشركة من الاسم والشعار والتفضيلات.",
  },

  // ── billing.open ───────────────────────────────────────────────────────────
  "copilot.guide.billing.open.title": {
    en: "View billing",
    ar: "عرض الفوترة",
  },
  "copilot.guide.billing.open.step1.title": {
    en: "Open Settings",
    ar: "افتح الإعدادات",
  },
  "copilot.guide.billing.open.step1.instruction": {
    en: "Click Settings in the sidebar to open company settings.",
    ar: "انقر على «الإعدادات» في الشريط الجانبي لفتح إعدادات الشركة.",
  },
  "copilot.guide.billing.open.step2.title": {
    en: "Open Billing",
    ar: "افتح الفوترة",
  },
  "copilot.guide.billing.open.step2.instruction": {
    en: "Click the Billing tab to see plans, invoices, and payment methods.",
    ar: "انقر على تبويب «الفوترة» لعرض الخطط والفواتير ووسائل الدفع.",
  },

  // ── chat.ask ───────────────────────────────────────────────────────────────
  "copilot.guide.chat.ask.title": {
    en: "Ask the assistant",
    ar: "اسأل المساعد",
  },
  "copilot.guide.chat.ask.step1.title": {
    en: "Open Chat",
    ar: "افتح المحادثة",
  },
  "copilot.guide.chat.ask.step1.instruction": {
    en: "Click Chat in the sidebar to open the assistant.",
    ar: "انقر على «المحادثة» في الشريط الجانبي لفتح المساعد.",
  },
  "copilot.guide.chat.ask.step2.title": {
    en: "Type your question",
    ar: "اكتب سؤالك",
  },
  "copilot.guide.chat.ask.step2.instruction": {
    en: "Type your question in the message box.",
    ar: "اكتب سؤالك في مربع الرسالة.",
  },
  "copilot.guide.chat.ask.step3.title": {
    en: "Send the message",
    ar: "أرسل الرسالة",
  },
  "copilot.guide.chat.ask.step3.instruction": {
    en: "Click the send button to get an answer with citations.",
    ar: "انقر على زر الإرسال للحصول على إجابة مع الاستشهادات.",
  },

  // ── documents.archive ──────────────────────────────────────────────────────
  "copilot.guide.documents.archive.title": {
    en: "Archive a document",
    ar: "أرشف مستندًا",
  },
  "copilot.guide.documents.archive.step1.title": {
    en: "Open Documents",
    ar: "افتح المستندات",
  },
  "copilot.guide.documents.archive.step1.instruction": {
    en: "Click Documents in the sidebar to open the documents page.",
    ar: "انقر على «المستندات» في الشريط الجانبي لفتح صفحة المستندات.",
  },
  "copilot.guide.documents.archive.step2.title": {
    en: "Find the document",
    ar: "ابحث عن المستند",
  },
  "copilot.guide.documents.archive.step2.instruction": {
    en: "Type the document name in the search field to find it.",
    ar: "اكتب اسم المستند في حقل البحث للعثور عليه.",
  },
  "copilot.guide.documents.archive.step3.title": {
    en: "Open the document",
    ar: "افتح المستند",
  },
  "copilot.guide.documents.archive.step3.instruction": {
    en: "Click the view button to open the document details.",
    ar: "انقر على زر العرض لفتح تفاصيل المستند.",
  },
  "copilot.guide.documents.archive.step4.title": {
    en: "Archive it",
    ar: "أرشف المستند",
  },
  "copilot.guide.documents.archive.step4.instruction": {
    en: "Click Archive in the drawer. Archived documents are hidden from the main list.",
    ar: "انقر على «أرشف» في اللوحة الجانبية. تُخفى المستندات المؤرشفة من القائمة الرئيسية.",
  },

  // ── documents.restore ──────────────────────────────────────────────────────
  "copilot.guide.documents.restore.title": {
    en: "Restore an archived document",
    ar: "استعادة مستند مؤرشف",
  },
  "copilot.guide.documents.restore.step1.title": {
    en: "Open Documents",
    ar: "افتح المستندات",
  },
  "copilot.guide.documents.restore.step1.instruction": {
    en: "Click Documents in the sidebar to open the documents page.",
    ar: "انقر على «المستندات» في الشريط الجانبي لفتح صفحة المستندات.",
  },
  "copilot.guide.documents.restore.step2.title": {
    en: "Show archived documents",
    ar: "اعرض المستندات المؤرشفة",
  },
  "copilot.guide.documents.restore.step2.instruction": {
    en: "Turn on the “Show archived” option to reveal archived documents.",
    ar: "فعّل خيار «عرض المؤرشف» لإظهار المستندات المؤرشفة.",
  },
  "copilot.guide.documents.restore.step3.title": {
    en: "Open the document",
    ar: "افتح المستند",
  },
  "copilot.guide.documents.restore.step3.instruction": {
    en: "Click the view button on the archived document you want to restore.",
    ar: "انقر على زر العرض للمستند المؤرشف الذي تريد استعادته.",
  },
  "copilot.guide.documents.restore.step4.title": {
    en: "Restore it",
    ar: "استعد المستند",
  },
  "copilot.guide.documents.restore.step4.instruction": {
    en: "Click Restore in the drawer to bring the document back to the main list.",
    ar: "انقر على «استعادة» في اللوحة الجانبية لإعادة المستند إلى القائمة الرئيسية.",
  },

  // ── documents.replace ──────────────────────────────────────────────────────
  "copilot.guide.documents.replace.title": {
    en: "Replace a document file",
    ar: "استبدال ملف مستند",
  },
  "copilot.guide.documents.replace.step1.title": {
    en: "Open Documents",
    ar: "افتح المستندات",
  },
  "copilot.guide.documents.replace.step1.instruction": {
    en: "Click Documents in the sidebar to open the documents page.",
    ar: "انقر على «المستندات» في الشريط الجانبي لفتح صفحة المستندات.",
  },
  "copilot.guide.documents.replace.step2.title": {
    en: "Find the document",
    ar: "ابحث عن المستند",
  },
  "copilot.guide.documents.replace.step2.instruction": {
    en: "Type the document name in the search field to find it.",
    ar: "اكتب اسم المستند في حقل البحث للعثور عليه.",
  },
  "copilot.guide.documents.replace.step3.title": {
    en: "Open the document",
    ar: "افتح المستند",
  },
  "copilot.guide.documents.replace.step3.instruction": {
    en: "Click the view button to open the document details.",
    ar: "انقر على زر العرض لفتح تفاصيل المستند.",
  },
  "copilot.guide.documents.replace.step4.title": {
    en: "Start a replacement",
    ar: "ابدأ الاستبدال",
  },
  "copilot.guide.documents.replace.step4.instruction": {
    en: "Click Replace in the drawer to open the replacement form.",
    ar: "انقر على «استبدال» في اللوحة الجانبية لفتح نموذج الاستبدال.",
  },
  "copilot.guide.documents.replace.step5.title": {
    en: "Pick the new file",
    ar: "اختر الملف الجديد",
  },
  "copilot.guide.documents.replace.step5.instruction": {
    en: "Choose the new file you want to upload. You can add a change description too.",
    ar: "اختر الملف الجديد الذي تريد رفعه. يمكنك أيضًا إضافة وصف للتغيير.",
  },
  "copilot.guide.documents.replace.step6.title": {
    en: "Finish the replacement",
    ar: "أكمل الاستبدال",
  },
  "copilot.guide.documents.replace.step6.instruction": {
    en: "Click Replace to upload the new version. The document will be reprocessed.",
    ar: "انقر على «استبدال» لرفع النسخة الجديدة. ستتم إعادة معالجة المستند.",
  },

  // ── documents.failedReview ─────────────────────────────────────────────────
  "copilot.guide.documents.failedReview.title": {
    en: "Review failed processing",
    ar: "مراجعة المعالجة الفاشلة",
  },
  "copilot.guide.documents.failedReview.step1.title": {
    en: "Open Failed Processing",
    ar: "افتح «المعالجة الفاشلة»",
  },
  "copilot.guide.documents.failedReview.step1.instruction": {
    en: "Click Failed Processing in the sidebar to open the failed documents page.",
    ar: "انقر على «المعالجة الفاشلة» في الشريط الجانبي لفتح صفحة المستندات الفاشلة.",
  },
  "copilot.guide.documents.failedReview.step2.title": {
    en: "Review the failures",
    ar: "راجع حالات الفشل",
  },
  "copilot.guide.documents.failedReview.step2.instruction": {
    en: "Review the failed documents and their error details. You can retry or reprocess them from the document drawer.",
    ar: "راجع المستندات الفاشلة وتفاصيل الأخطاء. يمكنك إعادة المحاولة أو إعادة المعالجة من لوحة المستند.",
  },

  // ── taxonomy.manage ────────────────────────────────────────────────────────
  "copilot.guide.taxonomy.manage.title": {
    en: "Manage document taxonomy",
    ar: "إدارة تصنيفات المستندات",
  },
  "copilot.guide.taxonomy.manage.step1.title": {
    en: "Open Document Taxonomy",
    ar: "افتح تصنيفات المستندات",
  },
  "copilot.guide.taxonomy.manage.step1.instruction": {
    en: "Click Document Taxonomy in the sidebar to open the taxonomy settings.",
    ar: "انقر على «تصنيفات المستندات» في الشريط الجانبي لفتح إعدادات التصنيفات.",
  },
  "copilot.guide.taxonomy.manage.step2.title": {
    en: "Create an entry",
    ar: "أنشئ تصنيفًا",
  },
  "copilot.guide.taxonomy.manage.step2.instruction": {
    en: "Click the Create button to add a new category, department, or classification.",
    ar: "انقر على زر «إنشاء» لإضافة فئة أو قسم أو تصنيف جديد.",
  },
  "copilot.guide.taxonomy.manage.step3.title": {
    en: "Fill in the details",
    ar: "املأ التفاصيل",
  },
  "copilot.guide.taxonomy.manage.step3.instruction": {
    en: "Enter a name and description, then save the entry to activate it.",
    ar: "أدخل اسمًا ووصفًا ثم احفظ التصنيف لتفعيله.",
  },

  // ── users.resendInvitation ─────────────────────────────────────────────────
  "copilot.guide.users.resendInvitation.title": {
    en: "Resend an invitation",
    ar: "إعادة إرسال دعوة",
  },
  "copilot.guide.users.resendInvitation.step1.title": {
    en: "Open Users",
    ar: "افتح المستخدمين",
  },
  "copilot.guide.users.resendInvitation.step1.instruction": {
    en: "Click Users in the sidebar to open the users page.",
    ar: "انقر على «المستخدمين» في الشريط الجانبي لفتح صفحة المستخدمين.",
  },
  "copilot.guide.users.resendInvitation.step2.title": {
    en: "Find the pending invite",
    ar: "ابحث عن الدعوة المعلقة",
  },
  "copilot.guide.users.resendInvitation.step2.instruction": {
    en: "Find the user with a pending invitation in the table.",
    ar: "ابحث في الجدول عن المستخدم ذي الدعوة المعلقة.",
  },
  "copilot.guide.users.resendInvitation.step3.title": {
    en: "Resend it",
    ar: "أعد الإرسال",
  },
  "copilot.guide.users.resendInvitation.step3.instruction": {
    en: "Click Resend on the user's row to deliver the invitation email again.",
    ar: "انقر على «إعادة الإرسال» في صف المستخدم لتسليم بريد الدعوة مجددًا.",
  },

  // ── users.revokeInvitation ─────────────────────────────────────────────────
  "copilot.guide.users.revokeInvitation.title": {
    en: "Revoke an invitation",
    ar: "إلغاء دعوة",
  },
  "copilot.guide.users.revokeInvitation.step1.title": {
    en: "Open Users",
    ar: "افتح المستخدمين",
  },
  "copilot.guide.users.revokeInvitation.step1.instruction": {
    en: "Click Users in the sidebar to open the users page.",
    ar: "انقر على «المستخدمين» في الشريط الجانبي لفتح صفحة المستخدمين.",
  },
  "copilot.guide.users.revokeInvitation.step2.title": {
    en: "Find the pending invite",
    ar: "ابحث عن الدعوة المعلقة",
  },
  "copilot.guide.users.revokeInvitation.step2.instruction": {
    en: "Find the user with a pending invitation in the table.",
    ar: "ابحث في الجدول عن المستخدم ذي الدعوة المعلقة.",
  },
  "copilot.guide.users.revokeInvitation.step3.title": {
    en: "Revoke it",
    ar: "ألغِ الدعوة",
  },
  "copilot.guide.users.revokeInvitation.step3.instruction": {
    en: "Click Revoke on the user's row and confirm in the dialog.",
    ar: "انقر على «إلغاء» في صف المستخدم ثم أكّد في نافذة التأكيد.",
  },

  // ── users.remove ───────────────────────────────────────────────────────────
  "copilot.guide.users.remove.title": {
    en: "Remove a user",
    ar: "إزالة مستخدم",
  },
  "copilot.guide.users.remove.step1.title": {
    en: "Open Users",
    ar: "افتح المستخدمين",
  },
  "copilot.guide.users.remove.step1.instruction": {
    en: "Click Users in the sidebar to open the users page.",
    ar: "انقر على «المستخدمين» في الشريط الجانبي لفتح صفحة المستخدمين.",
  },
  "copilot.guide.users.remove.step2.title": {
    en: "Find the user",
    ar: "ابحث عن المستخدم",
  },
  "copilot.guide.users.remove.step2.instruction": {
    en: "Find the user you want to remove in the table.",
    ar: "ابحث في الجدول عن المستخدم الذي تريد إزالته.",
  },
  "copilot.guide.users.remove.step3.title": {
    en: "Delete the user",
    ar: "احذف المستخدم",
  },
  "copilot.guide.users.remove.step3.instruction": {
    en: "Click Delete on the user's row and confirm. This action cannot be undone.",
    ar: "انقر على «حذف» في صف المستخدم وأكّد. لا يمكن التراجع عن هذا الإجراء.",
  },

  // ── roles.create ───────────────────────────────────────────────────────────
  "copilot.guide.roles.create.title": {
    en: "Create a role",
    ar: "إنشاء دور",
  },
  "copilot.guide.roles.create.step1.title": {
    en: "Open Roles",
    ar: "افتح الأدوار",
  },
  "copilot.guide.roles.create.step1.instruction": {
    en: "Click Roles in the sidebar to open the roles page.",
    ar: "انقر على «الأدوار» في الشريط الجانبي لفتح صفحة الأدوار.",
  },
  "copilot.guide.roles.create.step2.title": {
    en: "Start creating",
    ar: "ابدأ الإنشاء",
  },
  "copilot.guide.roles.create.step2.instruction": {
    en: "Click the Create Role button to open the role form.",
    ar: "انقر على زر «إنشاء دور» لفتح نموذج الدور.",
  },
  "copilot.guide.roles.create.step3.title": {
    en: "Name the role",
    ar: "سمِّ الدور",
  },
  "copilot.guide.roles.create.step3.instruction": {
    en: "Type a name for the role, choose a base role, and select the permissions to delegate.",
    ar: "اكتب اسمًا للدور، واختر الدور الأساسي، وحدد الصلاحيات المطلوب منحها.",
  },
  "copilot.guide.roles.create.step4.title": {
    en: "Create the role",
    ar: "أنشئ الدور",
  },
  "copilot.guide.roles.create.step4.instruction": {
    en: "Click Create Role at the bottom of the form to save the new role.",
    ar: "انقر على «إنشاء دور» أسفل النموذج لحفظ الدور الجديد.",
  },

  // ── settings.updateProfile ─────────────────────────────────────────────────
  "copilot.guide.settings.updateProfile.title": {
    en: "Update company profile",
    ar: "تحديث بيانات الشركة",
  },
  "copilot.guide.settings.updateProfile.step1.title": {
    en: "Open Settings",
    ar: "افتح الإعدادات",
  },
  "copilot.guide.settings.updateProfile.step1.instruction": {
    en: "Click Settings in the sidebar to open company settings.",
    ar: "انقر على «الإعدادات» في الشريط الجانبي لفتح إعدادات الشركة.",
  },
  "copilot.guide.settings.updateProfile.step2.title": {
    en: "Edit the profile",
    ar: "عدّل البيانات",
  },
  "copilot.guide.settings.updateProfile.step2.instruction": {
    en: "In the company profile section, update the name, logo, and preferences.",
    ar: "في قسم الملف التعريفي للشركة، حدّث الاسم والشعار والتفضيلات.",
  },
  "copilot.guide.settings.updateProfile.step3.title": {
    en: "Save the changes",
    ar: "احفظ التغييرات",
  },
  "copilot.guide.settings.updateProfile.step3.instruction": {
    en: "Click Save changes at the bottom of the page to apply the updates.",
    ar: "انقر على «حفظ التغييرات» أسفل الصفحة لتطبيق التحديثات.",
  },

  // ── usage.view ─────────────────────────────────────────────────────────────
  "copilot.guide.usage.view.title": {
    en: "View usage and limits",
    ar: "عرض الاستخدام والحدود",
  },
  "copilot.guide.usage.view.step1.title": {
    en: "Open Usage & Limits",
    ar: "افتح «الاستخدام والحدود»",
  },
  "copilot.guide.usage.view.step1.instruction": {
    en: "Click Usage & Limits in the sidebar to open the usage page.",
    ar: "انقر على «الاستخدام والحدود» في الشريط الجانبي لفتح صفحة الاستخدام.",
  },
  "copilot.guide.usage.view.step2.title": {
    en: "Review your usage",
    ar: "راجع استخدامك",
  },
  "copilot.guide.usage.view.step2.instruction": {
    en: "Review storage, document, and feature usage against your plan limits.",
    ar: "راجع استخدام التخزين والمستندات والميزات مقارنة بحدود خطتك.",
  },

  // ── navigate (generic section navigation) ─────────────────────────────────
  // `{label}` is interpolated with the section's localized name.
  "copilot.guide.navigate.step1.title": {
    en: "Open {label}",
    ar: "افتح {label}",
  },
  "copilot.guide.navigate.step1.instruction": {
    en: "Click \u201C{label}\u201D in the sidebar to open this section.",
    ar: "انقر على «{label}» في الشريط الجانبي لفتح هذا القسم.",
  },
  "copilot.guide.navigate.step2.title": {
    en: "You're viewing {label}",
    ar: "أنت تستعرض {label}",
  },
  "copilot.guide.navigate.step2.instruction": {
    en: "You're now on the {label} page. Explore the section, then click Finish when you're done.",
    ar: "أنت الآن في صفحة {label}. استكشف القسم ثم انقر على «إنهاء» عند الانتهاء.",
  },

  // ── platform.tour (newcomer onboarding) ───────────────────────────────────
  "copilot.guide.platform.tour.title": {
    en: "Platform Tour",
    ar: "جولة في المنصة",
  },
  "copilot.guide.platform.tour.step1.title": {
    en: "Welcome to DocuMind!",
    ar: "أهلاً بك في DocuMind!",
  },
  "copilot.guide.platform.tour.step1.instruction": {
    en: "Let me show you around — follow the light and we'll visit every corner of the platform together.",
    ar: "دعني أعرّفك على المنصة — اتبع الضوء وسنزور كل زاوية معاً.",
  },
  "copilot.guide.platform.tour.step2.title": {
    en: "Your cockpit",
    ar: "لوحة القيادة",
  },
  "copilot.guide.platform.tour.step2.instruction": {
    en: "This is your mission control: documents processed, storage used, and the pulse of your team at a glance.",
    ar: "هذه غرفة القيادة: المستندات المُعالجة، مساحة التخزين، ونبض فريقك في نظرة واحدة.",
  },
  "copilot.guide.platform.tour.step3.title": {
    en: "The memory vault",
    ar: "خزانة الذاكرة",
  },
  "copilot.guide.platform.tour.step3.instruction": {
    en: "Time to meet the heart of DocuMind — your document library.",
    ar: "حان وقت التعرف على قلب DocuMind — مكتبة مستنداتك.",
  },
  "copilot.guide.platform.tour.step4.title": {
    en: "Your document library",
    ar: "مكتبة المستندات",
  },
  "copilot.guide.platform.tour.step4.instruction": {
    en: "Every file your company owns lives here: upload, search, tag, and organize in seconds.",
    ar: "كل ملف تملكه شركتك يعيش هنا: ارفع، ابحث، صنّف، ونظّم في ثوانٍ.",
  },
  "copilot.guide.platform.tour.step5.title": {
    en: "Where files come in",
    ar: "حيث تدخل الملفات",
  },
  "copilot.guide.platform.tour.step5.instruction": {
    en: "This button starts everything — drop a file here and the AI reads, understands, and stores it for you.",
    ar: "من هنا يبدأ كل شيء — أسقط ملفاً هنا وسيقوم الذكاء الاصطناعي بقراءته وفهمه وحفظه لك.",
  },
  "copilot.guide.platform.tour.step6.title": {
    en: "The team roster",
    ar: "فريق العمل",
  },
  "copilot.guide.platform.tour.step6.instruction": {
    en: "Let's meet the people — your teammates and their access.",
    ar: "لنتعرف على الفريق — زملاؤك وصلاحياتهم.",
  },
  "copilot.guide.platform.tour.step7.title": {
    en: "Manage your team",
    ar: "إدارة الفريق",
  },
  "copilot.guide.platform.tour.step7.instruction": {
    en: "Invite teammates, resend invitations, or remove members — everyone's access is controlled here.",
    ar: "ادعُ زملاءك، أعد إرسال الدعوات، أو أزل الأعضاء — كل الصلاحيات تُدار من هنا.",
  },
  "copilot.guide.platform.tour.step8.title": {
    en: "Who can do what",
    ar: "من يفعل ماذا",
  },
  "copilot.guide.platform.tour.step8.instruction": {
    en: "Roles are the rulebook — let's see how permissions are designed.",
    ar: "الأدوار هي دليل الصلاحيات — لنرَ كيف تُصمم الأذونات.",
  },
  "copilot.guide.platform.tour.step9.title": {
    en: "Design permissions",
    ar: "صمّم الصلاحيات",
  },
  "copilot.guide.platform.tour.step9.instruction": {
    en: "Roles decide who can see and do what. Create custom roles so every teammate has exactly the right access.",
    ar: "الأدوار تحدد من يرى وماذا يفعل. أنشئ أدواراً مخصصة ليحصل كل زميل على الصلاحية المناسبة تماماً.",
  },
  "copilot.guide.platform.tour.step10.title": {
    en: "Company HQ",
    ar: "مقر الشركة",
  },
  "copilot.guide.platform.tour.step10.instruction": {
    en: "Next stop: the control room for your company identity.",
    ar: "المحطة التالية: غرفة التحكم بهوية شركتك.",
  },
  "copilot.guide.platform.tour.step11.title": {
    en: "Your company profile",
    ar: "الملف التعريفي للشركة",
  },
  "copilot.guide.platform.tour.step11.instruction": {
    en: "Name, logo, language, and preferences — everything that makes your workspace yours.",
    ar: "الاسم والشعار واللغة والتفضيلات — كل ما يجعل مساحة عملك خاصة بكم.",
  },
  "copilot.guide.platform.tour.step12.title": {
    en: "The filing system",
    ar: "نظام الأرشفة",
  },
  "copilot.guide.platform.tour.step12.instruction": {
    en: "Messy files? Not here — let's see how everything gets organized.",
    ar: "ملفات مبعثرة؟ ليس هنا — لنرَ كيف يتم تنظيم كل شيء.",
  },
  "copilot.guide.platform.tour.step13.title": {
    en: "Organize with categories",
    ar: "نظّم بالفئات",
  },
  "copilot.guide.platform.tour.step13.instruction": {
    en: "Categories, departments, and classifications keep every document neatly filed and easy to find.",
    ar: "الفئات والأقسام والتصنيفات تُبقي كل مستند مرتّباً وسهل الوصول.",
  },
  "copilot.guide.platform.tour.step14.title": {
    en: "The wallet",
    ar: "المحفظة",
  },
  "copilot.guide.platform.tour.step14.instruction": {
    en: "Every product has a checkout — let's look at the plan.",
    ar: "كل منتج له فاتورة — لنلقِ نظرة على الخطة.",
  },
  "copilot.guide.platform.tour.step15.title": {
    en: "Your plan & invoices",
    ar: "الخطة والفواتير",
  },
  "copilot.guide.platform.tour.step15.instruction": {
    en: "See your plan, invoices, and payment methods — and upgrade whenever you're ready.",
    ar: "اطّلع على خطتك وفواتيرك ووسائل الدفع — ورقِّ خطتك متى كنت جاهزاً.",
  },
  "copilot.guide.platform.tour.step16.title": {
    en: "The fuel gauge",
    ar: "مؤشر الوقود",
  },
  "copilot.guide.platform.tour.step16.instruction": {
    en: "Almost there — let's check how much you have left.",
    ar: "بقيت خطوة — لنرَ كم تبقى لديك.",
  },
  "copilot.guide.platform.tour.step17.title": {
    en: "Track your usage",
    ar: "تتبّع استخدامك",
  },
  "copilot.guide.platform.tour.step17.instruction": {
    en: "Storage, documents, and AI usage against your limits — so you never run out of surprises.",
    ar: "مساحة التخزين والمستندات واستخدام الذكاء الاصطناعي مقابل حدودك — حتى لا تفاجئك النفاد.",
  },
  "copilot.guide.platform.tour.step18.title": {
    en: "Your assistant's home",
    ar: "موطن مساعدك",
  },
  "copilot.guide.platform.tour.step18.instruction": {
    en: "One last stop — the place we're in right now.",
    ar: "المحطة الأخيرة — المكان الذي نحن فيه الآن.",
  },
  "copilot.guide.platform.tour.step19.title": {
    en: "You're all set!",
    ar: "انتهينا!",
  },
  "copilot.guide.platform.tour.step19.instruction": {
    en: "That's the whole platform! Ask me anything anytime — I'm always one click away.",
    ar: "هذه هي المنصة كاملة! اسألني أي شيء في أي وقت — أنا على بُعد نقرة واحدة.",
  },

  // ── Clarification (assistant panel) ────────────────────────────────────────
  "copilot.clarify.defaultMessage": {
    en: "I couldn't understand your request. Could you please clarify?",
    ar: "لم أتمكن من فهم طلبك. هل يمكنك التوضيح؟",
  },
  "copilot.clarify.capabilityUnavailable": {
    en: "I can walk you through this, but I can't do it directly for you yet.",
    ar: "يمكنني أن أرشدك خطوة بخطوة، لكن لا أستطيع تنفيذ ذلك مباشرةً لك بعد.",
  },
  "copilot.clarify.roleCreateUnavailable": {
    en: "I can guide you through creating a role, but I can't create roles directly for you yet.",
    ar: "يمكنني أن أرشدك خلال إنشاء الدور، لكن لا أستطيع إنشاء الأدوار مباشرةً لك بعد.",
  },
};

export function localizeGuideKey(key: string, locale: Locale): string {
  const message = GUIDE_I18N[key];
  if (!message) return key;
  return message[locale];
}

/**
 * Every guide step titleKey/instructionKey must resolve to a real translation.
 * A missing key means the localized title would leak the raw key to the client.
 */
export function validateGuideI18nKeys(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];
  for (const flow of getAllGuideFlows() as GuideFlow[]) {
    if (!GUIDE_I18N[flow.titleKey]) missing.push(flow.titleKey);
    for (const step of flow.steps) {
      if (!GUIDE_I18N[step.titleKey]) missing.push(step.titleKey);
      if (!GUIDE_I18N[step.instructionKey]) missing.push(step.instructionKey);
    }
  }
  return { valid: missing.length === 0, missing };
}
