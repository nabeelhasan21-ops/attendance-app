import { useState, useEffect, useRef } from 'react'
import { useRouter } from 'next/router'
import { supabase } from '../../lib/supabase'
import Head from 'next/head'

const TIMEZONE = 'Asia/Amman'

function nowJO() {
  // Returns current time in Jordan timezone
  return new Date(new Date().toLocaleString('en-US', { timeZone: TIMEZONE }))
}

function todayStrJO() {
  const d = nowJO()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function timeStrJO() {
  const d = nowJO()
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`
}

function fmtHours(minutes) {
  if (!minutes || minutes <= 0) return '0:00'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h}:${String(m).padStart(2, '0')}`
}

function timeToMins(t) {
  if (!t) return 0
  const [h, m] = t.split(':').map(Number)
  return h * 60 + m
}

function getElapsedMins(checkInTime) {
  const inMins = timeToMins(checkInTime)
  const nowMins = timeToMins(timeStrJO())
  return Math.max(0, nowMins - inMins)
}

function getArabicDay(dateStr) {
  const days = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']
  return days[new Date(dateStr + 'T12:00:00').getDay()]
}

function getArabicDate(dateStr) {
  const [y, m, d] = dateStr.split('-')
  const months = ['يناير','فبراير','مارس','أبريل','مايو','يونيو','يوليو','أغسطس','سبتمبر','أكتوبر','نوفمبر','ديسمبر']
  return `${parseInt(d)} ${months[parseInt(m)-1]} ${y}`
}

function weekStartStr() {
  const d = nowJO()
  d.setDate(d.getDate() - d.getDay())
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}

function monthStartStr() {
  const d = nowJO()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
}

export default function CheckIn() {
  const router = useRouter()
  const { id } = router.query

  const [employee, setEmployee] = useState(null)
  const [openEntry, setOpenEntry] = useState(null)
  const [allEntries, setAllEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [displayTime, setDisplayTime] = useState('')
  const [displayDate, setDisplayDate] = useState('')
  const [msg, setMsg] = useState(null)
  const [working, setWorking] = useState(false)
  const [summaryMode, setSummaryMode] = useState('week')
  const [elapsedMins, setElapsedMins] = useState(0)
  const tickRef = useRef(null)

  // Clock tick every second
  useEffect(() => {
    const tick = () => {
      const d = nowJO()
      setDisplayTime(`${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`)
      setDisplayDate(todayStrJO())
    }
    tick()
    tickRef.current = setInterval(tick, 1000)
    return () => clearInterval(tickRef.current)
  }, [])

  // Update elapsed time every second when checked in
  useEffect(() => {
    if (!openEntry) { setElapsedMins(0); return }
    const iv = setInterval(() => {
      setElapsedMins(getElapsedMins(openEntry.check_in))
    }, 1000)
    setElapsedMins(getElapsedMins(openEntry.check_in))
    return () => clearInterval(iv)
  }, [openEntry])

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
      .from('entries').select('*').eq('employee_id', id)
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
    const t = timeStrJO()
    const d = todayStrJO()
    const { error } = await supabase.from('entries').insert({
      employee_id: id, date: d, check_in: t, minutes: 0
    })
    if (error) showMsg('حدث خطأ: ' + error.message, 'error')
    else { showMsg('✅ تم تسجيل الدخول'); loadData() }
    setWorking(false)
  }

  async function handleCheckOut() {
    if (!openEntry) return
    setWorking(true)
    const t = timeStrJO()
    const inMins = timeToMins(openEntry.check_in)
    const outMins = timeToMins(t)
    const minutes = Math.max(0, outMins - inMins)
    const { error } = await supabase.from('entries').update({ check_out: t, minutes }).eq('id', openEntry.id)
    if (error) showMsg('حدث خطأ: ' + error.message, 'error')
    else { showMsg(`🔴 تم تسجيل الخروج — ${fmtHours(minutes)} في هذه الجلسة`); loadData() }
    setWorking(false)
  }

  // ── Totals ──
  const today = todayStrJO()
  const wStart = weekStartStr()
  const mStart = monthStartStr()

  const todayEntries = allEntries.filter(e => e.date === today)
  // Today mins = completed sessions + current running session
  const todayCompletedMins = todayEntries.filter(e => e.check_out).reduce((s, e) => s + (e.minutes || 0), 0)
  const todayTotalMins = todayCompletedMins + (openEntry && openEntry.date === today ? elapsedMins : 0)

  const weekEntries = allEntries.filter(e => e.date >= wStart)
  const weekCompletedMins = weekEntries.filter(e => e.check_out).reduce((s, e) => s + (e.minutes || 0), 0)
  const weekTotalMins = weekCompletedMins + (openEntry ? elapsedMins : 0)
  const weekDays = new Set(weekEntries.map(e => e.date)).size

  const monthEntries = allEntries.filter(e => e.date >= mStart)
  const monthCompletedMins = monthEntries.filter(e => e.check_out).reduce((s, e) => s + (e.minutes || 0), 0)
  const monthTotalMins = monthCompletedMins + (openEntry ? elapsedMins : 0)
  const monthDays = new Set(monthEntries.map(e => e.date)).size

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', flexDirection:'column', gap:12 }}>
      <div style={{ fontSize:'2rem' }}>⏳</div>
      <div style={{ color:'#9ca3af' }}>جارٍ التحميل...</div>
    </div>
  )

  if (!employee) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', minHeight:'100vh', flexDirection:'column', gap:12 }}>
      <div style={{ fontSize:'3rem' }}>❌</div>
      <div style={{ color:'#e24b4a', fontWeight:600 }}>لم يتم العثور على الموظف</div>
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

      <div className="container" style={{ paddingTop:'1.5rem', paddingBottom:'3rem' }}>
        {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

        {/* Clock */}
        <div className="card checkin-card">
          <div className="clock-display">
            <div className="clock-time">{displayTime}</div>
            <div className="clock-date">{displayDate ? `${getArabicDay(displayDate)}، ${getArabicDate(displayDate)}` : ''}</div>
          </div>

          {/* Status bar */}
          <div style={{
            textAlign:'center', padding:'0.85rem 1rem',
            background: openEntry ? '#e1f5ee' : '#f9fafb',
            borderRadius:10, marginBottom:'1.25rem',
            border:`1px solid ${openEntry ? '#9fe1cb' : '#e5e7eb'}`
          }}>
            {openEntry ? (
              <>
                <div style={{ fontWeight:700, color:'#085041' }}>✅ مسجّل دخول منذ {openEntry.check_in?.slice(0,5)}</div>
                <div style={{ fontSize:'1.4rem', fontWeight:700, color:'#1d9e75', marginTop:4, fontVariantNumeric:'tabular-nums' }}>
                  ⏱ {fmtHours(elapsedMins)} هذه الجلسة
                </div>
              </>
            ) : (
              <div style={{ color:'#6b7280' }}>⏸ غير مسجّل حالياً</div>
            )}
            {todayCompletedMins > 0 && (
              <div style={{ fontSize:'0.82rem', color:'#6b7280', marginTop:4 }}>
                جلسات مكتملة اليوم: <strong>{fmtHours(todayCompletedMins)}</strong>
                {openEntry ? ` + جلسة جارية` : ''}
              </div>
            )}
          </div>

          {/* Total today live counter */}
          {(openEntry || todayCompletedMins > 0) && (
            <div style={{ background:'#085041', color:'white', borderRadius:10, padding:'0.75rem', textAlign:'center', marginBottom:'1rem' }}>
              <div style={{ fontSize:'0.78rem', opacity:0.8, marginBottom:2 }}>إجمالي اليوم (يتحدث تلقائياً)</div>
              <div style={{ fontSize:'2rem', fontWeight:700, fontVariantNumeric:'tabular-nums' }}>{fmtHours(todayTotalMins)}</div>
            </div>
          )}

          {/* Buttons */}
          <div style={{ display:'flex', gap:10 }}>
            <button className="btn btn-primary btn-lg" onClick={handleCheckIn}
              disabled={working || !!openEntry} style={{ flex:1, opacity:openEntry?0.4:1 }}>
              🟢 تسجيل دخول
            </button>
            <button className="btn btn-lg" onClick={handleCheckOut}
              disabled={working || !openEntry}
              style={{ flex:1, background:openEntry?'#e24b4a':'#f3f4f6', color:openEntry?'white':'#9ca3af', justifyContent:'center', opacity:!openEntry?0.5:1 }}>
              🔴 تسجيل خروج
            </button>
          </div>

          {/* Today sessions list */}
          {todayEntries.length > 0 && (
            <div style={{ marginTop:'1.25rem', borderTop:'1px solid #f3f4f6', paddingTop:'1rem' }}>
              <div style={{ fontSize:'0.82rem', fontWeight:600, color:'#6b7280', marginBottom:'0.6rem' }}>📍 جلسات اليوم</div>
              {todayEntries.slice().reverse().map((e, i) => (
                <div key={e.id} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0.4rem 0.6rem', background:'#f9fafb', borderRadius:6, marginBottom:4 }}>
                  <span style={{ fontSize:'0.85rem', color:'#374151' }}>
                    جلسة {i+1}: {e.check_in?.slice(0,5)} ← {e.check_out ? e.check_out.slice(0,5) : '...'}
                  </span>
                  {e.check_out
                    ? <span className="badge badge-green">{fmtHours(e.minutes)}</span>
                    : <span className="badge badge-amber" style={{ fontVariantNumeric:'tabular-nums' }}>{fmtHours(elapsedMins)} ⏱</span>
                  }
                </div>
              ))}
              <div style={{ marginTop:'0.5rem', display:'flex', justifyContent:'space-between', fontWeight:700, fontSize:'0.9rem', color:'#085041', padding:'0.4rem 0.6rem', background:'#e1f5ee', borderRadius:6 }}>
                <span>مجموع اليوم:</span>
                <span>{fmtHours(todayTotalMins)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Summary tabs */}
        <div className="card" style={{ maxWidth:480, margin:'0 auto 1.25rem' }}>
          <div className="card-title">📊 ملخص ساعاتي التراكمي</div>
          <div className="tabs" style={{ marginBottom:'1rem' }}>
            {[['today','اليوم'],['week','الأسبوع'],['month','الشهر']].map(([k,l]) => (
              <button key={k} className={`tab-btn ${summaryMode===k?'active':''}`} onClick={() => setSummaryMode(k)}>{l}</button>
            ))}
          </div>
          {summaryMode === 'today' && (
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value" style={{ fontVariantNumeric:'tabular-nums' }}>{fmtHours(todayTotalMins)}</div>
                <div className="stat-label">إجمالي اليوم</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{todayEntries.length}</div>
                <div className="stat-label">عدد الجلسات</div>
              </div>
            </div>
          )}
          {summaryMode === 'week' && (
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value" style={{ fontVariantNumeric:'tabular-nums' }}>{fmtHours(weekTotalMins)}</div>
                <div className="stat-label">إجمالي الأسبوع</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{weekDays}</div>
                <div className="stat-label">أيام العمل</div>
              </div>
            </div>
          )}
          {summaryMode === 'month' && (
            <div className="stats-grid">
              <div className="stat-card">
                <div className="stat-value" style={{ fontVariantNumeric:'tabular-nums' }}>{fmtHours(monthTotalMins)}</div>
                <div className="stat-label">إجمالي الشهر</div>
              </div>
              <div className="stat-card">
                <div className="stat-value">{monthDays}</div>
                <div className="stat-label">أيام العمل</div>
              </div>
            </div>
          )}
        </div>

        {/* History */}
        <div className="card" style={{ maxWidth:480, margin:'0 auto' }}>
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
              const completedMins = dayEntries.filter(e=>e.check_out).reduce((s,e)=>s+(e.minutes||0),0)
              const isToday = d === today
              const totalMins = isToday ? todayTotalMins : completedMins
              return (
                <div key={d} style={{ marginBottom:'1rem', paddingBottom:'1rem', borderBottom:'1px solid #f3f4f6' }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'0.4rem' }}>
                    <span style={{ fontWeight:600, fontSize:'0.85rem' }}>{getArabicDay(d)} {getArabicDate(d)}</span>
                    <span className={`badge ${totalMins>=480?'badge-green':totalMins>=240?'badge-amber':'badge-gray'}`}>
                      {fmtHours(totalMins)}{isToday && openEntry ? ' ⏱' : ''}
                    </span>
                  </div>
                  {dayEntries.slice().reverse().map((e, i) => (
                    <div key={e.id} style={{ display:'flex', justifyContent:'space-between', fontSize:'0.8rem', color:'#6b7280', padding:'0.25rem 0.5rem', background:'#f9fafb', borderRadius:5, marginBottom:2 }}>
                      <span>جلسة {i+1}: {e.check_in?.slice(0,5)} ← {e.check_out ? e.check_out.slice(0,5) : '...'}</span>
                      <span>{e.check_out ? fmtHours(e.minutes) : <span style={{color:'#1d9e75', fontWeight:600}}>{fmtHours(elapsedMins)} ⏱</span>}</span>
                    </div>
                  ))}
                  <div style={{ display:'flex', justifyContent:'space-between', fontSize:'0.82rem', fontWeight:700, color:'#085041', padding:'0.3rem 0.5rem' }}>
                    <span>المجموع:</span><span>{fmtHours(totalMins)}</span>
                  </div>
                </div>
              )
            })
          })()}
        </div>
      </div>
    </>
  )
}
