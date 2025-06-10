import { Level } from 'level';
import { LEVEL_DB_DIR } from '../config';
import path from 'path';

function newStore(name: string): Level {
  return new Level<string, string>(path.join(LEVEL_DB_DIR, name));
}

export const queryResultStore = newStore('query-results');

export const deltasAcceptedStore = newStore('deltas-accepted');
