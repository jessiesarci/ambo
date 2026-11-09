// La pianta della scena: dove riprende un omino quando gli cambia il percorso.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ripresa, type Punto } from '../web/src/scena/pianta.ts';

test('ripresa: da fermo prima del primo punto si passa dal primo punto (non si taglia l\'angolo)', () => {
  // Il fattorino da casa verso la stampante: saltare il primo punto lo faceva passare nel muro.
  const percorso: Punto[] = [[-2.2, 4.3], [-0.6, 4.3], [0.9, -1], [1.2, -5.6], [2.2, -6.3]];
  assert.equal(ripresa([-3.2, 5.6], percorso), 0);
});

test('ripresa: a metà di un tratto si va verso la sua fine, non indietro', () => {
  const percorso: Punto[] = [[0, 0], [0, -4], [4, -4]];
  assert.equal(ripresa([0, -2], percorso), 1);
  assert.equal(ripresa([2, -4], percorso), 2);
});
