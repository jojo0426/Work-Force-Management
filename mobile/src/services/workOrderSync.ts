export type SyncableWorkOrder = {
  id: string;
  status: 'ASSIGNED' | 'WORKING' | 'ON_HOLD';
};

export type WorkOrderReconciliation<T extends SyncableWorkOrder> = {
  jobs: T[];
  selected: T | null;
  selectedRemoved: boolean;
  selectedStatusChanged: boolean;
  invalidateLocalWorkflow: boolean;
};

/**
 * Reconciles technician-local work-order state with the latest authoritative
 * server response. Management actions always win over stale mobile state.
 */
export function reconcileWorkOrders<T extends SyncableWorkOrder>(
  currentSelected: T | null,
  serverJobs: T[],
): WorkOrderReconciliation<T> {
  if (!currentSelected) {
    return {
      jobs: serverJobs,
      selected: null,
      selectedRemoved: false,
      selectedStatusChanged: false,
      invalidateLocalWorkflow: false,
    };
  }

  const latest = serverJobs.find((item) => item.id === currentSelected.id) || null;
  if (!latest) {
    return {
      jobs: serverJobs,
      selected: null,
      selectedRemoved: true,
      selectedStatusChanged: false,
      invalidateLocalWorkflow: true,
    };
  }

  const selectedStatusChanged = latest.status !== currentSelected.status;
  const leftWorkingState = currentSelected.status === 'WORKING' && latest.status !== 'WORKING';

  return {
    jobs: serverJobs,
    selected: latest,
    selectedRemoved: false,
    selectedStatusChanged,
    invalidateLocalWorkflow: leftWorkingState,
  };
}

export const WORK_ORDER_SYNC_INTERVAL_MS = 15_000;
