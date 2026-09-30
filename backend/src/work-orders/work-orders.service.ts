import { Injectable } from '@nestjs/common';
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

    const parsed = rows.map((r, idx) => {
      const errors: string[] = [];
      const woNumber = (r['WO Number'] || r['WO_NUMBER'] || r['Work Order'] || `WO-${Date.now()}-${idx}`).toString().trim();
      const typeRaw = (r['Type'] || r['Work Order Type'] || 'REPAIR').toString().toUpperCase();
      let type: 'REPAIR' | 'INSTALLATION' | 'TRANSFER' = 'REPAIR';
      if (typeRaw.includes('INSTALL')) type = 'INSTALLATION';
      if (typeRaw.includes('TRANSFER') || typeRaw.includes('CHANGE')) type = 'TRANSFER';

      const subscriber = (r['Subscriber'] || r['Name'] || r['Customer'] || '').toString().trim();
      const address = (r['Address'] || '').toString().trim();
      const nap = (r['NAP'] || r['NAP Number'] || '').toString().trim();
      const port = r['Port'] ? parseInt(r['Port']) : null;

      if (!subscriber) errors.push('Missing subscriber name');
      if (!address) errors.push('Missing address');
      if (type !== 'REPAIR' && !nap) errors.push('NAP required for installation/transfer');

      return {
        row: idx + 2,
        woNumber,
        type,
        subscriber,
        address,
        nap,
        port,
        remarks: r['Remarks'] || r['Notes'] || '',
        errors,
        valid: errors.length === 0
      };
    });

    const validCount = parsed.filter(p => p.valid).length;
    return {
      total: rows.length,
      valid: validCount,
      invalid: rows.length - validCount,
      preview: parsed.slice(0, 50),
      all: parsed
    };
  }

  async bulkCreateFromParsed(parsed: any[], createdBy: string) {
    const results = [];
    for (const p of parsed) {
      if (!p.valid) continue;
      try {
        // Find or create subscriber
        let sub = await this.prisma.subscriber.findFirst({ where: { name: p.subscriber, address: p.address } });
        if (!sub) {
          sub = await this.prisma.subscriber.create({
            data: { name: p.subscriber, address: p.address }
          });
        }
        // Find NAP if provided
        let nap = null;
        if (p.nap) {
          nap = await this.prisma.nap.findUnique({ where: { napCode: p.nap } });
          if (!nap) {
            nap = await this.prisma.nap.create({ data: { napCode: p.nap, address: p.address } });
          }
        }

        const wo = await this.prisma.workOrder.create({
          data: {
            woNumber: p.woNumber,
            type: p.type,
            status: 'DRAFT',
            subscriberId: sub.id,
            remarks: p.remarks,
            createdBy
          }
        });
        results.push(wo);
      } catch (e) {
        console.error('Create WO failed', p.woNumber, e);
      }
    }
    return results;
  }

  async findNearbyTechnicians(lat: number, lng: number, radiusMeters = 3000) {
    // In production: use PostGIS ST_DWithin
    // For Phase 1: return mock + real locations from DB
    const techs = await this.prisma.user.findMany({ where: { role: 'TECHNICIAN' }, take: 20 });
    // Calculate haversine distance
    const withDist = techs.map(t => {
      const d = t.lastLat && t.lastLng ? this.haversine(lat, lng, t.lastLat, t.lastLng) : Math.random() * 5000;
      return {
        id: t.id,
        name: t.name,
        team: t.teamId || 'Team A',
        status: t.status,
        distance_m: Math.round(d),
        lastLocationAt: t.lastLocationAt,
        isStale: t.lastLocationAt ? (Date.now() - new Date(t.lastLocationAt).getTime()) > 5*60*1000 : true
      };
    }).filter(t => t.distance_m <= radiusMeters).sort((a,b) => a.distance_m - b.distance_m);

    if (withDist.length === 0) {
      // Fallback mock for demo if no real locations yet
      return [
        { id: 'team-a', name: 'Team A — J. Garcia', team: 'Team A', status: 'AVAILABLE', distance_m: 650, isStale: false },
        { id: 'team-b', name: 'Team B — M. Santos', team: 'Team B', status: 'WORKING', distance_m: 1400, isStale: false },
        { id: 'team-c', name: 'Team C — L. Reyes', team: 'Team C', status: 'ONLINE', distance_m: 3200, isStale: true, lastLocationAt: new Date(Date.now()-10*60*1000) },
      ];
    }
    return withDist;
  }

  haversine(lat1: number, lon1: number, lat2: number, lon2: number) {
    const R = 6371000;
    const dLat = (lat2-lat1)*Math.PI/180;
    const dLon = (lon2-lon1)*Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }
}
