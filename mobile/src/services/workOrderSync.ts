export type SyncableWorkOrder={id:string;status:'ASSIGNED'|'WORKING'|'ON_HOLD'};
export type WorkOrderReconciliation<T extends SyncableWorkOrder>={jobs:T[];selected:T|null;selectedWorkOrder:T|null;selectedRemoved:boolean;selectedStatusChanged:boolean;invalidateLocalWorkflow:boolean};
/** Reconcile technician-local state with the latest authoritative server response. Management state always wins. */
export function reconcileWorkOrders<T extends SyncableWorkOrder>(currentSelected:T|null,serverJobs:T[]):WorkOrderReconciliation<T>;
export function reconcileWorkOrders<T extends SyncableWorkOrder>(currentJobs:T[],currentSelected:T|null,serverJobs:T[]):WorkOrderReconciliation<T>;
export function reconcileWorkOrders<T extends SyncableWorkOrder>(a:T[]|T|null,b:T[]|T|null,c?:T[]):WorkOrderReconciliation<T>{
 const currentSelected=(c?b:a) as T|null;const serverJobs=(c||b) as T[];
 if(!currentSelected)return{jobs:serverJobs,selected:null,selectedWorkOrder:null,selectedRemoved:false,selectedStatusChanged:false,invalidateLocalWorkflow:false};
 const latest=serverJobs.find(x=>x.id===currentSelected.id)||null;
 if(!latest)return{jobs:serverJobs,selected:null,selectedWorkOrder:null,selectedRemoved:true,selectedStatusChanged:false,invalidateLocalWorkflow:true};
 const selectedStatusChanged=latest.status!==currentSelected.status;const leftWorkingState=currentSelected.status==='WORKING'&&latest.status!=='WORKING';
 return{jobs:serverJobs,selected:latest,selectedWorkOrder:latest,selectedRemoved:false,selectedStatusChanged,invalidateLocalWorkflow:leftWorkingState};
}
export const WORK_ORDER_SYNC_INTERVAL_MS=15_000;
