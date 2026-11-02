import { createElement, type ComponentType } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import RoadmapSignIn from '../../apps/web/src/components/roadmap-sign-in.tsx';

it('does not offer development-session creation when unavailable', () => {
  const component = RoadmapSignIn as unknown as ComponentType<{
    developmentSignInAvailable: boolean;
  }>;
  const html = renderToStaticMarkup(
    createElement(component, { developmentSignInAvailable: false }),
  );

  expect(html).not.toContain('Open development workspace');
  expect(html).toContain('Google sign-in is not available in this environment yet.');
});
