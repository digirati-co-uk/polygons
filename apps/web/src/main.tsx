import { lazy, StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { PolygonEditor } from './editor/PolygonEditor';
import './style.css';
const AtlasExample = lazy(() => import('./editor/AtlasExample').then((module) => ({ default: module.AtlasExample })));
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <nav className="demo-nav">
      <strong>Polygons</strong>
      <a href="http://localhost:6006">Storybook scenarios</a>
      <a href="/">Playground</a>
      <a href="/atlas">Viewport integration</a>
    </nav>
    {window.location.pathname === '/atlas' ? (
      <Suspense fallback={<p>Loading viewer…</p>}>
        <AtlasExample />
      </Suspense>
    ) : (
      <PolygonEditor touch={window.matchMedia('(pointer: coarse)').matches} />
    )}
  </StrictMode>
);
