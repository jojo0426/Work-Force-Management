import { Injectable } from '@nestjs/common';
import { WoStatus } from '@prisma/client';
import { PrismaService } from '../prisma.service';

@Injectable()
export class LiveOperationsService {
  constructor(private prisma: PrismaService) {}

  async snapshot() {
    const now = new Date();
    const staleBefore = new Date(now.getTime() - 2 * 60 * 1000);
    const [statusGroups, technicians, activeExecutions, pendingExceptions] = await Promise.all([
      this.prisma.workOrder.groupBy({ by: ['status'], _count: true }),
      this.prisma.user.findMany({
        where: { role: 'TECHNICIAN', isActive: true },
        select: { id: true, name: true, status: true, teamId: true, lastLat: true, lastLng: true, lastLocationAt: true },
        orderBy: { name: 'asc' },
      }),
      this.prisma.jobExecution.findMany({
        where: { completedAt: null },
        include: { workOrder: { select: { id: true, woNumber: true, type: true, status: true, subscriberId: true } }, technician: { select: { id: true, name: true, teamId: true, status: true, lastLat: true, lastLng: true, lastLocationAt: true } } },
        orderBy: { startedAt: 'asc' },
        take: 200,
      }),
      this.prisma.fieldException.findMany({
        where: { status: 'PENDING' },
        include: { workOrder: { select: { id: true, woNumber: true, type: true, status: true } }, technician: { select: { id: true, name: true, teamId: true, status: true } } },
        orderBy: { reportedAt: 'asc' },
        take: 200,
      }),
    ]);

    const workOrders = Object.fromEntries(statusGroups.map((g) => [g.status, g._count]));
    const activeByTechnician = new Map(activeExecutions.map((e) => [e.technicianId, e]));
    const technicianRows = technicians.map((t) => {
      const active = activeByTechnician.get(t.id);
      const locationFresh = !!t.lastLocationAt && t.lastLocationAt >= staleBefore;
      return {
        id: t.id,
        name: t.name,
        teamId: t.teamId,
        status: t.status,
        location: t.lastLat != null && t.lastLng != null ? { lat: t.lastLat, lng: t.lastLng, capturedAt: t.lastLocationAt, isStale: !locationFresh } : null,
        activeWorkOrder: active ? { id: active.workOrder.id, woNumber: active.workOrder.woNumber, type: active.workOrder.type, status: active.workOrder.status, startedAt: active.startedAt } : null,
      };
    });

    return {
      generatedAt: now,
      source: 'authoritative_operational_database',
      refreshRecommendedSeconds: 15,
      counts: {
        draft: workOrders[WoStatus.DRAFT] || 0,
        assigned: workOrders[WoStatus.ASSIGNED] || 0,
        working: workOrders[WoStatus.WORKING] || 0,
        onHold: workOrders[WoStatus.ON_HOLD] || 0,
        completed: workOrders[WoStatus.COMPLETED] || 0,
        fbIssue: workOrders[WoStatus.FB_ISSUE] || 0,
        custIssue: workOrders[WoStatus.CUST_ISSUE] || 0,
        cancelled: workOrders[WoStatus.CANCELLED] || 0,
        pendingExceptions: pendingExceptions.length,
        activeExecutions: activeExecutions.length,
        activeTechnicians: technicians.length,
        availableTechnicians: technicians.filter((t) => t.status === 'AVAILABLE').length,
        staleLocations: technicianRows.filter((t) => t.location?.isStale).length,
      },
      technicians: technicianRows,
      activeExecutions: activeExecutions.map((e) => ({
        executionId: e.id,
        startedAt: e.startedAt,
        technician: e.technician,
        workOrder: e.workOrder,
      })),
      pendingExceptions: pendingExceptions.map((x) => ({
        id: x.id,
        reason: x.reason,
        notes: x.notes,
        reportedAt: x.reportedAt,
        lat: x.lat,
        lng: x.lng,
        technician: x.technician,
        workOrder: x.workOrder,
      })),
    };
  }
}
