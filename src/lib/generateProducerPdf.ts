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

const PRIMARY: [number, number, number] = [75, 0, 110];
const PURPLE_LIGHT: [number, number, number] = [120, 60, 160];
const ACCENT_GREEN: [number, number, number] = [22, 163, 74];
const ACCENT_RED: [number, number, number] = [220, 38, 38];
const MUTED_BG: [number, number, number] = [245, 240, 250];
const CARD_BORDER: [number, number, number] = [200, 180, 220];

function sectionTitle(doc: jsPDF, x: number, y: number, w: number, title: string): number {
  doc.setFillColor(...PRIMARY);
  doc.roundedRect(x, y, w, 6, 1, 1, 'F');
  doc.rect(x, y + 3.5, w, 2.5, 'F');
  doc.setFontSize(7);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(title, x + 2.5, y + 4.2);
  doc.setTextColor(0, 0, 0);
  return y + 6.5;
}

function cardBorder(doc: jsPDF, x: number, y: number, w: number, h: number) {
  doc.setDrawColor(...CARD_BORDER);
  doc.setLineWidth(0.25);
  doc.roundedRect(x, y, w, h, 1, 1, 'S');
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
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 8; // tight margins
  const cw = pw - m * 2; // content width
  let y = 0;

  // ── HEADER (compact) ──
  const logoBase64 = await loadLogoAsBase64();
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, pw, 22, 'F');

  if (logoBase64) {
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(m, 2, 26, 18, 1.5, 1.5, 'F');
    doc.addImage(logoBase64, 'PNG', m + 1, 3, 24, 16);
  }

  const tx = logoBase64 ? 40 : pw / 2;
  const ta: any = logoBase64 ? 'left' : 'center';
  doc.setFontSize(13);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('Cuenta Corriente Productor', tx, 10, { align: ta });
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.text(`Temporada ${data.year}`, tx, 15.5, { align: ta });
  doc.setFontSize(6.5);
  doc.setTextColor(210, 190, 230);
  const today = new Date();
  doc.text(`Emitido: ${today.getDate()} de ${MONTHS_FULL[today.getMonth()]} ${today.getFullYear()}`, tx, 19.5, { align: ta });
  doc.setTextColor(0, 0, 0);

  // Producer bar
  y = 24;
  doc.setFillColor(...MUTED_BG);
  doc.roundedRect(m, y, cw, 7, 1, 1, 'F');
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PRIMARY);
  doc.text(data.producer.name, m + 3, y + 4.8);
  if (data.producer.rut) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 100, 100);
    doc.text(`RUT: ${data.producer.rut}`, pw - m - 3, y + 4.8, { align: 'right' });
  }
  doc.setTextColor(0, 0, 0);
  y = 33;

  const gap = 3;
  const halfW = (cw - gap) / 2;
  const lx = m;
  const rx = m + halfW + gap;
  const cellPad = 1.2;
  const fontSize = 6.5;

  // ═══════════════════════════════════════════
  // 1. FACTURACIÓN & SECADO
  // ═══════════════════════════════════════════
  let ly = sectionTitle(doc, lx, y, halfW, 'Facturación Total');
  autoTable(doc, {
    startY: ly,
    margin: { left: lx + 1, right: pw - lx - halfW + 1 },
    theme: 'plain',
    styles: { fontSize, cellPadding: cellPad, textColor: [50, 50, 50] },
    body: [
      ['Kg Secos Totales', `${Number(data.dryKg).toLocaleString('es-CL')} kg`],
      ['Total Facturado USD', `USD ${fmt(data.totalInvoicedUsd)}`],
      ['Total Facturado CLP', `CLP ${fmtClp(data.totalInvoicedClp)}`],
    ],
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 30 }, 1: { halign: 'right' } },
    didParseCell: (h) => {
      if (h.row.index === 1 && h.column.index === 1 && h.section === 'body') {
        h.cell.styles.fontStyle = 'bold';
        h.cell.styles.textColor = [...PRIMARY];
      }
    },
  });
  const lEnd1 = (doc as any).lastAutoTable.finalY;

  let ry = sectionTitle(doc, rx, y, halfW, 'Secado');
  autoTable(doc, {
    startY: ry,
    margin: { left: rx + 1, right: pw - rx - halfW + 1 },
    theme: 'plain',
    styles: { fontSize, cellPadding: cellPad, textColor: [50, 50, 50] },
    body: [
      ['Total Secado CLP', `CLP ${fmtClp(data.totalDryingClp)}`],
      ['Total Pagado CLP', `CLP ${fmtClp(data.cuotaTotalPaidClp ?? 0)}`],
      ['Saldo CLP', `CLP ${fmtClp(data.cuotaSaldoClp ?? 0)}`],
      ['Método pago', methodLabel[data.method] ?? data.method],
    ],
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 30 }, 1: { halign: 'right' } },
    didParseCell: (h) => {
      if (h.section === 'body') {
        const label = String(h.row.raw?.[0] ?? '');
        if (label === 'Total Pagado CLP' && h.column.index === 1) h.cell.styles.textColor = [...ACCENT_GREEN];
        if (label === 'Saldo CLP') {
          h.cell.styles.fontStyle = 'bold';
          h.cell.styles.textColor = (data.cuotaSaldoClp ?? 0) > 0 ? [...ACCENT_RED] : [...ACCENT_GREEN];
        }
        if (label === 'Total Secado CLP' && h.column.index === 1) h.cell.styles.fontStyle = 'bold';
      }
    },
  });
  const rEnd1 = (doc as any).lastAutoTable.finalY;

  const h1 = Math.max(lEnd1, rEnd1) - y + 0.5;
  cardBorder(doc, lx, y, halfW, h1);
  cardBorder(doc, rx, y, halfW, h1);
  y = Math.max(lEnd1, rEnd1) + gap;

  // ═══════════════════════════════════════════
  // 2. ANTICIPOS
  // ═══════════════════════════════════════════
  const showDiscount = Object.values(data.discountByMonth).some(v => v > 0);
  const advHeaders: string[] = ['Mes', 'USD/kg', 'Anticipo USD'];
  if (showDiscount) advHeaders.push('Desc. Secado', 'Neto USD');
  advHeaders.push('Estado', 'Fecha Pago');

  const advRows = data.advances.map(a => {
    const discount = data.discountByMonth[a.month] ?? 0;
    const net = a.advance - discount;
    const row: string[] = [MONTHS_FULL[a.month - 1], fmt(a.centsPerKg / 100), `USD ${fmt(a.advance)}`];
    if (showDiscount) {
      row.push(discount > 0 ? `-USD ${fmt(discount)}` : '-');
      row.push(`USD ${fmt(net)}`);
    }
    row.push(a.paid ? '✓ Pagado' : 'Pendiente');
    row.push(a.paidDate ? new Date(a.paidDate + 'T12:00:00').toLocaleDateString('es-CL') : '-');
    return row;
  });
  const totalRow: string[] = ['TOTAL', '', `USD ${fmt(data.totalAdvances)}`];
  if (showDiscount) totalRow.push('', '');
  totalRow.push(`Pagado: USD ${fmt(data.paidAdvances)}`);
  totalRow.push('');
  advRows.push(totalRow);

  const aY = y;
  sectionTitle(doc, m, aY, cw, `Anticipos ${data.year}`);
  const statusCol = showDiscount ? 5 : 3;

  autoTable(doc, {
    startY: aY + 6.5,
    margin: { left: m + 0.5, right: m + 0.5 },
    theme: 'grid',
    headStyles: { fillColor: [...PURPLE_LIGHT], fontSize: 6, halign: 'center', textColor: [255, 255, 255], cellPadding: 1 },
    styles: { fontSize: 6, cellPadding: 1, lineColor: [...CARD_BORDER], lineWidth: 0.15 },
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

  const aEnd = (doc as any).lastAutoTable.finalY;
  cardBorder(doc, m, aY, cw, aEnd - aY + 0.5);
  y = aEnd + gap;

  // ═══════════════════════════════════════════
  // 3. PRÓXIMO PAGO & DOCUMENTO REQUERIDO
  // ═══════════════════════════════════════════
  if (data.nextAdvance) {
    const pY = y;
    const nextMonth = MONTHS_FULL[data.nextAdvance.month - 1];

    // Left: Próximo Pago
    let lpY = sectionTitle(doc, lx, pY, halfW, 'Próximo Pago');
    const payRows: string[][] = [
      ['Mes', nextMonth],
      ['Anticipo Bruto', `USD ${fmt(data.nextPaymentGross)}`],
    ];
    if (data.nextDiscount > 0) payRows.push(['Desc. Secado', `-USD ${fmt(data.nextDiscount)}`]);
    payRows.push(['Neto a Pagar', `USD ${fmt(data.nextPaymentNet)}`]);

    autoTable(doc, {
      startY: lpY,
      margin: { left: lx + 1, right: pw - lx - halfW + 1 },
      theme: 'plain',
      styles: { fontSize, cellPadding: cellPad, textColor: [50, 50, 50] },
      body: payRows,
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 26 }, 1: { halign: 'right' } },
      didParseCell: (h) => {
        if (h.section === 'body') {
          const label = String(h.row.raw?.[0] ?? '');
          if (label === 'Neto a Pagar') {
            h.cell.styles.fontStyle = 'bold';
            h.cell.styles.fillColor = [...MUTED_BG];
            h.cell.styles.fontSize = 7.5;
            h.cell.styles.textColor = [...PRIMARY];
          }
          if (label.includes('Desc')) h.cell.styles.textColor = [...ACCENT_RED];
        }
      },
    });
    const lpEnd = (doc as any).lastAutoTable.finalY;

    // Right: Documento
    let rpY = sectionTitle(doc, rx, pY, halfW, data.needsDocument ? 'Documento Requerido' : 'Documento');
    if (data.needsDocument) {
      const glosa = data.docType === 'Nota de Débito' ? `Ajuste precio anticipo ${nextMonth}` : `Anticipo compra fruta ${data.year}`;
      const tc = data.docExRate;
      const docRows: string[][] = [['Tipo', data.docType], ['Glosa', glosa], ['Neto USD', `USD ${fmt(data.docNeededUsd)}`]];
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
        margin: { left: rx + 1, right: pw - rx - halfW + 1 },
        theme: 'plain',
        styles: { fontSize, cellPadding: cellPad, textColor: [50, 50, 50] },
        body: docRows,
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 20 }, 1: { halign: 'right' } },
        didParseCell: (h) => {
          if (h.section === 'body') {
            const label = String(h.row.raw?.[0] ?? '');
            if (label === 'Total Doc.') {
              h.cell.styles.fontStyle = 'bold';
              h.cell.styles.fillColor = [...MUTED_BG];
              h.cell.styles.textColor = [...PRIMARY];
            }
            if (label === 'Tipo') { h.cell.styles.textColor = [...ACCENT_RED]; h.cell.styles.fontStyle = 'bold'; }
          }
        },
      });
    } else {
      autoTable(doc, {
        startY: rpY,
        margin: { left: rx + 1, right: pw - rx - halfW + 1 },
        theme: 'plain',
        styles: { fontSize: 7, cellPadding: 1.5 },
        body: [['Facturación al día ✓']],
        didParseCell: (h) => { h.cell.styles.textColor = [...ACCENT_GREEN]; h.cell.styles.fontStyle = 'bold'; h.cell.styles.halign = 'center'; },
      });
    }
    const rpEnd = (doc as any).lastAutoTable.finalY;

    const pH = Math.max(lpEnd, rpEnd) - pY + 0.5;
    cardBorder(doc, lx, pY, halfW, pH);
    cardBorder(doc, rx, pY, halfW, pH);
    y = Math.max(lpEnd, rpEnd) + gap;
  }

  // ═══════════════════════════════════════════
  // 4. BALANCE IVA
  // ═══════════════════════════════════════════
  const iY = y;
  sectionTitle(doc, m, iY, cw, 'Balance IVA (perspectiva del productor)');

  const ivaAFavor = data.ivaProductor;
  const ivaEnContra = data.ivaSecado;
  const saldoP = ivaAFavor - ivaEnContra;

  const colW = (cw - 4) / 3;
  const bY = iY + 7.5;
  const bH = 11;

  // 3 boxes
  const boxes = [
    { label: 'IVA Facturado (a su favor)', value: `CLP ${fmtClp(ivaAFavor)}`, bg: MUTED_BG, color: [0, 0, 0] as [number, number, number] },
    { label: 'IVA Secado (a favor exportadora)', value: `CLP ${fmtClp(ivaEnContra)}`, bg: MUTED_BG, color: [0, 0, 0] as [number, number, number] },
    { label: 'Saldo IVA Neto', value: `CLP ${fmtClp(saldoP)}`, bg: (saldoP >= 0 ? [230, 245, 230] : [255, 235, 235]) as [number, number, number], color: saldoP >= 0 ? ACCENT_GREEN : ACCENT_RED },
  ];

  boxes.forEach((b, i) => {
    const bx = m + 1 + i * (colW + 2);
    doc.setFillColor(...b.bg);
    doc.roundedRect(bx, bY, colW, bH, 1, 1, 'F');
    doc.setFontSize(5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(b.label, bx + colW / 2, bY + 3.5, { align: 'center' });
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...b.color);
    doc.text(b.value, bx + colW / 2, bY + 8.5, { align: 'center' });
  });

  doc.setTextColor(0, 0, 0);
  cardBorder(doc, m, iY, cw, bY + bH - iY + 1.5);
  y = bY + bH + 4;

  // ── Footer ──
  doc.setFontSize(5.5);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(150, 150, 150);
  doc.text('Este documento es un resumen informativo y no constituye un documento tributario.', pw / 2, y, { align: 'center' });

  doc.save(`Cuenta_Corriente_${data.producer.name.replace(/\s+/g, '_')}_${data.year}.pdf`);
}
