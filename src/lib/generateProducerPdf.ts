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
  advances: { month: number; centsPerKg: number; advance: number; paid: boolean; paidDate?: string | null }[];
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

// Purple theme
const PRIMARY: [number, number, number] = [75, 0, 110];
const PURPLE_LIGHT: [number, number, number] = [120, 60, 160];
const ACCENT_GREEN: [number, number, number] = [22, 163, 74];
const ACCENT_RED: [number, number, number] = [220, 38, 38];
const MUTED_BG: [number, number, number] = [245, 240, 250];
const CARD_BORDER: [number, number, number] = [200, 180, 220];
const WHITE: [number, number, number] = [255, 255, 255];

function drawSectionTitle(doc: jsPDF, x: number, y: number, w: number, title: string): number {
  doc.setFillColor(...PRIMARY);
  doc.roundedRect(x, y, w, 7, 1.5, 1.5, 'F');
  doc.rect(x, y + 4, w, 3, 'F');
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(title, x + 3, y + 5);
  doc.setTextColor(0, 0, 0);
  return y + 8;
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
  const pw = doc.internal.pageSize.getWidth(); // ~216
  const margin = 12;
  const contentW = pw - margin * 2;
  let y = 0;

  // ── HEADER ──
  const logoBase64 = await loadLogoAsBase64();
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, pw, 28, 'F');

  if (logoBase64) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(margin, 3, 32, 22, 2, 2, 'F');
    doc.addImage(logoBase64, 'PNG', margin + 1, 4, 30, 20);
  }

  const titleX = logoBase64 ? 50 : pw / 2;
  const titleAlign: any = logoBase64 ? 'left' : 'center';
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('Cuenta Corriente Productor', titleX, 12, { align: titleAlign });
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Temporada ${data.year}`, titleX, 18, { align: titleAlign });
  doc.setFontSize(7);
  doc.setTextColor(220, 200, 240);
  const today = new Date();
  doc.text(`Emitido: ${today.getDate()} de ${MONTHS_FULL[today.getMonth()]} ${today.getFullYear()}`, titleX, 23, { align: titleAlign });
  doc.setTextColor(0, 0, 0);

  // Producer info bar
  y = 30;
  doc.setFillColor(...MUTED_BG);
  doc.roundedRect(margin, y, contentW, 8, 1.5, 1.5, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PRIMARY);
  doc.text(data.producer.name, margin + 3, y + 5.5);
  if (data.producer.rut) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text(`RUT: ${data.producer.rut}`, pw - margin - 3, y + 5.5, { align: 'right' });
  }
  doc.setTextColor(0, 0, 0);
  y = 41;

  // ═══════════════════════════════════════════
  // 1. FACTURACIÓN & SECADO (side by side)
  // ═══════════════════════════════════════════
  const halfW = (contentW - 4) / 2;
  const leftX = margin;
  const rightX = margin + halfW + 4;

  // Left: Facturación Total
  let leftY = drawSectionTitle(doc, leftX, y, halfW, 'Facturación Total');
  autoTable(doc, {
    startY: leftY,
    margin: { left: leftX + 1, right: pw - leftX - halfW + 1 },
    theme: 'plain',
    styles: { fontSize: 7, cellPadding: 1.5, textColor: [50, 50, 50] },
    body: [
      ['Kg Secos Totales', `${Number(data.dryKg).toLocaleString('es-CL')} kg`],
      ['Total Facturado USD', `USD ${fmt(data.totalInvoicedUsd)}`],
      ['Total Facturado CLP', `CLP ${fmtClp(data.totalInvoicedClp)}`],
    ],
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 32 }, 1: { halign: 'right' } },
    didParseCell: (h) => {
      if (h.row.index === 1 && h.column.index === 1 && h.section === 'body') {
        h.cell.styles.fontStyle = 'bold';
        h.cell.styles.textColor = [...PRIMARY];
      }
    },
  });
  const leftEnd = (doc as any).lastAutoTable.finalY;

  // Right: Secado
  let rightY = drawSectionTitle(doc, rightX, y, halfW, 'Secado');
  const secadoRows: string[][] = [
    ['Total Secado CLP', `CLP ${fmtClp(data.totalDryingClp)}`],
    ['Total Pagado CLP', `CLP ${fmtClp(data.cuotaTotalPaidClp ?? 0)}`],
    ['Saldo CLP', `CLP ${fmtClp(data.cuotaSaldoClp ?? 0)}`],
    ['Método pago', methodLabel[data.method] ?? data.method],
  ];

  autoTable(doc, {
    startY: rightY,
    margin: { left: rightX + 1, right: pw - rightX - halfW + 1 },
    theme: 'plain',
    styles: { fontSize: 7, cellPadding: 1.5, textColor: [50, 50, 50] },
    body: secadoRows,
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 32 }, 1: { halign: 'right' } },
    didParseCell: (h) => {
      if (h.section === 'body') {
        const label = String(h.row.raw?.[0] ?? '');
        if (label === 'Total Pagado CLP' && h.column.index === 1) {
          h.cell.styles.textColor = [...ACCENT_GREEN];
        }
        if (label === 'Saldo CLP') {
          h.cell.styles.fontStyle = 'bold';
          const saldo = data.cuotaSaldoClp ?? 0;
          h.cell.styles.textColor = saldo > 0 ? [...ACCENT_RED] : [...ACCENT_GREEN];
        }
        if (label === 'Total Secado CLP' && h.column.index === 1) {
          h.cell.styles.fontStyle = 'bold';
        }
      }
    },
  });
  const rightEnd = (doc as any).lastAutoTable.finalY;

  // Draw borders around both cards
  const cardH = Math.max(leftEnd, rightEnd) - y + 1;
  doc.setDrawColor(...CARD_BORDER);
  doc.setLineWidth(0.3);
  doc.roundedRect(leftX, y, halfW, cardH, 1.5, 1.5, 'S');
  doc.roundedRect(rightX, y, halfW, cardH, 1.5, 1.5, 'S');

  y = Math.max(leftEnd, rightEnd) + 4;

  // ═══════════════════════════════════════════
  // 2. ANTICIPOS TABLE
  // ═══════════════════════════════════════════
  const showDiscount = Object.values(data.discountByMonth).some(v => v > 0);

  const advHeaders: string[] = ['Mes', 'USD/kg', 'Anticipo USD'];
  if (showDiscount) advHeaders.push('Desc. Secado', 'Neto USD');
  advHeaders.push('Estado', 'Fecha Pago');

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
    row.push(a.paidDate ? new Date(a.paidDate + 'T12:00:00').toLocaleDateString('es-CL') : '-');
    return row;
  });

  // Total row
  const totalRow: string[] = ['TOTAL', '', `USD ${fmt(data.totalAdvances)}`];
  if (showDiscount) totalRow.push('', '');
  totalRow.push(`Pagado: USD ${fmt(data.paidAdvances)}`);
  totalRow.push('');
  advRows.push(totalRow);

  const anticiposY = y;
  drawSectionTitle(doc, margin, anticiposY, contentW, `Anticipos ${data.year}`);

  const lastCol = showDiscount ? 6 : 4;
  const statusCol = showDiscount ? 5 : 3;

  autoTable(doc, {
    startY: anticiposY + 8,
    margin: { left: margin + 1, right: margin + 1 },
    theme: 'grid',
    headStyles: { fillColor: [...PURPLE_LIGHT], fontSize: 6.5, halign: 'center', textColor: [255, 255, 255], cellPadding: 1.5 },
    styles: { fontSize: 6.5, cellPadding: 1.5, lineColor: [...CARD_BORDER], lineWidth: 0.2 },
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
        6: { halign: 'center' },
      } : {
        3: { halign: 'center' },
        4: { halign: 'center' },
      }),
    },
    didParseCell: (h) => {
      if (h.section === 'body') {
        if (h.row.index === advRows.length - 1) {
          h.cell.styles.fontStyle = 'bold';
          h.cell.styles.fillColor = [...MUTED_BG];
        }
        if (h.column.index === statusCol) {
          const val = String(h.cell.raw);
          if (val.includes('Pagado')) h.cell.styles.textColor = [...ACCENT_GREEN];
        }
      }
    },
  });

  const anticiposEnd = (doc as any).lastAutoTable.finalY;
  doc.setDrawColor(...CARD_BORDER);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, anticiposY, contentW, anticiposEnd - anticiposY + 1, 1.5, 1.5, 'S');

  y = anticiposEnd + 4;

  // ═══════════════════════════════════════════
  // 3. PRÓXIMO PAGO & DOCUMENTO REQUERIDO (side by side)
  // ═══════════════════════════════════════════
  if (data.nextAdvance) {
    const pairY = y;

    // Left: Próximo Pago
    let lpY = drawSectionTitle(doc, leftX, pairY, halfW, 'Próximo Pago');
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
      startY: lpY,
      margin: { left: leftX + 1, right: pw - leftX - halfW + 1 },
      theme: 'plain',
      styles: { fontSize: 7, cellPadding: 1.5, textColor: [50, 50, 50] },
      body: paymentRows,
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 28 }, 1: { halign: 'right' } },
      didParseCell: (h) => {
        if (h.section === 'body') {
          const label = String(h.row.raw?.[0] ?? '');
          if (label === 'Neto a Pagar') {
            h.cell.styles.fontStyle = 'bold';
            h.cell.styles.fillColor = [...MUTED_BG];
            h.cell.styles.fontSize = 8;
            h.cell.styles.textColor = [...PRIMARY];
          }
          if (label.includes('Desc')) h.cell.styles.textColor = [...ACCENT_RED];
        }
      },
    });
    const lpEnd = (doc as any).lastAutoTable.finalY;

    // Right: Documento Requerido
    let rpY = drawSectionTitle(doc, rightX, pairY, halfW, data.needsDocument ? 'Documento Requerido' : 'Documento');

    if (data.needsDocument) {
      const glosa = data.docType === 'Nota de Débito'
        ? `Ajuste precio anticipo ${nextMonth}`
        : `Anticipo compra fruta ${data.year}`;
      const tc = data.docExRate;
      const docRows: string[][] = [
        ['Tipo', data.docType],
        ['Glosa', glosa],
        ['Neto USD', `USD ${fmt(data.docNeededUsd)}`],
      ];
      if (tc) {
        const montoCLP = data.docNeededUsd * tc;
        const iva = montoCLP * 0.19;
        docRows.push(['T.C.', `$${Number(tc).toLocaleString('es-CL')}`]);
        docRows.push(['Neto CLP', `CLP ${fmtClp(Math.round(montoCLP))}`]);
        docRows.push(['IVA (19%)', `CLP ${fmtClp(Math.round(iva))}`]);
        docRows.push(['Total Doc.', `CLP ${fmtClp(Math.round(montoCLP + iva))}`]);
      }

      autoTable(doc, {
        startY: rpY,
        margin: { left: rightX + 1, right: pw - rightX - halfW + 1 },
        theme: 'plain',
        styles: { fontSize: 7, cellPadding: 1.5, textColor: [50, 50, 50] },
        body: docRows,
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 22 }, 1: { halign: 'right' } },
        didParseCell: (h) => {
          if (h.section === 'body') {
            const label = String(h.row.raw?.[0] ?? '');
            if (label === 'Total Doc.') {
              h.cell.styles.fontStyle = 'bold';
              h.cell.styles.fillColor = [...MUTED_BG];
              h.cell.styles.textColor = [...PRIMARY];
            }
            if (label === 'Tipo') {
              h.cell.styles.textColor = [...ACCENT_RED];
              h.cell.styles.fontStyle = 'bold';
            }
          }
        },
      });
    } else {
      autoTable(doc, {
        startY: rpY,
        margin: { left: rightX + 1, right: pw - rightX - halfW + 1 },
        theme: 'plain',
        styles: { fontSize: 7.5, cellPadding: 2, textColor: [50, 50, 50] },
        body: [['Facturación al día ✓']],
        didParseCell: (h) => {
          h.cell.styles.textColor = [...ACCENT_GREEN];
          h.cell.styles.fontStyle = 'bold';
          h.cell.styles.halign = 'center';
        },
      });
    }
    const rpEnd = (doc as any).lastAutoTable.finalY;

    const pairH = Math.max(lpEnd, rpEnd) - pairY + 1;
    doc.setDrawColor(...CARD_BORDER);
    doc.setLineWidth(0.3);
    doc.roundedRect(leftX, pairY, halfW, pairH, 1.5, 1.5, 'S');
    doc.roundedRect(rightX, pairY, halfW, pairH, 1.5, 1.5, 'S');

    y = Math.max(lpEnd, rpEnd) + 4;
  }

  // ═══════════════════════════════════════════
  // 4. BALANCE IVA
  // ═══════════════════════════════════════════
  const ivaY = y;
  drawSectionTitle(doc, margin, ivaY, contentW, 'Balance IVA (perspectiva del productor)');

  const ivaAFavor = data.ivaProductor;
  const ivaEnContra = data.ivaSecado;
  const saldoProductor = ivaAFavor - ivaEnContra;

  const colW = (contentW - 6) / 3;
  const boxY = ivaY + 9;
  const boxH = 12;

  // IVA a favor
  doc.setFillColor(...MUTED_BG);
  doc.roundedRect(margin + 1, boxY, colW, boxH, 1, 1, 'F');
  doc.setFontSize(5.5);
  doc.setTextColor(100, 100, 100);
  doc.setFont('helvetica', 'normal');
  doc.text('IVA Facturado (a su favor)', margin + 1 + colW / 2, boxY + 4, { align: 'center' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(`CLP ${fmtClp(ivaAFavor)}`, margin + 1 + colW / 2, boxY + 9.5, { align: 'center' });

  // IVA secado
  doc.setFillColor(...MUTED_BG);
  doc.roundedRect(margin + 1 + colW + 3, boxY, colW, boxH, 1, 1, 'F');
  doc.setFontSize(5.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('IVA Secado (a favor exportadora)', margin + 1 + colW + 3 + colW / 2, boxY + 4, { align: 'center' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(`CLP ${fmtClp(ivaEnContra)}`, margin + 1 + colW + 3 + colW / 2, boxY + 9.5, { align: 'center' });

  // Saldo
  const saldoColor = saldoProductor >= 0 ? ACCENT_GREEN : ACCENT_RED;
  doc.setFillColor(saldoProductor >= 0 ? 230 : 255, saldoProductor >= 0 ? 245 : 235, saldoProductor >= 0 ? 230 : 235);
  doc.roundedRect(margin + 1 + (colW + 3) * 2, boxY, colW, boxH, 1, 1, 'F');
  doc.setFontSize(5.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 100, 100);
  doc.text('Saldo IVA Neto', margin + 1 + (colW + 3) * 2 + colW / 2, boxY + 4, { align: 'center' });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...saldoColor);
  doc.text(`CLP ${fmtClp(saldoProductor)}`, margin + 1 + (colW + 3) * 2 + colW / 2, boxY + 9.5, { align: 'center' });

  doc.setTextColor(0, 0, 0);

  // Card border for IVA
  doc.setDrawColor(...CARD_BORDER);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, ivaY, contentW, boxY + boxH - ivaY + 2, 1.5, 1.5, 'S');

  y = boxY + boxH + 5;

  // ── Footer ──
  doc.setDrawColor(...CARD_BORDER);
  doc.setLineWidth(0.2);
  doc.line(margin, y, pw - margin, y);
  y += 3;
  doc.setFontSize(6);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(140, 140, 140);
  doc.text('Este documento es un resumen informativo de la cuenta corriente y no constituye un documento tributario.', pw / 2, y, { align: 'center' });

  doc.save(`Cuenta_Corriente_${data.producer.name.replace(/\s+/g, '_')}_${data.year}.pdf`);
}
