import { BadRequestException, Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
@Injectable()
export class WorkOrdersPhase2Service {
  constructor(private prisma: PrismaService) {}

  async suggestNextJob(technicianId: string, currentLat: number, currentLng: number) {
    if (!Number.isFinite(currentLat) || !Number.isFinite(currentLng)) {
      throw new BadRequestException('Current technician GPS is required for nearby work-order suggestions');
    }

    const technician = await this.prisma.user.findUnique({ where: { id: technicianId } });
    if (!technician || technician.role !== 'TECHNICIAN' || !technician.isActive) {
      throw new BadRequestException('A valid active technician is required');
    }
    if (!technician.teamId) return { suggestions: [], recommended: null, message: 'Technician has no assigned team. No work-order suggestion can be calculated.' };

    const remaining = await this.prisma.workOrder.findMany({
      where: { status: 'ASSIGNED', assignments: { some: { teamId: technician.teamId } } },
      include: { assignments: true },
      take: 100,
      orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }]
    });

    const subscriberIds = remaining.map((wo) => wo.subscriberId).filter((id): id is string => Boolean(id));
    const subscribers = subscriberIds.length ? await this.prisma.subscriber.findMany({ where: { id: { in: subscriberIds } } }) : [];
    const subscriberById = new Map(subscribers.map((s) => [s.id, s]));

    const withDistance = remaining.flatMap((wo) => {
      if (!wo.subscriberId) return [];
      const subscriber = subscriberById.get(wo.subscriberId);
      if (!subscriber || subscriber.lat == null || subscriber.lng == null) return [];
      const distance_m = Math.round(this.haversine(currentLat, currentLng, subscriber.lat, subscriber.lng));
      return [{
        woNumber: wo.woNumber,
        id: wo.id,
        type: wo.type,
        status: wo.status,
        priority: wo.priority,
        subscriber: {
          accountNumber: subscriber.accountNumber,
          name: subscriber.name,
          address: subscriber.address,
          lat: subscriber.lat,
          lng: subscriber.lng,
          napId: subscriber.napId
        },
        distance_m,
        distance_km: Number((distance_m / 1000).toFixed(2))
      }];
    }).sort((a, b) => a.distance_m - b.distance_m || a.priority - b.priority || a.woNumber.localeCompare(b.woNumber));

    return {
      technician: {
        id: technician.id,
        name: technician.name,
        teamId: technician.teamId,
        status: technician.status,
        lat: currentLat,
        lng: currentLng
      },
      candidatesConsidered: remaining.length,
      suggestions: withDistance.slice(0, 10).map((item, index) => ({ ...item, sequence: index + 1 })),
      recommended: withDistance.length ? { ...withDistance[0], sequence: 1 } : null,
      excludedWithoutVerifiedLocation: remaining.length - withDistance.length,
      advisoryOnly: true,
      requiresManagementApproval: true,
      message: 'Suggestion only — nearest eligible assigned service orders are sequenced from the technician current GPS. No work order is automatically reordered, reassigned, or started.'
    };
  }

  private haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  async getVerifiedLocation(napCode: string) {
    const nap = await this.prisma.nap.findUnique({ where: { napCode } });
    if (nap && nap.verified && nap.lat != null && nap.lng != null) return { source: 'VERIFIED_DB', lat: nap.lat, lng: nap.lng, napCode: nap.napCode, verified: true };
    return { source: 'NEEDS_CAPTURE', message: 'Technician should capture GPS during field activity', napCode };
  }
  async reportMismatch(data: any) {
    const mismatch = await this.prisma.mismatch.create({ data: { workOrderId: data.workOrderId, type: data.type, dbValue: data.dbValue, reportedValue: data.reportedValue, reportedBy: data.reportedBy, status: 'PENDING' } });
    await this.prisma.auditLog.create({ data: { workOrderId: data.workOrderId, actorId: data.reportedBy, action: 'MISMATCH_REPORTED', details: data } });
    return { mismatch, workflow: 'REPORT MISMATCH -> Supervisor Review -> Verify -> Approve/Reject Update' };
  }
  async reviewMismatch(mismatchId: string, decision: 'APPROVED'|'REJECTED', reviewedBy: string) {
    return this.prisma.mismatch.update({ where: { id: mismatchId }, data: { status: decision, reviewedBy, reviewedAt: new Date() } as any });
  }
  async createTransfer(data: any) {
    const transfer = await this.prisma.transfer.create({ data: { workOrderId: data.workOrderId, oldNapId: data.oldNapId, oldPort: data.oldPort, oldLat: data.oldLat, oldLng: data.oldLng, newNapId: data.newNapId, newPort: data.newPort, newLat: data.newLat, newLng: data.newLng } });
    return { transfer, structure: { OLD_ADDRESS: { gps: { lat: data.oldLat, lng: data.oldLng }, nap: data.oldNapId, port: data.oldPort }, TRANSFER: 'TRANSFER', NEW_ADDRESS: { gps: { lat: data.newLat, lng: data.newLng }, nap: data.newNapId, port: data.newPort } }, note: 'Old history preserved' };
  }
}
