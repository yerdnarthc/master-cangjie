import CodingWorkspace from '../../../components/coding-workspace';
import { notFound } from 'next/navigation';
export default async function Topic({params}:{params:Promise<{topicId:string}>}) {
  const {topicId}=await params;
  if(topicId==='identifiers')return <main><h1>Identifiers</h1><p>This multiple-choice activity is not available in this internal build.</p><a href="/topics/running-the-first-cangjie-program">Back to Hello World</a></main>;
  if(topicId!=='running-the-first-cangjie-program')notFound();
  return <CodingWorkspace/>;
}
