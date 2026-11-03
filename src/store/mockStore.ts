import {
  SEED_AGENT_PROFILE,
  SEED_AIRLINES,
  SEED_AIRPORTS,
  SEED_PARTNERS,
  SEED_STOCK,
  SEED_DOCKETS,
  SEED_BOOKINGS,
  SEED_MAWBS,
  SEED_MANIFESTS,
  SEED_EAWB_MESSAGES,
  SEED_INVOICES,
  SEED_USERS,
} from '../seeds/seedData.js';

export interface UserAccount {
  id: string;
  username: string;
  password?: string;
  fullName: string;
  role: 'admin' | 'user';
  email: string;
  stationCode: string;
  isActive: boolean;
  permissions: string[];
  avatar?: string;
}

export interface AwbStockItem {
  id: string;
  airlinePrefix: string;
  airlineNumber: string;
  fullAwbNumber: string;
  status: 'AVAILABLE' | 'ALLOTTED' | 'ISSUED' | 'VOID';
  allocatedTo?: string;
  issuedAt?: string;
  voidReason?: string;
  createdAt: string;
}

export interface DimensionEntry {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  pieces: number;
}

export interface DocketItem {
  id: string;
  docketNumber: string;
  bookingDate: string;
  serviceMode: 'EXPRESS_AIR' | 'STANDARD_AIR' | 'PRIORITY_AOG' | 'COLD_CHAIN';
  paymentMode: 'PREPAID' | 'TO_PAY' | 'ON_ACCOUNT';
  origin: string;
  destination: string;
  consignorName: string;
  consignorAddress: string;
  consignorPhone: string;
  consignorGst: string;
  consigneeName: string;
  consigneeAddress: string;
  consigneePhone: string;
  consigneeGst: string;
  pieces: number;
  packageType: string;
  actualWeightKg: number;
  dimensions: DimensionEntry[];
  volumetricWeightKg: number;
  chargeableWeightKg: number;
  natureOfGoods: string;
  handlingCode: string;
  declaredValue: number;
  ewayBillNumber?: string;
  ratePerKg: number;
  freightAmount: number;
  docketFee: number;
  fuelSurcharge: number;
  securitySurcharge: number;
  subtotal: number;
  gstAmount: number;
  totalAmount: number;
  assignedAwb?: string;
  status: 'BOOKED' | 'AWB_ASSIGNED' | 'MANIFESTED' | 'IN_TRANSIT' | 'DELIVERED' | 'CANCELLED';
  createdAt: string;
}

export interface BookingItem {
  id: string;
  bookingRef: string;
  shipperName: string;
  consigneeName: string;
  origin: string;
  destination: string;
  pieces: number;
  actualWeightKg: number;
  dimensions: DimensionEntry[];
  volumetricWeightKg: number;
  chargeableWeightKg: number;
  natureOfGoods: string;
  handlingCode: string;
  status: 'PENDING_AWB' | 'AWB_ISSUED' | 'CANCELLED';
  assignedAwb?: string;
  createdAt: string;
}

export interface HawbItem {
  id: string;
  hawbNumber: string;
  mawbNumber: string;
  shipperName: string;
  consigneeName: string;
  origin: string;
  destination: string;
  pieces: number;
  grossWeightKg: number;
  chargeableWeightKg: number;
  natureOfGoods: string;
  status: string;
}

export interface MawbItem {
  id: string;
  mawbNumber: string;
  airlinePrefix: string;
  serialNumber: string;
  bookingId?: string;
  docketId?: string;
  shipperName: string;
  shipperAddress: string;
  consigneeName: string;
  consigneeAddress: string;
  issuingAgentName: string;
  issuingAgentIataCode: string;
  origin: string;
  destination: string;
  pieces: number;
  grossWeightKg: number;
  chargeableWeightKg: number;
  rateClass: 'M' | 'N' | 'Q' | 'C';
  ratePerKg: number;
  freightAmount: number;
  fuelSurcharge: number;
  securitySurcharge: number;
  totalCharges: number;
  natureOfGoods: string;
  handlingCode: string;
  flightNumber?: string;
  flightDate?: string;
  hawbs: HawbItem[];
  status: 'AVAILABLE' | 'ALLOTTED' | 'ISSUED' | 'MANIFESTED' | 'DEPARTED' | 'ARRIVED' | 'DELIVERED' | 'VOID';
  issuedAt: string;
  fwbSent: boolean;
  createdAt: string;
}

export interface FlightManifestItem {
  id: string;
  manifestNumber: string;
  flightNumber: string;
  airline: string;
  flightDate: string;
  origin: string;
  destination: string;
  mawbs: string[];
  totalMawbs: number;
  totalHawbs: number;
  totalPieces: number;
  totalGrossWeightKg: number;
  status: 'DRAFT' | 'FINALIZED' | 'DEPARTED';
  finalizedAt?: string;
  createdAt: string;
}

export interface EawbMessageItem {
  id: string;
  messageType: 'FWB' | 'FHL' | 'FFM' | 'FSU';
  awbNumber: string;
  airline: string;
  flightNumber?: string;
  direction: 'OUTBOUND' | 'INBOUND';
  status: 'ACKNOWLEDGED' | 'SENT' | 'FAILED' | 'RETRYING';
  timestamp: string;
  rawCargoImp: string;
  createdAt: string;
}

export interface CassInvoiceItem {
  id: string;
  invoiceNumber: string;
  mawbNumber: string;
  customerName: string;
  date: string;
  freightCharges: number;
  fuelSurcharge: number;
  securitySurcharge: number;
  handlingCharges: number;
  subtotal: number;
  gstAmount: number;
  totalAmount: number;
  cassReconciliationStatus: 'RECONCILED' | 'PENDING_MATCH' | 'DISCREPANCY';
  paymentStatus: 'PAID' | 'UNPAID' | 'PARTIAL';
  createdAt: string;
}

export interface AirlineItem {
  id: string;
  prefix: string;
  code: string;
  name: string;
  country: string;
}

export interface AirportItem {
  id: string;
  iataCode: string;
  name: string;
  city: string;
  country: string;
}

export interface PartnerItem {
  id: string;
  type: 'SHIPPER' | 'CONSIGNEE' | 'BOTH';
  name: string;
  accountNumber?: string;
  address: string;
  city: string;
  country: string;
  contactPerson: string;
  phone: string;
  email: string;
  taxOrGstId: string;
}

export interface AgentProfileItem {
  name: string;
  iataNumericCode: string;
  cassAddress: string;
  headOfficeAddress: string;
  city: string;
  country: string;
  phone: string;
  email: string;
  gstNumber: string;
  panNumber: string;
}

export interface AuditLogItem {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  performedBy: string;
  details?: any;
  reason?: string;
  timestamp: string;
}

class MockDataStore {
  public users: UserAccount[] = [];
  public stock: AwbStockItem[] = [];
  public dockets: DocketItem[] = [];
  public bookings: BookingItem[] = [];
  public mawbs: MawbItem[] = [];
  public manifests: FlightManifestItem[] = [];
  public eawbMessages: EawbMessageItem[] = [];
  public invoices: CassInvoiceItem[] = [];
  public airlines: AirlineItem[] = [];
  public airports: AirportItem[] = [];
  public partners: PartnerItem[] = [];
  public agentProfile: AgentProfileItem = { ...SEED_AGENT_PROFILE };
  public auditLogs: AuditLogItem[] = [];

  constructor() {
    this.resetToSeeds();
  }

  public resetToSeeds() {
    this.users = SEED_USERS.map((u, i) => ({
      ...u,
      id: `usr-${u.username}`,
    }));

    this.stock = SEED_STOCK.map((s, i) => ({
      ...s,
      id: `stk-${i + 1}`,
      createdAt: new Date().toISOString(),
    }));

    this.dockets = SEED_DOCKETS.map((d, i) => ({
      ...d,
      id: `dkt-${i + 1}`,
      createdAt: new Date().toISOString(),
    }));

    this.bookings = SEED_BOOKINGS.map((b, i) => ({
      ...b,
      id: `bkg-${i + 1}`,
      createdAt: new Date().toISOString(),
    }));

    this.mawbs = SEED_MAWBS.map((m, i) => ({
      ...m,
      id: `mawb-${i + 1}`,
      createdAt: new Date().toISOString(),
    }));

    this.manifests = SEED_MANIFESTS.map((mnf, i) => ({
      ...mnf,
      id: `mnf-${i + 1}`,
      createdAt: new Date().toISOString(),
    }));

    this.eawbMessages = SEED_EAWB_MESSAGES.map((msg, i) => ({
      ...msg,
      id: `msg-${i + 1}`,
      createdAt: new Date().toISOString(),
    }));

    this.invoices = SEED_INVOICES.map((inv, i) => ({
      ...inv,
      id: `inv-${i + 1}`,
      createdAt: new Date().toISOString(),
    }));

    this.airlines = SEED_AIRLINES.map((a, i) => ({
      ...a,
      id: `air-${i + 1}`,
    }));

    this.airports = SEED_AIRPORTS.map((ap, i) => ({
      ...ap,
      id: `apt-${i + 1}`,
    }));

    this.partners = SEED_PARTNERS.map((p, i) => ({
      ...p,
      id: `prt-${i + 1}`,
    }));

    this.agentProfile = { ...SEED_AGENT_PROFILE };
    this.auditLogs = [];
  }
}

export const mockStore = new MockDataStore();

