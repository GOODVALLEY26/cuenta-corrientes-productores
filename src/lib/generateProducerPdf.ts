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

// Colors
const PRIMARY = [30, 41, 59] as const;       // slate-800
const HEADER_BG = [30, 41, 59] as const;     // dark header
const ACCENT_GREEN = [22, 163, 74] as const; // green-600
const ACCENT_RED = [220, 38, 38] as const;   // red-600
const MUTED_BG = [241, 245, 249] as const;   // slate-100
const BORDER = [203, 213, 225] as const;     // slate-300
const WHITE = [255, 255, 255] as const;

function drawSectionTitle(doc: jsPDF, title: string, y: number, pageWidth: number): number {
  doc.setFillColor(...PRIMARY);
  doc.roundedRect(15, y, pageWidth - 30, 8, 1, 1, 'F');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(title, 19, y + 5.5);
  doc.setTextColor(0, 0, 0);
  return y + 12;
}

function checkPageBreak(doc: jsPDF, y: number, needed: number): number {
  if (y + needed > 255) {
    doc.addPage();
    return 20;
  }
  return y;
}

export function generateProducerPdf(data: PdfData) {
  const doc = new jsPDF('p', 'mm', 'letter');
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 15;

  // ── Header bar ──
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, pageWidth, 32, 'F');
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('Cuenta Corriente Productor', pageWidth / 2, 14, { align: 'center' });
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`Temporada ${data.year}`, pageWidth / 2, 22, { align: 'center' });
  doc.setTextColor(0, 0, 0);
  y = 40;

  // ── Producer info row ──
  doc.setFillColor(...MUTED_BG);
  doc.roundedRect(15, y, pageWidth - 30, 12, 2, 2, 'F');
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(data.producer.name, 20, y + 7);
  if (data.producer.rut) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(`RUT: ${data.producer.rut}`, pageWidth - 20, y + 7, { align: 'right' });
  }
  y += 16;

  // Emission date
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  const today = new Date();
  doc.text(`Emitido: ${today.getDate()} de ${MONTHS_FULL[today.getMonth()]} ${today.getFullYear()}`, 15, y);
  doc.setTextColor(0, 0, 0);
  y += 8;

  // ═══════════════════════════════════════════
  // 1. FACTURACIÓN TOTAL & SECADO (side by side)
  // ═══════════════════════════════════════════
  const halfW = (pageWidth - 30 - 4) / 2; // 4mm gap

  // Left: Facturación Total
  y = drawSectionTitle(doc, 'Facturación Total', y, pageWidth / 2 + 13);

  autoTable(doc, {
    startY: y,
    margin: { left: 15, right: pageWidth - 15 - halfW },
    theme: 'plain',
    styles: { fontSize: 8.5, cellPadding: 2 },
    body: [
      ['Kg Secos Totales', `${Number(data.dryKg).toLocaleString('es-CL')} kg`],
      ['Total Facturado USD', `USD ${fmt(data.totalInvoicedUsd)}`],
      ['Total Facturado CLP', `CLP ${fmtClp(data.totalInvoicedClp)}`],
      ['Método Pago Secado', methodLabel[data.method] ?? data.method],
    ],
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 42 },
      1: { halign: 'right' },
    },
    didParseCell: (hookData) => {
      if (hookData.row.index === 1 && hookData.column.index === 1 && hookData.section === 'body') {
        hookData.cell.styles.fontStyle = 'bold';
      }
    },
  });
  const leftTableEnd = (doc as any).lastAutoTable.finalY;

  // Right: Secado
  const rightX = 15 + halfW + 4;
  const rightTitle = drawSectionTitle(doc, 'Secado', y - 12, pageWidth / 2 + 13);

  // Build secado body
  const secadoBody: string[][] = [
    ['Total Secado CLP', `CLP ${fmtClp(data.totalDryingClp)}`],
  ];
  if (data.totalDryingUsd > 0) {
    secadoBody.push(['Total Secado USD', `USD ${fmt(data.totalDryingUsd)}`]);
  }
  if (data.method === 'cuotas' && data.cuotaClp) {
    secadoBody.push(['Cuota mensual CLP', `CLP ${fmtClp(data.cuotaClp)}`]);
    secadoBody.push(['Total Pagado CLP', `CLP ${fmtClp(data.cuotaTotalPaidClp ?? 0)}`]);
    if ((data.cuotaTotalPaidUsd ?? 0) > 0) {
      secadoBody.push(['Total Pagado USD', `USD ${fmt(data.cuotaTotalPaidUsd ?? 0)}`]);
    }
    secadoBody.push(['Saldo CLP', `CLP ${fmtClp(data.cuotaSaldoClp ?? 0)}`]);
  } else if (data.method === 'descuento_usd') {
    const firstDiscount = Object.values(data.discountByMonth)[0] ?? 0;
    secadoBody.push(['Desc. mensual', `USD ${fmt(firstDiscount)}`]);
  } else {
    secadoBody.push(['Descuento', 'No aplica']);
  }

  autoTable(doc, {
    startY: y,
    margin: { left: rightX, right: 15 },
    theme: 'plain',
    styles: { fontSize: 8.5, cellPadding: 2 },
    body: secadoBody,
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 42 },
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
  const rightTableEnd = (doc as any).lastAutoTable.finalY;

  y = Math.max(leftTableEnd, rightTableEnd) + 8;

  // ═══════════════════════════════════════════
  // 2. ANTICIPOS TABLE
  // ═══════════════════════════════════════════
  y = checkPageBreak(doc, y, 40);
  y = drawSectionTitle(doc, `Anticipos ${data.year}`, y, pageWidth);

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

  autoTable(doc, {
    startY: y,
    margin: { left: 15, right: 15 },
    theme: 'grid',
    headStyles: { fillColor: [...HEADER_BG], fontSize: 8, halign: 'center' },
    styles: { fontSize: 8, cellPadding: 2.5 },
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
        // Total row
        if (hookData.row.index === advRows.length - 1) {
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.fillColor = [...MUTED_BG];
        }
        // Estado column: green for paid
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
  y = (doc as any).lastAutoTable.finalY + 8;

  // ═══════════════════════════════════════════
  // 3. PRÓXIMO PAGO & DOCUMENTO REQUERIDO (side by side)
  // ═══════════════════════════════════════════
  y = checkPageBreak(doc, y, 50);

  if (data.nextAdvance) {
    // Left: Próximo Pago
    y = drawSectionTitle(doc, 'Próximo Pago', y, pageWidth / 2 + 13);

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
      startY: y,
      margin: { left: 15, right: pageWidth - 15 - halfW },
      theme: 'plain',
      styles: { fontSize: 8.5, cellPadding: 2.5 },
      body: paymentRows,
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 38 },
        1: { halign: 'right' },
      },
      didParseCell: (hookData) => {
        if (hookData.section === 'body') {
          const label = String(hookData.row.raw?.[0] ?? '');
          if (label === 'Neto a Pagar') {
            hookData.cell.styles.fontStyle = 'bold';
            hookData.cell.styles.fillColor = [...MUTED_BG];
            hookData.cell.styles.fontSize = 10;
          }
          if (label.includes('Desc')) {
            hookData.cell.styles.textColor = [...ACCENT_RED];
          }
        }
      },
    });
    const payEnd = (doc as any).lastAutoTable.finalY;

    // Right: Documento Requerido
    drawSectionTitle(doc, data.needsDocument ? 'Documento Requerido' : 'Documento', y - 12, pageWidth / 2 + 13);

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
        startY: y,
        margin: { left: rightX, right: 15 },
        theme: 'plain',
        styles: { fontSize: 8.5, cellPadding: 2.5 },
        body: docRows,
        columnStyles: {
          0: { fontStyle: 'bold', cellWidth: 35 },
          1: { halign: 'right' },
        },
        didParseCell: (hookData) => {
          if (hookData.section === 'body') {
            const label = String(hookData.row.raw?.[0] ?? '');
            if (label === 'Total Doc.') {
              hookData.cell.styles.fontStyle = 'bold';
              hookData.cell.styles.fillColor = [...MUTED_BG];
            }
            if (label === 'Tipo') {
              hookData.cell.styles.textColor = [...ACCENT_RED];
              hookData.cell.styles.fontStyle = 'bold';
            }
          }
        },
      });
      const docEnd = (doc as any).lastAutoTable.finalY;

      // Note below doc table
      doc.setFontSize(6.5);
      doc.setTextColor(120, 120, 120);
      doc.text(
        `* Neto = Acumulado USD ${fmt(data.docNeededUsd + data.totalInvoicedUsd)} − Facturado USD ${fmt(data.totalInvoicedUsd)}`,
        rightX,
        docEnd + 3
      );
      doc.setTextColor(0, 0, 0);

      y = Math.max(payEnd, docEnd + 6) + 6;
    } else {
      // No document needed
      autoTable(doc, {
        startY: y,
        margin: { left: rightX, right: 15 },
        theme: 'plain',
        styles: { fontSize: 9, cellPadding: 3 },
        body: [['Facturación al día ✓']],
        didParseCell: (hookData) => {
          hookData.cell.styles.textColor = [...ACCENT_GREEN];
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.halign = 'center';
        },
      });
      y = Math.max(payEnd, (doc as any).lastAutoTable.finalY) + 6;
    }
  }

  // ═══════════════════════════════════════════
  // 4. CUOTAS DETAIL (if cuotas method)
  // ═══════════════════════════════════════════
  if (data.method === 'cuotas' && data.cuotaDetails && data.cuotaDetails.length > 0) {
    y = checkPageBreak(doc, y, 40);
    y = drawSectionTitle(doc, 'Detalle Cuotas Secado', y, pageWidth);

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
      startY: y,
      margin: { left: 15, right: 15 },
      theme: 'grid',
      headStyles: { fillColor: [...HEADER_BG], fontSize: 7.5, halign: 'center' },
      styles: { fontSize: 7.5, cellPadding: 2 },
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
    y = (doc as any).lastAutoTable.finalY + 8;
  }

  // ═══════════════════════════════════════════
  // 5. BALANCE IVA
  // ═══════════════════════════════════════════
  y = checkPageBreak(doc, y, 35);
  y = drawSectionTitle(doc, 'Balance IVA (perspectiva del productor)', y, pageWidth);

  const ivaAFavor = data.ivaProductor;
  const ivaEnContra = data.ivaSecado;
  const saldoProductor = ivaAFavor - ivaEnContra;

  // Three columns layout
  const colW = (pageWidth - 30) / 3;
  const boxH = 18;
  const boxY = y;

  // IVA a favor
  doc.setFillColor(...MUTED_BG);
  doc.roundedRect(15, boxY, colW - 2, boxH, 1.5, 1.5, 'F');
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text('IVA Facturado (a su favor)', 15 + (colW - 2) / 2, boxY + 5, { align: 'center' });
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(`CLP ${fmtClp(ivaAFavor)}`, 15 + (colW - 2) / 2, boxY + 13, { align: 'center' });

  // IVA secado
  doc.setFillColor(...MUTED_BG);
  doc.roundedRect(15 + colW, boxY, colW - 2, boxH, 1.5, 1.5, 'F');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('IVA Secado (a favor exportadora)', 15 + colW + (colW - 2) / 2, boxY + 5, { align: 'center' });
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(`CLP ${fmtClp(ivaEnContra)}`, 15 + colW + (colW - 2) / 2, boxY + 13, { align: 'center' });

  // Saldo
  const saldoColor = saldoProductor >= 0 ? ACCENT_GREEN : ACCENT_RED;
  doc.setFillColor(saldoProductor >= 0 ? 230 : 255, saldoProductor >= 0 ? 245 : 235, saldoProductor >= 0 ? 230 : 235);
  doc.roundedRect(15 + colW * 2, boxY, colW - 2, boxH, 1.5, 1.5, 'F');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('Saldo IVA Neto', 15 + colW * 2 + (colW - 2) / 2, boxY + 5, { align: 'center' });
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...saldoColor);
  const saldoLabel = saldoProductor > 0 ? '(a favor productor)' : saldoProductor < 0 ? '(a favor exportadora)' : '';
  doc.text(`CLP ${fmtClp(saldoProductor)}`, 15 + colW * 2 + (colW - 2) / 2, boxY + 12, { align: 'center' });
  if (saldoLabel) {
    doc.setFontSize(6);
    doc.setFont('helvetica', 'normal');
    doc.text(saldoLabel, 15 + colW * 2 + (colW - 2) / 2, boxY + 16, { align: 'center' });
  }

  doc.setTextColor(0, 0, 0);
  y = boxY + boxH + 12;

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
