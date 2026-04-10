import { serve } from "https://deno.land/std@0.168.0/http/server.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File
    const invoiceType = formData.get('type') as string || 'drying'
    
    if (!file) throw new Error('No file provided')

    const bytes = new Uint8Array(await file.arrayBuffer())
    
    let binary = ''
    const chunkSize = 8192
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize)
      binary += String.fromCharCode(...chunk)
    }
    const base64 = btoa(binary)

    const apiKey = Deno.env.get('LOVABLE_API_KEY')
    if (!apiKey) throw new Error('LOVABLE_API_KEY not configured')

    const systemPrompt = invoiceType === 'producer'
      ? `Eres un sistema que extrae datos de facturas chilenas emitidas por productores agrícolas. 
Extrae la siguiente información y devuelve SOLO un JSON válido (sin markdown):
{
  "producer_name": "nombre del emisor de la factura",
  "producer_rut": "RUT del emisor (formato XX.XXX.XXX-X o sin puntos), o null si no aparece",
  "invoice_number": "número de folio",
  "amount_net_clp": número NETO en CLP (sin IVA, solo número, sin puntos ni comas),
  "iva_clp": número del IVA en CLP (solo número, sin puntos ni comas),
  "date": "YYYY-MM-DD",
  "exchange_rate": número o null si no aparece tipo de cambio,
  "document_type": "factura", "nota_debito" o "nota_credito",
  "notes": "observaciones relevantes o null"
}
IMPORTANTE: Separa siempre el monto NETO del IVA. El monto total = neto + IVA.
Si un campo no se encuentra, usa null.`
      : `Eres un sistema que extrae datos de facturas de secado (servicio de secado de nueces/frutos).
Extrae la siguiente información y devuelve SOLO un JSON válido (sin markdown):
{
  "producer_name": "nombre del cliente/productor al que se le cobra el secado",
  "producer_rut": "RUT del cliente/productor (formato XX.XXX.XXX-X o sin puntos), o null si no aparece",
  "invoice_number": "número de folio",
  "amount_net_clp": número NETO en CLP (sin IVA, solo número, sin puntos ni comas),
  "iva_clp": número del IVA en CLP (solo número, sin puntos ni comas),
  "date": "YYYY-MM-DD",
  "exchange_rate": número o null si no aparece tipo de cambio,
  "notes": "observaciones relevantes o null"
}
IMPORTANTE: Separa siempre el monto NETO del IVA. El monto total = neto + IVA.
Si un campo no se encuentra, usa null.`

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extrae los datos de esta factura:' },
              {
                type: 'image_url',
                image_url: { url: `data:application/pdf;base64,${base64}` }
              }
            ]
          }
        ],
        response_format: { type: 'json_object' }
      })
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`AI API error: ${response.status} - ${errText}`)
    }

    const aiResult = await response.json()
    const content = aiResult.choices?.[0]?.message?.content

    let parsed
    try {
      parsed = JSON.parse(content)
    } catch {
      const jsonMatch = content?.match(/```(?:json)?\s*([\s\S]*?)```/)
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[1].trim())
      } else {
        parsed = { error: 'Could not parse AI response', raw: content }
      }
    }

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error)
    return new Response(JSON.stringify({ error: msg }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
