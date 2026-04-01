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
  doc.roundedRect(x, y, w, 9, 2, 2, 'F');
  doc.rect(x, y + 5, w, 4, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text(title, x + 4, y + 6.2);
  doc.setTextColor(0, 0, 0);
  return y + 10;
}

function cardBorder(doc: jsPDF, x: number, y: number, w: number, h: number) {
  doc.setDrawColor(...CARD_BORDER);
  doc.setLineWidth(0.4);
  doc.roundedRect(x, y, w, h, 2, 2, 'S');
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
  const pw = doc.internal.pageSize.getWidth();  // 216
  const ph = doc.internal.pageSize.getHeight(); // 279
  const m = 12;
  const cw = pw - m * 2;
  let y = 0;

  // ── HEADER ──
  const logoBase64 = await loadLogoAsBase64();
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, pw, 30, 'F');

  if (logoBase64) {
    doc.addImage(logoBase64, 'PNG', m, 3, 50, 24);
  }

  const tx = logoBase64 ? 66 : pw / 2;
  const ta: any = logoBase64 ? 'left' : 'center';
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 255, 255);
  doc.text('Cuenta Corriente Productor', tx, 13, { align: ta });
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Temporada ${data.year}`, tx, 19, { align: ta });
  doc.setFontSize(7.5);
  doc.setTextColor(210, 190, 230);
  const today = new Date();
  doc.text(`Emitido: ${today.getDate()} de ${MONTHS_FULL[today.getMonth()]} ${today.getFullYear()}`, tx, 25, { align: ta });
  doc.setTextColor(0, 0, 0);

  // Producer bar
  y = 33;
  doc.setFillColor(...MUTED_BG);
  doc.roundedRect(m, y, cw, 9, 2, 2, 'F');
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...PRIMARY);
  doc.text(data.producer.name, m + 4, y + 6);
  if (data.producer.rut) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(100, 100, 100);
    doc.text(`RUT: ${data.producer.rut}`, pw - m - 4, y + 6, { align: 'right' });
  }
  doc.setTextColor(0, 0, 0);
  y = 45;

  const sp = 4;
  const halfW = (cw - 5) / 2;
  const lx = m;
  const rx = m + halfW + 5;
  const fs = 8;
  const cp = 2;

  // ═══════════════════════════════════════════
  // 1. FACTURACIÓN & SECADO
  // ═══════════════════════════════════════════
  let ly = sectionTitle(doc, lx, y, halfW, 'Facturación Total');
  autoTable(doc, {
    startY: ly,
    margin: { left: lx + 2, right: pw - (lx + halfW) + 2 },
    tableWidth: halfW - 4,
    theme: 'plain',
    styles: { fontSize: fs, cellPadding: cp, textColor: [50, 50, 50], overflow: 'ellipsize' },
    body: [
      ['Kg Secos Totales', 'En proceso'],
      ['Total Facturado USD', `USD ${fmt(data.totalInvoicedUsd)}`],
      ['Total Facturado CLP', `CLP ${fmtClp(data.totalInvoicedClp)}`],
    ],
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 38 }, 1: { halign: 'right' } },
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
    margin: { left: rx + 2, right: pw - (rx + halfW) + 2 },
    tableWidth: halfW - 4,
    theme: 'plain',
    styles: { fontSize: fs, cellPadding: cp, textColor: [50, 50, 50], overflow: 'ellipsize' },
    body: [
      ['Total Secado CLP', `CLP ${fmtClp(data.totalDryingClp)}`],
      ['Total Pagado CLP', `CLP ${fmtClp(data.cuotaTotalPaidClp ?? 0)}`],
      ['Saldo CLP', `CLP ${fmtClp(data.cuotaSaldoClp ?? 0)}`],
      ['Método pago', methodLabel[data.method] ?? data.method],
    ],
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 38 }, 1: { halign: 'right' } },
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

  const h1 = Math.max(lEnd1, rEnd1) - y + 1;
  cardBorder(doc, lx, y, halfW, h1);
  cardBorder(doc, rx, y, halfW, h1);
  y = Math.max(lEnd1, rEnd1) + sp;

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
    startY: aY + 10,
    margin: { left: m + 1, right: m + 1 },
    theme: 'grid',
    headStyles: { fillColor: [...PURPLE_LIGHT], fontSize: 8, halign: 'center', textColor: [255, 255, 255], cellPadding: 2.5 },
    styles: { fontSize: 8, cellPadding: 2.5, lineColor: [...CARD_BORDER], lineWidth: 0.2 },
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
  cardBorder(doc, m, aY, cw, aEnd - aY + 1);
  y = aEnd + sp;

  // ═══════════════════════════════════════════
  // 3. PRÓXIMO PAGO & DOCUMENTO REQUERIDO
  // ═══════════════════════════════════════════
  if (data.nextAdvance) {
    const pY = y;
    const nextMonth = MONTHS_FULL[data.nextAdvance.month - 1];

    let lpY = sectionTitle(doc, lx, pY, halfW, 'Próximo Pago');
    const payRows: string[][] = [
      ['Mes', nextMonth],
      ['Anticipo Bruto', `USD ${fmt(data.nextPaymentGross)}`],
    ];
    if (data.nextDiscount > 0) payRows.push(['Desc. Secado', `-USD ${fmt(data.nextDiscount)}`]);
    payRows.push(['Neto a Pagar', `USD ${fmt(data.nextPaymentNet)}`]);

    autoTable(doc, {
      startY: lpY,
      margin: { left: lx + 2, right: pw - lx - halfW + 2 },
      theme: 'plain',
      styles: { fontSize: fs, cellPadding: cp, textColor: [50, 50, 50] },
      body: payRows,
      columnStyles: { 0: { fontStyle: 'bold', cellWidth: 34 }, 1: { halign: 'right' } },
      didParseCell: (h) => {
        if (h.section === 'body') {
          const label = String(h.row.raw?.[0] ?? '');
          if (label === 'Neto a Pagar') {
            h.cell.styles.fontStyle = 'bold';
            h.cell.styles.fillColor = [...MUTED_BG];
            h.cell.styles.fontSize = 10;
            h.cell.styles.textColor = [...PRIMARY];
          }
          if (label.includes('Desc')) h.cell.styles.textColor = [...ACCENT_RED];
        }
      },
    });
    const lpEnd = (doc as any).lastAutoTable.finalY;

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
        margin: { left: rx + 2, right: pw - rx - halfW + 2 },
        theme: 'plain',
        styles: { fontSize: fs, cellPadding: cp, textColor: [50, 50, 50] },
        body: docRows,
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 28 }, 1: { halign: 'right' } },
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
        margin: { left: rx + 2, right: pw - rx - halfW + 2 },
        theme: 'plain',
        styles: { fontSize: 9, cellPadding: 3 },
        body: [['Facturación al día ✓']],
        didParseCell: (h) => { h.cell.styles.textColor = [...ACCENT_GREEN]; h.cell.styles.fontStyle = 'bold'; h.cell.styles.halign = 'center'; },
      });
    }
    const rpEnd = (doc as any).lastAutoTable.finalY;

    const pH = Math.max(lpEnd, rpEnd) - pY + 1;
    cardBorder(doc, lx, pY, halfW, pH);
    cardBorder(doc, rx, pY, halfW, pH);
    y = Math.max(lpEnd, rpEnd) + sp;
  }

  // ═══════════════════════════════════════════
  // 4. BALANCE IVA — stretch to fill remaining space
  // ═══════════════════════════════════════════
  const footerSpace = 12;
  const ivaAvailable = ph - y - footerSpace;
  const ivaH = Math.max(35, ivaAvailable);

  const iY = y;
  sectionTitle(doc, m, iY, cw, 'Balance IVA (perspectiva del productor)');

  const ivaAFavor = data.ivaProductor;
  const ivaEnContra = data.ivaSecado;
  const saldoP = ivaAFavor - ivaEnContra;

  const colW = (cw - 12) / 3;
  const bY = iY + 12;
  const bH = Math.min(ivaH - 16, 22);

  const boxes = [
    { label: 'IVA Facturado (a su favor)', value: `CLP ${fmtClp(ivaAFavor)}`, bg: MUTED_BG, color: [0, 0, 0] as [number, number, number] },
    { label: 'IVA Secado (a favor exportadora)', value: `CLP ${fmtClp(ivaEnContra)}`, bg: MUTED_BG, color: [0, 0, 0] as [number, number, number] },
    { label: 'Saldo IVA Neto', value: `CLP ${fmtClp(saldoP)}`, bg: (saldoP >= 0 ? [230, 245, 230] : [255, 235, 235]) as [number, number, number], color: saldoP >= 0 ? ACCENT_GREEN : ACCENT_RED },
  ];

  boxes.forEach((b, i) => {
    const bx = m + 3 + i * (colW + 6);
    doc.setFillColor(...b.bg);
    doc.roundedRect(bx, bY, colW, bH, 2, 2, 'F');
    doc.setFontSize(7);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(100, 100, 100);
    doc.text(b.label, bx + colW / 2, bY + bH * 0.3, { align: 'center' });
    doc.setFontSize(11);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...b.color);
    doc.text(b.value, bx + colW / 2, bY + bH * 0.7, { align: 'center' });
  });

  doc.setTextColor(0, 0, 0);
  cardBorder(doc, m, iY, cw, bY + bH - iY + 3);

  // ── Footer ──
  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(150, 150, 150);
  doc.text('Este documento es un resumen informativo y no constituye un documento tributario.', pw / 2, ph - 6, { align: 'center' });

  doc.save(`Cuenta_Corriente_${data.producer.name.replace(/\s+/g, '_')}_${data.year}.pdf`);
}
