import { useState, useEffect } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import Head from 'next/head'

function fmtHours(minutes) {
  if (!minutes) return '0:00'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function getArabicDay(dateStr) {
  const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
  return days[new Date(dateStr + 'T12:00:00').getDay()]
}

function getArabicDate(dateStr) {
  const [y, m, d] = dateStr.split('-')
  const months = ['يناير', 'فبراير', 'مارس', 'أبريل', 'مايو', 'يونيو', 'يوليو', 'أغسطس', 'سبتمبر', 'أكتوبر', 'نوفمبر', 'ديسمبر']
  return `${parseInt(d)} ${months[parseInt(m) - 1]} ${y}`
}

function weekStartStr() {
  const now = new Date()
  const start = new Date(now)
  start.setDate(now.getDate() - now.getDay())
  return start.toISOString().split('T')[0]
}

function monthStartStr() {
  const now = new Date()
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`
}

export default function CheckIn() {
  const router = useRouter()
  const { id } = router.query

  const [employee, setEmployee] = useState(null)
  const [openEntry, setOpenEntry] = useState(null)
  const [allEntries, setAllEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [time, setTime] = useState('')
  const [dateStr, setDateStr] = useState('')
  const [msg, setMsg] = useState(null)
  const [working, setWorking] = useState(false)
  const [summaryMode, setSummaryMode] = useState('week')

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setTime(now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }))
      setDateStr(now.toISOString().split('T')[0])
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!id) return
    loadData()
  }, [id])

  async function loadData() {
    setLoading(true)
    const { data: emp } = await supabase.from('employees').select('*').eq('id', id).single()
    if (!emp) { setLoading(false); return }
    setEmployee(emp)

    const since = new Date(); since.setDate(since.getDate() - 60)
    const sinceStr = since.toISOString().split('T')[0]

    const { data: entries } = await supabase
      .from('entries')
      .select('*')
      .eq('employee_id', id)
      .gte('date', sinceStr)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })

    const all = entries || []
    setAllEntries(all)
    setOpenEntry(all.find(e => !e.check_out) || null)
    setLoading(false)
  }

  const showMsg = (text, type = 'success') => {
    setMsg({ text, type })
    setTimeout(() => setMsg(null), 4000)
  }

  async function handleCheckIn() {
    if (openEntry) { showMsg('أنت مسجّل دخول بالفعل. سجّل خروجك أولاً.', 'error'); return }
    setWorking(true)
    const now = new Date()
    const timeStr = now.toTimeString().slice(0, 8)
    const today = now.toISOString().split('T')[0]
    const { error } = await supabase.from('entries').insert({ employee_id: id, date: today, check_in: timeStr, minutes: 0 })
    if (error) showMsg('حدث خطأ: ' + error.message, 'error')
    else { showMsg('✅ تم تسجيل الدخول'); loadData() }
    setWorking(false)
  }

  async function handleCheckOut() {
    if (!openEntry) return
    setWorking(true)
    const now = new Date()
    const timeStr = now.toTimeString().slice(0, 8)
    const [ih, im] = openEntry.check_in.split(':').map(Number)
    const [oh, om] = timeStr.split(':').map(Number)
    const minutes = Math.max(0, (oh * 60 + om) - (ih * 60 + im))
    const { error } = await supabase.from('entries').update({ check_out: timeStr, minutes }).eq('id', openEntry.id)
    if (error) showMsg('حدث خطأ: ' + error.message, 'error')
    else { showMsg(`🔴 تم تسجيل الخروج — ${fmtHours(minutes)} في هذه الجلسة`); loadData() }
    setWorking(false)
  }

  const today = todayStr()
  const wStart = weekStartStr()
  const mStart = monthStartStr()

  const todayEntries = allEntries.filter(e => e.date === today)
  const todayMins = todayEntries.reduce((s, e) => s + (e.minutes || 0), 0)

  const weekMins = allEntries.filter(e => e.date >= wStart).reduce((s, e) => s + (e.minutes || 0), 0)
  const weekDays = new Set(allEntries.filter(e => e.date >= wStart).map(e => e.date)).size

  const monthMins = allEntries.filter(e => e.date >= mStart).reduce((s, e) => s + (e.minutes || 0), 0)
  const monthDays = new Set(allEntries.filter(e => e.date >= mStart).map(e => e.date)).size

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: '2rem' }}>⏳</div>
      <div style={{ color: '#9ca3af' }}>جارٍ التحميل...</div>
    </div>
  )

  if (!employee) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: '3rem' }}>❌</div>
      <div style={{ color: '#e24b4a', fontWeight: 600 }}>لم يتم العثور على الموظف</div>
    </div>
  )

  return (
    <>
      <Head>
        <title>تسجيل الحضور - {employee.name}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <header className="header">
        <div className="container header-inner">
          <h1>🕐 الحضور والانصراف</h1>
          <span className="header-badge">{employee.name}</span>
        </div>
      </header>

      <div className="container" style={{ paddingTop: '1.5rem', paddingBottom: '3rem' }}>
        {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

        {/* Clock + Action */}
        <div className="card checkin-card">
          <div className="clock-display">
            <div className="clock-time">{time}</div>
            <div className="clock-date">{dateStr ? `${getArabicDay(dateStr)}، ${getArabicDate(dateStr)}` : ''}</div>
          </div>

          {/* Status */}
          <div style={{
            textAlign: 'center', padding: '0.85rem 1rem',
            background: openEntry ? '#e1f5ee' : '#f9fafb',
            borderRadius: 10, marginBottom: '1.25rem',
            border: `1px solid ${openEntry ? '#9fe1cb' : '#e5e7eb'}`
          }}>
            {openEntry
              ? <div style={{ fontWeight: 700, color: '#085041' }}>✅ مسجّل دخول منذ {openEntry.check_in?.slice(0, 5)}</div>
              : <div style={{ color: '#6b7280' }}>⏸ غير مسجّل حالياً</div>
            }
            {todayMins > 0 && (
              <div style={{ fontSize: '0.8rem', color: '#6b7280', marginTop: 4 }}>
                إجمالي اليوم حتى الآن: <strong>{fmtHours(todayMins)}</strong> ساعة ({todayEntries.filter(e=>e.check_out).length} جلسة)
              </div>
            )}
          </div>

          {/* Buttons - both always visible */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className="btn btn-primary btn-lg"
              onClick={handleCheckIn}
              disabled={working || !!openEntry}
              style={{ flex: 1, opacity: openEntry ? 0.4 : 1 }}
            >
              🟢 تسجيل دخول
            </button>
            <button
              className="btn btn-lg"
              onClick={handleCheckOut}
              disabled={working || !openEntry}
              style={{ flex: 1, background: openEntry ? '#e24b4a' : '#f3f4f6', color: openEntry ? 'white' : '#9ca3af', justifyContent: 'center', opacity: !openEntry ? 0.5 : 1 }}
            >
              🔴 تسجيل خروج
            </button>
          </div>

          {/* Today's sessions */}
          {todayEntries.length > 0 && (
            <div style={{ marginTop: '1.25rem', borderTop: '1px solid #f3f4f6', paddingTop: '1rem' }}>
              <div style={{ fontSize: '0.82rem', fontWeight: 600, color: '#6b7280', marginBottom: '0.6rem' }}>📍 جلسات اليوم</div>
              {todayEntries.slice().reverse().map((e, i) => (
                <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0.6rem', background: '#f9fafb', borderRadius: 6, marginBottom: 4 }}>
                  <span style={{ fontSize: '0.85rem', color: '#374151' }}>
                    جلسة {i + 1}: {e.check_in?.slice(0, 5)} ← {e.check_out ? e.check_out.slice(0, 5) : '...'}
                  </span>
                  {e.check_out
                    ? <span className="badge badge-green">{fmtHours(e.minutes)}</span>
                    : <span className="badge badge-amber">جارية</span>
                  }
                </div>
              ))}
              <div style={{ marginTop: '0.5rem', textAlign: 'left', fontWeight: 700, fontSize: '0.9rem', color: '#085041' }}>
                مجموع اليوم: {fmtHours(todayMins)}
              </div>
            </div>
          )}
        </div>

        {/* Summary */}
        <div className="card" style={{ maxWidth: 480, margin: '0 auto 1.25rem' }}>
          <div className="card-title">📊 ملخص ساعاتي</div>
          <div className="tabs" style={{ marginBottom: '1rem' }}>
            {[['today','اليوم'],['week','الأسبوع'],['month','الشهر']].map(([k,l]) => (
              <button key={k} className={`tab-btn ${summaryMode===k?'active':''}`} onClick={() => setSummaryMode(k)}>{l}</button>
            ))}
          </div>
          {summaryMode === 'today' && (
            <div className="stats-grid">
              <div className="stat-card"><div className="stat-value">{fmtHours(todayMins)}</div><div className="stat-label">ساعات اليوم</div></div>
              <div className="stat-card"><div className="stat-value">{todayEntries.filter(e=>e.check_out).length}</div><div className="stat-label">جلسات مكتملة</div></div>
            </div>
          )}
          {summaryMode === 'week' && (
            <div className="stats-grid">
              <div className="stat-card"><div className="stat-value">{fmtHours(weekMins)}</div><div className="stat-label">ساعات الأسبوع</div></div>
              <div className="stat-card"><div className="stat-value">{weekDays}</div><div className="stat-label">أيام العمل</div></div>
            </div>
          )}
          {summaryMode === 'month' && (
            <div className="stats-grid">
              <div className="stat-card"><div className="stat-value">{fmtHours(monthMins)}</div><div className="stat-label">ساعات الشهر</div></div>
              <div className="stat-card"><div className="stat-value">{monthDays}</div><div className="stat-label">أيام العمل</div></div>
            </div>
          )}
        </div>

        {/* History grouped by day */}
        <div className="card" style={{ maxWidth: 480, margin: '0 auto' }}>
          <div className="card-title">📋 السجل التفصيلي</div>
          {(() => {
            const grouped = {}
            allEntries.forEach(e => {
              if (!grouped[e.date]) grouped[e.date] = []
              grouped[e.date].push(e)
            })
            const dates = Object.keys(grouped).sort((a,b) => b.localeCompare(a)).slice(0, 14)
            if (!dates.length) return <div className="empty"><p>لا توجد سجلات</p></div>
            return dates.map(d => {
              const dayEntries = grouped[d]
              const dayMins = dayEntries.reduce((s, e) => s + (e.minutes || 0), 0)
              return (
                <div key={d} style={{ marginBottom: '1rem', paddingBottom: '1rem', borderBottom: '1px solid #f3f4f6' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{getArabicDay(d)} {getArabicDate(d)}</span>
                    <span className={`badge ${dayMins >= 480 ? 'badge-green' : dayMins >= 240 ? 'badge-amber' : 'badge-gray'}`}>{fmtHours(dayMins)}</span>
                  </div>
                  {dayEntries.slice().reverse().map((e, i) => (
                    <div key={e.id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#6b7280', padding: '0.25rem 0.5rem', background: '#f9fafb', borderRadius: 5, marginBottom: 2 }}>
                      <span>جلسة {i+1}: {e.check_in?.slice(0,5)} ← {e.check_out ? e.check_out.slice(0,5) : '...'}</span>
                      <span>{e.check_out ? fmtHours(e.minutes) : <span style={{color:'#ba7517'}}>جارية</span>}</span>
                    </div>
                  ))}
                </div>
              )
            })
          })()}
        </div>
      </div>
    </>
  )
}
