export async function extractDominantColor(imageUrl: string): Promise<string> {
  return new Promise((resolve) => {
    try {
      const img = new Image()
      img.crossOrigin = 'anonymous'
      
      img.onload = () => {
        const canvas = document.createElement('canvas')
        canvas.width = img.width
        canvas.height = img.height
        
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          resolve('#ff7a6b')
          return
        }
        
        ctx.drawImage(img, 0, 0)
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const data = imageData.data
        
        // Sample pixels (every 4th pixel to speed up)
        const colors: { r: number; g: number; b: number; brightness: number }[] = []
        for (let i = 0; i < data.length; i += 16) {
          const r = data[i]
          const g = data[i + 1]
          const b = data[i + 2]
          const a = data[i + 3]
          
          // Skip transparent and white/black pixels
          if (a < 128 || (r > 240 && g > 240 && b > 240) || (r < 15 && g < 15 && b < 15)) continue
          
          const brightness = (r * 299 + g * 587 + b * 114) / 1000
          colors.push({ r, g, b, brightness })
        }
        
        if (colors.length === 0) {
          resolve('#ff7a6b')
          return
        }
        
        // Find most vibrant color (higher saturation, medium brightness)
        let best = colors[0]
        let bestScore = 0
        
        for (const color of colors) {
          const max = Math.max(color.r, color.g, color.b)
          const min = Math.min(color.r, color.g, color.b)
          const saturation = max === 0 ? 0 : (max - min) / max
          const score = saturation * (1 - Math.abs(color.brightness - 128) / 256)
          
          if (score > bestScore) {
            bestScore = score
            best = color
          }
        }
        
        const hex = '#' + [best.r, best.g, best.b]
          .map(x => Math.round(x).toString(16).padStart(2, '0'))
          .join('')
        
        resolve(hex)
      }
      
      img.onerror = () => resolve('#ff7a6b')
      img.src = imageUrl
    } catch {
      resolve('#ff7a6b')
    }
  })
}
