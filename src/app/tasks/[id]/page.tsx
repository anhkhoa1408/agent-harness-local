import { TaskDetailPage } from "@/components/pages/task-detail-page";
export default async function TaskPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return <TaskDetailPage id={(await params).id} />;
}
