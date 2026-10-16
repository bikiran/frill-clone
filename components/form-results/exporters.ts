// CSV, Excel and PDF exports of the (filtered or selected) responses. The
// content comes from aggregate.ts (exportTable / pdfSections), so every export
// carries the same values the table shows: no quotes, "Other: <text>",
// verified payments only, variables and the path. xlsx and jspdf are loaded on
// demand so they stay out of the page's first load.

import type { LogicForm } from '@/lib/form-logic'
import { exportTable, pdfSections, toCsv, safeFileName, formatDateTime, type ResultRow, type VerifyContext } from './aggregate'

export type ExportArgs = {
  title: string
  rows: ResultRow[]
  logic: LogicForm
  verify: VerifyContext | null
  accent?: string | null
}

function download(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function buildCsv(args: ExportArgs): string {
  const { header, body } = exportTable(args.rows, args.logic, args.verify)
  return toCsv(header, body)
}

export function exportCsv(args: ExportArgs) {
  download(new Blob([buildCsv(args)], { type: 'text/csv;charset=utf-8' }), `${safeFileName(args.title)}-responses.csv`)
}

export async function buildWorkbook(args: ExportArgs) {
  const XLSX = await import('xlsx')
  const { header, body } = exportTable(args.rows, args.logic, args.verify)
  const sheet = XLSX.utils.aoa_to_sheet([header, ...body])
  sheet['!cols'] = header.map((h, i) => ({ wch: i === 0 ? 38 : Math.min(40, Math.max(12, h.length + 2)) }))
  const book = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(book, sheet, 'Responses')
  return { XLSX, book }
}

export async function exportExcel(args: ExportArgs) {
  const { XLSX, book } = await buildWorkbook(args)
  XLSX.writeFile(book, `${safeFileName(args.title)}-responses.xlsx`)
}

const hexToRgb = (hex: string | null | undefined): [number, number, number] => {
  const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex || '')
  return m ? [parseInt(m[1], 16), parseInt(m[2], 16), parseInt(m[3], 16)] : [255, 122, 107]
}

/** The existing jsPDF layout (accent header, one block per response), path questions only. */
export async function buildPdf(args: ExportArgs) {
  const { default: jsPDF } = await import('jspdf')
  const doc = new jsPDF()
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const rgb = hexToRgb(args.accent)
  let y = 20
  const room = (h: number) => { if (y + h > pageHeight - 15) { doc.addPage(); y = 20 } }

  doc.setTextColor(...rgb); doc.setFontSize(16); doc.setFont('helvetica', 'bold')
  doc.splitTextToSize(args.title || 'Form', pageWidth - 40).forEach((line: string) => { doc.text(line, 20, y); y += 8 })
  y += 2
  doc.setFontSize(11); doc.setTextColor(120); doc.setFont('helvetica', 'normal')
  doc.text(`Responses: ${args.rows.length}`, 20, y)
  doc.text(`Generated: ${formatDateTime(new Date().toISOString())}`, 20, y + 7)
  y += 20

  for (const section of pdfSections(args.rows, args.logic, args.verify)) {
    room(12)
    doc.setFontSize(10); doc.setFont('helvetica', 'bold'); doc.setTextColor(...rgb)
    doc.text(section.title, 20, y); y += 7
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9)
    for (const item of section.items) {
      room(10)
      doc.setTextColor(90)
      doc.splitTextToSize(`${item.q}:`, pageWidth - 40).forEach((line: string) => { room(5); doc.text(line, 20, y); y += 5 })
      doc.setTextColor(0)
      doc.splitTextToSize(item.a, pageWidth - 45).forEach((line: string) => { room(5); doc.text(line, 25, y); y += 5 })
      y += 2
    }
    y += 5
  }
  return doc
}

export async function exportPdf(args: ExportArgs) {
  const doc = await buildPdf(args)
  doc.save(`${safeFileName(args.title)}-responses.pdf`)
}
