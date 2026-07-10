'use client'

import { useState } from 'react'
import { S } from '../_shared'

export default function CsvProcessorSettings() {
  const [file, setFile] = useState<File | null>(null)
  const [rows, setRows] = useState<string[][]>([])

  const handleFile = (f: File | undefined) => {
    if (!f) return
    setFile(f)
    const reader = new FileReader()
    reader.onload = (e) => {
      const text = String(e.target?.result || '')
      const parsed = text.split('\n').slice(0, 20).map(line => line.split(','))
      setRows(parsed)
    }
    reader.readAsText(f)
  }

  return (
    <div style={{ maxWidth: 760 }}>
      <h1 style={S.h1}>CSV Processor</h1>
      <p style={S.sub}>Upload a CSV to preview and clean your data before importing it into Colvy.</p>

      <div style={{ ...S.card, textAlign: 'center', padding: 40 }}>
        <input id="csv-in" type="file" accept=".csv" style={{ display: 'none' }} onChange={e => handleFile(e.target.files?.[0])} />
        <label htmlFor="csv-in" style={{ ...S.btn, display: 'inline-block', cursor: 'pointer' }}>Choose CSV file</label>
        {file && <p style={{ ...S.hint, marginTop: 10 }}>{file.name} · {rows.length} rows previewed</p>}
      </div>

      {rows.length > 0 && (
        <div style={{ ...S.card, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--border)', background: i === 0 ? 'var(--canvas)' : '#fff' }}>
                  {r.map((cell, j) => (
                    <td key={j} style={{ padding: '7px 10px', fontWeight: i === 0 ? 700 : 400, color: i === 0 ? 'var(--ink)' : 'var(--slate)', whiteSpace: 'nowrap' }}>{cell}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
