// Shared client-side helper for the "scan a card / photo" feature.
//
// A raw phone photo is several MB, most of which is wasted on the vision model
// and only slows the upload. Downscale the long edge to 1600px and re-encode as
// JPEG before sending. Browser-only (uses FileReader / Image / canvas).

export interface ScaledImage {
  /** Full data URL, e.g. "data:image/jpeg;base64,…". */
  data: string
  mediaType: string
}

export function scaleImageToJpeg(file: File, maxEdge = 1600, quality = 0.8): Promise<ScaledImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Could not read that file'))
    reader.onload = () => {
      const img = new Image()
      img.onerror = () => reject(new Error('That file is not a readable image'))
      img.onload = () => {
        let { width, height } = img
        if (width > maxEdge || height > maxEdge) {
          const scale = maxEdge / Math.max(width, height)
          width = Math.round(width * scale)
          height = Math.round(height * scale)
        }
        const canvas = document.createElement('canvas')
        canvas.width = width; canvas.height = height
        const ctx = canvas.getContext('2d')
        if (!ctx) { reject(new Error('Could not process that image')); return }
        ctx.drawImage(img, 0, 0, width, height)
        resolve({ data: canvas.toDataURL('image/jpeg', quality), mediaType: 'image/jpeg' })
      }
      img.src = reader.result as string
    }
    reader.readAsDataURL(file)
  })
}
