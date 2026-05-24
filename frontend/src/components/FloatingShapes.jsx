import React, { useMemo } from 'react';

const FloatingShapes = () => {
  const shapes = useMemo(
    () =>
      Array.from({ length: 6 }, (_, i) => ({
        id: i,
        width: Math.random() * 100 + 50,
        height: Math.random() * 100 + 50,
        left: Math.random() * 100,
        top: Math.random() * 100,
        delay: Math.random() * 6,
        duration: Math.random() * 4 + 4,
      })),
    []
  );

  return (
    <div className="floating-shapes">
      {shapes.map((s) => (
        <div
          key={s.id}
          className="floating-shape"
          style={{
            width: `${s.width}px`,
            height: `${s.height}px`,
            left: `${s.left}%`,
            top: `${s.top}%`,
            animationDelay: `${s.delay}s`,
            animationDuration: `${s.duration}s`,
          }}
        />
      ))}
    </div>
  );
};

export default FloatingShapes;
