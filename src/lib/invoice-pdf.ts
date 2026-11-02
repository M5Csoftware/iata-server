// src/lib/invoice-pdf.ts
import puppeteer from "puppeteer";

const fmt = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  }).format(n || 0);

export async function buildInvoicePdf(
  invoice: any,
  agentProfile: any,
): Promise<Buffer> {
  const html = `
<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  body { font-family: Helvetica, Arial, sans-serif; padding: 30px; font-size: 12px; color: #111; }
  .header { display: flex; justify-content: space-between; border-bottom: 1px solid #000; padding-bottom: 12px; margin-bottom: 15px; }
  .h1 { font-size: 20px; font-weight: bold; }
  .h2 { font-size: 14px; font-weight: bold; margin-top: 12px; }
  .label { font-size: 10px; color: #666; margin-bottom: 2px; }
  .bold { font-weight: bold; }
  .row { display: flex; gap: 20px; margin-bottom: 10px; }
  .col { flex: 1; }
  table { width: 100%; border-collapse: collapse; margin-top: 12px; }
  th, td { padding: 6px; font-size: 11px; text-align: left; }
  th { border-bottom: 1px solid #000; }
  td { border-bottom: 1px solid #eee; }
  .right { text-align: right; }
  .total { border-top: 1px solid #000; font-weight: bold; }
  .footer { margin-top: 30px; text-align: center; font-size: 10px; color: #666; }
  .logo { max-height: 60px; }
</style>
</head>
<body>
  <div class="header">
    <div>
      ${invoice.companyLogoUrl ? `<img src="${invoice.companyLogoUrl}" class="logo" />` : ""}
      <div class="h1">${invoice.companyName || agentProfile?.name || "Cargo Agency"}</div>
      <div>${agentProfile?.headOfficeAddress || ""}</div>
      <div>${agentProfile?.city || ""}, ${agentProfile?.country || ""}</div>
      <div>GSTIN: ${agentProfile?.gstNumber || ""}</div>
    </div>
    <div style="text-align:right;">
      <div class="h1">TAX INVOICE</div>
      <div style="font-size:12px; margin-top:6px;">${invoice.invoiceNumber || "DRAFT"}</div>
      <div>Date: ${invoice.date}</div>
      <div>Due: ${invoice.dueDate || "N/A"}</div>
    </div>
  </div>

  <div class="row">
    <div class="col">
      <div class="label">BILL TO</div>
      <div class="bold">${invoice.customerName}</div>
      <div>${invoice.customerAddress || ""}</div>
      <div>GSTIN: ${invoice.customerGstId || "Unregistered"}</div>
    </div>
    <div class="col">
      <div class="label">SHIPMENT REF</div>
      ${(invoice.shipmentDetails ?? [])
        .map((s: any) => `<div>${s.hawbNumber || s.mawbNumber} · ${s.origin}→${s.destination}</div>`)
        .join("")}
    </div>
  </div>

  <table>
    <thead>
      <tr><th>Description</th><th class="right">Amount</th></tr>
    </thead>
    <tbody>
      ${(invoice.chargeLines ?? [])
        .map((line: any) => `<tr><td>${line.description}</td><td class="right">${fmt(line.amount)}</td></tr>`)
        .join("")}
      <tr><td>Discount</td><td class="right">−${fmt(invoice.discountAmount ?? 0)}</td></tr>
      <tr><td>Taxable Value</td><td class="right">${fmt(invoice.subtotal - (invoice.discountAmount ?? 0))}</td></tr>
      <tr>
        <td>${invoice.gstType === "CGST_SGST" ? "CGST + SGST" : "IGST"} (${invoice.gstRate ?? 18}%)</td>
        <td class="right">${fmt(invoice.gstAmount)}</td>
      </tr>
      <tr class="total">
        <td>TOTAL</td>
        <td class="right">${fmt(invoice.totalAmount)}</td>
      </tr>
    </tbody>
  </table>

  ${invoice.companyBankDetails
    ? `<div class="h2">Bank Details</div><div>${invoice.companyBankDetails}</div>`
    : ""}

  <div class="h2">Terms &amp; Conditions</div>
  <div style="font-size:10px;">${invoice.companyTerms || "Payment due by the due date shown above."}</div>

  <div class="footer">
    ${invoice.companyName || agentProfile?.name || "Cargo Agency"} · Computer-generated invoice.
  </div>
</body>
</html>`;

  const browser = await puppeteer.launch({
    headless: true,
    args: ["--no-sandbox", "--disable-setuid-sandbox"],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "load" });
    const pdf = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "10mm", right: "10mm", bottom: "10mm", left: "10mm" },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}