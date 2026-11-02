/** Shared topic and category metadata; lesson prose is stored under content/lessons. */
export type Category = {
  id: string;
  title: string;
  description: string;
};

export type TopicMetadata = {
  id: string;
  title: string;
  categoryId: string;
  categoryTitle: string;
  position: number;
  activity: "quiz" | "coding";
  sections: { id: string; title: string }[];
  sources: { label: string; href: string }[];
};

export type Lesson = Omit<TopicMetadata, "sections"> & {
  introduction: string;
  sections: { id: string; title: string; body: string }[];
  summary: string;
};

export const categories: Category[] = [
  {
    id: "getting-started-with-cangjie",
    title: "Getting Started with Cangjie",
    description:
      "Learn the essentials, prepare your tools, and run your first program.",
  },
  {
    id: "basic-concepts",
    title: "Basic Concepts",
    description:
      "Master Cangjie syntax, declarations, control flow expressions, and functions.",
  },
];
