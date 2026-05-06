import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

const MONTHS_FULL = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

const fmt = (n: number) => n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtClp = (n: number) => Math.round(n).toLocaleString('es-CL');
const fmtKg = (n: number) => n.toLocaleString('es-CL', { maximumFractionDigits: 2 }) + ' kg';

interface PdfData {
  producer: { name: string; rut?: string };
  year: number;
  dryKg: number;
  totalInvoicedUsd: number;
  totalInvoicedClp: number;
  advances: { month: number; centsPerKg: number; advance: number; paid: boolean; paidDate?: string | null; netClp?: number | null }[];
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
  hasCuotasUsd?: boolean;
  cuotaTcByMonth?: Record<number, number | null>;
  cuotaClpByMonth?: Record<number, number>;
  cuotaUsdByMonth?: Record<number, number>;
  prodInvoices?: any[];
  isSpecial?: boolean;
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

function ensureSpace(doc: jsPDF, y: number, needed: number, m: number): number {
  const ph = doc.internal.pageSize.getHeight();
  if (y + needed > ph - 15) {
    doc.addPage();
    return m;
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
  const pw = doc.internal.pageSize.getWidth();
  const ph = doc.internal.pageSize.getHeight();
  const m = 12;
  const cw = pw - m * 2;
  let y = 0;

  // ── HEADER ──
  const logoBase64 = await loadLogoAsBase64();
  doc.setFillColor(...PRIMARY);
  doc.rect(0, 0, pw, 30, 'F');

  if (logoBase64) {
    doc.addImage(logoBase64, 'PNG', m, 5, 60, 20);
  }

  const tx = logoBase64 ? 76 : pw / 2;
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
      ['Kilos deshidratados totales', fmtKg(data.dryKg)],
      ['Total Facturado USD', `USD ${fmt(data.totalInvoicedUsd)}`],
      ['Total Facturado CLP', `CLP ${fmtClp(data.totalInvoicedClp)}`],
    ],
    columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 }, 1: { halign: 'right' } },
    didParseCell: (h) => {
      if ((h.row.index === 0 || h.row.index === 1) && h.column.index === 1 && h.section === 'body') {
        h.cell.styles.fontStyle = 'bold';
        h.cell.styles.textColor = [...PRIMARY];
      }
    },
  });
  const lEnd1 = (doc as any).lastAutoTable.finalY;

  // Secado section - now with cuota details for cuotas USD
  const secadoBody: string[][] = [
    ['Total Secado CLP', `CLP ${fmtClp(data.totalDryingClp)}`],
    ['Total Pagado CLP', `CLP ${fmtClp(data.cuotaTotalPaidClp ?? 0)}`],
    ['Saldo CLP', `CLP ${fmtClp(data.cuotaSaldoClp ?? 0)}`],
    ['Método pago', methodLabel[data.method] ?? data.method],
  ];

  if (data.hasCuotasUsd && data.nextAdvance) {
    const nm = data.nextAdvance.month;
    const tc = data.cuotaTcByMonth?.[nm];
    const clpVal = data.cuotaClpByMonth?.[nm] ?? data.cuotaClp ?? 0;
    const usdVal = data.cuotaUsdByMonth?.[nm] ?? 0;
    secadoBody.push(['Cuota mensual CLP', `CLP ${fmtClp(clpVal)}`]);
    secadoBody.push(['TC observado', tc ? `$${Number(tc).toLocaleString('es-CL')}` : 'Sin TC']);
    secadoBody.push(['Cuota en USD', tc ? `USD ${fmt(usdVal)}` : 'Pendiente TC']);
  } else if (data.method === 'pago_clp' && (data.cuotaClp ?? 0) > 0) {
    secadoBody.push(['Cuota a depositar', `CLP ${fmtClp(data.cuotaClp ?? 0)}`]);
  }

  let ry = sectionTitle(doc, rx, y, halfW, 'Secado');
  autoTable(doc, {
    startY: ry,
    margin: { left: rx + 2, right: pw - (rx + halfW) + 2 },
    tableWidth: halfW - 4,
    theme: 'plain',
    styles: { fontSize: fs, cellPadding: cp, textColor: [50, 50, 50], overflow: 'ellipsize' },
    body: secadoBody,
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
        if (label === 'Cuota mensual CLP' && h.column.index === 1) h.cell.styles.fontStyle = 'bold';
        if (label === 'Cuota en USD' && h.column.index === 1) h.cell.styles.fontStyle = 'bold';
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
  const showDiscount = Object.values(data.discountByMonth).some(v => v > 0) || data.hasCuotasUsd;
  const showSpecialCols = !!data.isSpecial;
  const advHeaders: string[] = ['Mes', 'USD/kg', 'Anticipo USD'];
  if (showDiscount) advHeaders.push('Desc. Secado', 'Neto USD');
  if (showSpecialCols) advHeaders.push('Neto CLP', 'TC');
  advHeaders.push('Estado', 'Fecha Pago');

  const sortedAdvances = showSpecialCols
    ? [...data.advances].sort((a, b) => {
        if (a.paidDate && b.paidDate) return a.paidDate.localeCompare(b.paidDate);
        if (a.paidDate) return -1;
        if (b.paidDate) return 1;
        return a.month - b.month;
      })
    : data.advances;

  const advRows = sortedAdvances.map(a => {
    const discount = data.discountByMonth[a.month] ?? 0;
    const net = a.advance - discount;
    const row: string[] = [MONTHS_FULL[a.month - 1], fmt(a.centsPerKg / 100), `USD ${fmt(a.advance)}`];
    if (showDiscount) {
      row.push(discount > 0 ? `-USD ${fmt(discount)}` : '-');
      row.push(`USD ${fmt(net)}`);
    }
    if (showSpecialCols) {
      const netClp = a.netClp ?? null;
      const tc = netClp && net > 0 ? netClp / net : null;
      row.push(netClp ? `CLP ${fmtClp(netClp)}` : '-');
      row.push(tc ? `$${tc.toLocaleString('es-CL', { maximumFractionDigits: 2 })}` : '-');
    }
    row.push(a.paid ? 'Pagado' : 'Pendiente');
    row.push(a.paidDate ? new Date(a.paidDate + 'T12:00:00').toLocaleDateString('es-CL') : '-');
    return row;
  });
  const totalUsdKg = data.advances.reduce((s, a) => s + a.centsPerKg / 100, 0);
  const totalDiscount = data.advances.reduce((s, a) => s + (data.discountByMonth[a.month] ?? 0), 0);
  const totalNet = data.totalAdvances - totalDiscount;
  const paidNetSum = data.advances.filter(a => a.paid).reduce((s, a) => s + a.advance - (data.discountByMonth[a.month] ?? 0), 0);
  const totalNetClp = data.advances.reduce((s, a) => s + (a.netClp ?? 0), 0);
  const totalRow: string[] = ['TOTAL', fmt(totalUsdKg), `USD ${fmt(data.totalAdvances)}`];
  if (showDiscount) totalRow.push(`-USD ${fmt(totalDiscount)}`, `USD ${fmt(totalNet)}`);
  if (showSpecialCols) {
    totalRow.push(totalNetClp > 0 ? `CLP ${fmtClp(totalNetClp)}` : '-');
    totalRow.push('');
  }
  totalRow.push(`USD ${fmt(paidNetSum)}`);
  totalRow.push('');
  advRows.push(totalRow);

  y = ensureSpace(doc, y, 40, m);
  const aY = y;
  sectionTitle(doc, m, aY, cw, `Anticipos ${data.year}`);
  const statusCol = 3 + (showDiscount ? 2 : 0) + (showSpecialCols ? 2 : 0);

  autoTable(doc, {
    startY: aY + 10,
    margin: { left: m + 1, right: m + 1 },
    tableWidth: cw - 2,
    theme: 'grid',
    headStyles: { fillColor: [...PURPLE_LIGHT], fontSize: showSpecialCols ? 6.5 : 8, halign: 'center', textColor: [255, 255, 255], cellPadding: showSpecialCols ? 1.8 : 2.5 },
    styles: { fontSize: showSpecialCols ? 6.5 : 8, cellPadding: showSpecialCols ? 1.8 : 2.5, lineColor: [...CARD_BORDER], lineWidth: 0.2, overflow: 'ellipsize' },
    head: [advHeaders],
    body: advRows,
    columnStyles: (() => {
      const cs: any = {
        0: { fontStyle: 'bold' },
        1: { halign: 'right' },
        2: { halign: 'right' },
      };
      let i = 3;
      if (showDiscount) {
        cs[i++] = { halign: 'right', textColor: [...ACCENT_RED] };
        cs[i++] = { halign: 'right', fontStyle: 'bold' };
      }
      if (showSpecialCols) {
        cs[i++] = { halign: 'right' };
        cs[i++] = { halign: 'right' };
      }
      cs[i++] = { halign: 'center' };
      cs[i++] = { halign: 'center' };
      return cs;
    })(),
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
  // 3. PRÓXIMO PAGO + USD POR FACTURAR (left) & DOCUMENTO REQUERIDO (right)
  // ═══════════════════════════════════════════
  if (data.nextAdvance || data.needsDocument) {
    y = ensureSpace(doc, y, 50, m);
    const pY = y;
    const nextMonth = data.nextAdvance ? MONTHS_FULL[data.nextAdvance.month - 1] : '-';

    // LEFT: Próximo Pago
    let lpY = sectionTitle(doc, lx, pY, halfW, 'Próximo Pago');
    const payRows: string[][] = data.nextAdvance ? (() => {
      const rows: string[][] = [
        ['Mes', nextMonth],
        ['Anticipo Bruto', `USD ${fmt(data.nextPaymentGross)}`],
      ];
      if (data.nextDiscount > 0) rows.push(['Desc. Secado', `-USD ${fmt(data.nextDiscount)}`]);
      rows.push(['Neto a Pagar', `USD ${fmt(data.nextPaymentNet)}`]);
      return rows;
    })() : [['Estado', 'Sin próximo pago pendiente']];

    autoTable(doc, {
      startY: lpY,
      margin: { left: lx + 2, right: pw - (lx + halfW) + 2 },
      tableWidth: halfW - 4,
      theme: 'plain',
      styles: { fontSize: fs, cellPadding: cp, textColor: [50, 50, 50], overflow: 'ellipsize' },
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
    let lpEnd = (doc as any).lastAutoTable.finalY;

    // LEFT: USD por Facturar (below Próximo Pago)
    if (data.needsDocument) {
      const facY = lpEnd + 2;
      sectionTitle(doc, lx, facY, halfW, 'USD por Facturar');
      const cumulativeAdv = data.docNeededUsd + data.totalInvoicedUsd;
      const facRows: string[][] = [
        ['Anticipos acum.', `USD ${fmt(cumulativeAdv)}`],
        ['Ya facturado', `-USD ${fmt(data.totalInvoicedUsd)}`],
        ['USD por Facturar', `USD ${fmt(data.docNeededUsd)}`],
      ];
      autoTable(doc, {
        startY: facY + 10,
        margin: { left: lx + 2, right: pw - (lx + halfW) + 2 },
        tableWidth: halfW - 4,
        theme: 'plain',
        styles: { fontSize: fs, cellPadding: cp, textColor: [50, 50, 50], overflow: 'ellipsize' },
        body: facRows,
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 34 }, 1: { halign: 'right' } },
        didParseCell: (h) => {
          if (h.section === 'body') {
            const label = String(h.row.raw?.[0] ?? '');
            if (label === 'Ya facturado') h.cell.styles.textColor = [...ACCENT_RED];
            if (label === 'Anticipos acum.') {
              h.cell.styles.fontSize = 7;
              h.cell.styles.textColor = [100, 100, 100];
            }
            if (label === 'USD por Facturar') {
              h.cell.styles.fontStyle = 'bold';
              h.cell.styles.textColor = [...PRIMARY];
              h.cell.styles.fillColor = [...MUTED_BG];
            }
          }
        },
      });
      lpEnd = (doc as any).lastAutoTable.finalY;
    }

    // RIGHT: Documento Requerido
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
        margin: { left: rx + 2, right: pw - (rx + halfW) + 2 },
        tableWidth: halfW - 4,
        theme: 'plain',
        styles: { fontSize: fs, cellPadding: cp, textColor: [50, 50, 50], overflow: 'ellipsize' },
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
        margin: { left: rx + 2, right: pw - (rx + halfW) + 2 },
        tableWidth: halfW - 4,
        theme: 'plain',
        styles: { fontSize: 9, cellPadding: 3, overflow: 'ellipsize' },
        body: [['Facturación al día']],
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
  // 4. BALANCE IVA
  // ═══════════════════════════════════════════
  y = ensureSpace(doc, y, 40, m);
  const iY = y;
  sectionTitle(doc, m, iY, cw, 'Balance IVA (perspectiva del productor)');

  const ivaAFavor = data.ivaProductor;
  const ivaEnContra = data.ivaSecado;
  const saldoP = ivaAFavor - ivaEnContra;

  const colW = (cw - 18) / 3;
  const colGap = 3;
  const bY = iY + 12;
  const bH = 22;

  const boxes = [
    { label: 'IVA Facturado (a su favor)', value: `CLP ${fmtClp(ivaAFavor)}`, bg: MUTED_BG, color: [0, 0, 0] as [number, number, number] },
    { label: 'IVA Secado (a favor exportadora)', value: `CLP ${fmtClp(ivaEnContra)}`, bg: MUTED_BG, color: [0, 0, 0] as [number, number, number] },
    { label: 'Saldo IVA Neto', value: `CLP ${fmtClp(saldoP)}`, bg: (saldoP >= 0 ? [230, 245, 230] : [255, 235, 235]) as [number, number, number], color: saldoP >= 0 ? ACCENT_GREEN : ACCENT_RED },
  ];

  boxes.forEach((b, i) => {
    const bx = m + 3 + i * (colW + colGap);
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
  y = bY + bH + 3 + sp;

  // ═══════════════════════════════════════════
  // 5. HISTORIAL DE FACTURAS DEL PRODUCTOR
  // ═══════════════════════════════════════════
  const invoices = data.prodInvoices ?? [];
  if (invoices.length > 0) {
    y = ensureSpace(doc, y, 40, m);
    const invY = y;
    sectionTitle(doc, m, invY, cw, 'Historial de Facturas del Productor');

    const docTypeLabels: Record<string, string> = {
      factura: 'Factura',
      nota_debito: 'Nota de Débito',
      nota_credito: 'Nota de Crédito',
    };

    const sorted = [...invoices].sort((a, b) => a.date.localeCompare(b.date));
    const invRows = sorted.map(inv => [
      inv.invoice_number || '-',
      docTypeLabels[inv.document_type] ?? inv.document_type,
      new Date(inv.date + 'T12:00:00').toLocaleDateString('es-CL'),
      `CLP ${fmtClp(inv.amount_clp)}`,
      `$${Number(inv.exchange_rate).toLocaleString('es-CL')}`,
      `USD ${fmt(Number(inv.amount_usd))}`,
    ]);

    // Total row
    invRows.push([
      'TOTAL', '', '',
      `CLP ${fmtClp(data.totalInvoicedClp)}`,
      '',
      `USD ${fmt(data.totalInvoicedUsd)}`,
    ]);

    autoTable(doc, {
      startY: invY + 10,
      margin: { left: m + 1, right: m + 1 },
      tableWidth: cw - 2,
      theme: 'grid',
      headStyles: { fillColor: [...PURPLE_LIGHT], fontSize: 8, halign: 'center', textColor: [255, 255, 255], cellPadding: 2.5 },
      styles: { fontSize: 8, cellPadding: 2.5, lineColor: [...CARD_BORDER], lineWidth: 0.2, overflow: 'ellipsize' },
      head: [['N° Doc', 'Tipo', 'Fecha', 'Monto CLP', 'TC', 'Monto USD']],
      body: invRows,
      columnStyles: {
        0: { fontStyle: 'bold' },
        1: { halign: 'center' },
        2: { halign: 'center' },
        3: { halign: 'right' },
        4: { halign: 'right' },
        5: { halign: 'right', fontStyle: 'bold' },
      },
      didParseCell: (h) => {
        if (h.section === 'body' && h.row.index === invRows.length - 1) {
          h.cell.styles.fontStyle = 'bold';
          h.cell.styles.fillColor = [...MUTED_BG];
        }
      },
    });

    const invEnd = (doc as any).lastAutoTable.finalY;
    cardBorder(doc, m, invY, cw, invEnd - invY + 1);
    y = invEnd + sp;
  }

  // ── Footer on last page ──
  doc.setFontSize(7);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(150, 150, 150);
  doc.text('Este documento es un resumen informativo y no constituye un documento tributario.', pw / 2, ph - 6, { align: 'center' });

  doc.save(`Cuenta_Corriente_${data.producer.name.replace(/\s+/g, '_')}_${data.year}.pdf`);
}
