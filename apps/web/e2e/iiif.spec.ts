import { expect, test } from '@playwright/test';
import { iiifImages } from '../src/editor/iiif-images';

for (const [image, source] of Object.entries(iiifImages))
  test(`live ${image} IIIF tiles deepen on zoom and annotations stay aligned`, async ({ page }) => {
    test.setTimeout(90000);
    const tiles: string[] = [];
    const base = source.info.replace('/info.json', '');
    const failures: string[] = [];
    page.on('pageerror', (error) => failures.push(error.message));
    page.on('response', (response) => {
      if (response.ok() && response.url().startsWith(base) && /\/(default|color)\.(jpg|png|webp)/.test(response.url()))
        tiles.push(response.url());
    });
    await page.goto(
      `/iframe.html?id=scenarios-iiif-deep-zoom--${
        image === 'bodleian' ? 'bodleian-scan' : 'wellcome-page'
      }&viewMode=story`
    );
    await expect(page.getByTestId('atlas-stage')).toHaveAttribute('data-ready', 'true', { timeout: 45000 });
    await expect.poll(() => tiles.length, { timeout: 45000 }).toBeGreaterThan(0);
    const read = async () => JSON.parse((await page.getByTestId('atlas-interaction').textContent()) || '{}');
    const before = (await read()).scale;
    function resolution(url: string) {
      const parts = url.substring(base.length + 1).split('/');
      const region = parts[0].split(',').map(Number),
        output = Number(parts[1].split(',')[0]);
      return region.length === 4 && output > 0 && region[2] > 100 ? region[2] / output : Infinity;
    }
    const coarse = Math.min(...tiles.map(resolution));
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await page.getByRole('button', { name: 'Zoom in', exact: true }).click();
    await expect.poll(async () => (await read()).scale, { timeout: 15000 }).toBeLessThan(before * 0.8);
    await expect.poll(() => Math.min(...tiles.map(resolution)), { timeout: 45000 }).toBeLessThan(coarse * 0.8);
    const overlay = page.getByLabel('Atlas polygon overlay');
    await overlay.scrollIntoViewIfNeeded();
    const client = await overlay.evaluate(
      (element, point) => {
        const position = new DOMPoint(point[0], point[1]).matrixTransform((element as SVGSVGElement).getScreenCTM()!);
        return { x: position.x, y: position.y };
      },
      [source.width / 2, source.height / 2]
    );
    await page.mouse.click(client.x, client.y);
    await expect
      .poll(async () => JSON.parse((await page.getByTestId('atlas-shape').textContent()) || '{}').points.length)
      .toBe(1);
    const points = JSON.parse((await page.getByTestId('atlas-shape').textContent()) || '{}').points;
    const tolerance = 2 * (await read()).scale;
    expect(Math.abs(points[0][0] - source.width / 2)).toBeLessThan(tolerance);
    expect(Math.abs(points[0][1] - source.height / 2)).toBeLessThan(tolerance);
    await page.getByRole('button', { name: 'Fit image', exact: true }).click();
    await expect
      .poll(async () => Math.abs((await read()).scale - before) / before, { timeout: 15000 })
      .toBeLessThan(0.05);
    expect(JSON.parse((await page.getByTestId('atlas-shape').textContent()) || '{}').points).toEqual(points);
    expect(failures).toEqual([]);
  });
