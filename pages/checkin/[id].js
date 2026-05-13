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

export default function CheckIn() {
  const router = useRouter()
  const { id } = router.query

  const [employee, setEmployee] = useState(null)
  const [todayEntry, setTodayEntry] = useState(null)
  const [recentEntries, setRecentEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [time, setTime] = useState('')
  const [date, setDate] = useState('')
  const [msg, setMsg] = useState(null)
  const [working, setWorking] = useState(false)

  useEffect(() => {
    const tick = () => {
      const now = new Date()
      setTime(now.toLocaleTimeString('ar-SA', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }))
      setDate(now.toISOString().split('T')[0])
    }
    tick()
    const interval = setInterval(tick, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    if (!id) return
    loadEmployee()
  }, [id])

  async function loadEmployee() {
    setLoading(true)
    const { data: emp } = await supabase.from('employees').select('*').eq('id', id).single()
    if (!emp) { setLoading(false); return }
    setEmployee(emp)

    const today = todayStr()
    const { data: entries } = await supabase
      .from('entries')
      .select('*')
      .eq('employee_id', id)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(10)

    const todayE = entries?.find(e => e.date === today && !e.check_out)
    setTodayEntry(todayE || null)
    setRecentEntries(entries || [])
    setLoading(false)
  }

  const showMsg = (text, type = 'success') => {
    setMsg({ text, type })
    setTimeout(() => setMsg(null), 4000)
  }

  async function handleCheckIn() {
    setWorking(true)
    const now = new Date()
    const timeStr = now.toTimeString().slice(0, 8)
    const today = now.toISOString().split('T')[0]

    // Check if already checked in today (without checkout)
    const existing = recentEntries.find(e => e.date === today && !e.check_out)
    if (existing) {
      showMsg('أنت مسجّل دخول بالفعل اليوم. يرجى تسجيل الخروج أولاً.', 'error')
      setWorking(false); return
    }

    const { error } = await supabase.from('entries').insert({
      employee_id: id,
      date: today,
      check_in: timeStr,
      minutes: 0,
    })
    if (error) showMsg('حدث خطأ: ' + error.message, 'error')
    else { showMsg('تم تسجيل الدخول بنجاح ✓'); loadEmployee() }
    setWorking(false)
  }

  async function handleCheckOut() {
    if (!todayEntry) return
    setWorking(true)
    const now = new Date()
    const timeStr = now.toTimeString().slice(0, 8)
    const inTime = todayEntry.check_in
    const [ih, im, is_] = inTime.split(':').map(Number)
    const [oh, om] = timeStr.split(':').map(Number)
    const minutes = (oh * 60 + om) - (ih * 60 + im)

    const { error } = await supabase.from('entries').update({
      check_out: timeStr,
      minutes: Math.max(0, minutes)
    }).eq('id', todayEntry.id)

    if (error) showMsg('حدث خطأ: ' + error.message, 'error')
    else { showMsg(`تم تسجيل الخروج ✓ عملت ${fmtHours(Math.max(0, minutes))} ساعة اليوم`); loadEmployee() }
    setWorking(false)
  }

  // Weekly summary
  const now = new Date()
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - now.getDay())
  const weekStartStr = weekStart.toISOString().split('T')[0]
  const weekEntries = recentEntries.filter(e => e.date >= weekStartStr)
  const weekMins = weekEntries.reduce((s, e) => s + (e.minutes || 0), 0)
  const weekDays = new Set(weekEntries.map(e => e.date)).size

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: '2rem' }}>⏳</div>
      <div style={{ color: '#9ca3af' }}>جارٍ التحميل...</div>
    </div>
  )

  if (!employee) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', flexDirection: 'column', gap: 12 }}>
      <div style={{ fontSize: '3rem' }}>❌</div>
      <div style={{ color: '#e24b4a', fontWeight: 600, fontSize: '1.1rem' }}>لم يتم العثور على الموظفة</div>
      <div style={{ color: '#9ca3af', fontSize: '0.875rem' }}>يرجى التحقق من الرابط</div>
    </div>
  )

  const isCheckedIn = !!todayEntry
  const todayCheckedOut = recentEntries.find(e => e.date === todayStr() && e.check_out)

  return (
    <>
      <Head>
        <title>تسجيل الحضور - {employee.name}</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <header className="header">
        <div className="container header-inner">
          <h1>🕐 تسجيل الحضور والانصراف</h1>
          <span className="header-badge">{employee.name}</span>
        </div>
      </header>

      <div className="container" style={{ paddingTop: '1.5rem', paddingBottom: '3rem' }}>
        {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

        {/* Clock */}
        <div className="card checkin-card">
          <div className="clock-display">
            <div className="clock-time">{time}</div>
            <div className="clock-date">{date ? `${getArabicDay(date)}، ${getArabicDate(date)}` : ''}</div>
          </div>

          {/* Status indicator */}
          <div style={{
            textAlign: 'center', padding: '1rem',
            background: isCheckedIn ? '#e1f5ee' : todayCheckedOut ? '#f3f4f6' : '#faeeda',
            borderRadius: 10, margin: '0 0 1.5rem'
          }}>
            <div style={{ fontWeight: 700, fontSize: '1rem', color: isCheckedIn ? '#085041' : todayCheckedOut ? '#4b5563' : '#854f0b' }}>
              {isCheckedIn
                ? `✅ مسجّل دخول منذ ${todayEntry.check_in?.slice(0, 5)}`
                : todayCheckedOut
                  ? `✓ أنهيت يوم العمل (${todayCheckedOut.check_in?.slice(0, 5)} - ${todayCheckedOut.check_out?.slice(0, 5)})`
                  : '⏰ لم تسجل دخولك اليوم بعد'}
            </div>
          </div>

          {/* Action buttons */}
          {!todayCheckedOut && (
            <div style={{ display: 'flex', gap: 12, flexDirection: isCheckedIn ? 'column' : 'row' }}>
              {!isCheckedIn && (
                <button className="btn btn-primary btn-lg" onClick={handleCheckIn} disabled={working}>
                  {working ? '⏳ جارٍ التسجيل...' : '🟢 تسجيل الدخول'}
                </button>
              )}
              {isCheckedIn && (
                <button className="btn btn-lg" style={{ background: '#e24b4a', color: 'white', width: '100%', justifyContent: 'center' }}
                  onClick={handleCheckOut} disabled={working}>
                  {working ? '⏳ جارٍ التسجيل...' : '🔴 تسجيل الخروج'}
                </button>
              )}
            </div>
          )}
        </div>

        {/* Weekly summary */}
        <div className="stats-grid" style={{ maxWidth: 480, margin: '0 auto 1.25rem' }}>
          <div className="stat-card">
            <div className="stat-value">{weekDays}</div>
            <div className="stat-label">أيام هذا الأسبوع</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{fmtHours(weekMins)}</div>
            <div className="stat-label">ساعات هذا الأسبوع</div>
          </div>
        </div>

        {/* Recent history */}
        <div className="card" style={{ maxWidth: 480, margin: '0 auto' }}>
          <div className="card-title">📋 سجل الحضور الأخير</div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>اليوم</th><th>الدخول</th><th>الخروج</th><th>الساعات</th></tr>
              </thead>
              <tbody>
                {recentEntries.filter(e => e.check_out).map(e => (
                  <tr key={e.id}>
                    <td style={{ fontSize: '0.8rem' }}>{getArabicDay(e.date)}<br /><span style={{ color: '#9ca3af', fontSize: '0.75rem' }}>{e.date}</span></td>
                    <td>{e.check_in?.slice(0, 5)}</td>
                    <td>{e.check_out?.slice(0, 5)}</td>
                    <td>
                      <span className={`badge ${e.minutes >= 480 ? 'badge-green' : e.minutes >= 360 ? 'badge-amber' : 'badge-red'}`}>
                        {fmtHours(e.minutes)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {recentEntries.filter(e => e.check_out).length === 0 && (
              <div className="empty"><p>لا توجد سجلات سابقة</p></div>
            )}
          </div>
        </div>
      </div>
    </>
  )
}
