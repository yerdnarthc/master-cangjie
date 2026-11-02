import Link from "next/link";

export default function LockedTopic({
  topicTitle,
  prerequisiteTitle,
}: {
  topicTitle: string;
  prerequisiteTitle: string | null;
}) {
  return (
    <div className="workspace-shell lesson-shell">
      <header className="topbar">
        <Link href="/">MasterCangjie</Link>
      </header>
      <main>
        <p className="eyebrow">Topic locked</p>
        <h1>{topicTitle}</h1>
        <p className="muted">Locked</p>
        {prerequisiteTitle ? (
          <p>Complete {prerequisiteTitle} to unlock this topic.</p>
        ) : (
          <p>This topic is not available yet. Return to the roadmap.</p>
        )}
        <Link href="/">Return to roadmap</Link>
      </main>
    </div>
  );
}
