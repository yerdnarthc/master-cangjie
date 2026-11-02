import { readFile, readdir, stat } from "node:fs/promises";
import { resolve } from "node:path";
import { root } from "../../../infrastructure/runtime/config.ts";
import type { Lesson, TopicMetadata } from "../application/onboarding.ts";

const safeId = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export class FileLessonContent {
  constructor(
    private readonly lessonsRoot = resolve(root, "content/lessons"),
  ) {}

  async listMetadata(): Promise<TopicMetadata[]> {
    const entries = await readdir(this.lessonsRoot, { withFileTypes: true });
    const topics = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map((entry) => this.readMetadata(entry.name)),
    );

    const catalog = topics
      .filter((topic): topic is TopicMetadata => topic !== undefined)
      .sort((left, right) => left.position - right.position);
    const positions = new Set<number>();
    for (const topic of catalog) {
      if (positions.has(topic.position)) {
        throw new Error(`Duplicate topic position ${topic.position}.`);
      }
      positions.add(topic.position);
    }
    return catalog;
  }

  async readMetadata(topicId: string): Promise<TopicMetadata | undefined> {
    if (!safeId.test(topicId)) {
      throw new Error(`Invalid topic ID: ${topicId}.`);
    }
    const topicDir = resolve(this.lessonsRoot, topicId);
    try {
      await stat(topicDir);
    } catch (error) {
      if (
        error &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return undefined;
      }
      throw error;
    }

    let raw: string;
    try {
      raw = await readFile(resolve(topicDir, "topic.json"), "utf8");
    } catch (error) {
      throw new Error(`Unable to read topic metadata for ${topicId}.`, {
        cause: error,
      });
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(`Invalid topic metadata JSON for ${topicId}.`, {
        cause: error,
      });
    }

    try {
      if (!isRecord(parsed) || parsed.id !== topicId) {
        throw new Error(
          `Topic metadata ID must match its directory: ${topicId}.`,
        );
      }
      if (parsed.activity !== "quiz" && parsed.activity !== "coding") {
        throw new Error(`Invalid activity kind for topic ${topicId}.`);
      }
      if (typeof parsed.title !== "string" || !parsed.title.trim()) {
        throw new Error(`Invalid topic title for ${topicId}.`);
      }
      if (
        typeof parsed.categoryId !== "string" ||
        !safeId.test(parsed.categoryId) ||
        typeof parsed.categoryTitle !== "string" ||
        !parsed.categoryTitle.trim()
      ) {
        throw new Error(`Invalid topic category metadata for ${topicId}.`);
      }
      if (
        typeof parsed.position !== "number" ||
        !Number.isSafeInteger(parsed.position) ||
        parsed.position < 0
      ) {
        throw new Error(`Invalid topic position for ${topicId}.`);
      }
      if (!Array.isArray(parsed.sections) || parsed.sections.length === 0) {
        throw new Error(`Topic ${topicId} must define lesson sections.`);
      }
      const sectionIds = new Set<string>();
      for (const section of parsed.sections) {
        if (
          !isRecord(section) ||
          typeof section.id !== "string"
        ) {
          throw new Error(`Invalid section metadata for topic ${topicId}.`);
        }
        if (!safeId.test(section.id)) {
          throw new Error(`Invalid section ID: ${section.id}.`);
        }
        if (
          typeof section.title !== "string" ||
          !section.title.trim()
        ) {
          throw new Error(`Invalid section metadata for topic ${topicId}.`);
        }
        if (sectionIds.has(section.id)) {
          throw new Error(
            `Duplicate section ID ${section.id} for topic ${topicId}.`,
          );
        }
        sectionIds.add(section.id);
      }
      if (!Array.isArray(parsed.sources) || parsed.sources.length === 0) {
        throw new Error(`Topic ${topicId} must define lesson sources.`);
      }
      for (const source of parsed.sources) {
        if (
          !isRecord(source) ||
          typeof source.label !== "string" ||
          !source.label.trim() ||
          typeof source.href !== "string"
        ) {
          throw new Error(`Invalid source metadata for topic ${topicId}.`);
        }
        let url: URL;
        try {
          url = new URL(source.href);
        } catch {
          throw new Error(`Invalid source URL for topic ${topicId}.`);
        }
        if (url.protocol !== "http:" && url.protocol !== "https:") {
          throw new Error(`Invalid source URL for topic ${topicId}.`);
        }
      }
      return parsed as TopicMetadata;
    } catch (error) {
      throw error;
    }
  }

  async readLesson(topicId: string): Promise<Lesson | undefined> {
    const metadata = await this.readMetadata(topicId);
    if (!metadata) return undefined;

    const topicDir = resolve(this.lessonsRoot, topicId);
    const introduction = await this.readRequired(
      resolve(topicDir, "introduction.md"),
      topicId,
      "introduction",
    );
    const sections = await Promise.all(
      metadata.sections.map(async (section) => {
        if (!safeId.test(section.id)) {
          throw new Error(`Invalid section ID: ${section.id}.`);
        }
        return {
          ...section,
          body: await this.readRequired(
            resolve(topicDir, "sections", `${section.id}.md`),
            topicId,
            `section ${section.id}`,
          ),
        };
      }),
    );
    const summary = await this.readRequired(
      resolve(topicDir, "summary.md"),
      topicId,
      "summary",
    );

    return { ...metadata, introduction, sections, summary };
  }

  private async readRequired(
    filePath: string,
    topicId: string,
    label: string,
  ): Promise<string> {
    try {
      const content = await readFile(filePath, "utf8");
      if (!content.trim()) {
        throw new Error(`Empty ${label} Markdown for topic ${topicId}.`);
      }
      return content;
    } catch (error) {
      if (error instanceof Error && error.message.startsWith("Empty ")) {
        throw error;
      }
      throw new Error(
        `Unable to read ${label} Markdown for topic ${topicId}.`,
        { cause: error },
      );
    }
  }
}
