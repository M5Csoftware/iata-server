// src/lib/e-invoice.ts
import axios from "axios";

export interface EInvoiceResult {
  irn: string;
  ackNo: string;
  ackDate: string;
  qrCodeUrl: string;
}

export async function generateEInvoice(payload: {
  invoiceNumber: string;
  invoiceDate: string;
  customerGstin: string;
  customerName: string;
  customerAddress: string;
  customerStateCode: string;
  totalAmount: number;
  taxableAmount: number;
  gstAmount: number;
  cgstAmount?: number;
  sgstAmount?: number;
  igstAmount?: number;
  items: { description: string; amount: number; sacCode: string }[];
}): Promise<EInvoiceResult> {
  const baseUrl = process.env.EINVOICE_BASE_URL;
  if (!baseUrl) throw new Error("EINVOICE_BASE_URL not configured");

  // Step 1: Authenticate
  const authRes = await axios.post(`${baseUrl}/eivital/v1.04/auth`, {
    UserName: process.env.EINVOICE_USERNAME,
    Password: process.env.EINVOICE_PASSWORD,
    ClientID: process.env.EINVOICE_CLIENT_ID,
    ClientSecret: process.env.EINVOICE_CLIENT_SECRET,
    ForceRefreshAccessToken: false,
  });

  const authToken = authRes.data?.Data?.AuthToken;
  if (!authToken) throw new Error("E-invoice auth failed");

  // Step 2: Submit invoice
  const irnRes = await axios.post(
    `${baseUrl}/eiirp/v1.03/INV01`,
    {
      Version: "1.1",
      TranDtls: { TaxSch: "GST", SupTyp: "B2B", RegRev: "N" },
      DocDtls: {
        Typ: "INV",
        No: payload.invoiceNumber,
        Dt: payload.invoiceDate,
      },
      SellerDtls: { Gstin: process.env.EINVOICE_GSTIN },
      BuyerDtls: {
        Gstin: payload.customerGstin,
        LglNm: payload.customerName,
        Pos: payload.customerStateCode,
        Addr1: payload.customerAddress,
      },
      ItemList: payload.items.map((item, idx) => ({
        SlNo: String(idx + 1),
        PrdDesc: item.description,
        HsnCd: item.sacCode,
        Qty: 1,
        Unit: "NOS",
        UnitPrice: item.amount,
        TotAmt: item.amount,
        AssAmt: item.amount,
        GstRt: 18,
        CgstAmt: (payload.cgstAmount || 0) / Math.max(1, payload.items.length),
        SgstAmt: (payload.sgstAmount || 0) / Math.max(1, payload.items.length),
        IgstAmt: (payload.igstAmount || 0) / Math.max(1, payload.items.length),
        TotItemVal: item.amount * 1.18,
      })),
      ValDtls: {
        AssVal: payload.taxableAmount,
        CgstVal: payload.cgstAmount || 0,
        SgstVal: payload.sgstAmount || 0,
        IgstVal: payload.igstAmount || 0,
        TotInvVal: payload.totalAmount,
      },
    },
    { headers: { Authorization: `Bearer ${authToken}` } },
  );

  return {
    irn: irnRes.data.Irn,
    ackNo: irnRes.data.AckNo,
    ackDate: irnRes.data.AckDt,
    qrCodeUrl: irnRes.data.SignedQRCode,
  };
}