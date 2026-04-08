import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { getDriveAccessToken } from "../_shared/driveAccess.ts"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const body = await req.text()
    let fileId: string, fileName: string
    try {
      const parsed = JSON.parse(body)
      fileId = parsed.fileId
      fileName = parsed.fileName
    } catch (e) {
      throw new Error(`Invalid JSON body: ${body.substring(0, 50)}`)
    }
    
    if (!fileId) throw new Error('fileId is required')

    const sbUrl = Deno.env.get('SUPABASE_URL')!
    const sbKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const { accessToken } = await getDriveAccessToken(sbUrl, sbKey)

    const res = await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`, {
      headers: { 'Authorization': `Bearer ${accessToken}` },
    })

    if (!res.ok) {
      const err = await res.text()
      throw new Error(`Drive download error [${res.status}]: ${err}`)
    }

    const fileBytes = new Uint8Array(await res.arrayBuffer())

    let binary = ''
    const chunkSize = 8192
    for (let i = 0; i < fileBytes.length; i += chunkSize) {
      const chunk = fileBytes.subarray(i, i + chunkSize)
      binary += String.fromCharCode(...chunk)
    }
    const base64 = btoa(binary)

    const apiKey = Deno.env.get('LOVABLE_API_KEY')
    if (!apiKey) throw new Error('LOVABLE_API_KEY not configured')

    const systemPrompt = `Eres un sistema que extrae datos de facturas chilenas. 
Analiza el PDF y determina si es una factura de productor o una factura de secado.
Extrae la siguiente información y devuelve SOLO un JSON válido (sin markdown):
{
  "invoice_type": "producer" o "drying",
  "producer_name": "nombre del emisor o destinatario según el tipo",
  "invoice_number": "número de folio",
  "amount_net_clp": número NETO en CLP (sin IVA, solo número),
  "iva_clp": número del IVA en CLP (solo número),
  "date": "YYYY-MM-DD",
  "exchange_rate": número o null si no aparece tipo de cambio,
  "document_type": "factura" o "nota_debito",
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
              { type: 'image_url', image_url: { url: `data:application/pdf;base64,${base64}` } }
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

    parsed.pdf_base64 = base64
    parsed.file_name = fileName || `${fileId}.pdf`

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('Error:', error.message)
    return new Response(JSON.stringify({ error: error.message }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
