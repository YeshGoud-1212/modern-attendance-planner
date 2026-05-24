import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, GraduationCap, Lock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import FloatingShapes from '@/components/FloatingShapes';

const Home = () => {
  const [rollNumber, setRollNumber] = useState('');
  const [password, setPassword] = useState('');
  const navigate = useNavigate();

  const handleSubmit = (e) => {
    e.preventDefault();
    if (rollNumber.trim()) {
      navigate(`/dashboard?roll=${rollNumber.toUpperCase()}`);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center relative p-4">
      <FloatingShapes />

      <div className="w-full max-w-md animate-slide-up">
        {/* Main Card */}
        <div className="glass-card hover-lift text-center mb-8">
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full glass border-glass-border neon-glow mb-6">
              <GraduationCap className="h-10 w-10 text-primary animate-glow" />
            </div>

            <h1 className="text-4xl md:text-5xl font-bold neon-text mb-4">
              🎓 Attendance Tracker
            </h1>

            <p className="text-muted-foreground text-lg">
              Track your attendance, calculate safe bunks, and stay on top of your academic goals!
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

            <div className="relative">
              <Lock className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground" />
              <Input
                type="password"
                placeholder="Enter Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-12"
                required
              />
            </div>

            <Button
              type="submit"
              variant="neon"
              size="xl"
              className="w-full"
              disabled={!rollNumber.trim() || !password.trim()}
            >
              Check Attendance ✨
            </Button>
          </form>

          <div className="mt-8 pt-6 border-t border-glass-border">
            <p className="text-sm text-muted-foreground">
              Demo Roll Numbers:{' '}
              <span className="text-primary font-mono">23IT101</span>,{' '}
              <span className="text-primary font-mono">23IT102</span>
            </p>
          </div>
        </div>

        {/* Feature Cards */}
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
