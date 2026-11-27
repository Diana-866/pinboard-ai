export interface BatchProgress {
  completed: number;
  total: number;
  succeeded: number;
  failed: number;
}

export interface BatchFailure<T> {
  item: T;
  error: unknown;
}

/**
 * Runs batch work sequentially and keeps going after an individual item fails.
 * Sequential execution avoids flooding the review queue and makes progress stable.
 */
export async function runBatchWithPartialFailures<T>(
  items: readonly T[],
  runOne: (item: T, index: number) => Promise<void>,
  onProgress?: (progress: BatchProgress) => void,
): Promise<{ succeeded: number; failures: BatchFailure<T>[] }> {
  const failures: BatchFailure<T>[] = [];
  let succeeded = 0;

  for (let index = 0; index < items.length; index += 1) {
    try {
      await runOne(items[index], index);
      succeeded += 1;
    } catch (error) {
      failures.push({ item: items[index], error });
    }
    onProgress?.({
      completed: index + 1,
      total: items.length,
      succeeded,
      failed: failures.length,
    });
  }

  return { succeeded, failures };
}
