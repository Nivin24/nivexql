import { useRef, useCallback, useState } from 'react';

interface Props {
  onResize: (delta: number) => void;
  direction?: 'horizontal' | 'vertical';
  className?: string;
}

export default function ResizeHandle({ onResize, direction = 'horizontal', className = '' }: Props) {
  const [dragging, setDragging] = useState(false);
  const startPos = useRef<number>(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setDragging(true);
    startPos.current = direction === 'horizontal' ? e.clientX : e.clientY;

    const onMove = (me: MouseEvent) => {
      const current = direction === 'horizontal' ? me.clientX : me.clientY;
      onResize(current - startPos.current);
      startPos.current = current;
    };
    const onUp = () => {
      setDragging(false);
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [direction, onResize]);

  const isH = direction === 'horizontal';
  return (
    <div
      onMouseDown={onMouseDown}
      className={`resize-handle flex-shrink-0 group flex items-center justify-center
        ${isH ? 'w-1 cursor-col-resize' : 'h-1 cursor-row-resize'}
        ${dragging ? 'bg-accent/40' : 'bg-surface-border hover:bg-accent/30'}
        transition-colors ${className}`}
    >
      <div className={`rounded-full bg-surface-border group-hover:bg-accent/60 transition-colors
        ${isH ? 'w-0.5 h-8' : 'h-0.5 w-8'}`} />
    </div>
  );
}
