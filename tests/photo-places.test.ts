import { describe, it, expect } from 'vitest';
import { placePhoto, addPlace, forgetPhoto, FAR_KM } from '../src/studio/photo-places';
import { distanceKm, publicPosition, photoPosition } from '../src/lib/privacy';
import { validateEntry } from '../src/content/schemas';

const colton = { lat: 34.04, lng: -117.3 };
const woodville = { lat: 36.09, lng: -119.2 };

describe('photo GPS at upload', () => {
  it('does nothing for a photo without GPS', () => {
    expect(placePhoto({ ...colton }, '/src/assets/covers/a.jpg', {})).toEqual({});
  });

  it("fills an empty project location from the photo, to the Studio's usual 0.01°", () => {
    const { fill, farKm } = placePhoto({}, '/src/assets/covers/a.jpg', { lat: 34.04321, lng: -117.30987 });
    expect(fill).toEqual({ lat: 34.04, lng: -117.31 });
    expect(farKm).toBeUndefined();
  });

  it("records the photo's place rounded to the project's privacy setting", () => {
    const town = placePhoto({ ...colton, privacy: 'town' }, '/src/assets/covers/IMG_1.JPG', { lat: 34.0432, lng: -117.3098 });
    expect(town.key).toBe('img_1.jpg');
    expect(town.at).toEqual(publicPosition({ lat: 34.0432, lng: -117.3098, privacy: 'town' }));
    expect(town.at).toEqual({ lat: 34, lng: -117.3 });
    expect(placePhoto({ ...colton, privacy: 'region' }, 'b.jpg', { lat: 34.3, lng: -117.2 }).at).toEqual({ lat: 34.5, lng: -117 });
  });

  it('adds places as updates, so uploads at once keep each other', () => {
    const a = addPlace('a.jpg', colton), b = addPlace('b.jpg', woodville);
    expect(b(a(undefined))).toEqual({ 'a.jpg': colton, 'b.jpg': woodville });
  });

  it('flags a photo taken at another site, and only then', () => {
    expect(placePhoto({ ...colton }, 'a.jpg', { lat: 34.05, lng: -117.28 }).farKm).toBeUndefined();
    const far = placePhoto({ ...colton }, 'a.jpg', woodville);
    expect(far.farKm).toBeGreaterThan(FAR_KM);
    expect(far.farKm).toBe(Math.round(distanceKm(colton, woodville)));
    expect(far.fill).toBeUndefined(); // never moves the project
  });

  it('forgets a photo that leaves the project, unless it is still used', () => {
    const places = { 'a.jpg': colton, 'b.jpg': colton };
    const entry = { coverImage: '/c/a.jpg', gallery: ['/g/b.jpg'] };
    expect(forgetPhoto(entry, '/g/b.jpg')!(places)).toEqual({ 'a.jpg': colton });
    expect(forgetPhoto({ ...entry, gallery: ['/g/b.jpg', '/g/b.jpg'] }, '/g/b.jpg')).toBeNull();
    expect(forgetPhoto({ coverImage: '/c/a.jpg' }, '/c/a.jpg')!({ 'a.jpg': colton })).toBeUndefined();
    expect(forgetPhoto(entry, '/g/b.jpg')!(undefined)).toBeUndefined();
  });
});

describe('distance', () => {
  it('measures Colton to Woodville at about 300 km', () => {
    expect(distanceKm(colton, woodville)).toBeGreaterThan(280);
    expect(distanceKm(colton, woodville)).toBeLessThan(320);
    expect(distanceKm(colton, colton)).toBe(0);
  });
});

describe('where a project photo stands on the map', () => {
  const project = { lat: 38.7549, lng: -121.2873, privacy: 'site' as const };
  it("is the project's public position without a recorded place", () => {
    expect(photoPosition(project)).toEqual(publicPosition(project));
  });
  it('stays at the project when taken on the same site, so photos never map the work', () => {
    expect(photoPosition(project, { lat: 38.76, lng: -121.28 })).toEqual(publicPosition(project));
  });
  it('moves to its own site, rounded the same way, when taken elsewhere', () => {
    expect(photoPosition(project, { lat: 38.9, lng: -121.1 })).toEqual({ lat: 38.9, lng: -121.1 });
    expect(photoPosition({ ...project, privacy: 'region' }, { lat: 38.9, lng: -121.1 })).toEqual(publicPosition({ ...project, privacy: 'region' }));
  });
  it('shows nothing for a project kept off the map', () => {
    expect(photoPosition({}, colton)).toBeNull();
  });
});

describe('project schema', () => {
  it('accepts the photo places the Studio writes', () => {
    const ok = {
      title: 'T', client: 'C', siteType: 'S', status: 'complete', role: 'R', startDate: '2024', summary: 'x',
      photoPlaces: { 'a.jpg': { lat: 34, lng: -117.3 } },
    };
    expect(validateEntry('projects', ok)).toEqual({});
    expect(validateEntry('projects', { ...ok, photoPlaces: { 'a.jpg': { lat: 'x' } } })).toHaveProperty('photoPlaces');
  });
});
