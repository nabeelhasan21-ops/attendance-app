import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import Head from 'next/head'

const AVATAR_COLORS = [
  ['#9FE1CB','#085041'], ['#B5D4F4','#0C447C'], ['#F5C4B3','#712B13'],
  ['#F4C0D1','#72243E'], ['#C0DD97','#27500A'], ['#FAC775','#633806'],
  ['#CECBF6','#3C3489'], ['#D3D1C7','#444441'],
]

function getInitials(name) {
  return name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()
}

function fmtHours(minutes) {
  if (!minutes) return '0'
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}:${String(m).padStart(2, '0')}` : `${h}:00`
}

function todayStr() {
  return new Date().toISOString().split('T')[0]
}

function thisWeekRange() {
  const now = new Date()
  const day = now.getDay()
  const start = new Date(now)
  start.setDate(now.getDate() - ((day + 1) % 7)) // Saturday start
  const end = new Date(start)
  end.setDate(start.getDate() + 6)
  return [start.toISOString().split('T')[0], end.toISOString().split('T')[0]]
}

function thisMonthRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0]
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().split('T')[0]
  return [start, end]
}

export default function AdminDashboard() {
  const [tab, setTab] = useState('daily')
  const [employees, setEmployees] = useState([])
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)

  // Add employee form
  const [newName, setNewName] = useState('')
  const [newHours, setNewHours] = useState(40)
  const [addingEmp, setAddingEmp] = useState(false)

  // Manual entry form
  const [selEmp, setSelEmp] = useState('')
  const [entryDate, setEntryDate] = useState(todayStr())
  const [inTime, setInTime] = useState('09:00')
  const [outTime, setOutTime] = useState('17:00')
  const [addingEntry, setAddingEntry] = useState(false)

  const [selectedDate, setSelectedDate] = useState(todayStr())

  const showMsg = (text, type = 'success') => {
    setMsg({ text, type })
    setTimeout(() => setMsg(null), 3500)
  }

  const loadData = useCallback(async () => {
    setLoading(true)
    const [{ data: emps }, { data: ents }] = await Promise.all([
      supabase.from('employees').select('*').order('created_at'),
      supabase.from('entries').select('*, employees(name)').order('date', { ascending: false }).order('created_at', { ascending: false }).limit(500),
    ])
    setEmployees(emps || [])
    setEntries(ents || [])
    if (emps && emps.length > 0 && !selEmp) setSelEmp(emps[0].id)
    setLoading(false)
  }, [selEmp])

  useEffect(() => {
    loadData()
    // Real-time subscription
    const channel = supabase
      .channel('entries-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'entries' }, () => loadData())
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [])

  async function addEmployee() {
    if (!newName.trim()) return
    setAddingEmp(true)
    const { error } = await supabase.from('employees').insert({ name: newName.trim(), weekly_hours: newHours })
    if (error) showMsg('حدث خطأ: ' + error.message, 'error')
    else { showMsg('تمت إضافة الموظفة بنجاح ✓'); setNewName(''); loadData() }
    setAddingEmp(false)
  }

  async function deleteEmployee(id) {
    if (!confirm('هل تريد حذف هذه الموظفة وجميع سجلاتها؟')) return
    await supabase.from('entries').delete().eq('employee_id', id)
    await supabase.from('employees').delete().eq('id', id)
    showMsg('تم الحذف')
    loadData()
  }

  async function addManualEntry() {
    if (!selEmp || !entryDate || !inTime || !outTime) return
    const inM = inTime.split(':').reduce((h, m, i) => i === 0 ? h + parseInt(m) * 60 : h + parseInt(m), 0)
    const outM = outTime.split(':').reduce((h, m, i) => i === 0 ? h + parseInt(m) * 60 : h + parseInt(m), 0)
    if (outM <= inM) { showMsg('وقت الخروج يجب أن يكون بعد الدخول', 'error'); return }
    setAddingEntry(true)
    const { error } = await supabase.from('entries').insert({
      employee_id: selEmp, date: entryDate,
      check_in: inTime + ':00', check_out: outTime + ':00',
      minutes: outM - inM
    })
    if (error) showMsg('حدث خطأ: ' + error.message, 'error')
    else { showMsg('تم تسجيل الحضور ✓'); loadData() }
    setAddingEntry(false)
  }

  async function deleteEntry(id) {
    await supabase.from('entries').delete().eq('id', id)
    showMsg('تم حذف السجل')
    loadData()
  }

  // Compute daily entries
  const dailyEntries = entries.filter(e => e.date === selectedDate)
  const dailyPresent = new Set(dailyEntries.map(e => e.employee_id)).size
  const dailyTotal = dailyEntries.reduce((s, e) => s + (e.minutes || 0), 0)

  // Weekly
  const [wStart, wEnd] = thisWeekRange()
  const weekEntries = entries.filter(e => e.date >= wStart && e.date <= wEnd)
  const weekTotal = weekEntries.reduce((s, e) => s + (e.minutes || 0), 0)

  // Monthly
  const [mStart, mEnd] = thisMonthRange()
  const monthEntries = entries.filter(e => e.date >= mStart && e.date <= mEnd)
  const monthTotal = monthEntries.reduce((s, e) => s + (e.minutes || 0), 0)

  function empHoursInRange(empId, rangeEntries) {
    const empE = rangeEntries.filter(e => e.employee_id === empId)
    const mins = empE.reduce((s, e) => s + (e.minutes || 0), 0)
    const days = new Set(empE.map(e => e.date)).size
    return { mins, days }
  }

  if (loading) return (
    <div className="loader">
      <div>⏳ جارٍ تحميل البيانات...</div>
    </div>
  )

  return (
    <>
      <Head>
        <title>لوحة تحكم المشرف - متابعة الحضور</title>
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Head>

      <header className="header">
        <div className="container header-inner">
          <h1>🕐 متابعة حضور الموظفات</h1>
          <span className="header-badge">لوحة المشرف</span>
        </div>
      </header>

      <div className="container" style={{ paddingTop: '1.5rem', paddingBottom: '3rem' }}>
        {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

        {/* Stats */}
        <div className="stats-grid">
          <div className="stat-card">
            <div className="stat-value">{employees.length}</div>
            <div className="stat-label">إجمالي الموظفات</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{dailyPresent}</div>
            <div className="stat-label">حاضرات اليوم</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{fmtHours(weekTotal)}</div>
            <div className="stat-label">ساعات هذا الأسبوع</div>
          </div>
          <div className="stat-card">
            <div className="stat-value">{fmtHours(monthTotal)}</div>
            <div className="stat-label">ساعات هذا الشهر</div>
          </div>
        </div>

        {/* Tabs */}
        <div className="tabs">
          {[['daily','📅 يومي'],['weekly','📆 أسبوعي'],['monthly','🗓️ شهري'],['manual','✏️ إدخال يدوي'],['employees','👥 الموظفات']].map(([k,l]) => (
            <button key={k} className={`tab-btn ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>
          ))}
        </div>

        {/* DAILY TAB */}
        {tab === 'daily' && (
          <div>
            <div className="card">
              <div className="card-title">📅 تقرير يومي</div>
              <div className="form-group">
                <label className="form-label">اختر التاريخ</label>
                <input type="date" className="form-input" style={{ maxWidth: 220 }}
                  value={selectedDate} onChange={e => setSelectedDate(e.target.value)} />
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>الموظفة</th><th>الدخول</th><th>الخروج</th><th>الساعات</th><th>الحالة</th><th></th></tr>
                  </thead>
                  <tbody>
                    {employees.map((emp, i) => {
                      const empEntries = dailyEntries.filter(e => e.employee_id === emp.id)
                      const [bg, fg] = AVATAR_COLORS[i % AVATAR_COLORS.length]
                      if (!empEntries.length) return (
                        <tr key={emp.id}>
                          <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className="avatar" style={{ background: bg, color: fg }}>{getInitials(emp.name)}</div>
                            {emp.name}
                          </div></td>
                          <td>—</td><td>—</td><td>—</td>
                          <td><span className="badge badge-red">غائبة</span></td>
                          <td></td>
                        </tr>
                      )
                      const totalM = empEntries.reduce((s, e) => s + (e.minutes || 0), 0)
                      return empEntries.map((e, j) => (
                        <tr key={e.id}>
                          {j === 0 && (
                            <td rowSpan={empEntries.length}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <div className="avatar" style={{ background: bg, color: fg }}>{getInitials(emp.name)}</div>
                                {emp.name}
                              </div>
                            </td>
                          )}
                          <td>{e.check_in?.slice(0, 5)}</td>
                          <td>{e.check_out ? e.check_out.slice(0, 5) : <span className="badge badge-amber">لم يغادر</span>}</td>
                          {j === 0 && (
                            <>
                              <td rowSpan={empEntries.length}><strong>{fmtHours(totalM)}</strong></td>
                              <td rowSpan={empEntries.length}>
                                <span className={`badge ${totalM >= 480 ? 'badge-green' : totalM >= 360 ? 'badge-amber' : 'badge-red'}`}>
                                  {totalM >= 480 ? 'مكتمل' : totalM >= 360 ? 'جزئي' : 'قصير'}
                                </span>
                              </td>
                            </>
                          )}
                          <td>
                            <button className="btn btn-danger" style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                              onClick={() => deleteEntry(e.id)}>حذف</button>
                          </td>
                        </tr>
                      ))
                    })}
                  </tbody>
                </table>
                {employees.length === 0 && <div className="empty"><div className="empty-icon">👥</div><p>لا توجد موظفات. أضف موظفة من تبويب الموظفات.</p></div>}
              </div>
            </div>
          </div>
        )}

        {/* WEEKLY TAB */}
        {tab === 'weekly' && (
          <div className="card">
            <div className="card-title">📆 التقرير الأسبوعي ({wStart} → {wEnd})</div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>الموظفة</th><th>أيام العمل</th><th>إجمالي الساعات</th><th>المستهدف</th><th>نسبة الإنجاز</th></tr>
                </thead>
                <tbody>
                  {employees.map((emp, i) => {
                    const { mins, days } = empHoursInRange(emp.id, weekEntries)
                    const target = emp.weekly_hours * 60
                    const pct = target ? Math.min(100, Math.round(mins / target * 100)) : 0
                    const [bg, fg] = AVATAR_COLORS[i % AVATAR_COLORS.length]
                    return (
                      <tr key={emp.id}>
                        <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="avatar" style={{ background: bg, color: fg }}>{getInitials(emp.name)}</div>
                          {emp.name}
                        </div></td>
                        <td>{days} أيام</td>
                        <td><strong>{fmtHours(mins)}</strong> ساعة</td>
                        <td>{emp.weekly_hours} ساعة</td>
                        <td style={{ minWidth: 140 }}>
                          <div style={{ fontSize: '0.78rem', color: '#9ca3af', marginBottom: 4 }}>{pct}%</div>
                          <div className="progress-bar">
                            <div className="progress-fill" style={{
                              width: pct + '%',
                              background: pct >= 100 ? '#1d9e75' : pct >= 70 ? '#ba7517' : '#e24b4a'
                            }} />
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
              {employees.length === 0 && <div className="empty"><div className="empty-icon">📊</div><p>لا توجد بيانات</p></div>}
            </div>
          </div>
        )}

        {/* MONTHLY TAB */}
        {tab === 'monthly' && (
          <div className="card">
            <div className="card-title">🗓️ التقرير الشهري ({mStart} → {mEnd})</div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr><th>الموظفة</th><th>أيام العمل</th><th>إجمالي الساعات</th><th>متوسط يومي</th><th>الحالة</th></tr>
                </thead>
                <tbody>
                  {employees.map((emp, i) => {
                    const { mins, days } = empHoursInRange(emp.id, monthEntries)
                    const avgMins = days ? Math.round(mins / days) : 0
                    const [bg, fg] = AVATAR_COLORS[i % AVATAR_COLORS.length]
                    return (
                      <tr key={emp.id}>
                        <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="avatar" style={{ background: bg, color: fg }}>{getInitials(emp.name)}</div>
                          {emp.name}
                        </div></td>
                        <td>{days} أيام</td>
                        <td><strong>{fmtHours(mins)}</strong></td>
                        <td>{fmtHours(avgMins)}</td>
                        <td>
                          <span className={`badge ${days >= 20 ? 'badge-green' : days >= 10 ? 'badge-amber' : days === 0 ? 'badge-red' : 'badge-gray'}`}>
                            {days >= 20 ? 'منتظمة' : days >= 10 ? 'متوسطة' : days === 0 ? 'غائبة' : 'قليلة'}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* MANUAL ENTRY TAB */}
        {tab === 'manual' && (
          <div className="card">
            <div className="card-title">✏️ إدخال يدوي</div>
            <div className="form-grid">
              <div className="form-group">
                <label className="form-label">الموظفة</label>
                <select className="form-select" value={selEmp} onChange={e => setSelEmp(e.target.value)}>
                  {employees.map(e => <option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">التاريخ</label>
                <input type="date" className="form-input" value={entryDate} onChange={e => setEntryDate(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">وقت الدخول</label>
                <input type="time" className="form-input" value={inTime} onChange={e => setInTime(e.target.value)} />
              </div>
              <div className="form-group">
                <label className="form-label">وقت الخروج</label>
                <input type="time" className="form-input" value={outTime} onChange={e => setOutTime(e.target.value)} />
              </div>
            </div>
            <button className="btn btn-primary" onClick={addManualEntry} disabled={addingEntry}>
              {addingEntry ? '⏳ جارٍ الحفظ...' : '+ إضافة سجل'}
            </button>

            <div style={{ marginTop: '1.5rem', borderTop: '1px solid #f3f4f6', paddingTop: '1rem' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.75rem', fontSize: '0.9rem' }}>آخر السجلات</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>الموظفة</th><th>التاريخ</th><th>الدخول</th><th>الخروج</th><th>الساعات</th><th></th></tr></thead>
                  <tbody>
                    {entries.slice(0, 15).map(e => (
                      <tr key={e.id}>
                        <td>{e.employees?.name || '—'}</td>
                        <td>{e.date}</td>
                        <td>{e.check_in?.slice(0, 5)}</td>
                        <td>{e.check_out?.slice(0, 5) || '—'}</td>
                        <td>{fmtHours(e.minutes)}</td>
                        <td><button className="btn btn-danger" style={{ padding: '0.25rem 0.6rem', fontSize: '0.75rem' }} onClick={() => deleteEntry(e.id)}>حذف</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {entries.length === 0 && <div className="empty"><p>لا توجد سجلات</p></div>}
              </div>
            </div>
          </div>
        )}

        {/* EMPLOYEES TAB */}
        {tab === 'employees' && (
          <div>
            <div className="card">
              <div className="card-title">➕ إضافة موظفة جديدة</div>
              <div className="form-grid">
                <div className="form-group">
                  <label className="form-label">الاسم</label>
                  <input type="text" className="form-input" placeholder="اسم الموظفة" value={newName}
                    onChange={e => setNewName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && addEmployee()} />
                </div>
                <div className="form-group">
                  <label className="form-label">ساعات العمل المطلوبة أسبوعياً</label>
                  <input type="number" className="form-input" min="1" max="60" value={newHours}
                    onChange={e => setNewHours(+e.target.value)} />
                </div>
              </div>
              <button className="btn btn-primary" onClick={addEmployee} disabled={addingEmp}>
                {addingEmp ? '⏳ جارٍ الإضافة...' : '+ إضافة موظفة'}
              </button>
            </div>

            <div className="card">
              <div className="card-title">👥 قائمة الموظفات</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>الاسم</th><th>ساعات مطلوبة/أسبوع</th><th>رابط تسجيل الحضور</th><th></th></tr></thead>
                  <tbody>
                    {employees.map((emp, i) => {
                      const [bg, fg] = AVATAR_COLORS[i % AVATAR_COLORS.length]
                      const link = typeof window !== 'undefined'
                        ? `${window.location.origin}/checkin/${emp.id}`
                        : `/checkin/${emp.id}`
                      return (
                        <tr key={emp.id}>
                          <td><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div className="avatar" style={{ background: bg, color: fg }}>{getInitials(emp.name)}</div>
                            {emp.name}
                          </div></td>
                          <td>{emp.weekly_hours} ساعة</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <code style={{ fontSize: '0.75rem', background: '#f3f4f6', padding: '2px 8px', borderRadius: 6, direction: 'ltr', display: 'block', maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                /checkin/{emp.id}
                              </code>
                              <button className="btn btn-outline" style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem' }}
                                onClick={() => { navigator.clipboard.writeText(link); showMsg('تم نسخ الرابط ✓') }}>
                                نسخ
                              </button>
                            </div>
                          </td>
                          <td>
                            <button className="btn btn-danger" style={{ padding: '0.3rem 0.7rem', fontSize: '0.75rem' }}
                              onClick={() => deleteEmployee(emp.id)}>حذف</button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {employees.length === 0 && <div className="empty"><div className="empty-icon">👥</div><p>لا توجد موظفات حتى الآن</p></div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
