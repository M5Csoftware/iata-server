import { FastifyInstance } from 'fastify';
import { mockStore } from '../store/mockStore.js';

export default async function dashboardRoutes(fastify: FastifyInstance) {
  fastify.get('/api/dashboard/stats', {
    schema: {
      tags: ['Dashboard & Analytics'],
      summary: 'Get operational KPIs, stage pipeline metrics & recent shipments from mock store',
    },
    handler: async (_request, reply) => {
      const availableStockCount = mockStore.stock.filter((s) => s.status === 'AVAILABLE').length;
      const allottedStockCount = mockStore.stock.filter((s) => s.status === 'ALLOTTED').length;
      const issuedMawbCount = mockStore.mawbs.filter((m) => m.status === 'ISSUED').length;
      const manifestedMawbCount = mockStore.mawbs.filter((m) => m.status === 'MANIFESTED').length;
      const departedMawbCount = mockStore.mawbs.filter((m) => m.status === 'DEPARTED').length;
      const pendingBookingsCount = mockStore.bookings.filter((b) => b.status === 'PENDING_AWB').length;
      const totalBookingsCount = mockStore.bookings.length;
      const docketsCount = mockStore.dockets.length;
      const manifestsCount = mockStore.manifests.length;

      const eawbTotal = mockStore.eawbMessages.length;
      const eawbAck = mockStore.eawbMessages.filter((m) => m.status === 'ACKNOWLEDGED').length;
      const invoicesTotal = mockStore.invoices.length;
      const invoicesReconciled = mockStore.invoices.filter((i) => i.cassReconciliationStatus === 'RECONCILED').length;

      const liveMawbs = mockStore.mawbs.filter((m) => ['ISSUED', 'MANIFESTED', 'DEPARTED'].includes(m.status));
      const totalLiveGrossWeightKg = liveMawbs.reduce((sum, m) => sum + (m.grossWeightKg || 0), 0);
      const activeConsolidationsCount = liveMawbs.filter((m) => m.hawbs && m.hawbs.length > 0).length;

      const eawbSuccessRate = eawbTotal > 0 ? parseFloat(((eawbAck / eawbTotal) * 100).toFixed(1)) : 100;
      const cassReconciledRate = invoicesTotal > 0 ? parseFloat(((invoicesReconciled / invoicesTotal) * 100).toFixed(1)) : 100;

      const recentMawbs = mockStore.mawbs.slice(0, 5);
      const recentDockets = mockStore.dockets.slice(0, 5);

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
