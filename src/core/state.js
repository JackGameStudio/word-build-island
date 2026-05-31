/**
 * state.js
 * 全局 App 状态机 — 面板互斥
 */

import { AppState } from '../data/constants.js';

let state = AppState.IDLE;

const transitions = {
  [AppState.IDLE]:    [AppState.VOCAB, AppState.BUILD, AppState.CHEST],
  [AppState.VOCAB]:   [AppState.IDLE],
  [AppState.BUILD]:   [AppState.PREVIEW, AppState.IDLE],
  [AppState.PREVIEW]: [AppState.IDLE],
  [AppState.CHEST]:   [AppState.IDLE]
};

export function getState() {
  return state;
}

export function transition(newState) {
  const allowed = transitions[state];
  if (!allowed?.includes(newState)) {
    console.warn(`Invalid transition: ${state} → ${newState}`);
    return false;
  }
  state = newState;
  return true;
}

export function setState(s) {
  state = s;
}