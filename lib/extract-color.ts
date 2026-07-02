export async function extractDominantColor(imageUrl: string): Promise<string> {
  try {
    return await new Promise((resolve) => {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = 1
        canvas.height = 1
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve('#ff7a6b') // fallback
          return
        }
        ctx.drawImage(img, 0, 0, 1, 1)
        const imageData = ctx.getImageData(0, 0, 1, 1)
        const data = imageData.data
        const r = data[0].toString(16).padStart(2, '0')
        const g = data[1].toString(16).padStart(2, '0')
        const b = data[2].toString(16).padStart(2, '0')
        resolve(`#${r}${g}${b}`)
      }
      img.onerror = () => resolve('#ff7a6b') // fallback
      img.src = imageUrl
    })
  } catch {
    return '#ff7a6b'
  }
}
