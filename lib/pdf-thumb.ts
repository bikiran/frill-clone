'use client'

// Render the first page of a PDF to an image (data URL) in the browser with
// pdf.js, loaded from the CDN at runtime so it stays out of the bundle. Works
// for a URL or a local File (before / while it uploads).

const PDFJS_VER = '4.7.76'
let lib: Promise<any> | null = null

function pdfjs() {
  if (!lib) {
    lib = import(/* webpackIgnore: true */ `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}/pdf.min.mjs`).then((m: any) => {
      m.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VER}/pdf.worker.min.mjs`
      return m
    }).catch(e => { lib = null; throw e })
  }
  return lib
}

export async function pdfFirstPage(src: string | File, maxWidth = 900): Promise<{ dataUrl: string; pages: number } | null> {
  try {
    const m = await pdfjs()
    const doc = await m.getDocument(typeof src === 'string' ? { url: src } : { data: new Uint8Array(await src.arrayBuffer()) }).promise
    const page = await doc.getPage(1)
    const base = page.getViewport({ scale: 1 })
    const viewport = page.getViewport({ scale: Math.min(maxWidth, base.width * 2) / base.width })
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(viewport.width)
    canvas.height = Math.round(viewport.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport }).promise
    const pages = doc.numPages || 1
    try { doc.destroy?.() } catch {}
    return { dataUrl: canvas.toDataURL('image/jpeg', 0.82), pages }
  } catch { return null }
}
