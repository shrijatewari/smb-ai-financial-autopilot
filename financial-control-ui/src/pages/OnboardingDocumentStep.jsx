import { useState } from 'react'
import { FileUp } from 'lucide-react'
import { getApiErrorMessage, uploadDocuments } from '../services/api'

/**
 * Step 1 (mandatory): upload invoice / GST / bank PDF or image so OCR can seed business context.
 */
export function OnboardingDocumentStep({ onSuccess }) {
  const [files, setFiles] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleSubmit(e) {
    e.preventDefault()
    if (!files?.length) {
      setError('Kam se kam ek file chuno.')
      return
    }
    setError(null)
    setBusy(true)
    try {
      await uploadDocuments(Array.from(files))
      onSuccess?.()
    } catch (err) {
      setError(getApiErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-violet-50/40 to-white px-4 py-10">
      <div className="mx-auto max-w-lg">
        <p className="text-center text-[11px] font-semibold uppercase tracking-[0.2em] text-violet-500">
          Step 1 of 2
        </p>
        <h1 className="mt-3 text-center text-2xl font-bold leading-tight text-violet-950">
          Pehle documents upload karo
        </h1>
        <p className="mt-3 text-center text-sm leading-relaxed text-violet-900/80">
          Invoice, GST, bank statement ya khata – PDF ya photo. Isse system aapka business type aur size samajhta hai;
          phir aapko <strong>sirf wahi dikhega</strong> jo aapke liye useful hai.
        </p>

        <form onSubmit={handleSubmit} className="mt-10 space-y-6">
          <label
            htmlFor="onboarding-doc-upload"
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-3xl border-2 border-dashed border-[#6C3BFF]/40 bg-white/90 px-6 py-10 text-center shadow-inner transition hover:border-[#6C3BFF]/60"
          >
            <FileUp className="h-10 w-10 text-[#6C3BFF]" />
            <span className="text-sm font-semibold text-violet-950">Files chuno (ek ya zyada)</span>
            <span className="text-xs text-violet-600">PDF, PNG, JPG</span>
            <input
              id="onboarding-doc-upload"
              type="file"
              accept=".pdf,.png,.jpg,.jpeg,image/*,application/pdf"
              multiple
              className="sr-only"
              onChange={(e) => setFiles(e.target.files)}
            />
          </label>
          {files?.length ? (
            <p className="text-center text-sm text-emerald-700">{files.length} file(s) selected</p>
          ) : null}

          {error && (
            <p className="text-center text-sm text-red-600" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-xl bg-gradient-to-r from-[#6C3BFF] to-violet-600 py-4 text-base font-bold text-white shadow-lg shadow-[#6C3BFF]/25 disabled:opacity-50"
          >
            {busy ? 'Upload ho raha hai…' : 'Upload & aage badho'}
          </button>
        </form>
      </div>
    </div>
  )
}
