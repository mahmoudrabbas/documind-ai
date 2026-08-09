import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AssistantMarkdown } from "./AssistantMarkdown";

function render(content: string) {
  return renderToStaticMarkup(<AssistantMarkdown content={content} />);
}

describe("AssistantMarkdown", () => {
  it("renders bold text", () => {
    const html = render("This is **important**.");
    expect(html).toContain("<strong>important</strong>");
  });

  it("renders headings", () => {
    const html = render("## Summary");
    expect(html).toContain("<h2");
    expect(html).toContain("Summary");
  });

  it("renders lists", () => {
    const html = render("- one\n- two");
    expect(html).toContain("<ul");
    expect(html).toContain(">one</li>");
    expect(html).toContain(">two</li>");
  });

  it("renders plain text", () => {
    const html = render("Hello from the assistant.");
    expect(html).toContain("Hello from the assistant.");
  });

  it("preserves single-line soft breaks inside paragraphs (summary lines)", () => {
    const html = render("1- a\n2- b\n3- c");
    expect(html).toContain("whitespace-pre-line");
    expect(html).toContain("1- a\n2- b\n3- c");
  });

  it("keeps soft breaks in paragraphs without breaking real lists", () => {
    const html = render("1- a\n2- b\n\n- one\n- two");
    expect(html).toContain("1- a\n2- b");
    expect(html).toContain("<ul");
    expect(html).toContain(">one</li>");
    expect(html).toContain(">two</li>");
  });

  it("does not execute script tags in raw HTML", () => {
    const html = render('<script>alert("xss")</script>\n\nSafe.');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("alert(");
    expect(html).toContain("Safe.");
  });

  it("drops raw HTML tags instead of rendering them", () => {
    const html = render('<img src="x" onerror="alert(1)">\n\nStill safe.');
    expect(html).not.toContain("<img");
    expect(html).not.toContain("onerror");
    expect(html).toContain("Still safe.");
  });

  it("never renders markdown images (no automatic remote image fetch)", () => {
    const html = render("![alt](https://evil.example.com/a.png)\nText.");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("evil.example.com");
    expect(html).toContain("Text.");
  });

  it("strips think and analysis blocks so leaked reasoning is never visible", () => {
    const html = render("<think>hidden reasoning</think>\nVisible answer.");
    expect(html).not.toContain("hidden reasoning");
    expect(html).toContain("Visible answer.");

    const html2 = render("Answer.<analysis>analysis leak</analysis>");
    expect(html2).not.toContain("analysis leak");
    expect(html2).toContain("Answer.");
  });

  it("strips unclosed think blocks", () => {
    const html = render("The total is 42.<think>never closed");
    expect(html).not.toContain("never closed");
    expect(html).toContain("The total is 42.");
  });

  it("opens external links safely with rel=noopener noreferrer", () => {
    const html = render("[docs](https://example.com/docs)");
    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("keeps in-document anchors as regular links", () => {
    const html = render("[jump](#section)");
    expect(html).toContain('href="#section"');
    expect(html).not.toContain('target="_blank"');
  });

  it("renders inline code and fenced code blocks", () => {
    const html = render("Use `const x = 1;`\n\n```ts\nconst y = 2;\n```");
    expect(html).toContain("<code");
    expect(html).toContain("const x = 1;");
    expect(html).toContain("<pre");
    expect(html).toContain("const y = 2;");
  });

  it("renders content with direction based on its script (Arabic -> rtl/ar)", () => {
    const html = render("مرحبا بالعالم");
    expect(html).toContain('dir="rtl"');
    expect(html).toContain('lang="ar"');
    expect(html).toContain("مرحبا بالعالم");
  });

  it("renders content with direction based on its script (English -> ltr/en)", () => {
    const html = render("Hello from the assistant.");
    expect(html).toContain('dir="ltr"');
    expect(html).toContain('lang="en"');
  });

  it("uses logical start padding for lists so markers flip per direction", () => {
    const rtl = render("- أول عنصر\n- ثاني عنصر");
    expect(rtl).toContain("ps-5");
    const ltr = render("- one\n- two");
    expect(ltr).toContain("ps-5");
  });

  it("renders GFM tables without raw pipe characters", () => {
    const html = render("| Name | Age |\n| --- | --- |\n| Ali | 30 |");
    expect(html).toContain("<table");
    expect(html).toContain("<th");
    expect(html).toContain("<td");
    expect(html).toContain(">Name</th>");
    expect(html).toContain(">Ali</td>");
    expect(html).not.toContain("| --- |");
  });

  it("wraps tables in a horizontal overflow container so the page never scrolls", () => {
    const html = render(
      "| A | B | C | D |\n| --- | --- | --- | --- |\n| 1 | 2 | 3 | 4 |",
    );
    const wrapper = html.match(/<div class="([^"]*overflow-x-auto[^"]*)">/);
    expect(wrapper).toBeTruthy();
    expect(wrapper![1]).toContain("max-w-full");
    expect(wrapper![1]).toContain("overflow-x-auto");
  });

  it("keeps code blocks in a horizontal overflow container", () => {
    const html = render(
      "```ts\nconst long = 'line with lots of content';\n```",
    );
    const pre = html.match(/<pre class="([^"]+)"/);
    expect(pre).toBeTruthy();
    expect(pre![1]).toContain("overflow-x-auto");
    expect(pre![1]).toContain("max-w-full");
  });

  it("lets long URLs wrap safely instead of widening the bubble", () => {
    const html = render(
      "[docs](https://example.com/a/very/long/path?query=with=parameters&more=stuff)",
    );
    expect(html).toContain("break-words");
    expect(html).toContain('rel="noopener noreferrer"');
  });

  it("renders Arabic headings", () => {
    const html = render("## العنوان الرئيسي\n\nنص توضيحي.");
    expect(html).toContain("<h2");
    expect(html).toContain("العنوان الرئيسي");
    expect(html).not.toContain("##");
  });

  it("renders Arabic lists", () => {
    const html = render("- أول عنصر\n- ثاني عنصر");
    expect(html).toContain("<ul");
    expect(html).toContain(">أول عنصر</li>");
    expect(html).toContain(">ثاني عنصر</li>");
  });

  it("renders historical markdown content normally in the chat body", () => {
    const html = render(
      "## Legacy heading\n\n- item one\n- item two\n\n**bold** and `code`.",
    );
    expect(html).toContain("<h2");
    expect(html).toContain("<ul");
    expect(html).toContain("<strong>bold</strong>");
    expect(html).toContain("<code");
    expect(html).not.toContain("##");
  });
});
