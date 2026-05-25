import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, GraduationCap, Chrome } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import FloatingShapes from '@/components/FloatingShapes';
import { postAttendance, checkBackendHealth } from '@/services/api';
import { studentData, studentToAttendancePayload } from '@/data/students';

const DEMO_ENABLED = import.meta.env.VITE_ENABLE_DEMO === 'true';

const Home = () => {
  const [rollNumber, setRollNumber] = useState('');
  const [loadingDemo, setLoadingDemo] = useState(false);
  const [demoError, setDemoError] = useState(null);
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (rollNumber.trim()) {
      navigate(`/dashboard?roll=${rollNumber.toUpperCase()}`);
    }
  };

  const handleDemoLoad = async (roll) => {
    setLoadingDemo(true);
    setDemoError(null);
    try {
      const ok = await checkBackendHealth();
      if (!ok) {
        throw new Error('Backend is not running. Start it with: cd backend && python main.py');
      }
      const payload = studentToAttendancePayload(roll);
      if (!payload) throw new Error(`No demo data for ${roll}`);
      await postAttendance(payload);
      navigate(`/dashboard?roll=${roll}`);
    } catch (err) {
      setDemoError(err.message);
    } finally {
      setLoadingDemo(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative p-4">
      <FloatingShapes />

      <div className="w-full max-w-md animate-slide-up">
        <div className="glass-card hover-lift text-center mb-8">
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full glass border-glass-border neon-glow mb-6">
              <GraduationCap className="h-10 w-10 text-primary animate-glow" />
            </div>

            <h1 className="text-4xl md:text-5xl font-bold neon-text mb-4">
              🎓 Attendance Tracker
            </h1>

            <p className="text-muted-foreground text-lg">
              Track attendance, calculate safe bunks, and project your semester goals.
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                type="text"
                placeholder="Enter Roll Number (e.g., 23IT101)"
                value={rollNumber}
                onChange={(e) => setRollNumber(e.target.value)}
                className="pl-12"
                required
              />
            </div>

            <Button
              type="submit"
              variant="neon"
              size="xl"
              className="w-full"
              disabled={!rollNumber.trim()}
            >
              Open Dashboard ✨
            </Button>
          </form>

          <div className="mt-6 p-4 rounded-xl glass text-left text-sm text-muted-foreground">
            <div className="flex gap-2 items-start">
              <Chrome className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p>
                Log in on the <strong>VNR portal</strong> in Chrome, run the <strong>Atten-Track</strong> extension,
                then open the dashboard. We never store your portal password.
              </p>
            </div>
          </div>

          {DEMO_ENABLED && (
            <div className="mt-6 pt-6 border-t border-glass-border space-y-3">
              <p className="text-sm text-muted-foreground">Development: load sample data via API</p>
              <div className="flex gap-2">
                {Object.keys(studentData).map((roll) => (
                  <Button
                    key={roll}
                    type="button"
                    variant="glass"
                    size="sm"
                    disabled={loadingDemo}
                    onClick={() => handleDemoLoad(roll)}
                  >
                    Demo {roll}
                  </Button>
                ))}
              </div>
              {demoError && <p className="text-xs text-destructive">{demoError}</p>}
            </div>
          )}

          <div className="mt-6 pt-6 border-t border-glass-border">
            <p className="text-sm text-muted-foreground">
              Example rolls:{' '}
              <span className="text-primary font-mono">23IT101</span>,{' '}
              <span className="text-primary font-mono">23IT102</span>
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="glass text-center p-4 rounded-xl hover-lift">
            <div className="text-2xl mb-2">📊</div>
            <p className="text-xs text-muted-foreground">Visual Charts</p>
          </div>
          <div className="glass text-center p-4 rounded-xl hover-lift">
            <div className="text-2xl mb-2">🎯</div>
            <p className="text-xs text-muted-foreground">Bunk Calculator</p>
          </div>
          <div className="glass text-center p-4 rounded-xl hover-lift">
            <div className="text-2xl mb-2">🔮</div>
            <p className="text-xs text-muted-foreground">Future Projection</p>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Home;
