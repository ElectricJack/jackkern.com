import { projectArt } from '../../src/scene/project-art';

describe.each([false, true])('project art (mobile: %s)', mobile => {
  it('leaves Agent Queue on its original Matter-exported relief', () => {
    expect(projectArt('relief-a', mobile)).toBeNull();
  });

  it.each(['fountain-wall', 'statue-b'])('preserves the %s sculpture', id => {
    const asset = projectArt(id, mobile)!;
    expect(asset.geometry.boundingBox!.max.y).toBeGreaterThan(2);
    expect(asset.geometry.groups).toHaveLength(3);
    asset.geometry.dispose();
    for (const material of Array.isArray(asset.material) ? asset.material : [asset.material]) material.dispose();
  });
});
