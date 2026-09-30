import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole, WoStatus } from '@prisma/client';
import * as XLSX from 'xlsx';
import { PrismaService } from '../prisma.service';

@Injectable()
export class WorkOrdersService {
  constructor(private prisma: PrismaService) {}

  parseExcel(buffer: Buffer) {
    const wb = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const rows: any[] = XLSX.utils.sheet_to_json(sheet, { defval: '' });
    const requiredColumns = ['ACCOUNT NUMBER', 'NAME', 'ADDRESS', 'CONTACT NUMBER', 'PLAN', 'JOB ORDER'];
    const actualColumns = rows.length > 0 ? Object.keys(rows[0]).map((key) => key.toString().trim().toUpperCase()) : [];
    const missingColumns = requiredColumns.filter((column) => !actualColumns.includes(column));
    if (missingColumns.length > 0) return { total: rows.length, valid: 0, invalid: rows.length, requiredColumns, missingColumns, templateValid: false, preview: [], all: [] };

    const parsed = rows.map((r, idx) => {
      const errors: string[] = [];
      const normalized: Record<string, any> = {};
      for (const [key, value] of Object.entries(r)) normalized[key.trim().toUpperCase()] = value;
      const accountNumber = (normalized['ACCOUNT NUMBER'] ?? '').toString().trim();
      const name = (normalized['NAME'] ?? '').toString().trim();
      const address = (normalized['ADDRESS'] ?? '').toString().trim();
      const contactNumber = (normalized['CONTACT NUMBER'] ?? '').toString().trim();
      const plan = (normalized['PLAN'] ?? '').toString().trim();
      const jobOrder = (normalized['JOB ORDER'] ?? '').toString().trim();
      if (!accountNumber) errors.push('Missing account number');
      if (!name) errors.push('Missing name');
      if (!address) errors.push('Missing address');
      if (!contactNumber) errors.push('Missing contact number');
      if (!plan) errors.push('Missing plan');
      if (!jobOrder) errors.push('Missing job order');
      return { row: idx + 2, accountNumber, name, address, contactNumber, plan, jobOrder, errors, valid: errors.length === 0 };
    });
    const validCount = parsed.filter((p) => p.valid).length;
    return { total: rows.length, valid: validCount, invalid: rows.length - validCount, requiredColumns, missingColumns: [], templateValid: true, preview: parsed.slice(0, 50), all: parsed };
  }

  async bulkCreateFromParsed(parsed: any[], createdBy: string) {
    const results = [];
    for (const p of parsed) {
      if (!p.valid) continue;
      try {
        let sub = await this.prisma.subscriber.findUnique({ where: { accountNumber: p.accountNumber } });
        if (!sub) sub = await this.prisma.subscriber.create({ data: { accountNumber: p.accountNumber, name: p.name, address: p.address, contactNumber: p.contactNumber, plan: p.plan } });
        else sub = await this.prisma.subscriber.update({ where: { id: sub.id }, data: { name: p.name, address: p.address, contactNumber: p.contactNumber, plan: p.plan } });
        const existingWo = await this.prisma.workOrder.findUnique({ where: { woNumber: p.jobOrder } });
        if (existingWo) { results.push({ skipped: true, reason: 'JOB_ORDER_ALREADY_EXISTS', workOrder: existingWo }); continue; }
        const wo = await this.prisma.workOrder.create({ data: { woNumber: p.jobOrder, type: 'REPAIR', status: 'DRAFT', subscriberId: sub.id, createdBy } });
        results.push({ skipped: false, workOrder: wo });
      } catch (e) { console.error('Create WO failed', p.jobOrder, e); }
    }
    return results;
  }

  async listEligibleTeams() {
    const teams = await this.prisma.team.findMany({
      orderBy: { name: 'asc' },
      include: { users: { where: { role: UserRole.TECHNICIAN, isActive: true }, select: { id: true, name: true, status: true, lastLat: true, lastLng: true, lastLocationAt: true } } }
    });
    return teams.map((team) => ({ id: team.id, name: team.name, activeTechnicians: team.users.length, technicians: team.users }));
  }

  async assignToTeam(workOrderId: string, teamId: string, assignedBy: string) {
    const [workOrder, team] = await Promise.all([
      this.prisma.workOrder.findUnique({ where: { id: workOrderId } }),
      this.prisma.team.findUnique({ where: { id: teamId }, include: { users: { where: { role: UserRole.TECHNICIAN, isActive: true }, select: { id: true } } } })
    ]);
    if (!workOrder) throw new NotFoundException('Work order not found');
    if (!team) throw new NotFoundException('Team not found');
    if (team.users.length === 0) throw new BadRequestException('Selected team has no active technicians');
    const blockedStatuses: WoStatus[] = [WoStatus.WORKING, WoStatus.COMPLETED, WoStatus.CANCELLED];
    if (blockedStatuses.includes(workOrder.status)) throw new BadRequestException(`Cannot assign a ${workOrder.status.toLowerCase()} work order`);

    return this.prisma.$transaction(async (tx) => {
      const current = await tx.assignment.findMany({ where: { workOrderId } });
      await tx.assignment.deleteMany({ where: { workOrderId } });
      const assignment = await tx.assignment.create({ data: { workOrderId, teamId, assignedBy } });
      const updated = await tx.workOrder.update({ where: { id: workOrderId }, data: { status: WoStatus.ASSIGNED } });
      await tx.auditLog.create({ data: { workOrderId, actorId: assignedBy, action: current.length ? 'WORK_ORDER_REASSIGNED' : 'WORK_ORDER_ASSIGNED', details: { teamId, previousTeamIds: current.map((a) => a.teamId) } } });
      return { assignment, workOrder: updated };
    });
  }

  async findNearbyTechnicians(lat: number, lng: number, radiusMeters = 3000) {
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) throw new BadRequestException('Valid latitude and longitude are required');
    const techs = await this.prisma.user.findMany({ where: { role: UserRole.TECHNICIAN, isActive: true }, take: 100 });
    return techs.filter((t) => t.lastLat != null && t.lastLng != null).map((t) => {
      const distance = this.haversine(lat, lng, t.lastLat!, t.lastLng!);
      return { id: t.id, name: t.name, team: t.teamId, status: t.status, distance_m: Math.round(distance), lastLocationAt: t.lastLocationAt, isStale: t.lastLocationAt ? Date.now() - new Date(t.lastLocationAt).getTime() > 5 * 60 * 1000 : true };
    }).filter((t) => t.distance_m <= radiusMeters).sort((a, b) => a.distance_m - b.distance_m);
  }

  haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371000; const dLat = (lat2 - lat1) * Math.PI / 180; const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }
}
