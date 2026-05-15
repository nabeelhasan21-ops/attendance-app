import { useState, useEffect, useCallback } from 'react'
import { supabase } from '../lib/supabase'
import Head from 'next/head'

const TIMEZONE = 'Asia/Amman'
const AVATAR_COLORS = [
  ['#9FE1CB','#085041'],['#B5D4F4','#0C447C'],['#F5C4B3','#712B13'],
  ['#F4C0D1','#72243E'],['#C0DD97','#27500A'],['#FAC775','#633806'],
  ['#CECBF6','#3C3489'],['#D3D1C7','#444441'],
]

function nowJO() { return new Date(new Date().toLocaleString('en-US', { timeZone: TIMEZONE })) }
function todayStrJO() {
  const d = nowJO()
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
function timeStrJO() {
  const d = nowJO()
  return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}`
}
function calcSessionMins(inDate, inTime, outDate, outTime) {
  if (!inDate||!inTime||!outDate||!outTime) return 0
  const inDT = new Date(`${inDate}T${inTime}`)
  const outDT = new Date(`${outDate}T${outTime}`)
  return Math.max(0, Math.round((outDT - inDT) / 60000))
}
function calcElapsedMins(inDate, inTime) {
  if (!inDate||!inTime) return 0
  const inDT = new Date(`${inDate}T${inTime}`)
  const nowDT = nowJO()
  return Math.max(0, Math.round((nowDT - inDT) / 60000))
}
function getInitials(name) { return name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase() }
function fmtHours(minutes) {
  if (!minutes||minutes<=0) return '0:00'
  return `${Math.floor(minutes/60)}:${String(minutes%60).padStart(2,'0')}`
}
function thisWeekRange() {
  const d = nowJO(); d.setDate(d.getDate()-d.getDay())
  const s = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
  const e2 = new Date(d); e2.setDate(d.getDate()+6)
  const e = `${e2.getFullYear()}-${String(e2.getMonth()+1).padStart(2,'0')}-${String(e2.getDate()).padStart(2,'0')}`
  return [s, e]
}
function thisMonthRange() {
  const d = nowJO()
  const s = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-01`
  const e2 = new Date(d.getFullYear(), d.getMonth()+1, 0)
  const e = `${e2.getFullYear()}-${String(e2.getMonth()+1).padStart(2,'0')}-${String(e2.getDate()).padStart(2,'0')}`
  return [s, e]
}

export default function AdminDashboard() {
  const [tab, setTab] = useState('live')
  const [employees, setEmployees] = useState([])
  const [entries, setEntries] = useState([])
  const [loading, setLoading] = useState(true)
  const [msg, setMsg] = useState(null)
  const [nowTime, setNowTime] = useState('')
  const [elapsedMap, setElapsedMap] = useState({})

  const [newName, setNewName] = useState('')
  const [newHours, setNewHours] = useState(40)
  const [addingEmp, setAddingEmp] = useState(false)

  const [selEmp, setSelEmp] = useState('')
  const [entryDate, setEntryDate] = useState(todayStrJO())
  const [inTime, setInTime] = useState('09:00')
  const [outTime, setOutTime] = useState('17:00')
  const [addingEntry, setAddingEntry] = useState(false)
  const [selectedDate, setSelectedDate] = useState(todayStrJO())

  useEffect(() => {
    const tick = () => {
      setNowTime(timeStrJO().slice(0,5))
      // Update elapsed for open entries
      setElapsedMap(prev => {
        const next = {...prev}
        Object.keys(next).forEach(id => {
          const e = next[id]
          next[id] = {...e, elapsed: calcElapsedMins(e.date, e.check_in)}
        })
        return next
      })
    }
    tick()
    const iv = setInterval(tick, 1000)
    return () => clearInterval(iv)
  }, [])

  const showMsg = (text, type='success') => { setMsg({text,type}); setTimeout(()=>setMsg(null),3500) }

  const loadData = useCallback(async () => {
    setLoading(true)
    const [{data:emps},{data:ents}] = await Promise.all([
      supabase.from('employees').select('*').order('created_at'),
      supabase.from('entries').select('*, employees(name)').order('date',{ascending:false}).order('created_at',{ascending:false}).limit(500),
    ])
    setEmployees(emps||[])
    setEntries(ents||[])
    if (emps&&emps.length>0&&!selEmp) setSelEmp(emps[0].id)
    // Build elapsed map for open entries
    const map = {}
    ;(ents||[]).filter(e=>!e.check_out).forEach(e => {
      map[e.employee_id] = {...e, elapsed: calcElapsedMins(e.date, e.check_in)}
    })
    setElapsedMap(map)
    setLoading(false)
  }, [selEmp])

  useEffect(() => {
    loadData()
    const ch = supabase.channel('entries-changes')
      .on('postgres_changes',{event:'*',schema:'public',table:'entries'},()=>loadData())
      .subscribe()
    return () => supabase.removeChannel(ch)
  }, [])

  async function addEmployee() {
    if (!newName.trim()) return
    setAddingEmp(true)
    const {error} = await supabase.from('employees').insert({name:newName.trim(),weekly_hours:newHours})
    if (error) showMsg('خطأ: '+error.message,'error')
    else { showMsg('تمت الإضافة ✓'); setNewName(''); loadData() }
    setAddingEmp(false)
  }

  async function deleteEmployee(id) {
    if (!confirm('حذف الموظفة وجميع سجلاتها؟')) return
    await supabase.from('entries').delete().eq('employee_id',id)
    await supabase.from('employees').delete().eq('id',id)
    showMsg('تم الحذف'); loadData()
  }

  // Admin force checkout
  async function forceCheckout(entry) {
    if (!confirm(`إنهاء جلسة هذه الموظفة الآن؟`)) return
    const outDate = todayStrJO()
    const outTime2 = timeStrJO()
    const minutes = calcSessionMins(entry.date, entry.check_in, outDate, outTime2)
    const {error} = await supabase.from('entries').update({
      check_out: outTime2, check_out_date: outDate, minutes
    }).eq('id', entry.id)
    if (error) showMsg('خطأ: '+error.message,'error')
    else { showMsg(`تم إنهاء جلسة الموظفة — ${fmtHours(minutes)} ✓`); loadData() }
  }

  async function addManualEntry() {
    if (!selEmp||!entryDate||!inTime||!outTime) return
    const minutes = calcSessionMins(entryDate, inTime+':00', entryDate, outTime+':00')
    if (minutes<=0) { showMsg('وقت الخروج يجب أن يكون بعد الدخول','error'); return }
    setAddingEntry(true)
    const {error} = await supabase.from('entries').insert({
      employee_id:selEmp, date:entryDate,
      check_in:inTime+':00', check_out:outTime+':00',
      check_out_date:entryDate, minutes
    })
    if (error) showMsg('خطأ: '+error.message,'error')
    else { showMsg('تم تسجيل الحضور ✓'); loadData() }
    setAddingEntry(false)
  }

  async function deleteEntry(id) {
    await supabase.from('entries').delete().eq('id',id)
    showMsg('تم الحذف'); loadData()
  }

  const today = todayStrJO()
  const todayEntries = entries.filter(e=>e.date===today)
  const openEntriesMap = {}
  entries.filter(e=>!e.check_out).forEach(e => { openEntriesMap[e.employee_id] = e })
  const workingNow = employees.filter(emp=>openEntriesMap[emp.id])
  const notWorking = employees.filter(emp=>!openEntriesMap[emp.id])

  const todayMinsByEmp = {}
  todayEntries.forEach(e => {
    if (!todayMinsByEmp[e.employee_id]) todayMinsByEmp[e.employee_id] = 0
    todayMinsByEmp[e.employee_id] += (e.minutes||0)
  })

  const dailyPresent = new Set(todayEntries.map(e=>e.employee_id)).size
  const [wStart,wEnd] = thisWeekRange()
  const weekEntries = entries.filter(e=>e.date>=wStart&&e.date<=wEnd)
  const weekTotal = weekEntries.reduce((s,e)=>s+(e.minutes||0),0)
  const [mStart,mEnd] = thisMonthRange()
  const monthEntries = entries.filter(e=>e.date>=mStart&&e.date<=mEnd)
  const monthTotal = monthEntries.reduce((s,e)=>s+(e.minutes||0),0)

  function empHoursInRange(empId, rangeEntries) {
    const empE = rangeEntries.filter(e=>e.employee_id===empId)
    return { mins:empE.reduce((s,e)=>s+(e.minutes||0),0), days:new Set(empE.map(e=>e.date)).size }
  }

  if (loading) return <div className="loader">⏳ جارٍ التحميل...</div>

  return (
    <>
      <Head><title>لوحة المشرف - متابعة الحضور</title><meta name="viewport" content="width=device-width, initial-scale=1" /></Head>
      <header className="header">
        <div className="container header-inner">
          <h1>🕐 متابعة حضور الموظفات</h1>
          <span className="header-badge">المشرف · {nowTime}</span>
        </div>
      </header>

      <div className="container" style={{ paddingTop:'1.5rem', paddingBottom:'3rem' }}>
        {msg && <div className={`alert alert-${msg.type}`}>{msg.text}</div>}

        <div className="stats-grid">
          <div className="stat-card"><div className="stat-value" style={{color:workingNow.length>0?'#1d9e75':'#9ca3af'}}>{workingNow.length}</div><div className="stat-label">⚡ يعملن الآن</div></div>
          <div className="stat-card"><div className="stat-value">{dailyPresent}</div><div className="stat-label">حضرن اليوم</div></div>
          <div className="stat-card"><div className="stat-value">{fmtHours(weekTotal)}</div><div className="stat-label">ساعات الأسبوع</div></div>
          <div className="stat-card"><div className="stat-value">{fmtHours(monthTotal)}</div><div className="stat-label">ساعات الشهر</div></div>
        </div>

        <div className="tabs">
          {[['live','⚡ من يعمل الآن'],['daily','📅 يومي'],['weekly','📆 أسبوعي'],['monthly','🗓️ شهري'],['manual','✏️ إدخال يدوي'],['employees','👥 الموظفات']].map(([k,l])=>(
            <button key={k} className={`tab-btn ${tab===k?'active':''}`} onClick={()=>setTab(k)}>{l}</button>
          ))}
        </div>

        {/* LIVE */}
        {tab==='live' && (
          <div>
            <div className="card">
              <div className="card-title">
                <span style={{display:'inline-flex',alignItems:'center',gap:8}}>
                  <span style={{width:10,height:10,borderRadius:'50%',background:'#1d9e75',display:'inline-block',animation:'pulse 2s infinite'}}/>
                  يعملن الآن ({workingNow.length})
                </span>
              </div>
              <style>{`@keyframes pulse{0%,100%{box-shadow:0 0 0 3px #e1f5ee}50%{box-shadow:0 0 0 6px #9fe1cb}}`}</style>
              {workingNow.length===0 ? (
                <div className="empty"><div className="empty-icon">😴</div><p>لا أحد يعمل الآن</p></div>
              ) : (
                <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:12}}>
                  {workingNow.map((emp,i)=>{
                    const [bg,fg]=AVATAR_COLORS[i%AVATAR_COLORS.length]
                    const entry = openEntriesMap[emp.id]
                    const eData = elapsedMap[emp.id]
                    const elapsed = eData ? eData.elapsed : calcElapsedMins(entry.date, entry.check_in)
                    const completedToday = (todayMinsByEmp[emp.id]||0)
                    const totalToday = completedToday + elapsed
                    const crossedMidnight = entry.date !== today
                    return (
                      <div key={emp.id} style={{background:'#f0fdf8',border:'1.5px solid #9fe1cb',borderRadius:12,padding:'1rem',display:'flex',flexDirection:'column',gap:8}}>
                        <div style={{display:'flex',alignItems:'center',gap:10,justifyContent:'space-between'}}>
                          <div style={{display:'flex',alignItems:'center',gap:10}}>
                            <div style={{position:'relative'}}>
                              <div className="avatar" style={{background:bg,color:fg,width:44,height:44,fontSize:'1rem'}}>{getInitials(emp.name)}</div>
                              <span style={{position:'absolute',bottom:0,left:0,width:12,height:12,background:'#1d9e75',borderRadius:'50%',border:'2px solid white'}}/>
                            </div>
                            <div>
                              <div style={{fontWeight:700,fontSize:'0.95rem',color:'#085041'}}>{emp.name}</div>
                              <div style={{fontSize:'0.78rem',color:'#1d9e75'}}>
                                دخل {entry.check_in?.slice(0,5)}{crossedMidnight?' (أمس)':''}
                              </div>
                            </div>
                          </div>
                          {/* Force checkout button */}
                          <button
                            onClick={()=>forceCheckout(entry)}
                            style={{background:'#fcebeb',color:'#e24b4a',border:'none',borderRadius:8,padding:'0.4rem 0.7rem',fontSize:'0.75rem',fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}
                          >
                            🔴 إنهاء
                          </button>
                        </div>
                        <div style={{display:'flex',gap:8}}>
                          <div style={{flex:1,background:'white',borderRadius:8,padding:'0.5rem',textAlign:'center'}}>
                            <div style={{fontWeight:700,fontSize:'1.1rem',color:'#085041',fontVariantNumeric:'tabular-nums'}}>{fmtHours(elapsed)}</div>
                            <div style={{fontSize:'0.72rem',color:'#9ca3af'}}>هذه الجلسة</div>
                          </div>
                          <div style={{flex:1,background:'white',borderRadius:8,padding:'0.5rem',textAlign:'center'}}>
                            <div style={{fontWeight:700,fontSize:'1.1rem',color:'#374151',fontVariantNumeric:'tabular-nums'}}>{fmtHours(totalToday)}</div>
                            <div style={{fontSize:'0.72rem',color:'#9ca3af'}}>مجموع اليوم</div>
                          </div>
                        </div>
                        {crossedMidnight && (
                          <div style={{fontSize:'0.75rem',background:'#faeeda',color:'#854f0b',borderRadius:6,padding:'0.3rem 0.6rem',textAlign:'center'}}>
                            ⚠️ جلسة تمتد من أمس حتى الآن
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            <div className="card">
              <div className="card-title">😴 خارج العمل الآن ({notWorking.length})</div>
              {notWorking.length===0 ? <div className="empty"><p>الجميع يعمل! 🎉</p></div> : (
                <table className="emp-table">
                  <thead><tr><th>الموظفة</th><th>ساعات اليوم</th><th>آخر خروج</th><th>الحالة</th></tr></thead>
                  <tbody>
                    {notWorking.map((emp,i)=>{
                      const [bg,fg]=AVATAR_COLORS[(employees.indexOf(emp))%AVATAR_COLORS.length]
                      const todayMins = todayMinsByEmp[emp.id]||0
                      const lastEntry = todayEntries.filter(e=>e.employee_id===emp.id&&e.check_out).sort((a,b)=>b.check_out?.localeCompare(a.check_out))[0]
                      const hasWorkedToday = todayEntries.some(e=>e.employee_id===emp.id)
                      return (
                        <tr key={emp.id}>
                          <td><div style={{display:'flex',alignItems:'center',gap:8}}><div className="avatar" style={{background:bg,color:fg}}>{getInitials(emp.name)}</div>{emp.name}</div></td>
                          <td>{todayMins>0?<strong>{fmtHours(todayMins)}</strong>:'—'}</td>
                          <td>{lastEntry?lastEntry.check_out?.slice(0,5):'—'}</td>
                          <td>{hasWorkedToday?<span className="badge badge-amber">انصرفت</span>:<span className="badge badge-red">لم تحضر</span>}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* DAILY */}
        {tab==='daily' && (
          <div className="card">
            <div className="card-title">📅 تقرير يومي</div>
            <div className="form-group">
              <label className="form-label">اختر التاريخ</label>
              <input type="date" className="form-input" style={{maxWidth:220}} value={selectedDate} onChange={e=>setSelectedDate(e.target.value)}/>
            </div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>الموظفة</th><th>الدخول</th><th>الخروج</th><th>الساعات</th><th>الجلسات</th><th>الحالة</th><th></th></tr></thead>
                <tbody>
                  {employees.map((emp,i)=>{
                    const selEntries = entries.filter(e=>e.date===selectedDate&&e.employee_id===emp.id)
                    const [bg,fg]=AVATAR_COLORS[i%AVATAR_COLORS.length]
                    if (!selEntries.length) return (
                      <tr key={emp.id}>
                        <td><div style={{display:'flex',alignItems:'center',gap:8}}><div className="avatar" style={{background:bg,color:fg}}>{getInitials(emp.name)}</div>{emp.name}</div></td>
                        <td>—</td><td>—</td><td>—</td><td>—</td>
                        <td><span className="badge badge-red">غائبة</span></td><td></td>
                      </tr>
                    )
                    const totalM = selEntries.reduce((s,e)=>s+(e.minutes||0),0)
                    const sessions = selEntries.filter(e=>e.check_out).length
                    const hasOpen = selEntries.some(e=>!e.check_out)
                    return (
                      <tr key={emp.id}>
                        <td><div style={{display:'flex',alignItems:'center',gap:8}}><div className="avatar" style={{background:bg,color:fg}}>{getInitials(emp.name)}</div>{emp.name}</div></td>
                        <td>{selEntries[selEntries.length-1]?.check_in?.slice(0,5)}</td>
                        <td>{hasOpen?<span className="badge badge-green">مسجّل دخول ⚡</span>:selEntries[0]?.check_out?.slice(0,5)}</td>
                        <td><strong>{fmtHours(totalM)}</strong></td>
                        <td>{sessions} جلسة{hasOpen?' + جارية':''}</td>
                        <td><span className={`badge ${totalM>=480?'badge-green':totalM>=360?'badge-amber':'badge-red'}`}>{totalM>=480?'مكتمل':totalM>=360?'جزئي':'قصير'}</span></td>
                        <td><button className="btn btn-danger" style={{padding:'0.3rem 0.6rem',fontSize:'0.75rem'}} onClick={()=>{if(confirm('حذف جميع سجلات هذا اليوم؟'))selEntries.forEach(e=>deleteEntry(e.id))}}>حذف</button></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* WEEKLY */}
        {tab==='weekly' && (
          <div className="card">
            <div className="card-title">📆 الأسبوعي ({wStart} → {wEnd})</div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>الموظفة</th><th>أيام</th><th>إجمالي</th><th>المستهدف</th><th>الإنجاز</th></tr></thead>
                <tbody>
                  {employees.map((emp,i)=>{
                    const {mins,days}=empHoursInRange(emp.id,weekEntries)
                    const target=emp.weekly_hours*60
                    const pct=target?Math.min(100,Math.round(mins/target*100)):0
                    const [bg,fg]=AVATAR_COLORS[i%AVATAR_COLORS.length]
                    return (
                      <tr key={emp.id}>
                        <td><div style={{display:'flex',alignItems:'center',gap:8}}><div className="avatar" style={{background:bg,color:fg}}>{getInitials(emp.name)}</div>{emp.name}</div></td>
                        <td>{days} أيام</td>
                        <td><strong>{fmtHours(mins)}</strong> / {emp.weekly_hours}س</td>
                        <td>{emp.weekly_hours}س</td>
                        <td style={{minWidth:140}}>
                          <div style={{fontSize:'0.78rem',color:'#9ca3af',marginBottom:4}}>{pct}%</div>
                          <div className="progress-bar"><div className="progress-fill" style={{width:pct+'%',background:pct>=100?'#1d9e75':pct>=70?'#ba7517':'#e24b4a'}}/></div>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* MONTHLY */}
        {tab==='monthly' && (
          <div className="card">
            <div className="card-title">🗓️ الشهري ({mStart} → {mEnd})</div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>الموظفة</th><th>أيام</th><th>إجمالي</th><th>متوسط يومي</th><th>الحالة</th></tr></thead>
                <tbody>
                  {employees.map((emp,i)=>{
                    const {mins,days}=empHoursInRange(emp.id,monthEntries)
                    const [bg,fg]=AVATAR_COLORS[i%AVATAR_COLORS.length]
                    return (
                      <tr key={emp.id}>
                        <td><div style={{display:'flex',alignItems:'center',gap:8}}><div className="avatar" style={{background:bg,color:fg}}>{getInitials(emp.name)}</div>{emp.name}</div></td>
                        <td>{days}</td><td><strong>{fmtHours(mins)}</strong></td>
                        <td>{fmtHours(days?Math.round(mins/days):0)}</td>
                        <td><span className={`badge ${days>=20?'badge-green':days>=10?'badge-amber':days===0?'badge-red':'badge-gray'}`}>{days>=20?'منتظمة':days>=10?'متوسطة':days===0?'غائبة':'قليلة'}</span></td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* MANUAL */}
        {tab==='manual' && (
          <div className="card">
            <div className="card-title">✏️ إدخال يدوي</div>
            <div className="form-grid">
              <div className="form-group"><label className="form-label">الموظفة</label>
                <select className="form-select" value={selEmp} onChange={e=>setSelEmp(e.target.value)}>
                  {employees.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}
                </select>
              </div>
              <div className="form-group"><label className="form-label">التاريخ</label>
                <input type="date" className="form-input" value={entryDate} onChange={e=>setEntryDate(e.target.value)}/>
              </div>
              <div className="form-group"><label className="form-label">وقت الدخول</label>
                <input type="time" className="form-input" value={inTime} onChange={e=>setInTime(e.target.value)}/>
              </div>
              <div className="form-group"><label className="form-label">وقت الخروج</label>
                <input type="time" className="form-input" value={outTime} onChange={e=>setOutTime(e.target.value)}/>
              </div>
            </div>
            <button className="btn btn-primary" onClick={addManualEntry} disabled={addingEntry}>{addingEntry?'⏳...':'+ إضافة سجل'}</button>
            <div style={{marginTop:'1.5rem',borderTop:'1px solid #f3f4f6',paddingTop:'1rem'}}>
              <div style={{fontWeight:600,marginBottom:'0.75rem',fontSize:'0.9rem'}}>آخر السجلات</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>الموظفة</th><th>التاريخ</th><th>الدخول</th><th>الخروج</th><th>الساعات</th><th></th></tr></thead>
                  <tbody>
                    {entries.slice(0,15).map(e=>(
                      <tr key={e.id}>
                        <td>{e.employees?.name||'—'}</td><td>{e.date}</td>
                        <td>{e.check_in?.slice(0,5)}</td><td>{e.check_out?.slice(0,5)||'—'}</td>
                        <td>{fmtHours(e.minutes)}</td>
                        <td><button className="btn btn-danger" style={{padding:'0.25rem 0.6rem',fontSize:'0.75rem'}} onClick={()=>deleteEntry(e.id)}>حذف</button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* EMPLOYEES */}
        {tab==='employees' && (
          <div>
            <div className="card">
              <div className="card-title">➕ إضافة موظفة</div>
              <div className="form-grid">
                <div className="form-group"><label className="form-label">الاسم</label>
                  <input type="text" className="form-input" placeholder="اسم الموظفة" value={newName} onChange={e=>setNewName(e.target.value)} onKeyDown={e=>e.key==='Enter'&&addEmployee()}/>
                </div>
                <div className="form-group"><label className="form-label">ساعات أسبوعية مطلوبة</label>
                  <input type="number" className="form-input" min="1" max="60" value={newHours} onChange={e=>setNewHours(+e.target.value)}/>
                </div>
              </div>
              <button className="btn btn-primary" onClick={addEmployee} disabled={addingEmp}>{addingEmp?'⏳...':'+ إضافة موظفة'}</button>
            </div>
            <div className="card">
              <div className="card-title">👥 قائمة الموظفات</div>
              <div className="table-wrap">
                <table>
                  <thead><tr><th>الاسم</th><th>ساعات/أسبوع</th><th>رابط الحضور</th><th></th></tr></thead>
                  <tbody>
                    {employees.map((emp,i)=>{
                      const [bg,fg]=AVATAR_COLORS[i%AVATAR_COLORS.length]
                      const link=typeof window!=='undefined'?`${window.location.origin}/checkin/${emp.id}`:''
                      return (
                        <tr key={emp.id}>
                          <td><div style={{display:'flex',alignItems:'center',gap:8}}><div className="avatar" style={{background:bg,color:fg}}>{getInitials(emp.name)}</div>{emp.name}</div></td>
                          <td>{emp.weekly_hours}س</td>
                          <td>
                            <div style={{display:'flex',alignItems:'center',gap:8}}>
                              <code style={{fontSize:'0.75rem',background:'#f3f4f6',padding:'2px 8px',borderRadius:6,direction:'ltr',maxWidth:260,overflow:'hidden',textOverflow:'ellipsis',display:'block'}}>/checkin/{emp.id}</code>
                              <button className="btn btn-outline" style={{padding:'0.3rem 0.7rem',fontSize:'0.75rem'}} onClick={()=>{navigator.clipboard.writeText(link);showMsg('تم نسخ الرابط ✓')}}>نسخ</button>
                            </div>
                          </td>
                          <td><button className="btn btn-danger" style={{padding:'0.3rem 0.7rem',fontSize:'0.75rem'}} onClick={()=>deleteEmployee(emp.id)}>حذف</button></td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
                {employees.length===0&&<div className="empty"><div className="empty-icon">👥</div><p>لا توجد موظفات</p></div>}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
