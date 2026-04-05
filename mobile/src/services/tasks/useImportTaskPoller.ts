import { useEffect, useMemo, useState } from 'react';

import {
  getImportTaskState,
  loadImportTasks,
  subscribeImportTasks,
} from '@/services/import/importTaskService';
import type { ImportTaskRecord, ImportTaskState } from '@/types/importTask';

type ImportTaskPollerResult = {
  taskState: ImportTaskState;
  activeTasks: ImportTaskRecord[];
  failedTasks: ImportTaskRecord[];
  runningCount: number;
  latestVisibleTask: ImportTaskRecord | null;
};

export function useImportTaskPoller(): ImportTaskPollerResult {
  const [taskState, setTaskState] = useState<ImportTaskState>(() => getImportTaskState());

  useEffect(() => {
    const unsubscribe = subscribeImportTasks((state) => {
      setTaskState(state);
    });

    void loadImportTasks();

    return unsubscribe;
  }, []);

  const activeTasks = useMemo(
    () => taskState.tasks.filter((task) => task.status === 'running'),
    [taskState.tasks],
  );
  const failedTasks = useMemo(
    () => taskState.tasks.filter((task) => task.status === 'failed'),
    [taskState.tasks],
  );

  return {
    taskState,
    activeTasks,
    failedTasks,
    runningCount: taskState.runningCount,
    latestVisibleTask: taskState.latestVisibleTask,
  };
}
