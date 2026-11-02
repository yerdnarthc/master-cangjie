import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import TopicLesson from "../../apps/web/src/components/topic-lesson.tsx";
import type { Lesson, TopicMetadata } from "../../modules/roadmap/application/onboarding.ts";

it("renders Markdown formatting in the lesson introduction", () => {
  const metadata: TopicMetadata = {
    id: "sample-topic",
    title: "Sample topic",
    categoryId: "sample-category",
    categoryTitle: "Sample category",
    position: 0,
    activity: "quiz",
    sections: [{ id: "first-section", title: "First section" }],
    sources: [{ label: "Guide", href: "https://example.com/guide" }],
  };
  const lesson: Lesson = {
    ...metadata,
    introduction: "Start with **Cangjie**.",
    sections: [{ id: "first-section", title: "First section", body: "Section text." }],
    summary: "- Summary point.",
  };

  const html = renderToStaticMarkup(
    createElement(TopicLesson, { lesson, catalog: [metadata] }),
  );

  expect(html).toContain("Start with <strong>Cangjie</strong>.");
});
