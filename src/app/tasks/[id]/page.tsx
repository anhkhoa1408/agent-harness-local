import { TaskDetail } from "../../../components/task-detail";
export default async function TaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <TaskDetail id={(await params).id} />;
}
