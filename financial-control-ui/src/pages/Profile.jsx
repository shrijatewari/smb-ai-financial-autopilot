import { useEffect, useState } from 'react'
import {
  PolarAngleAxis,
  PolarGrid,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from 'recharts'
import { PageHeader } from '../components/twin/PageHeader'
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card'
import { Progress } from '../components/ui/progress'
import { Skeleton } from '../components/ui/skeleton'
import { fetchDocumentProfile, fetchSystemState, getOnboardingState } from '../services/api'

export default function Profile() {
  const [snap, setSnap] = useState(null)
  const [ob, setOb] = useState(null)
  const [doc, setDoc] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let c = false
    Promise.all([
      fetchSystemState(),
      getOnboardingState().catch(() => ({})),
      fetchDocumentProfile().catch(() => null),
    ]).then(([s, o, d]) => {
      if (!c) {
        setSnap(s)
        setOb(o)
        setDoc(d)
      }
    }).finally(() => {
      if (!c) setLoading(false)
    })
    return () => {
      c = true
    }
  }, [])

  const modules = snap?.modules || []
  const radar = modules.map((m) => ({
    axis: m.name,
    v: Math.round((m.priority || 0.5) * 100),
  }))
  const trust = snap?.reconstruction?.confidence ?? 0.72
  const formality = doc?.formality_score ?? 0.68

  return (
    <div className="w-full max-w-7xl mx-auto">
      <PageHeader
        title="Business profile"
        subtitle="Trust & formality from reconstruction + onboarding + document intelligence."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Scores</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            {loading ? (
              <Skeleton className="h-24 w-full" />
            ) : (
              <>
                <div>
                  <div className="mb-2 flex justify-between text-sm">
                    <span className="text-violet-950/70">Trust score</span>
                    <span className="font-medium text-violet-900">{(trust * 100).toFixed(0)}%</span>
                  </div>
                  <Progress value={trust * 100} />
                </div>
                <div>
                  <div className="mb-2 flex justify-between text-sm">
                    <span className="text-violet-950/70">Formality</span>
                    <span className="font-medium text-violet-900">{(formality * 100).toFixed(0)}%</span>
                  </div>
                  <Progress value={formality * 100} />
                </div>
                {ob && Object.keys(ob).length > 0 && (
                  <p className="text-xs text-violet-950/55">
                    Onboarding keys: {Object.keys(ob).slice(0, 6).join(', ')}
                    {Object.keys(ob).length > 6 ? '…' : ''}
                  </p>
                )}
              </>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Module radar</CardTitle>
          </CardHeader>
          <CardContent className="h-[300px]">
            {loading ? (
              <Skeleton className="h-full w-full" />
            ) : radar.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radar}>
                  <PolarGrid stroke="rgba(108,59,255,0.2)" />
                  <PolarAngleAxis dataKey="axis" tick={{ fill: '#5b4d7a', fontSize: 11 }} />
                  <Radar
                    name="Priority"
                    dataKey="v"
                    stroke="#6C3BFF"
                    fill="#6C3BFF"
                    fillOpacity={0.35}
                  />
                </RadarChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-sm text-violet-950/55">Complete onboarding to unlock module vectors.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
