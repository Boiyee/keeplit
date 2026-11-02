import { test } from "node:test";
import assert from "node:assert/strict";
import { validate, type Reading } from "./validate.ts";

function base(): Reading {
  return {
    batteryPct: 78,
    batteryV: 51.2,
    loadW: 840,
    pvW: 1250,
    acInputOn: false,
    brand: "Growatt",
    confidence: "high",
    notes: "",
  };
}

test("a sane 48 V reading has no problems", () => {
  assert.deepEqual(validate(base()), []);
});

test("12 V and 24 V readings pass, including band edges", () => {
  for (const batteryV of [10.5, 12.8, 15.5, 21, 26.4, 31, 42, 54.4, 62]) {
    assert.deepEqual(validate({ ...base(), batteryV }), [], `batteryV ${batteryV}`);
  }
});

test("batteryPct 0 and 100 pass; outside fails and names the field and value", () => {
  assert.deepEqual(validate({ ...base(), batteryPct: 0 }), []);
  assert.deepEqual(validate({ ...base(), batteryPct: 100 }), []);
  for (const batteryPct of [-5, 101, 140]) {
    const problems = validate({ ...base(), batteryPct });
    assert.equal(problems.length, 1);
    assert.match(problems[0], new RegExp(`batteryPct ${batteryPct}`));
  }
});

test("batteryV between bands or outside them fails", () => {
  for (const batteryV of [0, 9.8, 15.6, 18, 20.9, 31.1, 41.9, 62.1, 70]) {
    const problems = validate({ ...base(), batteryV });
    assert.equal(problems.length, 1, `batteryV ${batteryV}`);
    assert.match(problems[0], new RegExp(`batteryV ${batteryV}`));
  }
});

test("negative power fails", () => {
  assert.match(validate({ ...base(), loadW: -50 })[0], /loadW -50/);
  assert.match(validate({ ...base(), pvW: -1 })[0], /pvW -1/);
});

test("power above the default 20000 W limit fails; exactly 20000 passes", () => {
  assert.deepEqual(validate({ ...base(), loadW: 20000, pvW: 20000 }), []);
  assert.match(validate({ ...base(), loadW: 25000 })[0], /loadW 25000/);
  assert.match(validate({ ...base(), pvW: 21000 })[0], /pvW 21000/);
});

test("custom limits are honored per field", () => {
  assert.equal(validate({ ...base(), loadW: 6000 }, { loadMaxW: 5000 }).length, 1);
  assert.match(validate({ ...base(), loadW: 6000 }, { loadMaxW: 5000 })[0], /loadW 6000/);
  assert.deepEqual(validate({ ...base(), pvW: 30000 }, { pvMaxW: 50000 }), []);
  assert.deepEqual(validate({ ...base(), loadW: 6000 }, { pvMaxW: 5000 }), []);
});

test("small decimals look like kW read as W", () => {
  for (const loadW of [2.4, 0.5, 29.99]) {
    const problems = validate({ ...base(), loadW });
    assert.equal(problems.length, 1, `loadW ${loadW}`);
    assert.match(problems[0], /kW/);
  }
  assert.match(validate({ ...base(), pvW: 1.2 })[0], /pvW 1\.2/);
});

test("integers, zero and large decimals are not flagged as kW", () => {
  for (const loadW of [0, 2, 29, 1500.5]) {
    assert.deepEqual(validate({ ...base(), loadW }), [], `loadW ${loadW}`);
  }
});

test("null fields are skipped, except when every reading field is null", () => {
  assert.deepEqual(validate({ ...base(), loadW: null, brand: null }), []);
  assert.deepEqual(validate({ ...base(), acInputOn: false, batteryPct: null, batteryV: null, loadW: null, pvW: null, brand: null }), []);
  const allNull: Reading = {
    batteryPct: null,
    batteryV: null,
    loadW: null,
    pvW: null,
    acInputOn: null,
    brand: null,
    confidence: "low",
    notes: "",
  };
  const problems = validate(allNull);
  assert.equal(problems.length, 1);
  assert.match(problems[0], /nothing readable/);
});

test("multiple problems accumulate", () => {
  const problems = validate({ ...base(), batteryPct: 140, batteryV: 18, loadW: -3, pvW: 2.4 });
  assert.equal(problems.length, 4);
  assert.match(problems.join("\n"), /batteryPct 140/);
  assert.match(problems.join("\n"), /batteryV 18/);
  assert.match(problems.join("\n"), /loadW -3/);
  assert.match(problems.join("\n"), /pvW 2\.4/);
});
