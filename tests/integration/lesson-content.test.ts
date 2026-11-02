import { describe, expect, it } from "vitest";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { FileLessonContent } from "../../modules/roadmap/adapters/lesson-content.ts";

const fixtureMetadata = (id: string) => ({
  id,
  title: "Sample topic",
  categoryId: "sample-category",
  categoryTitle: "Sample category",
  position: 0,
  activity: "quiz",
  sections: [{ id: "first-section", title: "First section" }],
  sources: [{ label: "Sample source", href: "https://example.com/guide" }],
});

async function withTemporaryRoot<T>(work: (root: string) => Promise<T>) {
  const root = await mkdtemp(join(tmpdir(), "mcj-lesson-content-"));
  try {
    return await work(root);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function writeTopicMetadata(
  root: string,
  directoryId: string,
  metadata: unknown,
) {
  const topicDir = resolve(root, directoryId);
  await mkdir(topicDir, { recursive: true });
  await writeFile(
    resolve(topicDir, "topic.json"),
    JSON.stringify(metadata),
    "utf8",
  );
}

async function writeLessonFixture(
  root: string,
  directoryId: string,
  metadata: ReturnType<typeof fixtureMetadata>,
) {
  const topicDir = resolve(root, directoryId);
  await writeTopicMetadata(root, directoryId, metadata);
  await mkdir(resolve(topicDir, "sections"), { recursive: true });
  await writeFile(resolve(topicDir, "introduction.md"), "Introduction.\n");
  await writeFile(resolve(topicDir, "summary.md"), "- Summary.\n");
  for (const section of metadata.sections) {
    if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(section.id)) {
      await writeFile(
        resolve(topicDir, "sections", `${section.id}.md`),
        "Section body.\n",
      );
    }
  }
}

describe("lesson content adapter", () => {
  it("lists the published topics in curriculum order", async () => {
    const topics = await new FileLessonContent().listMetadata();

    expect(topics.map(({ id }) => id)).toEqual([
      "getting-started-with-cangjie",
      "installing-the-cangjie-toolchain",
      "running-the-first-cangjie-program",
      "identifiers",
      "program-structure",
      "expressions",
      "functions",
    ]);
    expect(topics.map(({ position }) => position)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it("loads every required Markdown file for all seven topics", async () => {
    const content = new FileLessonContent();
    const catalog = await content.listMetadata();

    for (const metadata of catalog) {
      const lesson = await content.readLesson(metadata.id);
      expect(lesson?.introduction.trim(), metadata.id).not.toBe("");
      expect(lesson?.sections, metadata.id).toHaveLength(metadata.sections.length);
      expect(lesson?.sections.every(({ body }) => body.trim().length > 0), metadata.id).toBe(true);
      expect(lesson?.summary.trim(), metadata.id).not.toBe("");
    }
  });

  it("reads a handout with its approved sections, code, summary, and sources", async () => {
    const lesson = await new FileLessonContent().readLesson(
      "running-the-first-cangjie-program",
    );

    expect(lesson).toMatchObject({
      id: "running-the-first-cangjie-program",
      activity: "coding",
      sections: [
        { id: "read-program", title: "Read the program" },
        { id: "compile-run", title: "Compile, then run" },
        { id: "practice-output", title: "Check the output" },
      ],
      sources: [
        {
          label: "Official first-program guide",
          href: "https://docs.cangjie-lang.cn/en/docs/1.0.0/user_manual/source_en/first_understanding/hello_world.html",
        },
        {
          label: "Official program entry and structure",
          href: "https://docs.cangjie-lang.cn/en/docs/1.0.0/user_manual/source_en/basic_programming_concepts/program_structure.html",
        },
      ],
    });
    expect(lesson?.introduction).toContain("read a greeting program");
    expect(lesson?.sections[0].body).toContain('println("Hello, World!")');
    expect(lesson?.summary).toContain(
      "Execution begins at main; println adds a newline.",
    );
  });

  it("rejects metadata whose topic ID does not match its directory", async () => {
    await withTemporaryRoot(async (root) => {
      await writeTopicMetadata(root, "sample-topic", fixtureMetadata("other-topic"));

      await expect(
        new FileLessonContent(root).readMetadata("sample-topic"),
      ).rejects.toThrow(/id.*directory|directory.*id/i);
    });
  });

  it("reports which topic has malformed metadata JSON", async () => {
    await withTemporaryRoot(async (root) => {
      const topicDir = resolve(root, "sample-topic");
      await mkdir(topicDir, { recursive: true });
      await writeFile(resolve(topicDir, "topic.json"), "{", "utf8");

      await expect(
        new FileLessonContent(root).readMetadata("sample-topic"),
      ).rejects.toThrow(/invalid.*metadata.*sample-topic/i);
    });
  });

  it("returns no lesson metadata for an unknown topic", async () => {
    await withTemporaryRoot(async (root) => {
      await expect(
        new FileLessonContent(root).readMetadata("not-a-topic"),
      ).resolves.toBeUndefined();
    });
  });

  it("rejects unsafe topic IDs before resolving content paths", async () => {
    await withTemporaryRoot(async (root) => {
      await expect(
        new FileLessonContent(root).readMetadata("../outside"),
      ).rejects.toThrow(/invalid.*topic id|unsafe.*topic id/i);
    });
  });

  it("rejects unsafe section IDs before reading section files", async () => {
    await withTemporaryRoot(async (root) => {
      const metadata = {
        ...fixtureMetadata("sample-topic"),
        sections: [{ id: "../outside", title: "Unsafe section" }],
      };
      await writeLessonFixture(root, "sample-topic", metadata);

      await expect(
        new FileLessonContent(root).readLesson("sample-topic"),
      ).rejects.toThrow(/invalid.*section id|unsafe.*section id/i);
    });
  });

  it("rejects unsupported activity kinds in topic metadata", async () => {
    await withTemporaryRoot(async (root) => {
      const metadata = { ...fixtureMetadata("sample-topic"), activity: "game" };
      await writeTopicMetadata(root, "sample-topic", metadata);

      await expect(
        new FileLessonContent(root).readMetadata("sample-topic"),
      ).rejects.toThrow(/activity/i);
    });
  });

  it("rejects duplicate section IDs in topic metadata", async () => {
    await withTemporaryRoot(async (root) => {
      const base = fixtureMetadata("sample-topic");
      const metadata = {
        ...base,
        sections: [
          { id: "first-section", title: "First section" },
          { id: "first-section", title: "Repeated section" },
        ],
      };
      await writeTopicMetadata(root, "sample-topic", metadata);

      await expect(
        new FileLessonContent(root).readMetadata("sample-topic"),
      ).rejects.toThrow(/duplicate.*section|section.*duplicate/i);
    });
  });

  it("rejects duplicate topic positions in the curriculum catalog", async () => {
    await withTemporaryRoot(async (root) => {
      await writeTopicMetadata(root, "first-topic", fixtureMetadata("first-topic"));
      await writeTopicMetadata(root, "second-topic", fixtureMetadata("second-topic"));

      await expect(
        new FileLessonContent(root).listMetadata(),
      ).rejects.toThrow(/duplicate.*position|position.*duplicate/i);
    });
  });

  it("fails clearly when a section Markdown file is missing", async () => {
    await withTemporaryRoot(async (root) => {
      const metadata = fixtureMetadata("sample-topic");
      await writeLessonFixture(root, "sample-topic", metadata);
      await rm(
        resolve(root, "sample-topic", "sections", "first-section.md"),
      );

      await expect(
        new FileLessonContent(root).readLesson("sample-topic"),
      ).rejects.toThrow(/section first-section/i);
    });
  });

  it("rejects an empty required lesson document", async () => {
    await withTemporaryRoot(async (root) => {
      await writeLessonFixture(
        root,
        "sample-topic",
        fixtureMetadata("sample-topic"),
      );
      await writeFile(
        resolve(root, "sample-topic", "introduction.md"),
        " \n",
        "utf8",
      );

      await expect(
        new FileLessonContent(root).readLesson("sample-topic"),
      ).rejects.toThrow(/empty|nonempty/i);
    });
  });

  it("rejects source links that are not HTTP or HTTPS URLs", async () => {
    await withTemporaryRoot(async (root) => {
      const metadata = {
        ...fixtureMetadata("sample-topic"),
        sources: [{ label: "Unsafe source", href: "javascript:alert(1)" }],
      };
      await writeTopicMetadata(root, "sample-topic", metadata);

      await expect(
        new FileLessonContent(root).readMetadata("sample-topic"),
      ).rejects.toThrow(/source.*URL|URL.*source/i);
    });
  });

  it("rejects non-integer or negative topic positions", async () => {
    await withTemporaryRoot(async (root) => {
      const metadata = { ...fixtureMetadata("sample-topic"), position: -0.5 };
      await writeTopicMetadata(root, "sample-topic", metadata);

      await expect(
        new FileLessonContent(root).readMetadata("sample-topic"),
      ).rejects.toThrow(/position/i);
    });
  });

  it("rejects missing topic or category display metadata", async () => {
    await withTemporaryRoot(async (root) => {
      const metadata = {
        ...fixtureMetadata("sample-topic"),
        title: "   ",
        categoryId: "",
        categoryTitle: "Sample category",
      };
      await writeTopicMetadata(root, "sample-topic", metadata);

      await expect(
        new FileLessonContent(root).readMetadata("sample-topic"),
      ).rejects.toThrow(/title|category/i);
    });
  });

  it("fails clearly when a topic folder has no topic metadata", async () => {
    await withTemporaryRoot(async (root) => {
      await mkdir(resolve(root, "incomplete-topic"), { recursive: true });

      await expect(
        new FileLessonContent(root).listMetadata(),
      ).rejects.toThrow(/metadata.*incomplete-topic|incomplete-topic.*metadata/i);
    });
  });
});
