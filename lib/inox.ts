/* inox.js
 *   Inox is a multi dialect basic/forth/smalltalk/lisp/prolog/erlang inspired
 * minimalist concatenative functional dynamic programming language.
 *
 * june 3 2021 by jhr
 * june 7 2021 by jhr, move from .js to .ts, ie Typescript, AssemblyScript
 * june 10 2021 by jhr, .nox file extension
 */

import { assert } from "console";

function inox(
  json_state : string,
  json_event : string,
  source     : string
) : string {

// Starts running an Inox machine, returns a json encoded new state.
// ToDo: return diff instead of new state
// The source parameter is a string, maybe the content of a .nox text file.

// Inox targets the webassembly virtual machine but runs on other
// architectures too.
// It is a multi dialect language because it values diversity.
//
// Main entities:
// Cells - that's what memory is made of.
// Acts  - aka activation records or closures.
// Tasks - they run code in a cooperative manner.
//
// Type of values:
// Symbol        - #such_names are efficient, both speed and memory usage
//  void         - void is void is void, singleton. integer 0
//  undefined    - pretty much like javascript's undefined, singleton
//  free         - unbound, see prolog
//  nil          - empty list, (), singleton, see lisp
//  true         - boolean. integer 1 actualy
//  false        - boolean. integer 0 actualy
//  fail         - like in Icon; integer -1. ToDo: without a cause?
// Magnitude     - More or less, see smalltalk
//  Number       - how much?
//   Complex     - I know, sorry about thatou may skip it
//    Real       - whatever that means
//     Rational  - Not so much
//      Integer  - a kind of Number I guess, native size, minus decoration
//      Unsigned - unsigned integers, eqv webassembly's usize
//      i8, u8, i6, u16, i32, u32, i64, u64 - webassembly
// Float         - another kind of numbers, huge
//  f32, f64     - webassembly
//
// String        - like in javascript, immutable, not 0 terminated like in C
// Any           - webassembly's anyref
//
// Address       - address of a byte in memory
// Cell          - a pointer to a memory cell, each type/name/value
// Object        - they have an id and their name is the name of their class
//   Box         - a proxy to a value typically, adds an indirection level
//   Collection
//     Lists     - linked, with an head and the rest, enumerable
//     Array     - indexed, 0 based
//     v128      - webassembly, a vector, possibly 16 bytes
//     Maps      - between keys and values
//     Set       - with members
//     Reactive  - ToDo: reactive sets,
//                 see https://github.com/ReactiveSets/toubkal
//
// Values versus objects: values of types List, Array, Map, Object, Cell,
// Act and Task are actualy references to same mutable underlying value. The
// values with other types are immutable. There should be some immutable
// version of List, Array and Map to improve safety and favor functional
// programming style.
//
// This is the reference implementation. It defines the syntax and semantic
// of the language. Production quality version of the virtual machine would
// have to be hard coded in some machine code to be efficient.
//
// To the reader: this source file is meant to be read as an essay about
// software in the late 1980 / early 2000, a 40 years period of time when
// everything was so new about software and computers. I figured out that
// some anecdoctes may interest the historians in some potential future.
// Dedicated to my children, Lucas and Marie-Louise.


//## dialect-typescript;
// This compilation directive tells the Inox compiler to switch to javascript
// ToDo: implement that dialect and make sure this current file complies to it.
// The first characters of a file define the syntax for comments.
// Anything before a whitespace is a "start of comment", if it is longer than
// one character then it its the start of of a "multi line comment" with the
// the end of comment being the same characters except for the first one that
// becomes the ending characters. That works for /* and */ and other syntaxes.
// Characters after the first multi line comment define the one line comment.

// Inspiration

// Forth. When I started programming, on a Commodore VIC20, the standard
// language was BASIC. Soon a Forth "cartridge" became commercialy available.
// I ordered it. It took forever to be delivered. When I plugged it I
// basically got totally lost. Much like when I first saw the 2001 movie
// by Stanley Kubrick. It took me years to understand. What attracted me
// initialy was speed and compactness. VIC20 had only 3.5kb of memory and
// BASIC was slow. 6502 machine code was out of my league at the time, I
// was 15 and no experience with programming. That was in 1981 I think, 82
// maybe.
// See https://en.wikipedia.org/wiki/Commodore_VIC-20
//
// BASIC. Program is store in memory in a very compact form using "tokens".
// REM starts a comment, DIM declares an array, GOSUB <LineNumber>, etc.
// See https://www.infinite-loop.at/Power20/Documentation/Power20-ReadMe/AA-VIC-20_BASIC.html
// Inox uses tokens to store code. Each instructions is a 16 bits word.
// Some instructions are builtins, other are user defined. They are both
// named "words". Like in Forth a word can execute in interpreted mode
// or in compile mode. In the later case, during source parsing, the
// word can prepare stuff to be used when in interpreted mode, compute
// relative jumps for example.
//
// Inox is stack based like Forth and token based like BASIC. Using
// dialects, it is possible to mix vocabularies from different languages
// in the same source file. That way, you can leverage your past
// knowledge and feel at home right away. Almost.


de&&bug( "Inox starting..." );

// my de&&bug darling
function bug( msg: string ){
  console.log( msg );
}
var de : boolean = true;
const mand = function( condition ){
  if( condition )return;
  assert( false );
};


assert( de ); // Not ready for production, please wait :)
de&&mand( de );

// Make it work in the javascript machine, it's the portable scheme.
// When compiled using AssemblyScript some changes are required.
const PORTABLE = true;

/// ToDo: if( PORTABLE ){

// ToDo: should do that when?
// require( "assemblyscript/std/portable" );

// Let's say Typescript is AssemblyScript for a while (june 7 2021)
type i8    = number;
type u8    = number;
type i16   = number;
type u16   = number;
type i32   = number;
type u32   = number;
type isize = number;
type usize = number;
type u64   = number;
type float = number;

// } // PORTABLE

type  InoxAddress     = u32; // Abritrary address in VM memory, aka a pointer
type  InoxIndex       = u16; // Index in either builtins or words dictionaries
type  InoxValue       = u32; // payload, sometimes an index, sometimes a pointer
type  InoxWord        = u16; // Smallest entities at qn InoxAddress in VM memory
type  Cell            = u32; // Pointer to a cell's value
type  InoxInfo        = u32; // type & name info
type  InoxType        = u8;  // packed with name, 3 bits, 8 types
type  InoxName        = u32; // 29 bits actually, type + info is 32 bits
const size_of_word    = 2;   // 2 bytes, 16 bits
const size_of_cell    = 8;   // 8 bytes, 64 bits
const size_of_value   = 4;   // 4 bytes, 32 bits
const words_per_cell  = size_of_cell  / size_of_word; // 4
const words_per_value = size_of_value / size_of_word; // 2

// In memory, the value is stored first, then the type & name info
const offset_of_cell_info = size_of_value / size_of_word;



/* ---------------------------------------------------------------------------
 *  Low level memory management.
 *  The Inox virtual machine uses an array of 16 bits words to store both
 *  the content of "cells" (2 words) and arrays of "codes" (1 word). A
 *  cell is the basic value manipulated everywhere. A code is a token that
 *  reference either a javascript defined builtin or an Inox defined word.
 *  The notion of user defined "word" comes from the Forth language.
 */

// ToDo: if( PORTABLE ){

// Portable versions of load() and store()
// For the webassembly version, see https://wasmbyexample.dev/examples/webassembly-linear-memory/webassembly-linear-memory.assemblyscript.en-us.html


// This is "the data segment" of the virtual machine.
// the "void" first cell is allocated at absolute address 0.
// That array of 32 bits words is indexed using 32 bits addresses
// with odd addresses to address 16 bits words.
// 16 bits is the standard size for UTF16 enconded strings.
// ToDo: study webassembly modules
// See https://webassembly.github.io/spec/core/syntax/modules.html
const memory8 = new ArrayBuffer( 1024 * 16 ); // 16 kb
const memory16 = new Uint16Array( memory8 );
const memory32 = new Uint32Array( memory8 );

function load32( index : InoxAddress ) : u32 {
  // The right shift translates 16 bits aligned addresses into 32 bits ones
  let value = memory32[ index >>> 1 ];
  // de&&bug( "Load 32 @" + index + " " + value );
  return value;
}

function store32( index : InoxAddress, value : InoxValue ) : void {
   memory32[ index >>> 1 ] = value;
   // de&&bug( "store 32 @ " + index + " " + value );
   de&&mand( load32( index ) == value );
}

function load16( index : InoxAddress ) : u16 {
  let word : InoxWord = memory16[ index ];
  // de&&bug( "Load 16 @ " + index + " " + word );
  return word;
}

function store16( index : InoxAddress, word : InoxWord ) : void {
  memory16[ index ] = word;
  // de&&bug( "store16 @" + index + " " + word );
  de&&mand( load16( index ) == word );
}

// Not portable version is AssemblyScript syntax
// ToDo: figure out what @inline means exactly
// ToDo: figure out some method to avoid the right shift when
// optimizing for speed instead of for memory
// The resulting vm would then have access to less cells,
// half of them, but faster.
// }
if( ! PORTABLE ){ /*

@inline function load32( index : InoxAddress ) : u32 {
  return load< u32 >( index << 1 );
}

@inline function store32( index : InoxAddress, value : InoxValue ) : void {
  store< InoxValue >( index << 1, value );
}

@inline function load16( index : InoxAddress ) : u16 {
  return load< u16 >( index << 1 );
}

@inline function store16( index : InoxAddress, value : u16 ) : void {
  store< u16 >( index << 1, value );
}

*/} // ! PORTABLE?

// 0 means diffent things depending on the context, it is "void",
// "false", "nop" instruction code, null object, etc.
const _ = 0; // undefined;


/* -----------------------------------------------------------------------------
  *  Cell
  *
  *  A memory cell seats at an address and has a type, a value and a name.
  *  When type is "list", the name is the address of the rest of the list.
  *  Else it is a "symbol", a fixed abritrary value. In some languages
  *  like Lisp a symbol are called an "atom".
  *
  *  The encoding stores all of that in a 64 bits word.
  *  cell's type is a numeric id, 0..7
  *  cell's name is the address of a Symbol type of cell (xor next in lists).
  *  cell's value depends on type, often a pointer to some object.
  *
  *  eqv C like struct Cell {
  *    value : InoxValue; // 32 bits word
  *    info  : InoxInfo;  // packed type & name
  *  };
  *
  *  ToDo: add sugar syntax to tranform xxx's yyy into xxx.yyy
  *  and/or yyy of xxx into xxx.yyy.
  *  Inox is expected to be a "user friendly" language, like BASIC.
  *
  *  This architecture, with named values, is classicaly called a
  *  tagged architecture.
  *  See https://en.wikipedia.org/wiki/Tagged_architecture
  */

// In this implementation, the name is a 29 bits pointer that points
// to 16 bits words, this is equivalent to a 30 bits pointer
// pointing to bytes. That's 1 giga bytes and 256 millions of cells.
//
// Possible layouts :
//  32 bits values, 3 bits types, 29 bits addresses, 4 bytes per cell
//  40 bits values, 3 bits types, 25 bits addresses, 5 bytes per cell
//  48 bits values, 3 bits types, 15 bits addresses, 6 bytes per cell
//  16 bits values, 3 bits types, 13 bits addresses, 128 kb, 8k words
//  The layout could also vary according to the type.
//
// I used these named values 30 years ago, when I designed the
// object oriented version of a scriting language named Emul. It was
// used in a single project, a network supervision system named SAGE.
// SAGE managed X25 devices that could interop with the french public
// data network named Transpac. The Minitel national program used that
// network to serve 1200 bauds clients using X25 connected servers.
// It all exploded when Internet arrived, circa 1995 approximatly.
// I survived. That makes me a software "veteran" I guesss.

abstract class CellContent {
// A memory cell has an address, a type, a value and a name maybe.
// When the type is "list", the name is the address of the rest of the list.
// The encoding stores all of that in a 64 bits word.
// Derived classes defines additional methods.

    type  : InoxType;  // 0..7
    name  : Cell;      // address of some other memory cell
    value : InoxValue; // value depends on type, often a pointer to an object

    constructor( cell : Cell ){
      let info : InoxInfo = fetch_info( cell );
      this.type  = unpack_type( info );
      this.name  = unpack_name( info );
      this.value = fetch_value( cell );
    }

}

// cell number 0 is reserved, special, 0/0/0, void/void/void
let first_cell = 0;


if( ! PORTABLE ){/*
  first_cell = heap.alloc( 1024 ); // Some initial memory, expanded later
*/}

// Some basic memory allocation, purely growing.
// This is like sbrk() on Unix
// See https://en.wikipedia.org/wiki/Sbrk
// There is some reallocation of cells when some of them are
// freed, see fast_allocate_cell()
// ToDo: some C style malloc()/free() combo.
let next_cell : InoxAddress = first_cell;

function allocate_cell() : Cell {
  let top = next_cell;
  // Each cell is made of 4 16 bits words
  next_cell += words_per_cell;
  return top;
}

function allocate_bytes( size : InoxValue ) : InoxAddress {
  // Align on 64 bits, size of cell
  var aligned_size
  = ( size + ( size_of_cell - 1 ) )
  & ( 0xffffffff - ( size_of_cell - 1 ) );
  // ToDo: malloc() style allocation?
  var top = next_cell;
  // Divide by 2 because memory is 16 bits words, not bytes
  next_cell += ( aligned_size / size_of_word );
  de&&mand( load32( top ) == 0 );
  return top;
}

function free_bytes( address : InoxAddress, size : InoxValue ){
  // ToDo: add to pool for malloc()
  // ToDo: a simple solution is to split the array into cells
  // and call free_cell() for each of them. That's easy.
}

// @inline
function store( address : InoxAddress, value : InoxAddress ) : void {
  store32( address, value );
  de&&mand( fetch( address ) == value );
}

// @inline
function fetch( address : InoxAddress ) : InoxAddress {
  return load32( address );
}

// @inline
function store_value( cell : Cell, value : InoxValue ) : void {
  store32( cell, value );
  de&&mand( fetch_value( cell ) == value );
}

// @inline
function fetch_value( cell : Cell ) : InoxValue {
  return load32( cell );
}
const get_cell_value = fetch_value;

// @inline
function store_info( cell : Cell, info : InoxInfo ) : void {
  store32( cell + offset_of_cell_info, info );
  de&&mand( fetch_info( cell ) == info );
}

// @inline
function fetch_info( cell : Cell ) : InoxAddress {
  return load32( cell + offset_of_cell_info );
}

// @inline
function pack( type : InoxType, name : InoxName ) : InoxInfo {
// Pack type and name together.
  // Name is a 64 bits aligned pointer to a symbol type of cell
  let pack = name << 3 | type;
  de&&mand( unpack_type( pack ) == type );
  de&&mand( unpack_name( pack ) == name );
  return pack
}

// @inline
function unpack_type( value : InoxValue ) : InoxType {
  return value & 0x7; // 3 bits
}

// @inline
function unpack_name( value : InoxValue ) : InoxName {
  return value >>> 3;
}

function make_cell(
  type : InoxType, name : InoxName, value : InoxValue
) : Cell {
  let cell :InoxAddress = allocate_cell();
  store_cell( cell, type, name, value );
  de&&mand( get_cell_type(  cell ) == type );
  de&&mand( get_cell_name(  cell ) == name );
  de&&mand( get_cell_value( cell ) == value );
  return cell;
}

function store_cell(
  cell : Cell, type : InoxType, name : InoxName, value : InoxValue
) : void {
  // Store value first
  store32( cell, value );
  // Pack type and name together
  store32( cell + offset_of_cell_info, pack( type, name ) );
  de&&mand( get_cell_type(  cell ) == type );
  de&&mand( get_cell_name(  cell ) == name );
  de&&mand( get_cell_value( cell ) == value );
}

function fetch_cell( cell : Cell ) : CellContent {
  let info  = fetch_info(  cell );
  let value = fetch_value( cell )
  // Unpack type and name
  return {
    type:  unpack_type( info ),
    name:  unpack_name( info ),
    value: value
  };
}

function get_cell_type( cell : Cell ) : InoxType {
// Returns the type of a cell
  return unpack_type( fetch_info( cell ) );
}
const fetch_type = get_cell_type;

function get_cell_name( cell : Cell ) : InoxName {
// Returns the name of a cell, as a Symbol id
  return unpack_name( fetch_info( cell ) );
}
const fetch_name = get_cell_name;

// @inline
function get_next_cell( cell : Cell ) : Cell {
// Assuming cell is a list member, return next cell in list
  return unpack_name( fetch_info( cell ) );
}

function set_next_cell( cell : Cell, next : Cell ) : void {
// Assuming cell is a list member, set the next cell in list
  // ToDo: assume type is 0 maybe?
  let info = fetch_info( cell );
  let type = unpack_type( info );
  store_info( cell, pack( type, next ) );
  de&&mand( get_next_cell( cell ) == next );
}

function copy_cell( source : Cell, destination : Cell ) : void {
// Change the content of a cell
  store_value( destination, fetch_value( source ) );
  store_info(  destination, fetch_info(  source ) );
  de&&mand( get_cell_type(  destination ) == get_cell_type(  source ) );
  de&&mand( get_cell_name(  destination ) == get_cell_name(  source ) );
  de&&mand( get_cell_value( destination ) == get_cell_value( source ) );
}

function copy_cell_value( source : Cell, destination : Cell ) : void {
// Change the content of a cell but keep the previous name
  let destination_name = unpack_name( fetch_info( destination ) );
  let source_type      = unpack_type( fetch_info( source ) );
  let source_value     = fetch_value( source );
  store_info( destination, pack( source_type, destination_name ) );
  store_value( destination, source_value );
  de&&mand( get_cell_value( destination ) == get_cell_value( source ) );
}

// This is initialy the sentinel tail of reallocatable cells
let nil_cell   : Cell = 0 // it will soon be the void/void/void cell
var free_cells : Cell = nil_cell;

function fast_allocate_cell(
  type  : InoxType,
  name  : InoxName,
  value : InoxValue
) : Cell {
// Allocate a new cell or reuse an free one
  if( free_cells == nil_cell )return make_cell( type, name, value );
  let cell = free_cells;
  let next_cell = get_next_cell( free_cells );
  free_cells =  next_cell;
  store_cell( cell, type, name, value );
  return cell;
}

function free_cell( cell : Cell ) : void {
// free a cell, add it to the free list
  set_next_cell( cell, free_cells );
  free_cells = cell;
}


// -----------------------------------------------------------------------
//  Symbol & Void, type 1 & type 0
//
// Symbols have an id, it is an integer. Whenever the value of a symbol
// is required as a number, that id is used. Whenever it is the string
// representation that is required, it's the name of the symbol that
// is used.
//   0 is both void and false
//   1 is true, it's symbolic!

const type_symbol = "true";
const all_symbol_cells_by_name = new Map< string, Cell >();
const all_symbol_cells_by_id   = new Array< Cell >();
const all_symbol_names_by_id   = new Array<string >()

let next_symbol_id : u32 = 0;
// The first symbol, void, will be id 0

function make_symbol( name : string ) : Cell {

  if( all_symbol_cells_by_name.has( name ) ){
    return all_symbol_cells_by_name.get( name );
  }

  let id = next_symbol_id++;
  let cell = make_cell( 1, id, id );
  all_symbol_cells_by_name.set( name, cell );
  all_symbol_cells_by_id[ id ] = cell;
  all_symbol_names_by_id[ id ] = name;

  de&&mand( symbol_id_to_string( id ) == name );
  de&&mand( get_symbol_by_id( id ) == cell );
  de&&mand( fetch_value( cell ) == id );
  de&&mand( fetch_name(  cell ) == id );
  de&&mand( fetch_type(  cell ) == 1  );

  return cell;

}

// Symbol with id 0 is void
const type_void   = "void";
const void_cell   = make_cell( 0, 0, 0 ); // First cell ever
const symbol_void = make_symbol( type_void );

// Symbol with id 1 is Symbol
const symbol_symbol = make_symbol( type_symbol );
const id_symbol = 1;

function symbol_id_to_string( id : u32 ) : string {
  return all_symbol_names_by_id[ id ];
}

function get_symbol_by_id( id : u32 ) : Cell {
// Return the address of the cell that holds the symbol singleton
  return all_symbol_cells_by_id[ id ];
}


// -----------------------------------------------------------------------
//  Integer, type 2, 32 bits
// ToDo: u8+ style to deal with less common arrays of bits.

const type_integer = "Integer";
const symbol_integer = make_symbol( type_integer );

function make_integer( value ){
  return make_cell( 2, symbol_integer, value );
}


// -----------------------------------------------------------------------
//  String, type 3
//


// Access to oject is opaque, there is an indirection

type InoxOid = u32;

let next_object_id = 0;

let free_objects : InoxOid = 0;

// ToDo: should be an array
let all_objects_by_id = new Array< any >();

function make_opaque_object( object : any ) : InoxOid {
  // ToDo: return object directly, it fits inside a cell's 32 bits value
  let id = free_objects;
  if( free_objects ){
    free_objects = all_objects_by_id[ id ];
  }else{
    id = next_object_id++;
  }
  all_objects_by_id[ id ] = object;
  return id;
}

// Object with id 0 is special void/null inexistant object
const null_object = make_opaque_object( 0 );

function get_opaque_object_by_id( id : InoxOid ) : any {
  return all_objects_by_id[ id ];
}

function get_cell_opaque_object( cell : Cell ){
  let oid = fetch_value( cell );
  return get_opaque_object_by_id( oid );
}

function object_id_to_string( id : InoxOid ) : string {
  let obj : any = get_opaque_object_by_id( id );
  return obj.toString();
}

function free_object( id : InoxOid ){
  // ToDo: list of free objects to reallocate
  all_objects_by_id[ id ] = 0;
  free_objects = id;
}

const type_string = "String";
const symbol_string = make_symbol( type_string );

function make_string( value : string ) : Cell {
  const cell = make_cell( 3, symbol_string, make_opaque_object( value ) );
  de&&mand( cell_to_string( cell ) == value );
  return cell;
}


// -----------------------------------------------------------------------
//  Object, type 4
//

const type_object = "Object";
const symbol_object = make_symbol( type_object );

function make_object( object : Object ) : Cell {
  let symbol = make_symbol( object.constructor.name );
  return make_cell( 4, symbol , make_opaque_object( object ) );
}

/* -----------------------------------------------------------------------------
 *  Act, type 5
 *  An Act is created for functions with local variables, aka closures.
 *  In addition to normal cells, there is a reference counter.
 *  The value of the cell is either void or an array of cells, one for
 *  each local variable encapsulated in the closure.
 *
 *  ToDo: implement this.
 *
 *  This is sometimes called "an activation record"
 *
 *  ToDo: unify with Function and Word types, similar to "bound functions"
 *  in javascript.
 *  ToDo: pointer to parent act to ease debugging and dereference parent
 *  when child act is deallocated.
 *  ToDo: https://en.wikipedia.org/wiki/Parent_pointer_tree
 */

const type_act = "Act";
const symbol_act = make_symbol( type_act );

type RefCount = u32;

 class Act {
  filler   : InoxAddress;  // type and name, packed
  locals   : Cell;         // = make_map() or void if none
  refcount : RefCount;     // free when no more references
}

function make_act( caller : Cell ) : Cell {
  let address = allocate_bytes( words_per_cell + words_per_cell / 2 );
  store_info( address, pack( 5, fetch_info( caller ) ) );
  // No local variables initially
  store_value( address, void_cell );
  // Store reference counter
  store32( address + words_per_cell, 1 );
  return address;
}

function get_act_refcount( address : InoxAddress ) : RefCount {
  return fetch( address + 8 );
}

function set_act_refcount(
  address : InoxAddress,
  count   : InoxValue
) : void {
  store_value( address, count );
}

var free_acts = void_cell;

function allocate_act( caller : Cell ) : Cell {
  if( free_acts == void_cell )return make_act( caller );
  let act = free_acts;
  free_acts = get_next_cell( act );
  store_info( act, pack( 6, fetch_info( caller ) ) );
  return act;
}

function free_act( act : Cell ) : void {
  set_next_cell( act, free_acts );
  free_acts = act;
}

function ref_act( act : Cell ) : void {
  set_act_refcount( act, get_act_refcount( act ) + 1 );
}

function deref_act( act : Cell ) : void {
  var count = get_act_refcount( act );
  count--;
  if( count == 0 ){
    free_act( act );
  }
}


// -----------------------------------------------------------------------
//  Word, type 6
//    the name is the id of the name of the word
//    the value is the address where the word is defined is the VM memory

const type_word = "word";
const symbol_word = make_symbol( type_word );

let next_word_id = 0;
let all_words_by_id      = Array< InoxAddress >();
let all_word_ids_by_name = new Map< string, InoxValue >()

function make_word( cell : Cell ) : Cell {
// Define a word. It's name is the name of the cell.
  // The cell's value is the adress where the definition starts.
  // The definition is an array of 16 bits words with builtin ids and
  // word ids. See run_fast() where the definition is interpreted.
  // ToDo: first 16 bits should be flags and length of code
  // ToDo: Forth also requires a pointer to the previous definition of
  // the word.
  let id = next_word_id++;
  let name = unpack_name( fetch_info( cell ) );
  let word_cell : Cell = make_cell( 6, name, fetch_value( cell ) );
  all_words_by_id[ id ] = word_cell;
  all_word_ids_by_name.set( symbol_id_to_string( name ), id );
  return word_cell;
}

function get_word_by_id( id : InoxValue ) : InoxAddress {
  return all_words_by_id[ id ];
}

function word_name_to_string( id : InoxValue ): string {
  let word_cell = get_word_by_id( id );
  let name = get_cell_name( word_cell );
  let str_name : string = symbol_id_to_string( fetch_value( name ) );
  return str_name;
}

function get_word_definition( name : string ) : InoxAddress {
  // ToDo: implement header with flags, length and pointer to previous
  let id : InoxIndex;
  let cell : Cell;
  if( all_word_ids_by_name.has( name ) ){
    id   = all_word_ids_by_name.get( name );
    cell = all_words_by_id[ id ];
  }else{
    id   = all_builtin_ids_by_name.get( name );
    cell = all_builtins_by_id[ id ];
  }
  return fetch_value( cell );
}

function get_word_definition_by_id( id : InoxValue  ) : InoxAddress {
  let cell : Cell = all_words_by_id[ id ];
  return fetch_value( cell );
}


/* -----------------------------------------------------------------------------
 *  Float, Array, Map, List
 */

const type_float = "Float";
const symbol_float = make_symbol( type_float );

function make_float( value : float ){
  return make_cell( 4, symbol_float, make_opaque_object( value ) );
}

const type_array = "Array";
const symbol_array = make_symbol( type_array );

function make_array( obj? : Object ):Cell {
  let array;
  if( obj ){
    array = obj;
  }else{
    array = new Array< any >();
  }
  return make_cell( 4, symbol_array, make_opaque_object( array ) );
}

const type_map = "Map";
const symbol_map = make_symbol( type_map );

function make_map( obj? : Object ){
  let map = obj;
  if( obj ){
    map = obj;
  }else{
    map = new Map< InoxOid, any >();
  }
  return make_cell( 4, symbol_map, make_opaque_object( map ) );
}

const type_list = "List";
const symbol_list = make_symbol( type_list );

function make_list( obj? : Object ) : Cell {
  // ToDo: value should a linked list of cells
  let list;
  if( obj ){
    list = obj;
  }else{
    list = new Array< any >();
  }
  return make_cell( 4, symbol_list, make_opaque_object( list ) );
}


/* --------------------------------------------------------------------------
 *  Task
 *  ToDo: make it a first class type?
 */

const type_Task   = "Task";
const symbol_Task = make_symbol( type_Task );

// Global state about currently running task
let current_task : Task;
let current_ip   : InoxAddress;
let current_rsp  : InoxAddress;
let current_psp  : InoxAddress;


function push( cell : Cell ){
// Push data on parameter stack
  current_psp -= words_per_cell;
  store32( current_psp, cell );
  de&&bug( "push /" + current_psp + "/" + cell_to_string( cell ) );
}

function pop() : Cell {
// Consume top of parameter stack
  let cell : Cell = load32( current_psp );
  current_psp += words_per_cell;
  de&&bug( "pop /" + current_psp + "/" + cell_to_string( cell ) );
  return cell;
}


class CpuContext {
  ip  : InoxAddress;
  rsp : InoxAddress;
  psp : InoxAddress;
  constructor( ip : InoxAddress, rsp : InoxAddress, psp : InoxAddress ){
    this.ip  = ip;
    this.psp = psp;
    this.rsp = rsp;
  }
}

class Task {
// Inox machines run cooperative tasks, actors typically

  cell     : Cell;     // Cell that references this object
  parent   : Cell;     // Parent task
  act      : Cell;     // Current activation record
  ip       : Cell;     // Current interpreter pointer in code
  mp       : Cell;     // Memory pointer, in ram array, goes upward
  psp      : Cell;     // Parameter stack pointer, goes downward
  pstack   : Cell;     // base address of a parameter stack cell array
  rsp      : InoxAddress; // Stack pointer for call returns, goes downward
  rstack   : InoxAddress; // Base address of return stack, 32 entries

  constructor(
    parent   : Cell,
    act      : InoxAddress,
    ip       : InoxAddress,
    ram_size : InoxValue
  ){
    // this.cell is set in make_task()
    this.cell = 0;
    // Parent task list, up to root task
    this.parent = parent;
    // Current activation for the new task
    this.act    = act;
    // Init memory and cpu context
    this.init( ip, ram_size );
  }

  init( ip : InoxAddress, ram_size : InoxValue ){
    // Round size to the size of a cell
    var size = ( ram_size / size_of_cell ) * size_of_cell;
    // Current instruction pointer
    this.ip     = ip;
    // Room for stacks, both parameters and returns
    this.mp     = allocate_bytes( size );
    // Return stack is at the very end
    this.rstack = this.mp + ( ( size / size_of_word ) - words_per_value );
    // That's where the current return stack pointer is also
    this.rsp    = this.rstack;
    // Parameter stack is just below the return stack
    this.pstack = this.rstack - ( words_per_cell * 32 );
    // That's where the current parameter stack pointer is
    this.psp    = this.pstack;
  }

  get_context() : CpuContext {
    return new CpuContext( this.ip, this.rsp, this.psp );
  }

  restore_context( ctx : CpuContext ) : void {
    current_task = this;
    current_ip   = this.ip  = ctx.ip;
    current_rsp  = this.rsp = ctx.rsp;
    current_psp  = this.psp = ctx.psp;
  }
}

function make_task( parent : Cell, act : Cell ) : Cell {
  let size = 1024 * 1; // 1 kb, for parameters & returns stacks
  var new_task = new Task( parent, 1, act, size );
  // Fill parameter stack with act's parameters
  // ToDo [ act.locals ];
  let cell = make_object( new_task );
  new_task.cell = cell;
  return cell;
};

// Current task is the root task
let root_task: Cell = make_task( void_cell, void_cell );
current_task = get_cell_opaque_object( root_task );

// Current task changes at context switch
task_switch( current_task );

// There is nothing in the free list
let free_tasks = void_cell;

function allocate_task( parent : Cell, act:Cell ) : Cell {
  if( free_tasks == void_cell )return make_task( parent, act );
  let task = free_tasks;
  let task_object = get_cell_opaque_object( task );
  task_object.ip = 1;
  task_object.parent = parent;
  task_object.act = act;
  return task;
}

function free_task( task : Cell ){
// add task to free list
  set_next_cell( task, free_tasks );
  free_tasks = task;
}

// builtin to switch to another task
function builtin_task_switch() : void {
  var next_task = pop();
  task_switch( get_cell_opaque_object( next_task ) );
}

function task_switch( task : Task ) : void {
  task.restore_context( task.get_context() );
}

function builtin_make_task() : void {
  let ip : InoxAddress = fetch_value( this.pop() );
  var act = allocate_act( current_task.cell );
  var new_task : Cell = allocate_task( current_task.cell, act );
  // ToDo: push( parameters ); into new task
  let t : Task = get_cell_opaque_object( new_task );
  t.ip = ip;
  this.push( make_cell( symbol_Task, symbol_Task, new_task ) );
};


// -----------------------------------------------------------------------
//  Builtins
//

let next_builtin_id             = 0;
let all_builtins_by_id          = new Array< Cell >();
let all_builtin_fumctions_by_id = new Array< Function >();
let all_builtin_ids_by_name     = new Map< string, InoxIndex >();

// Helper to define a builtin
function builtin( name : string, fn : Function ) : Cell {
  let fcell = make_object( fn );
  let scell = make_symbol( name );
  // Make sure the name of the Function object is as desired
  store_cell(
    fcell,
    get_cell_type( fcell ),
    get_cell_name( scell ),
    fetch_value( fcell )
  );
  // Assign a new builtin id to the new builtin
  let id = next_builtin_id++;
  // Associate name, builtin id and cell is all directions
  all_builtins_by_id[ id ] = fcell;
  all_builtin_fumctions_by_id[ id ] = fn;
  all_builtin_ids_by_name.set( name, id );
  // Make also some word that calls the builtins
  // 16 bits with the builtin id and 16 bits with "next" instruction code
  let bytes : InoxAddress = allocate_bytes( 4 );
  store16( bytes,     0x4000 + id ); // builtin
  store16( bytes + 1, 0x4000 + 1  ); // next
  store_value( scell, bytes );
  let word_cell = make_word( scell );
  // Restore the proper value of the symbol, a constant
  store_value( scell, id_symbol );
  de&&mand( get_word_definition( name ) == bytes );
  de&&mand( load16( get_word_definition( name ) ) == ( 0x4000 + id ) );
  return word_cell;
}

// Builtin with id 0 is nop, no operation
builtin( "no-operation", function no_operation(){} );
de&&mand( load16( get_word_definition( "no-operation" ) ) == 0x4000 );

// Builtin with id 1 is "next", jump to return address
builtin( "go-next", function go_next(){
  this.ip = load32( this.rsp );
  this.rsp += words_per_value;
} );

// Bultin with id " is "juñp" to some relative position
builtin( "go-jump", function go_jump(){
  this.ip += load32( this.rsp );
} );


builtin( "make_task",   builtin_make_task   );
builtin( "task_switch", builtin_task_switch );

// ToDo: core dictionary

// Parameters stack manipulations

builtin( "push", function push(){ this.push() } );

builtin( "pop",  function pop(){ this.pop()  } );

builtin( "drop", function drop(){ this.pop()  } );

builtin( "dup",  function dump(){
  // ToDo: optimize this
  let top = this.pop();
  this.push( top );
  this.push( top );
} );

function cell_to_string( cell : Cell ) : string {

  let value : InoxValue = fetch_value( cell );
  let info = fetch_info( cell );
  let type = unpack_type( info );

  // Fast with string objects
  if( type == 3 )return all_objects_by_id[ value ];

  let name = unpack_name( info );
  let buf : string = "";

  buf += type;
  buf += "/" + name + "/";
  buf += symbol_id_to_string( type ) + "/";
  buf += symbol_id_to_string( name ) + "/";

  switch( type ){
    case 0 : break; // buf += "Void";
    case 1 : // buf += "Symbol";
      buf += "/" + symbol_id_to_string( value );
    break;
    case 2 : // buf += "Integer";
    case 3 : // buf += "String";
    case 4 : // buf += "Object";
      if( all_objects_by_id[ value ] ){
        let obj : any = all_objects_by_id[ value ];
        buf += obj.toString();
      }else{
        buf += "->?";
      }
    break;
    case 5 : buf += "Function";
    break;
    case 6 : buf += "Act";
    break;
    case 7 : buf += "Word";
    break;
    default : buf += "???";
    break;
  }

  return buf;

}

function builtin_to_string(){
  let str = cell_to_string( this.pop() );
  this.push( make_string( str ) );
}

builtin( "to_string", builtin_to_string );

function builtin_log(){
  console.log( cell_to_string( this.pop() ) );
}

builtin( "log", builtin_log );

const symbol_method_missing = make_symbol( "method_missing" );

// -----------------------------------------------------------------------
//  Tokenizer
//

type Token = {
  type  : string,
  value : string,
  index : u32
};

const void_token : Token = {
  type  : "",
  value : "",
  index : 0 // ToDo line/column
};

let text        = source;
let text_length = text.length;
let back_token  = void_token;
let token_state = "comment";
let text_cursor = 0;

// Smart detection of comments syntax, somehow
let is_c_style     = false;
let is_forth_style = false;
let is_lisp_style  = false;
let comment_multiline_begin       = "";
let comment_multiline_begin_begin = "";
let comment_multiline_end         = "";
let comment_multiline_end_end     = "";
// ToDo: nesting multiline comments
let comment_monoline_begin        = "";
let comment_monoline_begin_begin  = "";
let first_comment = true;

function tokenizer_restart( source : string ){
  text        = source;
  text_length = text.length;
  back_token  = void_token;
  token_state = "base";
  text_cursor = 0;
  is_c_style = is_forth_style = is_lisp_style = false;
  first_comment = true;
  token_state = "comment";
}

tokenizer_restart( source );

function make_token( type : string, value : string, ii : u32 ) : Token {
  return {
    type  :  type,
    value : value,
    index : ii - 1 // ii is always one character ahead
  }
}

function unget_token( token : Token ) : void {
  back_token = token;
}

function get_next_token() : Token {
// Split source code into syntax tokens

  // ToDo: hord clauses, prolog syle
  // See http://tau-prolog.org/files/doc/grammar-specification.pdf

  // ToDo: lisp like nil and lists
  // See https://www.cs.cmu.edu/Groups/AI/html/cltl/clm/node9.html

  // ToDo: study Scheme implementations
  // See https://legacy.cs.indiana.edu/~dyb/pubs/3imp.pdf

  // If there is some token already, deliver it
  let token : Token = back_token;
  if( token !== void_token ){
    back_token = void_token;
    return token;
  }

  // Collect token text
  let buf   = "";
  let sep   = "";
  let ii    = text_cursor;
  let state = token_state;
  let ch    = "";
  let is_space = false;
  let is_eol   = false; // End Of Line
  let is_eof   = false; // End Of File

  // Some  lookahead to detect xxx's yyy and yyy of xxx syntax sugar
  // for xxx.yyy. That requires 4 characters
  // ToDo: use a "    " fxied size string?
  let next_ch  = [ " ", " ", " ", " " ];

  function ch_is_space( ch : string ){
    // ToDo: avoid regexp
    return /\s/.test( ch.charAt( 0 ) );
  }

  function ch_is_eol( ch : string ){
    // ToDo: handle crlf better
    if( ch == "\n" )return true;
    if( ch == "\r" )return true;
    return false;
  }

  eat:
  while( true ){

    // EOF is like end of line
    if( ii == text_length ){
      is_eof = true;
      if( state == "base" ){
        token = { type : "eof", value : "", index : ii }
        break eat;
      }
      // Simulate an end of line
      ch = "\n";

    // Get next character in source
    }else{
      ch = text[ ii ];
      ii++;
    }

    // Is it somespace or something equivalent?
    is_space = ch_is_space( ch );
    is_eol = ch_is_eol( ch );

    // Also get next next chars, some lookahead helps sometimes
    for( let jj = 0 ; jj < 4 ; jj++ ){
      if( ( ii + jj ) >= text_length ){
        next_ch[ jj ] = " ";
      }else{
        next_ch[ jj ] = text[ ii + jj ];
        // Treat lf like a space
        if( ch_is_eol( next_ch[ jj ] ) ){
          next_ch[ jj ] = " ";
        }
      }
    }

    // Collect comment
    if( state == "comment" ){

      buf += ch;

      // When inside the first comment at the very beginning of the file
      if( first_comment && !is_space ){

        // ToDo: skip #! shebang
        // see https://en.wikipedia.org/wiki/Shebang_(Unix)

        // C style of comment, either // or /* xxx */
        if( ch == "/*" || ch == "//" ){
          is_c_style = true;
          comment_multiline_begin       = "/*";
          comment_multiline_begin_begin = "/";
          comment_multiline_end         = "*/";
          comment_multiline_end_end     = "/";
          comment_monoline_begin        = "//";
          comment_monoline_begin_begin  = "/";

        // Forth style, either \ or ( xxx )
        }else if( ch == "(" ){
          is_forth_style = true;
          comment_multiline_begin       = "(";
          comment_multiline_begin_begin = "(";
          comment_multiline_end         = ")";
          comment_multiline_end_end     = ")";
          comment_monoline_begin        = "\\";
          comment_monoline_begin_begin  = "\\";

        // Lisp style, ;
        }else if( ch == ";" ){
          is_lisp_style = true;
          comment_monoline_begin        = ";";
          comment_monoline_begin_begin  = ";";

        // Prolog style, %
        }else if( ch == "%" ){
          is_lisp_style = true;
          comment_monoline_begin        = "%";
          comment_monoline_begin_begin  = "%";
        }
      }

      // If this is a monoline comment ending, emit it
      if( is_eol
      && comment_monoline_begin
      && ( buf.slice( 0, comment_monoline_begin.length )
        == comment_monoline_begin )
      ){
        // Emit token, without start of comment sequence
        token = {
          type  : "comment",
          value : buf.slice(
            comment_monoline_begin.length,
            buf.length - comment_monoline_begin.length
          ),
          index : ii
        };
        state = "base";
        break eat;
      }

      // If this terminates the multiline comment, emit the comment
      if( ch == comment_multiline_end_end
      && buf.slice( buf.length - comment_multiline_begin.length )
        == comment_multiline_end
      && buf.slice( 0, comment_multiline_begin.length )
        == comment_multiline_begin
      ){
        // Emit token, without start & end of comment sequence
        token = {
          type  : "comment_multiline",
          value : buf.slice(
            comment_multiline_begin.length,
            buf.length
            - comment_multiline_begin.length
            - comment_multiline_end.length
          ),
          index : ii
        };
        state = "base";
        break eat;
      }

      // Premature end of file, something else was expected
      if( is_eof ){
        token = {
          type  : "error",
          value : "eof in token " + state,
          index : ii
        };
        break eat;
      }

      // Keep Collecting characters
      continue eat;
    }

    // Skip whitespaces
    if( state == "base" ){

      // skip whitespaces
      if( is_space ){
        continue eat;
      }

      // Strings starts with ", unless Forth
      if( ch == "\"" && ! is_forth_style ){
        // ToDo: handle single quote 'xx' and backquote `xxxx`
        // ToDo: handle templates litterals
        state = "string";
        continue eat;
      }

      // ToDo: JSON starts with ~ ?
      // See https://www.json.org/json-en.html

      buf = ch;

      // Comments start differently depending on style
      if( ch == comment_monoline_begin_begin
      ||  ch == comment_multiline_begin_begin
      ){
        state = "comment";
        continue eat;
      }

      // Else, it is a "word", including "separators" sometimes
      state = "word";
      continue eat;

    } // base state

    // Collect string until final "
    if( state == "string" ){

      // End of string or end of file
      if( ch == "\""
      || is_eof
      ){
        token = {
          type  : "string",
          value : buf,
          index : ii
        };
        state = "base";
        break eat;
      }

      // ToDo: handle escape sequences
      buf += ch;
      continue eat;

    } // string state

    // Collect word until separator
    if( state == "word" ){

      // Spqce is a terminator
      if( is_space ){
        // In Forth, things are pretty simple
        if( is_forth_style ){
          token =  { type : "word", value : buf, index : ii - 1 } ;
          state = "base";
          break eat;
        }
        // Normalize all whitespaces into a single space character
        ch = " ";
      }

      // In Forth everthing between spaces is a word
      if( is_forth_style ){
        buf += ch;
        continue eat;
      }

      // Treat xxx( as if it were ( xxx. Hence ( fn 3 2 ) eqv fn( 3 2 )
      // Idem for xxx{ and xxx[
      // ToDo: idem? for xxx:, xxx, xxx; and xxx.
      // ToDo: idem? for ?, !
      // ToDo: quid @, &, #, $
      // ToDo: quid +, -, *, /
      // ToDo: quid <, >, =
      // ToDo: quid <xxx> yyy </xxx> ?
      // ToDo: quid ^, `
      // ToDo: generalize to anything special after alphanumeric sequence?
      // ToDo: act also depending on "known words" to enable some
      // special constructs like "if(" when it is a defined word.

      if(
        (ch == "(" ||  ch == '[' ||  ch == '{' )
      && buf.length > 0
      ){
        unget_token( { type : ch, value : ch, index : ii } );
        token =  { type : "word", value : buf, index : ii - 1 } ;
        state = "base";
        break eat;
      }

      // ToDo: detect yyy of xxx, meaning xxx.yyy

      // Some characters cannot be inside a word
      // ToDo: what about # ?
      if( ch == " "
      ||  ch == "~" // ToDo: ?
      ||  ch == "^" // ToDo: ?
      ||  ch == "." // ToDo: dot notation where a.b( c ) eqv b( a, c )
      ||  ch == "\\"
      ||  ch == ":" // ToDo: what about :: ?
      ||  ch == "." // ToDo: what about .. ?
      ||  ch == ","
      ||  ch == "'" // ToDo: detect xxx's
      ||  ch == "'"
      ||  ch == "`"
      ||  ch == '"'
      ||  ch == '(' // ToDo: what about ()
      ||  ch == ')'
      ||  ch == '[' //ToDo: what about [] ?
      ||  ch == ']'
      ||  ch == '{' // ToDo: trailing lambdas where { x... } ev do x... end
      ||  ch == '}' // ToDo: what about {}, ){, ]} ?
      // ToDo: what about all two characters combinations with (, { and [ ?
      ){

        // Handle line continuation when \ is last character on line
        if( ch == "\\"
        && ch_is_eol( next_ch[ 0 ] )
        ){
          // Handle crlf
          if( next_ch[ 0 ] == "\r" ){
            ii++;
          }
          // Skip lf
          ii++;
          continue eat;
        }

        // Either a word followed by some separator
        if( buf.length ){
          token = { type : "word", value : buf, index : ii - 1 };
          // Also push back a separator token unless it is just a space
          if( ch != " " ){
            // But only if there is a space right after it
            if( next_ch[ 0 ] == " " )
            unget_token( { type : "post", value : ch, index : ii } );
          }
        // Or just the separator itself, with nothing before it
        }else{
          token = { type : "pre", value : ch, index : ii };
        }
        // In both cases, emit a token and get back to normal
        state = "base";
        break eat;

      }

      buf += ch;
      continue eat;

    } // word state

    // ???
    token = {
      type  : "error",
      value : "bad state in get_next_token()",
      index : ii
    };
    break eat;

  } // eat loop

  text_cursor = ii;
  token_state = state;
  return token;

} // get_next_token()


// -----------------------------------------------------------------------
//  run()
//

function run_fast( ctx : CpuContext ){
// This is the one function that needs to run fast.
// It should be optimized by hand depending on the target CPU.
  // See https://muforth.nimblemachines.com/threaded-code/
  // Also http://www.ultratechnology.com/1xforth.htm
  // and http://www.bradrodriguez.com/papers/moving1.htm

  // Setup cpu context, instruction pointer, parameter & return stacks
  let ip  : InoxAddress = ctx.ip;
  let psp : InoxAddress = ctx.psp;
  let rsp : InoxAddress = ctx.rsp;

  // builtins can jump instead of just returning, aka chaining
  let then : InoxIndex = 0;

  function push( cell : Cell ){
  // Push data on parameter stack
    psp -= words_per_cell; // size of cell pointer, 2 32 bits words
    store32( psp, cell );
    de&&bug( "fast push /" + psp + "/" + cell_to_string( cell ) );
  }

  function pop() : Cell {
  // Consume top of parameter stack
    let cell : Cell = load32( psp );
    psp += words_per_cell; // size of cell pointer
    de&&bug( "fast pop /" + psp + "/" + cell_to_string( cell ) );
    return cell;
  }

  const inox = {
    pop:     pop,
    push:    push,
    ip:      function ip(){  return ip  },
    psp:     function psp(){ return psp },
    rsp:     function rsp(){ return rsp },
    // ToDo gmp & tmp, global memory pointer and task memory pointer
    // ToDo ap, current Act pointer
    set_ip:  function set_ip(   v : InoxAddress ){ ip   = v; },
    set_psp: function set_psp(  v : InoxAddress ){ psp  = v; },
    set_rsp: function set_rsp(  v : InoxAddress ){ rsp  = v; },
    then:    function set_then( v : InoxIndex   ){ then = v; }
  };

  let word : usize;
  let type : usize;
  let code : usize;

  while( ip ){

    // Get 16 bits cell to execute and move forward
    word = load16( ip );
    ip++;

    //  what type of code this is, builtin or word
    type = word >>> 14;
    code = word & 0x3fff;

    // If this is a builtin, execute it
    if( type == 1 ){

      // Special "go-next" builtin is just a jump to the return address
      if( code == 1 ){
        // Jump to address poped from top of stack
        ip = load32( rsp );
        rsp += words_per_value; // size of InoxAddress, 2 16 bits words
        continue;
      }

      // Else, it is the id of a bultin
      let fun : Function = all_builtin_fumctions_by_id[ code ];
      while( true ){
        fun.apply( inox );
        if( ! then )break;
        fun  = all_builtin_fumctions_by_id[ then ];
        then = 0;
      }
      if( !current_task )break;
      continue;

    }

    // Special "jump" are relative jumps
    if( type == 2 ){
      ip += code;
      continue;
    }

    // else it is almost the address of some code to run

    // Push the current instruction pointer onto the return stack
    rsp -= words_per_value; // size of an InoxAddress, 2 16 bits words
    store32( rsp, ip );

    // Jump to the destination's address
    ip = get_word_definition_by_id( code );

    // ToDo: what about literals
  }

  return new CpuContext( ip, rsp, psp );

} // run_fast()

function run(){
  let old_ctx = new CpuContext( current_ip, current_rsp, current_psp );
  let new_ctx = run_fast( old_ctx );
  current_ip  = new_ctx.ip;
  current_psp = new_ctx.psp;
  current_rsp = new_ctx.rsp;
}

function run_word( word : string ){
  current_ip = get_word_definition( word );
  run();
}

function inox_eval(){
  var source = cell_to_string( this.pop() );
  tokenizer_restart( source );
  let token;
  let type;
  let value;
  while( true ){
    token = get_next_token();
    type = token.type;
    value = token.value;
    de&&bug( "Token /" + type + "/" + value + "/" );
    if( type == "error" ){
      break;
    }
    if( type == "eof" ){
      break;
    }
  }
}

builtin( "inox-eval", inox_eval );

// ToDo: restore state and provide event from json encoded values
// The idea there is about code that can execute in a stateless manner
// even when some state is required. Basically the whole state is
// turned into an immutable value and Inox programs simply process
// that value to produce another value that is a new state.
// As a result every Inox program could run on any machine and
// it would be the job of some "orchestration" layer to dispatch
// jobs and propagate state changes harmoniouly. Not a simple task.
let state = JSON.parse( json_state );
let event = JSON.parse( json_event );

// Compile the bootstrap vocabulary
let bootstrap_code : string =
`( let's go forth )

`;
push( make_string( bootstrap_code ) );
run_word( "inox-eval" );

// If source code was provided, push it on the parameter stack
// See http://c2.com/cybords/pp4.cgi?muforth/README
if( source ){
  push( make_string( source) );
  run_word( "inox-eval" );
  run_word( "inox-event-loop" );
}

// ToDo: return diff to apply instead of new state
let new_state = state; // ToDo: encode top of stack in json
return new_state;

}


// --------------------------------------------------------------------------
// Smoke test
//

inox( "{}", "{}", [

  '( forth )',
  ': hello CR ." Hello world!" ;',
  'hello ;'

].join( "\n" ) );

exports.inox = inox;
