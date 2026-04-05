import { useLocalSearchParams } from 'expo-router';

import { ImportTaskDetailScreen } from '@/screens/import-task-detail-screen';

export default function ImportTaskRouteScreen() {
  const params = useLocalSearchParams<{ taskId?: string | string[] }>();
  const taskId = (Array.isArray(params.taskId) ? params.taskId[0] : params.taskId) ?? '';

  return <ImportTaskDetailScreen taskId={taskId} />;
}
