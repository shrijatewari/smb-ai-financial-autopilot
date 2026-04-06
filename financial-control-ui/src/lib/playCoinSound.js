/**
 * Short metallic "coin" clink for payment-received / dues-cleared feedback.
 * Uses Web Audio (no asset); may be blocked until the user has interacted with the page.
 */
export async function playCoinClink() {
  const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext)
  if (!AC) return
  const ctx = new AC()
  try {
    if (ctx.state === 'suspended') await ctx.resume()
  } catch {
    /* autoplay policy – silent fail */
  }
  const t0 = ctx.currentTime
  const master = ctx.createGain()
  master.connect(ctx.destination)
  master.gain.setValueAtTime(0.0001, t0)
  master.gain.exponentialRampToValueAtTime(0.14, t0 + 0.012)
  master.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.38)

  const osc1 = ctx.createOscillator()
  osc1.type = 'sine'
  osc1.frequency.setValueAtTime(2093, t0)
  osc1.connect(master)

  const osc2 = ctx.createOscillator()
  osc2.type = 'triangle'
  osc2.frequency.setValueAtTime(1318, t0)
  osc2.frequency.exponentialRampToValueAtTime(988, t0 + 0.08)
  osc2.connect(master)

  osc1.start(t0)
  osc2.start(t0)
  osc1.stop(t0 + 0.42)
  osc2.stop(t0 + 0.42)
  window.setTimeout(() => {
    try {
      ctx.close()
    } catch {
      /* ignore */
    }
  }, 600)
}
