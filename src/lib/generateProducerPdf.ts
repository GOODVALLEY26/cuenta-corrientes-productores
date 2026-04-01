import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const MONTHS_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtClp = (n: number) => Math.round(n).toLocaleString('es-CL');

interface PdfData {
  producer: { name: string; rut?: string };
  year: number;
  dryKg: number;
  totalInvoicedUsd: number;
  totalInvoicedClp: number;
  advances: { month: number; centsPerKg: number; advance: number; paid: boolean }[];
  totalAdvances: number;
  paidAdvances: number;
  nextAdvance: { month: number; centsPerKg: number; advance: number } | null;
  totalDryingUsd: number;
  totalDryingClp: number;
  discountByMonth: Record<number, number>;
  nextDiscount: number;
  nextPaymentGross: number;
  nextPaymentNet: number;
  method: string;
  needsDocument: boolean;
  docType: string;
  docNeededUsd: number;
  nextMonthEx: { rate: number; month: number } | null;
  docExRate: number | null;
  ivaSecado: number;
  ivaProductor: number;
  ivaSaldo: number;
  cuotaClp?: number;
  cuotaTotalPaidClp?: number;
  cuotaTotalPaidUsd?: number;
  cuotaSaldoClp?: number;
  cuotaDetails?: any[];
}

const methodLabel: Record<string, string> = {
  descuento_usd: 'Descuento en USD',
  pago_clp: 'Pago en CLP',
  liquidacion_fin_año: 'Liquidación fin de año',
  cuotas: 'Cuotas',
};

// Purple theme colors (from Goodvalley logo)
const PRIMARY: [number, number, number] = [75, 0, 110];       // Deep purple
const HEADER_BG: [number, number, number] = [75, 0, 110];
const ACCENT_GREEN: [number, number, number] = [22, 163, 74];
const ACCENT_RED: [number, number, number] = [220, 38, 38];
const MUTED_BG: [number, number, number] = [245, 240, 250];   // Light purple tint
const BORDER: [number, number, number] = [180, 160, 200];
const WHITE: [number, number, number] = [255, 255, 255];
const CARD_BORDER: [number, number, number] = [200, 180, 220];
const PURPLE_LIGHT: [number, number, number] = [120, 60, 160];

function drawCardBox(doc: jsPDF, x: number, y: number, w: number, h: number, title: string): number {
  // Card border
  doc.setDrawColor(...CARD_BORDER);
  doc.setLineWidth(0.5);
  doc.roundedRect(x, y, w, h, 2, 2, 'S');

  // Title bar
  doc.setFillColor(...PRIMARY);
  doc.roundedRect(x, y, w, 9, 2, 2, 'F');
  // Cover bottom corners of title bar
  doc.rect(x, y + 5, w, 4, 'F');

  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(title, x + 4, y + 6.2);
  doc.setTextColor(0, 0, 0);

  return y + 11;
}

function checkPageBreak(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > 255) {
    doc.addPage();
    return 20;
  }
  return y;
}

async function loadLogoAsBase64(): Promise<string | null> {
  try {
    const response = await fetch('/images/goodvalley-logo.png');
    const blob = await response.blob();
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

export async function generateProducerPdf(data: PdfData) {
  const doc = new jsPDF('p', 'mm', 'letter');
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 0;

  // ── Header with logo ──
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, pageWidth, 36, 'F');

  // Load and add logo
  const logoBase64 = await loadLogoAsBase64();
  if (logoBase64) {
    // White circle/box behind logo for contrast
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(12, 4, 42, 28, 3, 3, 'F');
    doc.addImage(logoBase64, 'PNG', 14, 6, 38, 24);
  }

  // Title text
  doc.setFontSize(17);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  const titleX = logoBase64 ? 60 : pageWidth / 2;
  const titleAlign = logoBase64 ? 'left' : 'center';
  doc.text('Cuenta Corriente Productor', titleX, 16, { align: titleAlign as any });
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`Temporada ${data.year}`, titleX, 24, { align: titleAlign as any });

  // Emission date in header
  doc.setFontSize(8);
  doc.setTextColor(220, 200, 240);
  const today = new Date();
  doc.text(`Emitido: ${today.getDate()} de ${MONTHS_FULL[today.getMonth()]} ${today.getFullYear()}`, titleX, 31, { align: titleAlign as any });

  doc.setTextColor(0, 0, 0);
  y = 42;

  // ── Producer info row ──
  doc.setFillColor(...MUTED_BG);
  doc.roundedRect(15, y, pageWidth - 30, 10, 2, 2, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PRIMARY);
  doc.text(data.producer.name, 20, y + 6.5);
  if (data.producer.rut) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 100, 100);
    doc.text(`RUT: ${data.producer.rut}`, pageWidth - 20, y + 6.5, { align: 'right' });
  }
  doc.setTextColor(0, 0, 0);
  y += 16;

  // ═══════════════════════════════════════════
  // 1. FACTURACIÓN TOTAL & SECADO (side by side cards)
  // ═══════════════════════════════════════════
  const halfW = (pageWidth - 30 - 6) / 2;
  const cardH1 = 42;

  // Left card: Facturación Total
  const leftCardY = y;
  drawCardBox(doc, 15, leftCardY, halfW, cardH1, 'Facturación Total');

  autoTable(doc, {
    startY: leftCardY + 11,
    margin: { left: 17, right: pageWidth - 13 - halfW },
    theme: 'plain',
    styles: { fontSize: 8.5, cellPadding: 2, textColor: [50, 50, 50] },
    body: [
      ['Kg Secos Totales', `${Number(data.dryKg).toLocaleString('es-CL')} kg`],
      ['Total Facturado USD', `USD ${fmt(data.totalInvoicedUsd)}`],
      ['Total Facturado CLP', `CLP ${fmtClp(data.totalInvoicedClp)}`],
      ['Método Pago Secado', methodLabel[data.method] ?? data.method],
    ],
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 38 },
      1: { halign: 'right' },
    },
    didParseCell: (hookData) => {
      if (hookData.row.index === 1 && hookData.column.index === 1 && hookData.section === 'body') {
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.textColor = [...PRIMARY];
      }
    },
  });

  // Right card: Secado
  const rightX = 15 + halfW + 6;
  drawCardBox(doc, rightX, leftCardY, halfW, cardH1, 'Secado');

  const secadoBody: string[][] = [
    ['Total Secado CLP', `CLP ${fmtClp(data.totalDryingClp)}`],
  ];
  if (data.totalDryingUsd > 0) {
    secadoBody.push(['Total Secado USD', `USD ${fmt(data.totalDryingUsd)}`]);
  }
  if (data.method === 'cuotas' && data.cuotaClp) {
    secadoBody.push(['Cuota mensual CLP', `CLP ${fmtClp(data.cuotaClp)}`]);
    secadoBody.push(['Total Pagado CLP', `CLP ${fmtClp(data.cuotaTotalPaidClp ?? 0)}`]);
    secadoBody.push(['Saldo CLP', `CLP ${fmtClp(data.cuotaSaldoClp ?? 0)}`]);
  } else if (data.method === 'descuento_usd') {
    const firstDiscount = Object.values(data.discountByMonth)[0] ?? 0;
    secadoBody.push(['Desc. mensual', `USD ${fmt(firstDiscount)}`]);
  } else {
    secadoBody.push(['Descuento', 'No aplica']);
  }

  autoTable(doc, {
    startY: leftCardY + 11,
    margin: { left: rightX + 2, right: 17 },
    theme: 'plain',
    styles: { fontSize: 8.5, cellPadding: 2, textColor: [50, 50, 50] },
    body: secadoBody,
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 38 },
      1: { halign: 'right' },
    },
    didParseCell: (hookData) => {
      if (hookData.section === 'body') {
        const label = String(hookData.row.raw?.[0] ?? '');
        if (label.includes('Pagado')) {
          hookData.cell.styles.textColor = [...ACCENT_GREEN];
        }
        if (label === 'Saldo CLP') {
          hookData.cell.styles.fontStyle = 'bold';
          const saldo = data.cuotaSaldoClp ?? 0;
          hookData.cell.styles.textColor = saldo > 0 ? [...ACCENT_RED] : [...ACCENT_GREEN];
        }
      }
    },
  });

  y = leftCardY + cardH1 + 6;

  // ═══════════════════════════════════════════
  // 2. ANTICIPOS TABLE (full width card)
  // ═══════════════════════════════════════════
  y = checkPageBreak(doc, y, 50);

  const showDiscount = data.method === 'descuento_usd' || data.method === 'cuotas';

  const advHeaders: string[] = ['Mes', 'USD/kg', 'Anticipo USD'];
  if (showDiscount) advHeaders.push('Desc. Secado', 'Neto USD');
  advHeaders.push('Estado');

  const advRows = data.advances.map(a => {
    const discount = data.discountByMonth[a.month] ?? 0;
    const net = a.advance - discount;
    const row: string[] = [
      MONTHS_FULL[a.month - 1],
      fmt(a.centsPerKg / 100),
      `USD ${fmt(a.advance)}`,
    ];
    if (showDiscount) {
      row.push(discount > 0 ? `-USD ${fmt(discount)}` : '-');
      row.push(`USD ${fmt(net)}`);
    }
    row.push(a.paid ? '✓ Pagado' : 'Pendiente');
    return row;
  });

  // Total row
  const totalRow: string[] = ['TOTAL', '', `USD ${fmt(data.totalAdvances)}`];
  if (showDiscount) totalRow.push('', '');
  totalRow.push(`Pagado: USD ${fmt(data.paidAdvances)}`);
  advRows.push(totalRow);

  // Estimate card height for anticipos
  const anticiposCardH = 14 + advRows.length * 7.5;
  const anticiposY = y;

  // Draw card border
  doc.setDrawColor(...CARD_BORDER);
  doc.setLineWidth(0.5);
  // We'll draw after the table to know exact height

  // Title bar
  doc.setFillColor(...PRIMARY);
  const titleBarH = 9;
  doc.roundedRect(15, anticiposY, pageWidth - 30, titleBarH, 2, 2, 'F');
  doc.rect(15, anticiposY + 5, pageWidth - 30, 4, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(`Anticipos ${data.year}`, 19, anticiposY + 6.2);
  doc.setTextColor(0, 0, 0);

  autoTable(doc, {
    startY: anticiposY + titleBarH + 1,
    margin: { left: 16, right: 16 },
    theme: 'grid',
    headStyles: { fillColor: [...PURPLE_LIGHT], fontSize: 7.5, halign: 'center', textColor: [255, 255, 255] },
    styles: { fontSize: 7.5, cellPadding: 2.5, lineColor: [...CARD_BORDER], lineWidth: 0.3 },
    head: [advHeaders],
    body: advRows,
    columnStyles: {
      0: { fontStyle: 'bold' },
      1: { halign: 'right' },
      2: { halign: 'right' },
      ...(showDiscount ? {
        3: { halign: 'right', textColor: [...ACCENT_RED] },
        4: { halign: 'right', fontStyle: 'bold' },
        5: { halign: 'center' },
      } : {
        3: { halign: 'center' },
      }),
    },
    didParseCell: (hookData) => {
      if (hookData.section === 'body') {
        if (hookData.row.index === advRows.length - 1) {
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.fillColor = [...MUTED_BG];
        }
        const lastCol = showDiscount ? 5 : 3;
        if (hookData.column.index === lastCol) {
          const val = String(hookData.cell.raw);
          if (val.includes('Pagado')) {
            hookData.cell.styles.textColor = [...ACCENT_GREEN];
          }
        }
      }
    },
  });

  const anticiposEnd = (doc as any).lastAutoTable.finalY;
  // Draw card border around the whole thing
  doc.setDrawColor(...CARD_BORDER);
  doc.setLineWidth(0.5);
  doc.roundedRect(15, anticiposY, pageWidth - 30, anticiposEnd - anticiposY + 2, 2, 2, 'S');

  y = anticiposEnd + 8;

  // ═══════════════════════════════════════════
  // 3. PRÓXIMO PAGO & DOCUMENTO REQUERIDO (side by side cards)
  // ═══════════════════════════════════════════
  y = checkPageBreak(doc, y, 55);

  if (data.nextAdvance) {
    const cardH2Left = 38;
    const cardH2Right = data.needsDocument ? 52 : 22;
    const cardH2 = Math.max(cardH2Left, cardH2Right);
    const pairY = y;

    // Left: Próximo Pago
    drawCardBox(doc, 15, pairY, halfW, cardH2, 'Próximo Pago');

    const nextMonth = MONTHS_FULL[data.nextAdvance.month - 1];
    const paymentRows: string[][] = [
      ['Mes', nextMonth],
      ['Anticipo Bruto', `USD ${fmt(data.nextPaymentGross)}`],
    ];
    if (data.nextDiscount > 0) {
      paymentRows.push(['Desc. Secado', `-USD ${fmt(data.nextDiscount)}`]);
    }
    paymentRows.push(['Neto a Pagar', `USD ${fmt(data.nextPaymentNet)}`]);

    autoTable(doc, {
      startY: pairY + 11,
      margin: { left: 17, right: pageWidth - 13 - halfW },
      theme: 'plain',
      styles: { fontSize: 8.5, cellPadding: 2.5, textColor: [50, 50, 50] },
      body: paymentRows,
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 35 },
        1: { halign: 'right' },
      },
      didParseCell: (hookData) => {
        if (hookData.section === 'body') {
          const label = String(hookData.row.raw?.[0] ?? '');
          if (label === 'Neto a Pagar') {
            hookData.cell.styles.fontStyle = 'bold';
            hookData.cell.styles.fillColor = [...MUTED_BG];
            hookData.cell.styles.fontSize = 10;
            hookData.cell.styles.textColor = [...PRIMARY];
          }
          if (label.includes('Desc')) {
            hookData.cell.styles.textColor = [...ACCENT_RED];
          }
        }
      },
    });

    // Right: Documento Requerido
    drawCardBox(doc, rightX, pairY, halfW, cardH2, data.needsDocument ? 'Documento Requerido' : 'Documento');

    if (data.needsDocument) {
      const glosa = data.docType === 'Nota de Débito'
        ? `Ajuste precio anticipo ${nextMonth}`
        : `Anticipo compra fruta ${data.year}`;

      const tc = data.docExRate;
      const docRows: string[][] = [
        ['Tipo', data.docType],
        ['Glosa', glosa],
        ['Fecha', `${nextMonth} ${data.year}`],
        ['Neto USD', `USD ${fmt(data.docNeededUsd)}`],
      ];
      if (tc) {
        const montoCLP = data.docNeededUsd * tc;
        const iva = montoCLP * 0.19;
        docRows.push(['Tipo de Cambio', `$${Number(tc).toLocaleString('es-CL')}`]);
        docRows.push(['Neto CLP', `CLP ${fmtClp(Math.round(montoCLP))}`]);
        docRows.push(['IVA (19%)', `CLP ${fmtClp(Math.round(iva))}`]);
        docRows.push(['Total Doc.', `CLP ${fmtClp(Math.round(montoCLP + iva))}`]);
      }

      autoTable(doc, {
        startY: pairY + 11,
        margin: { left: rightX + 2, right: 17 },
        theme: 'plain',
        styles: { fontSize: 8.5, cellPadding: 2.5, textColor: [50, 50, 50] },
        body: docRows,
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 32 },
          1: { halign: 'right' },
        },
        didParseCell: (hookData) => {
          if (hookData.section === 'body') {
            const label = String(hookData.row.raw?.[0] ?? '');
            if (label === 'Total Doc.') {
              hookData.cell.styles.fontStyle = 'bold';
              hookData.cell.styles.fillColor = [...MUTED_BG];
              hookData.cell.styles.textColor = [...PRIMARY];
            }
            if (label === 'Tipo') {
              hookData.cell.styles.textColor = [...ACCENT_RED];
              hookData.cell.styles.fontStyle = 'bold';
            }
          }
        },
      });
    } else {
      autoTable(doc, {
        startY: pairY + 11,
        margin: { left: rightX + 2, right: 17 },
        theme: 'plain',
        styles: { fontSize: 9, cellPadding: 3, textColor: [50, 50, 50] },
        body: [['Facturación al día ✓']],
        didParseCell: (hookData) => {
          hookData.cell.styles.textColor = [...ACCENT_GREEN];
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.halign = 'center';
        },
      });
    }

    y = pairY + cardH2 + 8;
  }

  // ═══════════════════════════════════════════
  // 4. CUOTAS DETAIL (if cuotas method)
  // ═══════════════════════════════════════════
  if (data.method === 'cuotas' && data.cuotaDetails && data.cuotaDetails.length > 0) {
    y = checkPageBreak(doc, y, 40);

    const cuotasY = y;
    doc.setFillColor(...PRIMARY);
    doc.roundedRect(15, cuotasY, pageWidth - 30, 9, 2, 2, 'F');
    doc.rect(15, cuotasY + 5, pageWidth - 30, 4, 'F');
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('Detalle Cuotas Secado', 19, cuotasY + 6.2);
    doc.setTextColor(0, 0, 0);

    const cuotaHeaders = ['#', 'Mes', 'Monto CLP', 'TC', 'Monto USD', 'Estado', 'Fecha Pago'];
    const cuotaRows = data.cuotaDetails
      .sort((a: any, b: any) => a.installment_number - b.installment_number)
      .map((inst: any) => [
        String(inst.installment_number),
        inst.month && inst.month <= 12 ? MONTHS_FULL[inst.month - 1] : `Mes ${inst.month}`,
        `CLP ${fmtClp(Number(inst.amount_clp))}`,
        inst.exchange_rate ? `$${Number(inst.exchange_rate).toLocaleString('es-CL')}` : '-',
        inst.amount_usd ? `USD ${fmt(Number(inst.amount_usd))}` : '-',
        inst.paid ? '✓ Pagado' : 'Pendiente',
        inst.paid_date ? new Date(inst.paid_date).toLocaleDateString('es-CL') : '-',
      ]);

    autoTable(doc, {
      startY: cuotasY + 10,
      margin: { left: 16, right: 16 },
      theme: 'grid',
      headStyles: { fillColor: [...PURPLE_LIGHT], fontSize: 7.5, halign: 'center', textColor: [255, 255, 255] },
      styles: { fontSize: 7.5, cellPadding: 2, lineColor: [...CARD_BORDER], lineWidth: 0.3 },
      head: [cuotaHeaders],
      body: cuotaRows,
      columnStyles: {
        0: { halign: 'center', cellWidth: 10 },
        2: { halign: 'right' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'center' },
        6: { halign: 'center' },
      },
      didParseCell: (hookData) => {
        if (hookData.section === 'body' && hookData.column.index === 5) {
          const val = String(hookData.cell.raw);
          if (val.includes('Pagado')) {
            hookData.cell.styles.textColor = [...ACCENT_GREEN];
          }
        }
      },
    });

    const cuotasEnd = (doc as any).lastAutoTable.finalY;
    doc.setDrawColor(...CARD_BORDER);
    doc.setLineWidth(0.5);
    doc.roundedRect(15, cuotasY, pageWidth - 30, cuotasEnd - cuotasY + 2, 2, 2, 'S');

    y = cuotasEnd + 8;
  }

  // ═══════════════════════════════════════════
  // 5. BALANCE IVA (full width card)
  // ═══════════════════════════════════════════
  y = checkPageBreak(doc, y, 40);

  const ivaCardY = y;
  const ivaCardH = 32;

  // Card with title
  doc.setDrawColor(...CARD_BORDER);
  doc.setLineWidth(0.5);
  doc.roundedRect(15, ivaCardY, pageWidth - 30, ivaCardH, 2, 2, 'S');

  doc.setFillColor(...PRIMARY);
  doc.roundedRect(15, ivaCardY, pageWidth - 30, 9, 2, 2, 'F');
  doc.rect(15, ivaCardY + 5, pageWidth - 30, 4, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('Balance IVA (perspectiva del productor)', 19, ivaCardY + 6.2);
  doc.setTextColor(0, 0, 0);

  const ivaAFavor = data.ivaProductor;
  const ivaEnContra = data.ivaSecado;
  const saldoProductor = ivaAFavor - ivaEnContra;

  const colW = (pageWidth - 36) / 3;
  const boxY = ivaCardY + 12;
  const boxH = 16;

  // IVA a favor
  doc.setFillColor(...MUTED_BG);
  doc.roundedRect(18, boxY, colW - 2, boxH, 1.5, 1.5, 'F');
  doc.setFontSize(6.5);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'normal');
  doc.text('IVA Facturado (a su favor)', 18 + (colW - 2) / 2, boxY + 5, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(`CLP ${fmtClp(ivaAFavor)}`, 18 + (colW - 2) / 2, boxY + 12, { align: 'center' });

  // IVA secado
  doc.setFillColor(...MUTED_BG);
  doc.roundedRect(18 + colW, boxY, colW - 2, boxH, 1.5, 1.5, 'F');
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('IVA Secado (a favor exportadora)', 18 + colW + (colW - 2) / 2, boxY + 5, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(`CLP ${fmtClp(ivaEnContra)}`, 18 + colW + (colW - 2) / 2, boxY + 12, { align: 'center' });

  // Saldo
  const saldoColor = saldoProductor >= 0 ? ACCENT_GREEN : ACCENT_RED;
  doc.setFillColor(saldoProductor >= 0 ? 230 : 255, saldoProductor >= 0 ? 245 : 235, saldoProductor >= 0 ? 230 : 235);
  doc.roundedRect(18 + colW * 2, boxY, colW - 2, boxH, 1.5, 1.5, 'F');
  doc.setFontSize(6.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('Saldo IVA Neto', 18 + colW * 2 + (colW - 2) / 2, boxY + 5, { align: 'center' });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...saldoColor);
  const saldoLabel = saldoProductor > 0 ? '(a favor productor)' : saldoProductor < 0 ? '(a favor exportadora)' : '';
  doc.text(`CLP ${fmtClp(saldoProductor)}`, 18 + colW * 2 + (colW - 2) / 2, boxY + 11, { align: 'center' });
  if (saldoLabel) {
    doc.setFontSize(5.5);
    doc.setFont('helvetica', 'normal');
    doc.text(saldoLabel, 18 + colW * 2 + (colW - 2) / 2, boxY + 15, { align: 'center' });
  }

  doc.setTextColor(0, 0, 0);
  y = ivaCardY + ivaCardH + 8;

  // ── Footer ──
  doc.setDrawColor(...BORDER);
  doc.setLineWidth(0.3);
  doc.line(15, y, pageWidth - 15, y);
  y += 5;
  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(140, 140, 140);
  doc.text('Este documento es un resumen informativo de la cuenta corriente y no constituye un documento tributario.', pageWidth / 2, y, { align: 'center' });

  // Save
  doc.save(`Cuenta_Corriente_${data.producer.name.replace(/\s+/g, '_')}_${data.year}.pdf`);
}
