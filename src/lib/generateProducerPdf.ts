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
  dryingDiscountPerMonth: number;
  nextPaymentGross: number;
  nextPaymentNet: number;
  method: string;
  needsDocument: boolean;
  docType: string;
  docNeededUsd: number;
  nextMonthEx: { rate: number; month: number } | null;
  ivaSecado: number;
  ivaProductor: number;
  ivaSaldo: number;
}

const methodLabel: Record<string, string> = {
  descuento_usd: 'Descuento en USD',
  pago_clp: 'Pago en CLP',
  liquidacion_fin_año: 'Liquidación fin de año',
  cuotas: 'Cuotas',
};

export function generateProducerPdf(data: PdfData) {
  const doc = new jsPDF('p', 'mm', 'letter');
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 20;

  // Header
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('Cuenta Corriente', pageWidth / 2, y, { align: 'center' });
  y += 8;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`Temporada ${data.year}`, pageWidth / 2, y, { align: 'center' });
  y += 10;

  // Producer info
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`Productor: ${data.producer.name}`, 15, y);
  if (data.producer.rut) {
    doc.setFont('helvetica', 'normal');
    doc.text(`RUT: ${data.producer.rut}`, pageWidth - 15, y, { align: 'right' });
  }
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  const today = new Date();
  doc.text(`Fecha de emisión: ${today.getDate()} de ${MONTHS_FULL[today.getMonth()]} ${today.getFullYear()}`, 15, y);
  y += 4;
  doc.setDrawColor(50);
  doc.setLineWidth(0.5);
  doc.line(15, y, pageWidth - 15, y);
  y += 8;

  // Section: Resumen General
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('1. Resumen General', 15, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    margin: { left: 15, right: 15 },
    theme: 'grid',
    headStyles: { fillColor: [60, 60, 60] },
    body: [
      ['Kilos Secos Totales', `${Number(data.dryKg).toLocaleString('es-CL')} kg`],
      ['Total Facturado', `USD ${fmt(data.totalInvoicedUsd)}  |  CLP ${fmtClp(data.totalInvoicedClp)}`],
      ['Método Pago Secado', methodLabel[data.method] ?? data.method],
    ],
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 60 },
      1: { halign: 'right' },
    },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  // Section: Anticipos
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('2. Detalle de Anticipos', 15, y);
  y += 3;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.text(`Cálculo: Kg Secos (${Number(data.dryKg).toLocaleString('es-CL')}) × Centavos/kg ÷ 100 = Anticipo USD`, 15, y + 4);
  y += 8;

  const showDiscount = data.method === 'descuento_usd' || data.method === 'cuotas';

  const advRows = data.advances.map(a => {
    const discount = showDiscount ? data.dryingDiscountPerMonth : 0;
    const net = a.advance - discount;
    const row: string[] = [
      MONTHS_FULL[a.month - 1],
      `${a.centsPerKg}`,
      `${Number(data.dryKg).toLocaleString('es-CL')} × ${a.centsPerKg} ÷ 100`,
      `USD ${fmt(a.advance)}`,
    ];
    if (showDiscount) {
      row.push(discount > 0 ? `-USD ${fmt(discount)}` : '-');
      row.push(`USD ${fmt(net)}`);
    }
    row.push(a.paid ? 'Pagado' : 'Pendiente');
    return row;
  });

  const advHeaders: string[] = ['Mes', '¢/kg', 'Cálculo', 'Anticipo USD'];
  if (showDiscount) {
    advHeaders.push('Desc. Secado', 'Neto USD');
  }
  advHeaders.push('Estado');

  // Totals row
  const totalRow: string[] = ['TOTAL', '', '', `USD ${fmt(data.totalAdvances)}`];
  if (showDiscount) {
    totalRow.push('', '');
  }
  totalRow.push(`Pagado: USD ${fmt(data.paidAdvances)}`);
  advRows.push(totalRow);

  autoTable(doc, {
    startY: y,
    margin: { left: 15, right: 15 },
    theme: 'grid',
    headStyles: { fillColor: [60, 60, 60] },
    head: [advHeaders],
    body: advRows,
    styles: { fontSize: 8 },
    didParseCell: (hookData) => {
      // Bold total row
      if (hookData.row.index === advRows.length - 1 && hookData.section === 'body') {
        hookData.cell.styles.fontStyle = 'bold';
        hookData.cell.styles.fillColor = [240, 240, 240];
      }
    },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  // Check page space
  if (y > 220) {
    doc.addPage();
    y = 20;
  }

  // Section: Secado
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('3. Secado', 15, y);
  y += 6;

  autoTable(doc, {
    startY: y,
    margin: { left: 15, right: 15 },
    theme: 'grid',
    headStyles: { fillColor: [60, 60, 60] },
    body: [
      ['Total Secado', `USD ${fmt(data.totalDryingUsd)}  |  CLP ${fmtClp(data.totalDryingClp)}`],
      ['Descuento Mensual', showDiscount ? `USD ${fmt(data.dryingDiscountPerMonth)}/mes` : 'No aplica (pago directo)'],
    ],
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 60 },
      1: { halign: 'right' },
    },
  });
  y = (doc as any).lastAutoTable.finalY + 10;

  // Section: Próximo Pago
  if (data.nextAdvance) {
    if (y > 220) { doc.addPage(); y = 20; }

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('4. Próximo Pago', 15, y);
    y += 6;

    const nextMonth = MONTHS_FULL[data.nextAdvance.month - 1];
    const paymentRows: string[][] = [
      ['Mes', nextMonth],
      ['Cálculo', `${Number(data.dryKg).toLocaleString('es-CL')} kg × ${data.nextAdvance.centsPerKg} ¢/kg ÷ 100`],
      ['Anticipo Bruto', `USD ${fmt(data.nextPaymentGross)}`],
    ];

    if (showDiscount && data.dryingDiscountPerMonth > 0) {
      paymentRows.push(['Descuento Secado', `-USD ${fmt(data.dryingDiscountPerMonth)}`]);
    }
    paymentRows.push(['NETO A PAGAR', `USD ${fmt(data.nextPaymentNet)}`]);

    autoTable(doc, {
      startY: y,
      margin: { left: 15, right: 15 },
      theme: 'grid',
      headStyles: { fillColor: [60, 60, 60] },
      body: paymentRows,
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 60 },
        1: { halign: 'right' },
      },
      didParseCell: (hookData) => {
        if (hookData.row.index === paymentRows.length - 1 && hookData.section === 'body') {
          hookData.cell.styles.fontStyle = 'bold';
          hookData.cell.styles.fillColor = [230, 245, 230];
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // Section: Documento Requerido
  if (data.needsDocument && data.nextAdvance) {
    if (y > 200) { doc.addPage(); y = 20; }

    const nextMonth = MONTHS_FULL[data.nextAdvance.month - 1];

    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('5. Documento Requerido', 15, y);
    y += 6;

    const glosa = data.docType === 'Nota de Débito'
      ? `Ajuste de precio de anticipo ${nextMonth}`
      : `Anticipo compra fruta temporada ${data.year}`;

    const docRows: string[][] = [
      ['Tipo Documento', data.docType],
      ['Glosa', glosa],
      ['Fecha', `${nextMonth} ${data.year}`],
      ['Monto Neto USD', `USD ${fmt(data.docNeededUsd)}`],
    ];

    if (data.nextMonthEx) {
      const montoCLP = data.docNeededUsd * data.nextMonthEx.rate;
      docRows.push(['Tipo de Cambio', `$${data.nextMonthEx.rate}`]);
      docRows.push(['Monto Neto CLP', `CLP ${fmtClp(montoCLP)}`]);
      const iva = montoCLP * 0.19;
      docRows.push(['IVA (19%)', `CLP ${fmtClp(iva)}`]);
      docRows.push(['Total Documento', `CLP ${fmtClp(montoCLP + iva)}`]);
    }

    docRows.push(['Cálculo', `Anticipos acumulados hasta ${nextMonth} (USD ${fmt(data.docNeededUsd + data.totalInvoicedUsd)}) - Ya facturado (USD ${fmt(data.totalInvoicedUsd)}) = USD ${fmt(data.docNeededUsd)}`]);

    autoTable(doc, {
      startY: y,
      margin: { left: 15, right: 15 },
      theme: 'grid',
      headStyles: { fillColor: [60, 60, 60] },
      body: docRows,
      columnStyles: {
        0: { fontStyle: 'bold', cellWidth: 60 },
        1: { halign: 'right' },
      },
      didParseCell: (hookData) => {
        const lastIdx = docRows.length - 1;
        if (hookData.row.index === lastIdx && hookData.section === 'body') {
          hookData.cell.styles.fontSize = 7;
          hookData.cell.styles.fontStyle = 'italic';
        }
      },
    });
    y = (doc as any).lastAutoTable.finalY + 10;
  }

  // Section: IVA — from producer's perspective
  if (y > 220) { doc.addPage(); y = 20; }

  const sectionNum = data.needsDocument && data.nextAdvance ? 6 : 5;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`${sectionNum}. Balance IVA`, 15, y);
  y += 3;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.text('Desde la perspectiva del productor', 15, y + 3);
  y += 7;

  // From producer's POV: they invoiced us (producer_invoices) = IVA a su favor
  // Drying invoices = IVA que nos deben
  const ivaAFavor = data.ivaProductor; // producer invoiced us, so IVA is in their favor
  const ivaEnContra = data.ivaSecado; // drying IVA they owe us
  const saldoProductor = ivaAFavor - ivaEnContra; // positive = producer has net credit

  autoTable(doc, {
    startY: y,
    margin: { left: 15, right: 15 },
    theme: 'grid',
    headStyles: { fillColor: [60, 60, 60] },
    body: [
      ['IVA Facturado por Ud. (a su favor)', `CLP ${fmtClp(ivaAFavor)}`],
      ['IVA Secado (a favor exportadora)', `CLP ${fmtClp(ivaEnContra)}`],
      ['Saldo IVA Neto', `CLP ${fmtClp(saldoProductor)}${saldoProductor > 0 ? ' (a su favor)' : saldoProductor < 0 ? ' (a favor exportadora)' : ''}`],
    ],
    columnStyles: {
      0: { fontStyle: 'bold', cellWidth: 80 },
      1: { halign: 'right' },
    },
    didParseCell: (hookData) => {
      if (hookData.row.index === 2 && hookData.section === 'body') {
        hookData.cell.styles.fontStyle = 'bold';
        if (saldoProductor >= 0) {
          hookData.cell.styles.fillColor = [230, 245, 230];
        } else {
          hookData.cell.styles.fillColor = [255, 235, 235];
        }
      }
    },
  });

  // Footer
  const finalY = (doc as any).lastAutoTable.finalY + 15;
  doc.setFontSize(8);
  doc.setFont('helvetica', 'italic');
  doc.setTextColor(120);
  doc.text('Este documento es un resumen informativo de la cuenta corriente y no constituye un documento tributario.', pageWidth / 2, Math.min(finalY, 260), { align: 'center' });

  // Save
  doc.save(`Cuenta_Corriente_${data.producer.name.replace(/\s+/g, '_')}_${data.year}.pdf`);
}
