import Link from "next/link";
import DevelopmentSessionButton from "./development-session-button";

export default function RoadmapSignIn() {
  return (
    <div className="workspace-shell lesson-shell">
      <header className="topbar">
        <Link href="/">MasterCangjie</Link>
      </header>
      <main>
        <p className="eyebrow">Curriculum Roadmap</p>
        <h1>Open your learning path</h1>
        <p>Sign in to see which topics are available for you.</p>
        <DevelopmentSessionButton />
      </main>
    </div>
  );
}
