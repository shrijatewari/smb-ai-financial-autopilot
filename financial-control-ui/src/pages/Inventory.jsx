import { useCallback, useEffect, useMemo, useState } from 'react'
import { motion } from 'framer-motion'
import { AlertTriangle, BookOpen, Camera, Loader2, Plus, Trash2 } from 'lucide-react'
import { PageHeader } from '../components/twin/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Button } from '../components/ui/button'
import {
  applyKhataSale,
  createInventoryItem,
  fetchInventoryItems,
  getApiErrorMessage,
  patchInventoryItem,
  uploadKhataPhoto,
} from '../services/api'

function newLine() {
  return {
    key: crypto.randomUUID(),
    inventory_item_id: '',
    quantity: '',
    amount_inr: '',
    aiProduct: '',
    aiRaw: '',
    confidence: null,
  }
}

function linesFromVision(suggested) {
  if (!Array.isArray(suggested) || !suggested.length) return [newLine()]
  return suggested.map((s) => ({
    key: crypto.randomUUID(),
    inventory_item_id: s.matched_inventory_item_id != null ? String(s.matched_inventory_item_id) : '',
    quantity:
      s.quantity != null && !Number.isNaN(Number(s.quantity)) ? String(s.quantity) : '',
    amount_inr:
      s.amount_inr != null && !Number.isNaN(Number(s.amount_inr)) ? String(s.amount_inr) : '',
    aiProduct: s.product_name || '',
    aiRaw: s.raw_text || '',
    confidence: s.confidence ?? null,
  }))
}

export default function Inventory() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [toast, setToast] = useState(null)

  const [sku, setSku] = useState('')
  const [name, setName] = useState('')
  const [startQty, setStartQty] = useState('0')
  const [unit, setUnit] = useState('')
  const [reorder, setReorder] = useState('20')
  const [addBusy, setAddBusy] = useState(false)

  const [khataUploadId, setKhataUploadId] = useState(null)
  const [khataPreviewUrl, setKhataPreviewUrl] = useState(null)
  const [khataBusy, setKhataBusy] = useState(false)
  const [visionNotes, setVisionNotes] = useState(null)
  const [lines, setLines] = useState([newLine()])
  const [applyBusy, setApplyBusy] = useState(false)

  const load = useCallback(async () => {
    setError(null)
    try {
      const data = await fetchInventoryItems()
      setItems(data.items || [])
    } catch (e) {
      setError(getApiErrorMessage(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useEffect(() => {
    return () => {
      if (khataPreviewUrl) URL.revokeObjectURL(khataPreviewUrl)
    }
  }, [khataPreviewUrl])

  const itemOptions = useMemo(
    () =>
      items.map((it) => (
        <option key={it.id} value={it.id}>
          {it.name} ({it.sku}) – {it.quantity}
          {it.unit ? ` ${it.unit}` : ''}
        </option>
      )),
    [items],
  )

  async function handleAddProduct(e) {
    e.preventDefault()
    setAddBusy(true)
    setToast(null)
    try {
      await createInventoryItem({
        sku: sku.trim(),
        name: name.trim(),
        quantity: Number(startQty) || 0,
        unit: unit.trim() || null,
        reorder_threshold: Number(reorder) || 20,
      })
      setSku('')
      setName('')
      setStartQty('0')
      setUnit('')
      setReorder('20')
      await load()
      setToast({ type: 'success', text: 'Product added.' })
    } catch (err) {
      setToast({ type: 'error', text: getApiErrorMessage(err) })
    } finally {
      setAddBusy(false)
    }
  }

  async function handleAdjustQty(id, qty) {
    try {
      await patchInventoryItem(id, { quantity: Number(qty) })
      await load()
      setToast({ type: 'success', text: 'Stock updated.' })
    } catch (err) {
      setToast({ type: 'error', text: getApiErrorMessage(err) })
    }
  }

  async function onKhataFile(e) {
    const f = e.target.files?.[0]
    if (!f) return
    setKhataBusy(true)
    setToast(null)
    setVisionNotes(null)
    try {
      if (khataPreviewUrl) URL.revokeObjectURL(khataPreviewUrl)
      const res = await uploadKhataPhoto(f)
      setKhataUploadId(res.upload_id)
      setKhataPreviewUrl(URL.createObjectURL(f))
      setVisionNotes(res.vision_notes || null)
      if (Array.isArray(res.suggested_lines) && res.suggested_lines.length) {
        setLines(linesFromVision(res.suggested_lines))
        setToast({
          type: 'success',
          text: res.message || 'Photo saved – sale lines AI se bhari gayi. Verify karke Apply karein.',
        })
      } else {
        setLines([newLine()])
        setToast({ type: 'success', text: res.message || 'Photo saved.' })
      }
    } catch (err) {
      setToast({ type: 'error', text: getApiErrorMessage(err) })
    } finally {
      setKhataBusy(false)
    }
  }

  function updateLine(i, field, value) {
    setLines((prev) => {
      const next = [...prev]
      next[i] = { ...next[i], [field]: value }
      return next
    })
  }

  function addSaleLine() {
    setLines((prev) => [...prev, newLine()])
  }

  function removeSaleLine(i) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((_, j) => j !== i)))
  }

  async function handleApplyKhata(e) {
    e.preventDefault()
    setApplyBusy(true)
    setToast(null)
    const parsed = []
    for (const ln of lines) {
      const id = Number(ln.inventory_item_id)
      const q = Number(ln.quantity)
      const amt = Number(ln.amount_inr)
      if (!id || !ln.inventory_item_id) continue
      if (!q || q <= 0 || !amt || amt <= 0) {
        setToast({ type: 'error', text: 'Each line needs product, quantity, and amount (₹).' })
        setApplyBusy(false)
        return
      }
      parsed.push({ inventory_item_id: id, quantity: q, amount_inr: amt })
    }
    if (!parsed.length) {
      setToast({ type: 'error', text: 'Add at least one sale line (product + qty + ₹).' })
      setApplyBusy(false)
      return
    }
    try {
      const res = await applyKhataSale({
        lines: parsed,
        khata_upload_id: khataUploadId || null,
      })
      setItems(res.items || [])
      setToast({ type: 'success', text: res.message || 'Applied.' })
      setLines([newLine()])
    } catch (err) {
      setToast({ type: 'error', text: getApiErrorMessage(err) })
    } finally {
      setApplyBusy(false)
    }
  }

  return (
    <div className="mx-auto w-full max-w-7xl space-y-8 pb-16">
      <p className="rounded-xl border border-amber-200/80 bg-amber-50/60 px-4 py-3 text-sm text-amber-950/90">
        <strong className="font-semibold">Twin vs inventory:</strong> quantities here are stored in the database.
        The home <strong>cash / risk</strong> screen runs on the <strong>transaction ledger</strong> (SMS, CSV,
        khata). Stock updates when you <strong>apply a khata sale</strong> (or ingest cash); it is not driven by
        the Monte Carlo engine directly.
      </p>
      <PageHeader
        title="Inventory & khata"
        subtitle="Add products, then photograph your khata and record sales – stock goes down and cash (credit) hits the ledger."
      />

      {toast && (
        <div
          className={`rounded-lg border px-4 py-2 text-sm ${
            toast.type === 'error' ? 'border-red-200 bg-red-50 text-red-900' : 'border-emerald-200 bg-emerald-50 text-emerald-900'
          }`}
          role="status"
        >
          {toast.text}
        </div>
      )}

      {error && (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      )}

      <Card className="border-violet-200/50 bg-white/80 shadow-lg shadow-violet-500/5 backdrop-blur">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <BookOpen className="h-5 w-5 text-[#6C3BFF]" />
            How it works
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm leading-relaxed text-violet-950/75">
          <ol className="list-decimal space-y-1 pl-5">
            <li>Add your products and opening stock (e.g. milk, packets).</li>
            <li>Upload a photo of your khata page for your records (optional but recommended).</li>
            <li>
              Khata photo upload par <strong>AI photo padhta hai</strong> (OpenAI vision) aur sale lines suggest
              karta hai – aap verify karke <strong>Apply</strong> dabate ho. Galat match ho to product dropdown
              change karo.
            </li>
          </ol>
          <p className="mt-3 text-xs text-violet-950/55">
            Requires <code className="rounded bg-violet-100 px-1">OPENAI_API_KEY</code> in backend – same as
            assistant. Hindi / English mixed handwriting supported to an extent; hamesha confirm karein.
          </p>
        </CardContent>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="border-violet-200/50 bg-white/80 shadow-md">
          <CardHeader>
            <CardTitle className="text-base">Add product</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleAddProduct} className="space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-xs font-medium text-violet-800">
                  SKU
                  <input
                    value={sku}
                    onChange={(e) => setSku(e.target.value)}
                    className="mt-1 w-full rounded-md border border-violet-200 bg-white px-2 py-1.5 text-sm"
                    required
                  />
                </label>
                <label className="text-xs font-medium text-violet-800">
                  Name
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    className="mt-1 w-full rounded-md border border-violet-200 bg-white px-2 py-1.5 text-sm"
                    required
                  />
                </label>
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                <label className="text-xs font-medium text-violet-800">
                  Opening qty
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={startQty}
                    onChange={(e) => setStartQty(e.target.value)}
                    className="mt-1 w-full rounded-md border border-violet-200 bg-white px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-xs font-medium text-violet-800">
                  Unit (optional)
                  <input
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                    placeholder="L, kg…"
                    className="mt-1 w-full rounded-md border border-violet-200 bg-white px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="text-xs font-medium text-violet-800">
                  Low-stock below
                  <input
                    type="number"
                    min="0"
                    value={reorder}
                    onChange={(e) => setReorder(e.target.value)}
                    className="mt-1 w-full rounded-md border border-violet-200 bg-white px-2 py-1.5 text-sm"
                  />
                </label>
              </div>
              <Button type="submit" disabled={addBusy} size="sm">
                {addBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Add to stock
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="border-violet-200/50 bg-white/80 shadow-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Camera className="h-5 w-5 text-[#6C3BFF]" />
              Khata photo
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-violet-300/80 bg-violet-50/40 px-4 py-8 text-center hover:border-[#6C3BFF]/50">
              <input type="file" accept="image/*" className="hidden" onChange={onKhataFile} disabled={khataBusy} />
              {khataBusy ? <Loader2 className="h-8 w-8 animate-spin text-violet-500" /> : <Camera className="h-8 w-8 text-violet-400" />}
              <span className="mt-2 text-sm font-medium text-violet-900">Tap to upload khata page</span>
              <span className="text-xs text-violet-950/50">JPG / PNG, max 8MB</span>
            </label>
            {khataUploadId && (
              <p className="text-xs text-violet-700">
                Upload #{khataUploadId} – Apply par ledger ke saath link hoga.
              </p>
            )}
            {visionNotes && (
              <p className="rounded-lg border border-emerald-200/80 bg-emerald-50/80 px-3 py-2 text-xs text-emerald-950">
                {visionNotes}
              </p>
            )}
            {khataPreviewUrl && (
              <img
                src={khataPreviewUrl}
                alt="Khata preview"
                className="max-h-64 w-full rounded-lg border border-violet-200 object-contain"
              />
            )}
          </CardContent>
        </Card>
      </div>

      <Card className="border-violet-200/50 bg-gradient-to-br from-violet-950 via-violet-900 to-neutral-900 p-6 text-white shadow-xl">
        <CardHeader className="p-0 pb-4">
          <CardTitle className="text-lg">Record sales from khata</CardTitle>
          <p className="text-sm text-violet-200/90">
            Photo upload ke baad AI yahan lines bhar sakta hai – aap sirf check karke Apply karo. Har line stock
            kam karti hai aur ₹ cash ledger mein jama hota hai.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          <form onSubmit={handleApplyKhata} className="space-y-3">
            {lines.map((ln, i) => (
              <div
                key={ln.key}
                className="flex flex-wrap items-end gap-2 rounded-xl border border-white/10 bg-white/5 p-3 backdrop-blur"
              >
                <label className="min-w-[180px] flex-1 text-xs">
                  Product
                  <select
                    value={ln.inventory_item_id}
                    onChange={(e) => updateLine(i, 'inventory_item_id', e.target.value)}
                    className="mt-1 w-full rounded-md border border-white/20 bg-white/10 px-2 py-1.5 text-sm text-white"
                  >
                    <option value="">Select…</option>
                    {itemOptions}
                  </select>
                  {ln.aiProduct ? (
                    <span className="mt-1 block text-[10px] text-violet-300/95">
                      AI: {ln.aiProduct}
                      {ln.confidence != null ? ` · ${Math.round(Number(ln.confidence) * 100)}% sure` : ''}
                    </span>
                  ) : null}
                </label>
                <label className="w-24 text-xs">
                  Qty sold
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={ln.quantity}
                    onChange={(e) => updateLine(i, 'quantity', e.target.value)}
                    className="mt-1 w-full rounded-md border border-white/20 bg-white/10 px-2 py-1.5 text-sm text-white"
                  />
                </label>
                <label className="w-28 text-xs">
                  ₹ received
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={ln.amount_inr}
                    onChange={(e) => updateLine(i, 'amount_inr', e.target.value)}
                    className="mt-1 w-full rounded-md border border-white/20 bg-white/10 px-2 py-1.5 text-sm text-white"
                  />
                </label>
                <button
                  type="button"
                  onClick={() => removeSaleLine(i)}
                  className="rounded p-2 text-white/70 hover:bg-white/10"
                  aria-label="Remove line"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="secondary" size="sm" onClick={addSaleLine} className="bg-white/10 text-white border-white/20">
                <Plus className="h-4 w-4" />
                Add line
              </Button>
              <Button type="submit" variant="success" disabled={applyBusy || loading}>
                {applyBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Apply to stock & cash
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <div>
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-wider text-violet-400">Current stock</h2>
        {loading ? (
          <p className="text-sm text-violet-950/60">Loading…</p>
        ) : items.length === 0 ? (
          <p className="text-sm text-violet-950/60">No products yet – add one above.</p>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {items.map((item, i) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.04 }}
              >
                <Card className="border-violet-200/50 bg-white/80 shadow-md">
                  <CardHeader className="flex flex-row items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{item.name}</CardTitle>
                      <p className="text-xs text-violet-950/50">{item.sku}</p>
                    </div>
                    {item.status === 'low' ? (
                      <Badge variant="warning" className="gap-1">
                        <AlertTriangle className="h-3 w-3" /> Low
                      </Badge>
                    ) : (
                      <Badge variant="success">OK</Badge>
                    )}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <p className="text-sm text-violet-800">
                      On hand:{' '}
                      <span className="font-semibold tabular-nums">
                        {item.quantity}
                        {item.unit ? ` ${item.unit}` : ''}
                      </span>
                    </p>
                    {item.last_bill_deduct_at && (
                      <p className="text-xs text-violet-600">
                        Last bill update:{' '}
                        {new Date(item.last_bill_deduct_at).toLocaleString(undefined, {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </p>
                    )}
                    <div className="mb-2 flex justify-between text-xs text-violet-600">
                      <span>Stock level</span>
                      <span className="font-medium tabular-nums">{item.stock_pct}%</span>
                    </div>
                    <div className="h-3 w-full overflow-hidden rounded-full bg-violet-100">
                      <motion.div
                        className="h-full rounded-full bg-gradient-to-r from-[#6C3BFF] to-emerald-400"
                        initial={{ width: 0 }}
                        animate={{ width: `${item.stock_pct}%` }}
                        transition={{ duration: 0.6, ease: 'easeOut' }}
                      />
                    </div>
                    <label className="flex items-center gap-2 text-xs text-violet-700">
                      Adjust qty
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={item.quantity}
                        key={item.quantity}
                        className="w-24 rounded border border-violet-200 px-2 py-1 text-sm text-violet-950"
                        onBlur={(e) => {
                          const v = Number(e.target.value)
                          if (!Number.isNaN(v) && v !== item.quantity) handleAdjustQty(item.id, v)
                        }}
                      />
                    </label>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
