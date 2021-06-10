// test/inox.js
//   Inox language test suite
//
// june 10 by jhr, create

const assert = require( "assert" );

const fs = require( "fs" );
const loader = require( "@assemblyscript/loader" );
const imports = { /* imports go here */ };
const wasmModule
= loader.instantiateSync(
  fs.readFileSync(
__dirname + "/build/optimized.wasm"
  ),
  imports
);

module.exports = wasmModule.exports;

console.log( "Hello Inox world!" );
