import test from "node:test";
import assert from "node:assert/strict";
import { extractEntities, extractTemporalConstraints } from "../intentQuery.entityExtractor.js";

test("Entity Extractor utility", async (t) => {
  await t.test("should extract quoted phrases", () => {
    const text = 'Find documents about "vacation policy" and «سياسة العمل»';
    const entities = extractEntities(text, "en");

    const quoted = entities.filter((e) => e.type === "quoted_phrase");
    assert.equal(quoted.length, 2);
    assert.equal(quoted[0].text, "vacation policy");
    assert.equal(quoted[0].preserveExact, true);
    assert.equal(quoted[1].text, "سياسة العمل");
    assert.equal(quoted[1].preserveExact, true);
  });

  await t.test("should extract document references", () => {
    const text = "Please scan doc-12345 and pdf-999";
    const entities = extractEntities(text, "ar");

    const docRefs = entities.filter((e) => e.type === "document_title");
    assert.equal(docRefs.length, 2);
    assert.equal(docRefs[0].text.toLowerCase(), "doc-12345");
    assert.equal(docRefs[1].text.toLowerCase(), "pdf-999");
  });

  await t.test("should extract clause numbers", () => {
    const text = "As per Article 12.3 and المادة ٥.أ";
    const entities = extractEntities(text, "en");

    const clauses = entities.filter((e) => e.type === "clause_number");
    assert.equal(clauses.length, 2);
    assert.equal(clauses[0].text, "Article 12.3");
    assert.equal(clauses[1].text, "المادة ٥");
  });

  await t.test("should extract standard dates and Arabic dates", () => {
    const text = "Start date: 2024-01-15, End date: 15 يناير 2024";
    const entities = extractEntities(text, "en");

    const dates = entities.filter((e) => e.type === "date");
    assert.equal(dates.length, 2);
    assert.equal(dates[0].text, "2024-01-15");
    assert.equal(dates[1].text, "15 يناير 2024");
  });

  await t.test("should extract temporal constraints in English and Arabic", () => {
    const englishText = "Find reports before 2023, files since 2018, and plans between 2020 and 2022. Also check documents in 2021.";
    const englishConstraints = extractTemporalConstraints(englishText);

    assert.equal(englishConstraints.length, 4);
    assert.equal(englishConstraints.find(c => c.type === "before")?.value, "2023");
    assert.equal(englishConstraints.find(c => c.type === "after")?.value, "2018");
    assert.equal(englishConstraints.find(c => c.type === "between")?.value, "2020-2022");
    assert.equal(englishConstraints.find(c => c.type === "exact")?.value, "2021");

    const arabicText = "ابحث عن ملفات قبل 2022، ومستندات بعد عام 2015، وقوانين بين 2018 و 2020، وقرارات في 2019.";
    const arabicConstraints = extractTemporalConstraints(arabicText);

    assert.equal(arabicConstraints.length, 4);
    assert.equal(arabicConstraints.find(c => c.type === "before")?.value, "2022");
    assert.equal(arabicConstraints.find(c => c.type === "after")?.value, "2015");
    assert.equal(arabicConstraints.find(c => c.type === "between")?.value, "2018-2020");
    assert.equal(arabicConstraints.find(c => c.type === "exact")?.value, "2019");
  });
});

