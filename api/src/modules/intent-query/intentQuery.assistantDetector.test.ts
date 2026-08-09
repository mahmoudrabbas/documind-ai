import assert from "node:assert/strict";
import test from "node:test";
import { detectAssistantIntent } from "./intentQuery.assistantDetector.js";

test("detects assistant identity variants conservatively", () => {
  const questions = [
    "انت مين؟", "مين حضرتك؟", "من أنت؟", "Who are you?", "What are you?",
    "What is DocuMind?", "انت DocuMind AI؟", "عرف نفسك", "انت ميين",
    "انت مينن", "مين انتا", "who r u", "who are u",
  ];
  for (const question of questions) {
    assert.deepEqual(detectAssistantIntent(question), {
      kind: "identity",
      isAssistantOnly: true,
      knowledgeRemainder: null,
    }, question);
  }
});

test("detects assistant capability variants conservatively", () => {
  const questions = [
    "انت بتعمل ايه؟", "بتعرف تعمل ايه؟", "بتعمل اية", "بتعمل اي",
    "تقدر تساعدني في ايه؟", "ممكن تساعدني بإيه؟", "ايه قدراتك؟",
    "ايه قدراتكك", "وظيفتك ايه؟", "دورك ايه؟", "What can you do?",
    "What can you help me with?", "What are your capabilities?",
    "What is your role?", "what can u do", "what can you do يا DocuMind؟",
    "انت بتعمل ايه exactly؟",
  ];
  for (const question of questions) {
    assert.deepEqual(detectAssistantIntent(question), {
      kind: "capabilities",
      isAssistantOnly: true,
      knowledgeRemainder: null,
    }, question);
  }
});

test("preserves the substantive request in mixed assistant and knowledge turns", () => {
  const cases = [
    ["انت مين وكام يوم الإجازة السنوية؟", "identity", "كام يوم الإجازة السنوية؟"],
    ["عرف نفسك وبعدها قولي سياسة الإجازات", "identity", "قولي سياسة الإجازات"],
    ["Who are you and what is our annual leave policy?", "identity", "what is our annual leave policy?"],
    ["What can you do, and summarize HR_Policy.pdf", "capabilities", "summarize HR_Policy.pdf"],
  ] as const;
  for (const [question, kind, remainder] of cases) {
    assert.deepEqual(detectAssistantIntent(question), {
      kind,
      isAssistantOnly: false,
      knowledgeRemainder: remainder,
    }, question);
  }
});

test("does not absorb social, knowledge, unsupported, or gibberish boundaries", () => {
  for (const question of [
    "شكرا يا قائد", "شجرا", "What is our leave policy?", "What is the weather today?", "asdasd",
  ]) {
    assert.deepEqual(detectAssistantIntent(question), {
      kind: null,
      isAssistantOnly: false,
      knowledgeRemainder: null,
    }, question);
  }
});

