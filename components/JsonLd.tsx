// Renders a JSON-LD structured-data block. Server-safe (no 'use client'); the
// object is serialised at render time so search engines see it in the HTML.
export default function JsonLd({ data }: { data: Record<string, any> | Record<string, any>[] }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify output is safe to inline; there is no user input here.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }}
    />
  )
}
