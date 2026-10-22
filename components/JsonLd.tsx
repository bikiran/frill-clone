// Renders a JSON-LD structured-data block. Server-safe (no 'use client'); the
// object is serialised at render time so search engines see it in the HTML.
export default function JsonLd({ data }: { data: Record<string, any> | Record<string, any>[] }) {
  return (
    <script
      type="application/ld+json"
      // JSON.stringify doesn't escape '<', so a "</script>" inside any string
      // value would end the block: write it as \u003c (still the same JSON).
      dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, '\\u003c') }}
    />
  )
}
