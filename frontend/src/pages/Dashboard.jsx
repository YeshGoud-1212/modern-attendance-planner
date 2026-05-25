/**
 * pages/Dashboard.jsx
 * Consumes real data from FastAPI via Chrome extension.
 * Falls back to NoDataPrompt if no data available.
 */

import React, { useState, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft, AlertTriangle, Target, TrendingUp,
  Plus, Settings, BookOpen, Save, Calculator,
  RefreshCw, Wifi, WifiOff, Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import AttendanceChart from "@/components/AttendanceChart";
import FloatingShapes from "@/components/FloatingShapes";
import NoDataPrompt from "@/components/NoDataPrompt";
import { useAttendance } from "@/hooks/useAttendance";
import { saveSettings, loadSettings } from "@/services/api";
import { DAYS } from "@/data/students";

const motivationalQuotes = [
  "📚 Consistency is the key to success!",
  "🎯 Every class attended is a step closer to your dreams!",
  "💫 Excellence is not an act, but a habit!",
  "🚀 Your future self will thank you for showing up today!",
  "⭐ Small steps daily lead to big results yearly!",
];

function computeBunkImpact(attended, total, remaining, bunkCount, target) {
  if (bunkCount > remaining) return { error: "Cannot bunk more than remaining classes!" };
  const newAttended = attended + (remaining - bunkCount);
  const newTotal = total + remaining;
  const newPct = newTotal === 0 ? 0 : ((newAttended / newTotal) * 100).toFixed(2);
  return { percentage: newPct, attended: newAttended, total: newTotal };
}

const Dashboard = () => {
  const { data, lastUpdated, loading, error, backendOk, dataSource, refresh, roll } = useAttendance();

  const [showScheduleSetup, setShowScheduleSetup] = useState(false);
  const [isFirstTimeUser, setIsFirstTimeUser] = useState(false);
  const [classesPerDay, setClassesPerDay] = useState({
    Monday: 0, Tuesday: 0, Wednesday: 0, Thursday: 0, Friday: 0, Saturday: 0,
  });
  const [semesterEndDate, setSemesterEndDate] = useState("");
  const [targetPct, setTargetPct] = useState(75);
  const [editingTarget, setEditingTarget] = useState(false);
  const [bunkClasses, setBunkClasses] = useState(0);
  const [projectedAttendance, setProjectedAttendance] = useState(null);
  const [editingSubject, setEditingSubject] = useState(null);
  const [subjectTargets, setSubjectTargets] = useState({});

  const randomQuote = useMemo(
    () => motivationalQuotes[Math.floor(Math.random() * motivationalQuotes.length)], []
  );

  useEffect(() => {
    loadSettings().then((s) => {
      if (s.weeklySchedule) setClassesPerDay(s.weeklySchedule);
      if (s.semesterEndDate) setSemesterEndDate(s.semesterEndDate);
      if (s.targetPercentage) setTargetPct(s.targetPercentage);
      const hasSchedule = s.weeklySchedule && Object.values(s.weeklySchedule).some(v => v > 0);
      if (!hasSchedule) { setIsFirstTimeUser(true); setShowScheduleSetup(true); }
    });
  }, []);

  useEffect(() => {
    if (data?.subjects) {
      const init = {};
      data.subjects.forEach(s => { init[s.name] = targetPct; });
      setSubjectTargets(prev => ({ ...init, ...prev }));
    }
  }, [data]);

  useEffect(() => {
    if (!data) return;
    if (bunkClasses > 0) {
      setProjectedAttendance(computeBunkImpact(data.attended, data.total, data.remaining_classes, bunkClasses, targetPct));
    } else {
      setProjectedAttendance(null);
    }
  }, [bunkClasses, data, targetPct]);

  const calcWeeklyTotal = () => Object.values(classesPerDay).reduce((s, c) => s + parseInt(c || 0), 0);

  const saveSchedule = () => {
    saveSettings({ weeklySchedule: classesPerDay, semesterEndDate: semesterEndDate || null, targetPercentage: targetPct });
    setShowScheduleSetup(false);
    setIsFirstTimeUser(false);
  };

  if (loading && !data) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <FloatingShapes />
        <div className="text-center animate-slide-up">
          <div className="text-6xl mb-4 animate-pulse">⚡</div>
          <p className="text-xl neon-text font-bold">Loading attendance data...</p>
        </div>
      </div>
    );
  }

  if (error === "NO_DATA" || !data) {
    return (<><FloatingShapes /><NoDataPrompt backendOk={backendOk} onRefresh={refresh} /></>);
  }

  return (
    <div className="min-h-screen relative p-4 md:p-8">
      <FloatingShapes />

      {/* Schedule Setup Dialog */}
      <Dialog open={showScheduleSetup} onOpenChange={setShowScheduleSetup}>
        <DialogContent className="max-w-4xl glass-card max-h-[90vh] overflow-y-auto"
          onInteractOutside={(e) => isFirstTimeUser && e.preventDefault()}>
          <DialogHeader>
            <DialogTitle className="text-3xl font-bold neon-text text-center mb-2">
              📚 Configure Your Schedule
            </DialogTitle>
            <p className="text-center text-muted-foreground text-sm">
              Helps compute remaining classes and safe bunks accurately.
            </p>
          </DialogHeader>

          <Alert className="my-4">
            <BookOpen className="h-4 w-4" />
            <AlertDescription>
              💡 Count only academic classes. Semester end date determines remaining classes.
            </AlertDescription>
          </Alert>

          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 my-4">
            {DAYS.map((day) => (
              <div key={day} className="glass-card p-4 space-y-2 hover-lift">
                <label className="text-base font-bold text-primary block">{day}</label>
                <Input type="number" min="0" max="10"
                  value={classesPerDay[day] || 0}
                  onChange={(e) => setClassesPerDay({ ...classesPerDay, [day]: parseInt(e.target.value) || 0 })}
                  onFocus={(e) => e.target.select()}
                  className="h-14 text-xl text-center font-bold" />
                <p className="text-xs text-muted-foreground text-center">classes/day</p>
              </div>
            ))}
          </div>

          <div className="glass-card p-4 mb-4">
            <label className="text-sm font-bold text-primary block mb-2">📅 Semester End Date</label>
            <Input type="date" value={semesterEndDate} onChange={(e) => setSemesterEndDate(e.target.value)} className="h-12" />
            <p className="text-xs text-muted-foreground mt-2">Default: Nov 30, 2025 if left blank.</p>
          </div>

          <div className="glass-card p-4 mb-4">
            <label className="text-sm font-bold text-primary block mb-2">🎯 Attendance Target (%)</label>
            <Input type="number" min="0" max="100" value={targetPct}
              onChange={(e) => setTargetPct(Number(e.target.value))} className="h-12 text-xl font-bold" />
          </div>

          <div className="glass-card p-4 mb-4 bg-gradient-to-r from-primary/10 to-accent/10">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold">Total Classes per Week</p>
                <p className="text-xs text-muted-foreground">Sum of all days</p>
              </div>
              <div className="text-5xl font-bold text-primary neon-text animate-pulse-neon">{calcWeeklyTotal()}</div>
            </div>
          </div>

          <div className="flex gap-4">
            {!isFirstTimeUser && (
              <Button onClick={() => setShowScheduleSetup(false)} variant="ghost" className="flex-1">Cancel</Button>
            )}
            <Button onClick={saveSchedule} variant="neon" size="xl"
              className="flex-1 flex items-center gap-2" disabled={calcWeeklyTotal() === 0}>
              <Save className="h-5 w-5" />
              {isFirstTimeUser ? "Continue to Dashboard" : "Save Settings"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <div className="max-w-6xl mx-auto animate-slide-up">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link to="/"><Button variant="glass" size="icon" className="hover-lift"><ArrowLeft className="h-4 w-4" /></Button></Link>
            <h1 className="text-3xl md:text-4xl font-bold neon-text">📊 Dashboard</h1>
          </div>
          <div className="flex items-center gap-3">
            {roll && (
              <span className="text-xs font-mono text-muted-foreground">{roll}</span>
            )}
            {lastUpdated && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Clock className="h-3 w-3" />{new Date(lastUpdated).toLocaleTimeString()}
                {dataSource && <span className="opacity-70">· {dataSource}</span>}
              </div>
            )}
            <div className="flex items-center gap-1 text-xs">
              {backendOk
                ? <><Wifi className="h-3 w-3 text-success" /><span className="text-success">Connected</span></>
                : <><WifiOff className="h-3 w-3 text-destructive" /><span className="text-destructive">Offline</span></>}
            </div>
            <Button variant="glass" size="icon" onClick={refresh} className="hover-lift"><RefreshCw className="h-4 w-4" /></Button>
          </div>
        </div>

        {/* Student Info */}
        <div className="glass-card hover-lift mb-8">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center">
            <div>
              <h2 className="text-2xl font-bold text-primary mb-2">{data.student_name}</h2>
              <p className="text-muted-foreground">Student ID: {data.student_id}</p>
              <p className="text-xs text-muted-foreground mt-1">
                Semester ends: <span className="text-accent">{data.semester_end_date}</span>
                {" · "}{data.holidays_count} holidays
              </p>
            </div>
            <div className="mt-4 md:mt-0 text-right">
              <div className="text-4xl font-bold neon-text">{data.percentage}%</div>
              <p className="text-sm text-muted-foreground">Current Attendance</p>
              <div className="flex items-center gap-2 mt-2">
                <p className="text-xs text-muted-foreground">Target:</p>
                {editingTarget ? (
                  <div className="flex items-center gap-1">
                    <Input type="number" value={targetPct} onChange={(e) => setTargetPct(Number(e.target.value))}
                      className="w-16 h-6 text-xs" min="0" max="100" autoFocus />
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0"
                      onClick={() => { setEditingTarget(false); saveSettings({ targetPercentage: targetPct }); }}>✓</Button>
                  </div>
                ) : (
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-bold text-accent">{data.target_percentage}%</span>
                    <Button size="sm" variant="ghost" className="h-6 w-6 p-0" onClick={() => setEditingTarget(true)}>
                      <Settings className="h-3 w-3" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 mb-8">
          <div className="lg:col-span-1">
            <AttendanceChart attended={data.attended} total={data.total} target={data.target_percentage} />
          </div>
          <div className="lg:col-span-2 space-y-6">
            {/* Safe Bunks */}
            <div className="glass-card hover-lift">
              <div className="flex items-center gap-3 mb-4">
                <AlertTriangle className="h-6 w-6 text-warning" />
                <h3 className="text-xl font-bold">🎯 Bunk Calculator</h3>
              </div>
              {data.safe_bunks > 0 ? (
                <div className="text-center">
                  <div className="text-6xl font-bold text-success neon-text animate-pulse-neon mb-2">{data.safe_bunks}</div>
                  <p className="text-lg text-success font-semibold">Safe Bunks Left! ✅</p>
                  <p className="text-sm text-muted-foreground mt-2">Miss {data.safe_bunks} more and still maintain {data.target_percentage}%</p>
                </div>
              ) : (
                <div className="text-center">
                  <div className="text-4xl font-bold text-destructive neon-text animate-pulse-neon mb-2">⚠️ 0 ⚠️</div>
                  <p className="text-lg text-destructive font-semibold">No more bunks allowed!</p>
                  <p className="text-sm text-muted-foreground mt-2">Attend all remaining to maintain {data.target_percentage}%</p>
                </div>
              )}
            </div>

            {/* Future Projection */}
            <div className="glass-card hover-lift">
              <div className="flex items-center gap-3 mb-4">
                <Target className="h-6 w-6 text-accent" />
                <h3 className="text-xl font-bold">🔮 Future Projection</h3>
              </div>
              <div className="space-y-4">
                <p className="text-center text-lg">
                  Must attend <span className="text-primary font-bold text-2xl neon-text">{data.must_attend}</span>
                  {" "}out of <span className="font-bold">{data.remaining_classes}</span> remaining classes
                </p>
                <p className="text-xs text-muted-foreground text-center italic">
                  Computed: today → {data.semester_end_date}, minus holidays &amp; Sundays
                </p>
                <div>
                  <div className="w-full bg-muted rounded-full h-4 overflow-hidden">
                    <div className="h-full bg-gradient-neon animate-glow transition-all duration-1000 ease-out"
                      style={{ width: `${Math.min(data.percentage, 100)}%` }} />
                  </div>
                  <div className="flex justify-between text-xs mt-2">
                    <span>0%</span>
                    <span className="font-bold">{data.target_percentage}% Target</span>
                    <span>100%</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quick Stats */}
            <div className="grid grid-cols-2 gap-4">
              <div className="glass-card text-center">
                <TrendingUp className="h-8 w-8 text-accent mx-auto mb-2" />
                <div className="text-2xl font-bold text-primary">{data.attended}/{data.total}</div>
                <p className="text-sm text-muted-foreground">Classes Ratio</p>
              </div>
              <div className="glass-card text-center">
                <Target className="h-8 w-8 text-success mx-auto mb-2" />
                <div className="text-2xl font-bold text-primary">{data.remaining_classes}</div>
                <p className="text-sm text-muted-foreground">Classes Left</p>
              </div>
            </div>
          </div>
        </div>

        {/* Subjects */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold neon-text mb-6">📚 Subject-wise Attendance</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {data.subjects.map((subject, index) => {
              const st = subjectTargets[subject.name] || data.target_percentage;
              const isEditingThis = editingSubject === subject.name;
              const statusClass = subject.status === "safe" ? "text-success" : subject.status === "warning" ? "text-warning" : "text-destructive";
              return (
                <div key={index} className="glass-card hover-lift">
                  <div className="flex justify-between items-start mb-3">
                    <h3 className="font-bold text-primary">{subject.name}</h3>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`text-sm font-bold ${statusClass}`}>{subject.percentage}%</span>
                      <div className="flex items-center gap-1">
                        <span className="text-xs text-muted-foreground">Target:</span>
                        {isEditingThis ? (
                          <div className="flex items-center gap-1">
                            <Input type="number" value={st}
                              onChange={(e) => setSubjectTargets({ ...subjectTargets, [subject.name]: Number(e.target.value) })}
                              className="w-12 h-5 text-xs px-1" min="0" max="100" autoFocus />
                            <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => setEditingSubject(null)}>✓</Button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <span className="text-xs font-bold text-accent">{st}%</span>
                            <Button size="sm" variant="ghost" className="h-5 w-5 p-0" onClick={() => setEditingSubject(subject.name)}>
                              <Settings className="h-3 w-3" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  <Progress value={subject.percentage} className="h-3 mb-2" />
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{subject.attended}/{subject.total} classes</span>
                    <span className={`font-medium ${statusClass}`}>
                      {subject.status === "safe" ? "✅ Above Target" : subject.status === "warning" ? "⚠️ Near Target" : "❌ Below Target"}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground pt-2 mt-2 border-t border-glass-border">
                    <span>Safe bunks: <strong className="text-success">{subject.safe_bunks}</strong></span>
                    <span>Must attend: <strong className="text-primary">{subject.must_attend}</strong></span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Schedule & Holidays */}
        <div className="glass-card hover-lift mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-bold neon-text mb-2">📚 Weekly Schedule & Holidays</h3>
              <p className="text-sm text-muted-foreground">
                {calcWeeklyTotal()} classes/week · {data.holidays_count} holidays · ends {data.semester_end_date}
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Remaining: <strong className="text-primary">{data.remaining_classes}</strong> classes computed automatically
              </p>
            </div>
            <Button onClick={() => setShowScheduleSetup(true)} variant="glass" className="flex items-center gap-2">
              <Settings className="h-4 w-4" /> Edit Schedule
            </Button>
          </div>
        </div>

        {/* Bunk Impact Calculator */}
        <div className="glass-card hover-lift mb-8">
          <div className="flex items-center gap-3 mb-4">
            <Calculator className="h-6 w-6 text-warning" />
            <h3 className="text-xl font-bold neon-text">🔮 Bunk Impact Calculator</h3>
          </div>
          <p className="text-sm text-muted-foreground mb-4">
            See projected attendance if you bunk N remaining classes
          </p>
          <Input type="number" min="0" max={data.remaining_classes} value={bunkClasses}
            onChange={(e) => setBunkClasses(parseInt(e.target.value) || 0)}
            onFocus={(e) => e.target.select()} placeholder="Enter number of classes" className="h-12 mb-4" />

          {projectedAttendance && (
            <Card className={`border-2 ${projectedAttendance.error ? "border-destructive" : "border-primary"}`}>
              <CardHeader>
                <CardTitle className={projectedAttendance.error ? "text-destructive" : "text-primary"}>
                  {projectedAttendance.error ? "⚠️ Error" : "📊 Projected Attendance"}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {projectedAttendance.error ? (
                  <p className="text-destructive font-medium">{projectedAttendance.error}</p>
                ) : (
                  <div className="space-y-3">
                    <div className="text-center">
                      <div className={`text-5xl font-bold neon-text ${Number(projectedAttendance.percentage) >= data.target_percentage ? "text-success" : "text-destructive"}`}>
                        {projectedAttendance.percentage}%
                      </div>
                      <p className="text-sm text-muted-foreground mt-2">Your attendance will be</p>
                    </div>
                    <div className="grid grid-cols-2 gap-4 pt-4 border-t border-border">
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Attended</p>
                        <p className="text-lg font-bold">{projectedAttendance.attended}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-xs text-muted-foreground">Total</p>
                        <p className="text-lg font-bold">{projectedAttendance.total}</p>
                      </div>
                    </div>
                    {Number(projectedAttendance.percentage) < data.target_percentage && (
                      <Alert variant="destructive">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertDescription>Attendance will fall below {data.target_percentage}%!</AlertDescription>
                      </Alert>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        {/* Motivational Quote */}
        <div className="glass-card text-center hover-lift">
          <div className="text-2xl font-bold neon-text animate-glow">{randomQuote}</div>
          <p className="text-sm text-muted-foreground mt-2">Stay motivated and keep attending! 💪</p>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
