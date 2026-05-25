import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GraduationCap } from 'lucide-react';
import FloatingShapes from '@/components/FloatingShapes';

const Home = () => {
  const navigate = useNavigate();

  useEffect(() => {
    // Auto-redirect to dashboard
    navigate('/dashboard');
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center relative p-4">
      <FloatingShapes />

      <div className="w-full max-w-md animate-slide-up">
        {/* Loading Card */}
        <div className="glass-card hover-lift text-center mb-8">
          <div className="mb-8">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-full glass border-glass-border neon-glow mb-6">
              <GraduationCap className="h-10 w-10 text-primary animate-glow" />
            </div>

            <h1 className="text-4xl md:text-5xl font-bold neon-text mb-4">
              🎓 Attendance Tracker
            </h1>

            <p className="text-muted-foreground text-lg">
              Loading your analytics dashboard...
            </p>

            <div className="mt-8">
              <div className="inline-block">
                <div className="h-2 w-24 bg-gradient-to-r from-primary to-purple-500 rounded-full animate-pulse"></div>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-glass-border">
            <p className="text-sm text-muted-foreground">
              Data from:{' '}
              <span className="text-primary font-mono">Chrome Extension</span>
            </p>
          </div>

          {/* Feature Cards */}
          <div className="mt-8 grid grid-cols-3 gap-3">
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
    </div>
  );
};

export default Home;
