import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Home from './pages/Home.jsx';
import Dashboard from './pages/Dashboard.jsx';

const NotFound = () => (
  <div className="min-h-screen flex items-center justify-center">
    <div className="glass-card text-center">
      <h1 className="text-4xl font-bold neon-text mb-4">404</h1>
      <p className="text-muted-foreground">Page not found</p>
    </div>
  </div>
);

const App = () => (
  <BrowserRouter>
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/dashboard" element={<Dashboard />} />
      <Route path="*" element={<NotFound />} />
    </Routes>
  </BrowserRouter>
);

export default App;
