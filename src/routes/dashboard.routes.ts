import { FastifyInstance } from 'fastify';
import { AwbStock } from '../models/AwbStock.js';
import { Mawb } from '../models/Mawb.js';
import { Booking } from '../models/Booking.js';
import { Docket } from '../models/Docket.js';
import { FlightManifest } from '../models/FlightManifest.js';
import { EawbMessage } from '../models/EawbMessage.js';
import { CassInvoice } from '../models/CassInvoice.js';

export default async function dashboardRoutes(fastify: FastifyInstance) {
  fastify.get('/api/dashboard/stats', {
    schema: {
      tags: ['Dashboard & Analytics'],
      summary: 'Get operational KPIs, stage pipeline metrics & recent shipments',
    },
    handler: async (_request, reply) => {
      const [
        availableStockCount,
        allottedStockCount,
        issuedMawbCount,
        manifestedMawbCount,
        departedMawbCount,
        pendingBookingsCount,
        totalBookingsCount,
        docketsCount,
        manifestsCount,
        eawbTotal,
        eawbAck,
        invoicesTotal,
        invoicesReconciled,
        recentMawbs,
        recentDockets,
      ] = await Promise.all([
        AwbStock.countDocuments({ status: 'AVAILABLE' }),
        AwbStock.countDocuments({ status: 'ALLOTTED' }),
        Mawb.countDocuments({ status: 'ISSUED' }),
        Mawb.countDocuments({ status: 'MANIFESTED' }),
        Mawb.countDocuments({ status: 'DEPARTED' }),
        Booking.countDocuments({ status: 'PENDING_AWB' }),
        Booking.countDocuments(),
        Docket.countDocuments(),
        FlightManifest.countDocuments(),
        EawbMessage.countDocuments(),
        EawbMessage.countDocuments({ status: 'ACKNOWLEDGED' }),
        CassInvoice.countDocuments(),
        CassInvoice.countDocuments({ cassReconciliationStatus: 'RECONCILED' }),
        Mawb.find().sort({ createdAt: -1 }).limit(5),
        Docket.find().sort({ createdAt: -1 }).limit(5),
      ]);

      // Calculate total live gross tonnage
      const liveMawbs = await Mawb.find({ status: { $in: ['ISSUED', 'MANIFESTED', 'DEPARTED'] } }).select('grossWeightKg hawbs');
      const totalLiveGrossWeightKg = liveMawbs.reduce((sum, m) => sum + (m.grossWeightKg || 0), 0);
      const activeConsolidationsCount = liveMawbs.filter((m) => m.hawbs && m.hawbs.length > 0).length;

      const eawbSuccessRate = eawbTotal > 0 ? parseFloat(((eawbAck / eawbTotal) * 100).toFixed(1)) : 100;
      const cassReconciledRate = invoicesTotal > 0 ? parseFloat(((invoicesReconciled / invoicesTotal) * 100).toFixed(1)) : 100;

      return reply.send({
        success: true,
        stats: {
          availableStock: availableStockCount,
          allottedStock: allottedStockCount,
          issuedMawbs: issuedMawbCount,
          manifestedMawbs: manifestedMawbCount,
          departedMawbs: departedMawbCount,
          pendingBookings: pendingBookingsCount,
          totalBookings: totalBookingsCount,
          totalDockets: docketsCount,
          totalManifests: manifestsCount,
          totalLiveTonnageKg: totalLiveGrossWeightKg,
          activeConsolidations: activeConsolidationsCount,
          eawbSuccessRate,
          cassReconciledRate,
        },
        pipeline: {
          stockAvailable: availableStockCount,
          bookedDockets: docketsCount,
          issuedMawbs: issuedMawbCount,
          manifestedFlights: manifestsCount,
          departedFlights: departedMawbCount,
        },
        recentMawbs,
        recentDockets,
      });
    },
  });
}
