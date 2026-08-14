# Plan: Newcomer "Platform Tour" — assistant walks the user through the whole platform

## Objective
Give newcomers an optional guided tour: the copilot assistant explains the whole platform step-by-step, visiting the 8 core tenant sections with simple, creative EN/AR explanations. Reuses the existing guide overlay (spotlight + tooltip + `route_change` auto-navigation) — a tour is just a long flow.

## Decisions (user-confirmed)
- Offer placement: **welcome card inside the copilot panel** (above chat when idle), plus the tour stays in the panel's flow catalog under the existing "platform" category.
- Newcomer detection: **account age < 30 days** (needs `createdAt` in `/auth/me`) + **localStorage** flags per user id.
- Scope: **core 8 sections** — Overview, Documents, Users, Roles, Settings, Taxonomy, Billing, Usage, Chat (~19 steps). Permission-filtered automatically for employees.

## Backend (api/)

### 1. `api/src/modules/copilot/guide/guideFlows.ts`
Add `platform.tour` flow at the end of `GUIDE_FLOWS` (after `usage.view`), before `] as const;`:

```ts
{
  flowId: "platform.tour",
  titleKey: "copilot.guide.platform.tour.title",
  requiredPermissions: [],
  entryRoute: "/dashboard",
  steps: [ /* 19 steps below */ ],
},
```

Steps (nav steps: `step(id, order, titleKey, instrKey, targetId, "auto", "navigate", "route_change", route, false, "wait", 8000)`; observe steps: `step(id, order, titleKey, instrKey, targetId, "top", "observe", "manual")`):

| # | target | interaction | route |
|---|--------|-------------|-------|
| 1 | nav-overview | navigate | /dashboard |
| 2 | page-heading-overview | observe | |
| 3 | nav-documents | navigate | /dashboard/documents |
| 4 | page-heading-documents | observe | |
| 5 | documents-upload-button | observe | |
| 6 | nav-users | navigate | /dashboard/users |
| 7 | page-heading-users | observe | |
| 8 | nav-roles | navigate | /dashboard/roles |
| 9 | page-heading-roles | observe | |
| 10 | nav-settings | navigate | /dashboard/settings |
| 11 | page-heading-settings | observe | |
| 12 | nav-document-taxonomy | navigate | /dashboard/settings/document-taxonomy |
| 13 | page-heading-document-taxonomy | observe | |
| 14 | nav-billing | navigate | /dashboard/settings/billing |
| 15 | page-heading-billing | observe | |
| 16 | nav-company-usage | navigate | /company/usage |
| 17 | page-heading-usage | observe | |
| 18 | nav-chat | navigate | /dashboard/chat |
| 19 | page-heading-chat | observe | (outro) |

### 2. `api/src/modules/copilot/guide/guide.i18n.ts`
Add `copilot.guide.platform.tour.*` keys (title + step1..19 title/instruction, `{en, ar}`). Creative copy (concise, friendly):

- title: "Platform Tour" / "جولة في المنصة"
- step1: "Welcome to DocuMind!" / "أهلاً بك في DocuMind!" — "Let me show you around — follow the light and we'll visit every corner of the platform together." / "دعني أعرّفك على المنصة — اتبع الضوء وسنزور كل زاوية معاً."
- step2 (overview): "Your cockpit" / "لوحة القيادة" — "This is your mission control: documents processed, storage used, and the pulse of your team at a glance." / "هذه غرفة القيادة: المستندات المُعالجة، مساحة التخزين، ونبض فريقك في نظرة واحدة."
- step3 (documents nav): "The memory vault" / "خزانة الذاكرة" — "Time to meet the heart of DocuMind — your document library." / "حان وقت التعرف على قلب DocuMind — مكتبة مستنداتك."
- step4 (documents): "Your document library" / "مكتبة المستندات" — "Every file your company owns lives here: upload, search, tag, and organize in seconds." / "كل ملف تملكه شركتك يعيش هنا: ارفع، ابحث، صنّف، ونظّم في ثوانٍ."
- step5 (upload button): "Where files come in" / "حيث تدخل الملفات" — "This button starts everything — drop a file here and the AI reads, understands, and stores it for you." / "من هنا يبدأ كل شيء — أسقط ملفاً هنا وسيقوم الذكاء الاصطناعي بقراءته وفهمه وحفظه لك."
- step6 (users nav): "The team roster" / "فريق العمل" — "Let's meet the people — your teammates and their access." / "لنتعرف على الفريق — زملاؤك وصلاحياتهم."
- step7 (users): "Manage your team" / "إدارة الفريق" — "Invite teammates, resend invitations, or remove members — everyone's access is controlled here." / "ادعُ زملاءك، أعد إرسال الدعوات، أو أزل الأعضاء — كل الصلاحيات تُدار من هنا."
- step8 (roles nav): "Who can do what" / "من يفعل ماذا" — "Roles are the rulebook — let's see how permissions are designed." / "الأدوار هي دليل الصلاحيات — لنرَ كيف تُصمم الأذونات."
- step9 (roles): "Design permissions" / "صمّم الصلاحيات" — "Roles decide who can see and do what. Create custom roles so every teammate has exactly the right access." / "الأدوار تحدد من يرى وماذا يفعل. أنشئ أدواراً مخصصة ليحصل كل زميل على الصلاحية المناسبة تماماً."
- step10 (settings nav): "Company HQ" / "مقر الشركة" — "Next stop: the control room for your company identity." / "المحطة التالية: غرفة التحكم بهوية شركتك."
- step11 (settings): "Your company profile" / "الملف التعريفي للشركة" — "Name, logo, language, and preferences — everything that makes your workspace yours." / "الاسم والشعار واللغة والتفضيلات — كل ما يجعل مساحة عملك خاصة بكم."
- step12 (taxonomy nav): "The filing system" / "نظام الأرشفة" — "Messy files? Not here — let's see how everything gets organized." / "ملفات مبعثرة؟ ليس هنا — لنرَ كيف يتم تنظيم كل شيء."
- step13 (taxonomy): "Organize with categories" / "نظّم بالفئات" — "Categories, departments, and classifications keep every document neatly filed and easy to find." / "الفئات والأقسام والتصنيفات تُبقي كل مستند مرتّباً وسهل الوصول."
- step14 (billing nav): "The wallet" / "المحفظة" — "Every product has a checkout — let's look at the plan." / "كل منتج له فاتورة — لنلقِ نظرة على الخطة."
- step15 (billing): "Your plan & invoices" / "الخطة والفواتير" — "See your plan, invoices, and payment methods — and upgrade whenever you're ready." / "اطّلع على خطتك وفواتيرك ووسائل الدفع — ورقِّ خطتك متى كنت جاهزاً."
- step16 (usage nav): "The fuel gauge" / "مؤشر الوقود" — "Almost there — let's check how much you have left." / "بقيت خطوة — لنرَ كم تبقى لديك."
- step17 (usage): "Track your usage" / "تتبّع استخدامك" — "Storage, documents, and AI usage against your limits — so you never run out of surprises." / "مساحة التخزين والمستندات واستخدام الذكاء الاصطناعي مقابل حدودك — حتى لا تفاجئك النفاد."
- step18 (chat nav): "Your assistant's home" / "موطن مساعدك" — "One last stop — the place we're in right now." / "المحطة الأخيرة — المكان الذي نحن فيه الآن."
- step19 (chat outro): "You're all set!" / "انتهينا!" — "That's the whole platform! Ask me anything anytime — I'm always one click away." / "هذه هي المنصة كاملة! اسألني أي شيء في أي وقت — أنا على بُعد نقرة واحدة."

### 3. `api/src/modules/copilot/guide/guideIntent.ts`
- `FLOW_CATEGORIES["platform.tour"] = "platform"`.
- Add to `FLOW_KEYWORDS`:
  - EN: `"tour"`, `"platform tour"`, `"guided tour"`, `"explain the platform"`, `"walk me through the platform"`, `"show me around"`, `"getting started"`, `"onboarding"`, `"introduction"`, `"introduce me to the platform"`
  - AR: `"جولة"`, `"جولة في المنصة"`, `"اشرح لي المنصة"`, `"تعرف على المنصة"`, `"شرح المنصة"`, `"من أين أبدأ"`, `"ابدأ معنا"`

### 4. `api/src/modules/copilot/guide/guideTargets.ts`
Add `page-heading-chat` entry: route `/dashboard/chat`, description "Chat page heading", `requiredPermissions: [Permission.CHAT_READ]` (mirror the pattern of other `page-heading-*` entries).

### 5. Account age — expose `createdAt` in `/auth/me`
- `api/src/modules/auth/auth.service.ts` `serializeVerifiedUser` (~line 251): add `createdAt: user.createdAt?.toISOString() ?? new Date().toISOString()`.
- `api/src/modules/auth/auth.types.ts`: `MeResult.user` (~line 145) currently `Omit<UserPublicView, "createdAt">` → change to `Omit<UserPublicView, "createdAt"> & { createdAt: string }` (keep the rest of the shape identical).

## Frontend (app/)

### 6. `app/src/lib/copilot/guide-targets.ts`
Add `page-heading-chat` entry mirroring the backend (route `/dashboard/chat`, perms `["chat:read"]`).

### 7. `app/src/app/(dashboard)/dashboard/chat/chat-client.tsx`
Add `data-guide-id="page-heading-chat"` to the header `<h3>` at ~line 713 (the chat title heading). Check the actual element and choose the right one (title heading).

### 8. `app/src/lib/copilot/tour.ts` (new, pure + testable)
```ts
export const TOUR_OFFER_WINDOW_DAYS = 30;
export function isNewcomer(createdAt: string, now = Date.now()): boolean;
export function shouldShowTourOffer(userId: string, createdAt: string, now = Date.now()): boolean; // newcomer && no started/dismissed/completed flag
export function markTourStarted(userId: string): void;
export function dismissTourOffer(userId: string): void;
export function markTourCompleted(userId: string): void;
```
localStorage keys: `documind.tour.<userId>.started|dismissed|completed`. SSR-safe (guard `typeof window`).

### 9. `app/src/components/copilot/CopilotPanel.tsx`
- Import `useAuth` for `user` (id + createdAt) — verify the auth hook path used in the app (auth-provider exports `useAuth`).
- Render welcome card above chat when: panel `open`, `mode` is idle, `shouldShowTourOffer(user.id, user.createdAt)`:
  - Icon + title (`copilot.tour.title`) + body (`copilot.tour.body`)
  - Button "Walk me through the platform" (`copilot.tour.startButton`) → `dismissTourOffer` + `markTourStarted` + `startGuide("platform.tour")`
  - Button "I'll explore on my own" (`copilot.tour.skipButton`) → `dismissTourOffer`
- Effect: when `guide?.status === "completed" && guide.session.flowId === "platform.tour"` → `markTourCompleted(user.id)`.

### 10. `app/src/providers/auth-provider.tsx`
Add `createdAt: string` to `AuthUser` type (line ~27-35). No runtime change needed (payload now includes it).

### 11. `app/src/lib/i18n/translations/en.ts` + `ar.ts`
Add under the copilot block:
```
copilot.tour.title        "New here? Let me show you around!"
copilot.tour.body         "I can walk you through the whole platform — every section, in a few friendly steps."
copilot.tour.startButton  "Walk me through the platform"
copilot.tour.skipButton   "I'll explore on my own"
```
+ Arabic equivalents.

## Tests

### api
- `guide.parity.test.ts` — auto-validates the new flow (registered targets, i18n keys EN/AR, step order uniqueness). No manual edit needed.
- `guideIntent.test.ts` — add cases: `flowOf("give me a tour of the platform","en") === "platform.tour"`, `flowOf("walk me through the platform","en") === "platform.tour"`, `flowOf("جولة في المنصة","ar") === "platform.tour"`, `flowOf("getting started","en") === "platform.tour"`.
- `platformGuideAgent.test.ts` — add: utterance "walk me through the whole platform" (COMPANY_ADMIN) → `result.output.guideSession.flowId === "platform.tour"`; and a SUPER_ADMIN/EMPLOYEE sanity check that the tour still expands (permission-filtered steps).
- `guide.sections.test.ts` — untouched.

### app
- `guide-targets.test.ts` — add `page-heading-chat` to the hardcoded mirror list.
- New `tour.test.ts` (vitest, node env or jsdom) — cover `isNewcomer` boundary (29 vs 31 days), `shouldShowTourOffer` with mocked localStorage flags, mark/dismiss/completed idempotency.
- `guide-target-parity.test.ts` — auto-covers the new app target.

## Verification
1. `node --import tsx --test` on changed api suites (guideIntent, platformGuideAgent, guide.parity, guide.sections) + harness for copilotSupervisorDecision/copilot.service/eval (auth change touches `getMe` — run `eval.test.ts` and `copilot.service.test.ts` too; also auth tests if any cover /auth/me: check `auth/__tests__`).
2. `npx vitest run src/lib/copilot` + new `tour.test.ts` in app.
3. `npm run typecheck` (api + app) and eslint on changed files.
4. `docker compose up -d --build api app`.

## Files touched
Backend: `guide/guideFlows.ts`, `guide/guide.i18n.ts`, `guide/guideIntent.ts`, `guide/guideTargets.ts`, `guide/guideIntent.test.ts`, `agents/platformGuideAgent.test.ts`, `modules/auth/auth.service.ts`, `modules/auth/auth.types.ts`.
Frontend: `lib/copilot/guide-targets.ts`, `lib/copilot/tour.ts` (new), `lib/copilot/__tests__/tour.test.ts` (new), `lib/copilot/__tests__/guide-targets.test.ts`, `components/copilot/CopilotPanel.tsx`, `providers/auth-provider.tsx`, `app/(dashboard)/dashboard/chat/chat-client.tsx`, `lib/i18n/translations/en.ts`, `lib/i18n/translations/ar.ts`.

## Edge cases
- Employee without roles/billing perms → steps filtered out by `filterStepsByPermissions`; tour still runs with remaining steps.
- Tour cancelled mid-way → `started` flag prevents the offer from nagging; offer only reappears after dismissing? No — dismissed flag set by skip button; started flag set on start → no re-offer.
- SUPER_ADMIN on tenant dashboard → flow has no requiredPermissions; step-level filtering applies; acceptable.
- `/auth/me` change: verify no existing test asserts the exact MeResult shape (run auth tests).
