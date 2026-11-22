import test from 'node:test';
import assert from 'node:assert/strict';
import { nextEpisodeId, parseVideoId } from '../src/stremio/ids.js';

test('parses IMDb movie and episode ids', () => {
  assert.deepEqual(parseVideoId('tt0111161'), { kind: 'imdb', imdbId: 'tt0111161', season: null, episode: null });
  assert.deepEqual(parseVideoId('tt15483602:2:5'), { kind: 'imdb', imdbId: 'tt15483602', season: 2, episode: 5 });
});

test('parses anime ids from every supported catalog', () => {
  assert.deepEqual(parseVideoId('kitsu:46917:3'), { kind: 'anime', prefix: 'kitsu', animeId: '46917', episode: 3 });
  assert.deepEqual(parseVideoId('mal:5114'), { kind: 'anime', prefix: 'mal', animeId: '5114', episode: null });
});

test('rejects ids it cannot serve', () => {
  assert.equal(parseVideoId('tmdb:123'), null);
  assert.equal(parseVideoId('kitsu:abc:1'), null);
  assert.equal(parseVideoId(''), null);
});

test('next episode keeps the id family; movies have none', () => {
  assert.equal(nextEpisodeId(parseVideoId('tt15483602:2:5')), 'tt15483602:2:6');
  assert.equal(nextEpisodeId(parseVideoId('kitsu:46917:3')), 'kitsu:46917:4');
  assert.equal(nextEpisodeId(parseVideoId('tt0111161')), null);
});
