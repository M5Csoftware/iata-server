export interface DimensionEntry {
  lengthCm: number;
  widthCm: number;
  heightCm: number;
  pieces: number;
}

/**
 * Calculates volumetric weight according to IATA Air Cargo Standard:
 * Volumetric Weight (kg) = (Length cm * Width cm * Height cm * Pieces) / 6000
 */
export function calculateVolumetricWeight(dimensions: DimensionEntry[]): number {
  if (!dimensions || dimensions.length === 0) return 0;
  const totalCm3 = dimensions.reduce(
    (acc, dim) => acc + (dim.lengthCm || 0) * (dim.widthCm || 0) * (dim.heightCm || 0) * (dim.pieces || 1),
    0
  );
  return parseFloat((totalCm3 / 6000).toFixed(2));
}

/**
 * Determines chargeable weight: higher of actual weight and volumetric weight
 */
export function calculateChargeableWeight(actualWeightKg: number, volumetricWeightKg: number): number {
  return parseFloat(Math.max(actualWeightKg || 0, volumetricWeightKg || 0).toFixed(2));
}

/**
 * Calculates standard freight breakdown and surcharges
 */
export function calculateFreightCharges(params: {
  chargeableWeightKg: number;
  ratePerKg?: number;
  fuelRatePerKg?: number;
  securityRatePerKg?: number;
  handlingFee?: number;
  gstRate?: number;
}) {
  const {
    chargeableWeightKg,
    ratePerKg = chargeableWeightKg > 300 ? 175 : chargeableWeightKg > 100 ? 195 : 220,
    fuelRatePerKg = 22,
    securityRatePerKg = 8,
    handlingFee = 1200,
    gstRate = 0.18,
  } = params;

  const freightAmount = parseFloat((chargeableWeightKg * ratePerKg).toFixed(2));
  const fuelSurcharge = parseFloat((chargeableWeightKg * fuelRatePerKg).toFixed(2));
  const securitySurcharge = parseFloat((chargeableWeightKg * securityRatePerKg).toFixed(2));
  const subtotal = parseFloat((freightAmount + fuelSurcharge + securitySurcharge + handlingFee).toFixed(2));
  const gstAmount = parseFloat((subtotal * gstRate).toFixed(2));
  const totalAmount = parseFloat((subtotal + gstAmount).toFixed(2));

  return {
    ratePerKg,
    freightAmount,
    fuelSurcharge,
    securitySurcharge,
    handlingFee,
    subtotal,
    gstAmount,
    totalAmount,
  };
}

