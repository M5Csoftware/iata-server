/**
 * Cargo-IMP Standard Message Generators (FWB, FHL, FFM, FSU)
 */

export function generateFwbMessage(mawb: {
  mawbNumber: string;
  origin: string;
  destination: string;
  pieces: number;
  grossWeightKg: number;
  chargeableWeightKg: number;
  ratePerKg: number;
  freightAmount: number;
  natureOfGoods: string;
  shipperName: string;
  shipperAddress: string;
  consigneeName: string;
  consigneeAddress: string;
  issuingAgentName: string;
  issuingAgentIataCode: string;
  handlingCode?: string;
  flightNumber?: string;
  flightDate?: string;
}): string {
  const cleanAwb = mawb.mawbNumber.replace(/[^0-9]/g, '');
  const fltNum = mawb.flightNumber || 'AI121';
  const fltDate = mawb.flightDate ? mawb.flightDate.replace(/-/g, '').slice(4) : '30OCT';
  const agentCode = (mawb.issuingAgentIataCode || '').replace(/[^0-9]/g, '').slice(0, 7) || '1439821';

  return `FWB/16
${cleanAwb}${mawb.origin}${mawb.destination}/T${mawb.pieces}K${mawb.grossWeightKg}
FLT/${fltNum}/${fltDate}
RTD/1/P${mawb.pieces}/K${mawb.grossWeightKg}/CQ/W${mawb.chargeableWeightKg}/R${mawb.ratePerKg}/T${mawb.freightAmount}
/NG/${(mawb.natureOfGoods || 'GENERAL CARGO').toUpperCase().slice(0, 30)}
SHP
/${(mawb.shipperName || '').toUpperCase().slice(0, 35)}
/${(mawb.shipperAddress || '').toUpperCase().slice(0, 35)}
CNE
/${(mawb.consigneeName || '').toUpperCase().slice(0, 35)}
/${(mawb.consigneeAddress || '').toUpperCase().slice(0, 35)}
AGT//${agentCode}
/${(mawb.issuingAgentName || '').toUpperCase().slice(0, 35)}
SPH/${mawb.handlingCode || 'GEN'}`;
}

export function generateFhlMessage(
  mawb: { mawbNumber: string; origin: string; destination: string; pieces: number; grossWeightKg: number },
  hawbs: Array<{ hawbNumber: string; origin: string; destination: string; pieces: number; grossWeightKg: number; natureOfGoods: string }>
): string {
  const cleanAwb = mawb.mawbNumber.replace(/[^0-9]/g, '');
  const hawbLines = hawbs
    .map(
      (h) => `HBS/${h.hawbNumber}/${h.origin}${h.destination}/${h.pieces}/K${h.grossWeightKg}/${(h.natureOfGoods || 'CARGO').slice(0, 15).toUpperCase()}`
    )
    .join('\n');

  return `FHL/4
MBI/${cleanAwb}${mawb.origin}${mawb.destination}/T${mawb.pieces}K${mawb.grossWeightKg}
${hawbLines}`;
}

export function generateFfmMessage(manifest: {
  flightNumber: string;
  flightDate: string;
  origin: string;
  destination: string;
  totalPieces: number;
  totalGrossWeightKg: number;
  mawbs: string[];
}): string {
  const mawbEntries = manifest.mawbs.map((m) => `AWB/${m.replace(/-/g, '')}`).join('\n');

  return `FFM/9
FLT/${manifest.flightNumber}/${manifest.flightDate.replace(/-/g, '')}
POU/${manifest.origin}/${manifest.destination}
${mawbEntries}
TOT/P${manifest.totalPieces}/K${manifest.totalGrossWeightKg}`;
}

export function generateFsuMessage(params: {
  awbNumber: string;
  statusType: 'RCS' | 'MAN' | 'DEP' | 'ARR' | 'DLV';
  station: string;
  pieces: number;
  weightKg: number;
  flightNumber?: string;
}): string {
  const cleanAwb = params.awbNumber.replace(/[^0-9]/g, '');
  return `FSU/15
AWB/${cleanAwb}
${params.statusType}/${params.station}/P${params.pieces}/K${params.weightKg}${params.flightNumber ? `/${params.flightNumber}` : ''}`;
}

