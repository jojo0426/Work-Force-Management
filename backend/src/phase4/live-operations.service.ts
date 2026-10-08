import { Injectable } from '@nestjs/common';
import { WoStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { escalationMetadata, MANAGEMENT_ESCALATION_POLICY } from './escalation-policy';

@Injectable()
export class LiveOperationsService {
  constructor(private prisma: PrismaService) {}

  async snapshot() {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - 2 * 60 * 1000);
    const longRunningBefore = new Date(now.getTime() - 2 * 60 * 60 * 1000);
    const agingExceptionBefore = new Date(now.getTime() - 30 * 60 * 1000);
    const [statusGroups, technicians, activeExecutions, pendingExceptions] = await Promise.all([
      this.prisma.workOrder.groupBy({ by: ['status'], _count: true }),
      this.prisma.user.findMany({ where: { role: 'TECHNICIAN', isActive: true }, select: { id: true, name: true, status: true, teamId: true, lastLat: true, lastLng: true, lastLocationAt: true }, orderBy: { name: 'asc' } }),
      this.prisma.jobExecution.findMany({ where: { completedAt: null }, include: { workOrder: { select: { id: true, woNumber: true, type: true, status: true, subscriberId: true } } }, orderBy: { startedAt: 'asc' }, take: 200 }),
      this.prisma.fieldException.findMany({ where: { status: 'PENDING' }, include: { workOrder: { select: { id: true, woNumber: true, type: true, status: true } } }, orderBy: { reportedAt: 'asc' }, take: 200 }),
    ]);

    const workOrders = Object.fromEntries(statusGroups.map((g) => [g.status, g._count]));
    const technicianById = new Map(technicians.map((t) => [t.id, t]));
    const activeByTechnician = new Map(activeExecutions.map((e) => [e.technicianId, e]));
    const technicianRows = technicians.map((t) => {
      const active = activeByTechnician.get(t.id);
      const locationFresh = !!t.lastLocationAt && t.lastLocationAt >= staleBefore;
      return { id: t.id, name: t.name, teamId: t.teamId, status: t.status, location: t.lastLat != null && t.lastLng != null ? { lat: t.lastLat, lng: t.lastLng, capturedAt: t.lastLocationAt, isStale: !locationFresh } : null, activeWorkOrder: active ? { id: active.workOrder.id, woNumber: active.workOrder.woNumber, type: active.workOrder.type, status: active.workOrder.status, startedAt: active.startedAt } : null };
    });
    const availableTechnicians = technicians.filter((t) => t.status === 'AVAILABLE').length;
    const rawAttention = [
      ...technicianRows.filter((t) => !t.location || t.location.isStale).map((t) => ({ kind: 'LOCATION_STALE', severity: t.activeWorkOrder ? 'HIGH' : 'MEDIUM', technicianId: t.id, technicianName: t.name, workOrderNumber: t.activeWorkOrder?.woNumber || null, since: t.location?.capturedAt || null, message: t.location ? 'Technician location is older than 2 minutes.' : 'Technician has not reported a location.' })),
      ...activeExecutions.filter((e) => e.startedAt <= longRunningBefore).map((e) => ({ kind: 'LONG_RUNNING_JOB', severity: 'MEDIUM', technicianId: e.technicianId, technicianName: technicianById.get(e.technicianId)?.name || 'Unknown technician', workOrderNumber: e.workOrder.woNumber, since: e.startedAt, message: 'Active execution has been running for more than 2 hours.' })),
      ...pendingExceptions.filter((x) => x.reportedAt <= agingExceptionBefore).map((x) => ({ kind: 'AGING_EXCEPTION', severity: 'HIGH', technicianId: x.technicianId, technicianName: technicianById.get(x.technicianId)?.name || 'Unknown technician', workOrderNumber: x.workOrder.woNumber, since: x.reportedAt, message: 'Pending field exception has awaited management review for more than 30 minutes.' })),
      ...((availableTechnicians === 0 && ((workOrders[WoStatus.DRAFT] || 0) + (workOrders[WoStatus.ASSIGNED] || 0) > 0)) ? [{ kind: 'NO_AVAILABLE_CAPACITY', severity: 'HIGH', technicianId: null, technicianName: null, workOrderNumber: null, since: now, message: 'No technician is AVAILABLE while dispatch backlog exists.' }] : []),
    ];
    const attention = rawAttention.map((item) => ({ ...item, ...escalationMetadata(item) }));

    return {
      generatedAt: now, source: 'authoritative_operational_database', refreshRecommendedSeconds: 15,
      thresholds: { staleLocationSeconds: 120, longRunningJobMinutes: 120, agingExceptionMinutes: 30, notificationCooldownSeconds: MANAGEMENT_ESCALATION_POLICY.cooldownSeconds },
      counts: { draft: workOrders[WoStatus.DRAFT] || 0, assigned: workOrders[WoStatus.ASSIGNED] || 0, working: workOrders[WoStatus.WORKING] || 0, onHold: workOrders[WoStatus.ON_HOLD] || 0, completed: workOrders[WoStatus.COMPLETED] || 0, fbIssue: workOrders[WoStatus.FB_ISSUE] || 0, custIssue: workOrders[WoStatus.CUST_ISSUE] || 0, cancelled: workOrders[WoStatus.CANCELLED] || 0, pendingExceptions: pendingExceptions.length, activeExecutions: activeExecutions.length, activeTechnicians: technicians.length, availableTechnicians, staleLocations: technicianRows.filter((t) => !t.location || t.location.isStale).length, attentionItems: attention.length },
      attention,
      technicians: technicianRows,
      activeExecutions: activeExecutions.map((e) => ({ executionId: e.id, startedAt: e.startedAt, technician: technicianById.get(e.technicianId) || { id: e.technicianId, name: 'Unknown technician', teamId: null, status: null, lastLat: null, lastLng: null, lastLocationAt: null }, workOrder: e.workOrder })),
      pendingExceptions: pendingExceptions.map((x) => ({ id: x.id, reason: x.reason, notes: x.notes, reportedAt: x.reportedAt, lat: x.lat, lng: x.lng, technician: technicianById.get(x.technicianId) || { id: x.technicianId, name: 'Unknown technician', teamId: null, status: null }, workOrder: x.workOrder })),
    };
  }
}
