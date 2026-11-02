// src/lib/email-sender.ts
import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.gmail.com",
  port: Number(process.env.SMTP_PORT || 587),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendInvoiceEmail(params: {
  to: string;
  invoiceNumber: string;
  customerName: string;
  totalAmount: number;
  pdfBuffer: Buffer;
  companyName: string;
}) {
  const fmt = new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
  });

  await transporter.sendMail({
    from: `"${params.companyName}" <${process.env.SMTP_USER}>`,
    to: params.to,
    subject: `Invoice ${params.invoiceNumber} from ${params.companyName}`,
    html: `
      <p>Dear ${params.customerName},</p>
      <p>Please find attached invoice <strong>${params.invoiceNumber}</strong>
         for <strong>${fmt.format(params.totalAmount)}</strong>.</p>
      <p>Regards,<br/>${params.companyName}</p>
    `,
    attachments: [
      {
        filename: `Invoice-${params.invoiceNumber}.pdf`,
        content: params.pdfBuffer,
        contentType: "application/pdf",
      },
    ],
  });
}