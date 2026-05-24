/**
 * KnightSchool engine worker.
 *
 * Wraps the Stockfish.wasm (Lite) build inside a classic Web Worker so the
 * main thread never sees engine work. Communicates with main thread via
 * postMessage and forwards/receives raw UCI strings.
 *
 * Protocol - main thread → worker:
 *   { type: 'init' }                - load Stockfish; replies with { type: 'ready' }
 *   { type: 'uci', cmd: 'go ...' }  - raw UCI command
 *   { type: 'stop' }                - convenience for stop
 *   { type: 'quit' }                - terminate engine cleanly
 *
 * Protocol - worker → main thread:
 *   { type: 'ready' }
 *   { type: 'uci', line: '...' }    - raw UCI output from engine
 *   { type: 'error', message: ... } - fatal load / runtime errors
 *   { type: 'log', stage, ... }     - diagnostic milestones for debugging
 */

/* eslint-disable no-undef */
'use strict';

let sf = null;
let initInFlight = null;

function diag(stage, extra) {
  try {
    postMessage({ type: 'log', stage, ...(extra ?? {}) });
  } catch {}
}

self.addEventListener('error', (e) => {
  diag('self.error', { message: e.message, filename: e.filename, lineno: e.lineno });
});

self.addEventListener('unhandledrejection', (e) => {
  const reason = e.reason;
  const message = reason && reason.message ? reason.message : String(reason);
  diag('self.unhandledrejection', { message });
});

function loadStockfishFactory() {
  diag('importScripts:start');
  importScripts('./stockfish.js');
  diag('importScripts:done', {
    hasStockfish: typeof Stockfish,
    hasSharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
    crossOriginIsolated:
      typeof crossOriginIsolated !== 'undefined' ? crossOriginIsolated : 'unknown',
  });
  if (typeof Stockfish !== 'function') {
    throw new Error('Stockfish factory not found after importScripts (typeof=' + typeof Stockfish + ')');
  }
  return Stockfish;
}

async function init() {
  if (sf) return;
  if (initInFlight) return initInFlight;

  initInFlight = (async () => {
    try {
      diag('init:start', { location: self.location.href });
      const factory = loadStockfishFactory();
      // Tell Stockfish where stockfish.js lives so the pthread sub-workers can
      // re-importScripts it themselves. Without this, the sub-worker receives
      // urlOrBlob=undefined and throws on URL.createObjectURL(undefined).
      const sfUrl = new URL('./stockfish.js', self.location.href).href;
      diag('factory:invoking', { mainScriptUrlOrBlob: sfUrl });
      const startMs = Date.now();
      sf = await factory({ mainScriptUrlOrBlob: sfUrl });
      diag('factory:resolved', {
        elapsedMs: Date.now() - startMs,
        sfType: typeof sf,
        hasAddListener: sf && typeof sf.addMessageListener,
        hasPostMessage: sf && typeof sf.postMessage,
      });

      if (!sf || typeof sf.addMessageListener !== 'function' || typeof sf.postMessage !== 'function') {
        throw new Error('Stockfish factory resolved but missing required API methods.');
      }

      sf.addMessageListener((line) => {
        if (line == null || line === '') return;
        postMessage({ type: 'uci', line });
      });
      sf.postMessage('uci');
      // KnightSchool spec hardcodes Multi-PV to 3. Set once at boot - sending
      // setoption around or during a search is poorly specified in UCI.
      sf.postMessage('setoption name MultiPV value 3');
      sf.postMessage('setoption name Threads value 1');
      sf.postMessage('isready');
      diag('init:complete');
      postMessage({ type: 'ready' });
    } catch (err) {
      const message = err && err.message ? err.message : String(err);
      diag('init:error', { message });
      postMessage({ type: 'error', message });
      throw err;
    } finally {
      initInFlight = null;
    }
  })();

  return initInFlight;
}

self.onmessage = async (e) => {
  const msg = e.data;
  if (!msg || typeof msg !== 'object') return;

  try {
    switch (msg.type) {
      case 'init':
        await init();
        break;
      case 'uci':
        if (!sf) await init();
        sf.postMessage(String(msg.cmd));
        break;
      case 'stop':
        if (sf) sf.postMessage('stop');
        break;
      case 'quit':
        if (sf) sf.postMessage('quit');
        setTimeout(() => self.close(), 50);
        break;
      default:
        postMessage({ type: 'error', message: `Unknown message type: ${msg.type}` });
    }
  } catch (err) {
    const message = err && err.message ? err.message : String(err);
    postMessage({ type: 'error', message });
  }
};
