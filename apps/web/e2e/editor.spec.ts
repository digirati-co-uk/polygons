import { expect, test, type Locator } from '@playwright/test';
async function coordinates(el: Locator, point: [number, number]) {
  return el.evaluate((element, p) => {
    const result = new DOMPoint(...p).matrixTransform((element as SVGSVGElement).getScreenCTM()!);
    return { x: result.x, y: result.y };
  }, point);
}
async function shape(output: Locator) {
  return JSON.parse((await output.textContent()) || '{}');
}

test('native captured drag commits its final release and undo restores the baseline', async ({ page }) => {
  await page.goto('/iframe.html?id=editor-polygons--playground&args=tool:box&viewMode=story');
  const svg = page.getByRole('application');
  await svg.scrollIntoViewIfNeeded();
  const from = await coordinates(svg, [100, 100]),
    to = await coordinates(svg, [320, 240]);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y);
  await page.mouse.up();
  await expect.poll(async () => (await shape(page.getByTestId('shape-state'))).points.length).toBe(4);
  const points = (await shape(page.getByTestId('shape-state'))).points;
  expect(points[2][0]).toBeCloseTo(320, 0);
  expect(points[2][1]).toBeCloseTo(240, 0);
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await shape(page.getByTestId('shape-state'))).points).toEqual([]);
});

test('touch taps draw without hover', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Real touchscreen input is exercised in the portrait project.');
  await page.goto('/iframe.html?id=editor-polygons--playground&viewMode=story');
  const svg = page.getByRole('application');
  await svg.scrollIntoViewIfNeeded();
  for (const point of [
    [100, 100],
    [300, 100],
    [200, 300],
  ] as [number, number][]) {
    const at = await coordinates(svg, point);
    await page.touchscreen.tap(at.x, at.y);
  }
  await expect.poll(async () => (await shape(page.getByTestId('shape-state'))).points.length).toBe(3);
  await page.getByRole('button', { name: 'Finish', exact: true }).click();
  await expect.poll(async () => (await shape(page.getByTestId('shape-state'))).open).toBe(false);
});

test('OS touch cancellation discards an unsaved box', async ({ page, isMobile, context }) => {
  test.skip(!isMobile, 'Touch cancellation uses Chromium touch input.');
  await page.goto('/iframe.html?id=editor-polygons--playground&args=tool:box&viewMode=story');
  const svg = page.getByRole('application');
  await svg.scrollIntoViewIfNeeded();
  const from = await coordinates(svg, [100, 100]),
    to = await coordinates(svg, [320, 240]);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...from, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...to, id: 1 }] });
  await expect(page.getByTestId('draft-shape')).toBeVisible();
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchCancel', touchPoints: [] });
  await expect(page.getByTestId('draft-shape')).toHaveCount(0);
  expect((await shape(page.getByTestId('saved-state'))).points).toEqual([]);
});

test('a second real touch cancels editing until every contact lifts', async ({ page, isMobile, context }) => {
  test.skip(!isMobile, 'Multiple contacts use Chromium touch input.');
  await page.goto('/iframe.html?id=editor-polygons--playground&args=tool:box&viewMode=story');
  const svg = page.getByRole('application');
  await svg.scrollIntoViewIfNeeded();
  const from = await coordinates(svg, [100, 100]),
    to = await coordinates(svg, [300, 240]),
    second = await coordinates(svg, [450, 240]);
  const cdp = await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ ...from, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...to, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { ...to, id: 1 },
      { ...second, id: 2 },
    ],
  });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [{ ...to, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ ...second, id: 1 }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  expect((await shape(page.getByTestId('shape-state'))).points).toEqual([]);
});

for (const id of ['canvas-origin', 'offset-canvas'])
  test(`Atlas forwards native input for ${id}`, async ({ page }) => {
    await page.goto(`/iframe.html?id=integration-atlas--${id}&viewMode=story`);
    await expect(page.getByTestId('atlas-stage')).toHaveAttribute('data-ready', 'true');
    await expect(page.locator('canvas').first()).toHaveCSS('cursor', 'crosshair');
    const svg = page.getByLabel('Atlas polygon overlay');
    await expect(svg).toBeVisible();
    await expect
      .poll(async () => Number(await svg.getAttribute('width')) || (await svg.boundingBox())?.width || 0)
      .toBeGreaterThan(0);
    // Wait for Atlas home positioning, then send browser events to its canvas.
    await expect
      .poll(async () => JSON.parse((await page.getByTestId('atlas-interaction').textContent()) || '{}').scale)
      .toBeGreaterThan(0);
    const first = await coordinates(svg, [100, 100]);
    await page.mouse.click(first.x, first.y);
    await expect.poll(async () => (await shape(page.getByTestId('atlas-shape'))).points.length).toBe(1);
    const result = (await shape(page.getByTestId('atlas-shape'))).points[0];
    const tolerance = 2 * JSON.parse((await page.getByTestId('atlas-interaction').textContent()) || '{}').scale;
    expect(Math.abs(result[0] - 100)).toBeLessThan(tolerance);
    expect(Math.abs(result[1] - 100)).toBeLessThan(tolerance);
  });

test('feature scenarios remain interactive and the dense scene can switch and edit boxes', async ({ page }) => {
  await page.goto('/iframe.html?id=scenarios-many-boxes--dense-annotation-page&viewMode=story');
  await expect(page.getByTestId('snap-source')).toHaveCount(40);
  await expect(page.getByTestId('bounding-box-handle')).toHaveCount(4);
  await page.getByRole('button', { name: 'Select Box 1', exact: true }).click();
  await expect.poll(async () => (await shape(page.getByTestId('saved-state'))).id).toBe('Box 1');
  await expect(page.getByTestId('bounding-box-handle')).toHaveCount(4);
  await page.getByRole('button', { name: 'Add box', exact: true }).click();
  await expect.poll(async () => (await shape(page.getByTestId('interaction-state'))).tool).toBe('box');
  const svg = page.getByRole('application');
  await svg.scrollIntoViewIfNeeded();
  const start = await coordinates(svg, [100, 560]),
    end = await coordinates(svg, [250, 610]);
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  await page.mouse.move(end.x, end.y);
  await page.mouse.up();
  await expect.poll(async () => (await shape(page.getByTestId('shape-state'))).points.length).toBe(4);
  await expect(page.getByText('42 annotations', { exact: true })).toBeVisible();
});

test('native curve control edits change the curve and undo restores its controls', async ({ page }) => {
  await page.goto('/iframe.html?id=scenarios-draw-and-edit--shape-a-curve&viewMode=story');
  const svg = page.getByRole('application');
  await svg.scrollIntoViewIfNeeded();
  const before = (await shape(page.getByTestId('shape-state'))).points;
  const start = await coordinates(svg, [160, 60]),
    end = await coordinates(svg, [190, 30]);
  await page.mouse.move(start.x, start.y);
  await expect(svg).toHaveCSS('cursor', 'grab');
  await page.mouse.down();
  await page.mouse.move(end.x, end.y);
  await page.mouse.up();
  await expect.poll(async () => (await shape(page.getByTestId('shape-state'))).points[0][2]).not.toBe(before[0][2]);
  const changed = (await shape(page.getByTestId('shape-state'))).points;
  expect(changed[0].slice(0, 2)).toEqual(before[0].slice(0, 2));
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect.poll(async () => (await shape(page.getByTestId('shape-state'))).points).toEqual(before);
});
