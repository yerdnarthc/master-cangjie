import { notFound } from 'next/navigation';
import CodingWorkspace from '../../../../components/coding-workspace';
export default async function Activity({params}:{params:Promise<{topicId:string}>}) {
  const {topicId}=await params;
  if(topicId!=='running-the-first-cangjie-program')notFound();
  return <CodingWorkspace/>;
}
