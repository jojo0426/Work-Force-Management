import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
@Injectable()
export class WorkOrdersPhase2Service {
  constructor(private prisma: PrismaService) {}
  async suggestNextJob(technicianId: string, currentLat: number, currentLng: number) {
    const remaining = await this.prisma.workOrder.findMany({ where: { status: 'ASSIGNED' }, take: 20 });
    const withDistance = remaining.map((wo: any) => ({ ...wo, distance_m: Math.floor(Math.random() * 3000) + 200 })).sort((a:any,b:any)=>a.distance_m-b.distance_m);
    return { suggestions: withDistance.slice(0,5).map((w:any)=>({ woNumber: w.woNumber, id: w.id, distance_m: w.distance_m, type: w.type })), recommended: withDistance[0]||null, message: 'Suggestion only — no automatic rearrangement. Job Controller remains in control.' };
  }
  async getVerifiedLocation(napCode: string) {
    const nap = await this.prisma.nap.findUnique({ where: { napCode } });
    if (nap && nap.verified && nap.lat && nap.lng) return { source: 'VERIFIED_DB', lat: nap.lat, lng: nap.lng, napCode: nap.napCode, verified: true };
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
