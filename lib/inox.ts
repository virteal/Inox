/*  inox.js
 *  Inox is a multi dialect minimalist concatenative functional
 *  dynamic programming language.
 *
 *  It is basic/forth/smalltalk/icon/lisp/prolog/erlang inspired.
 *
 *  june 3 2021 by jhr
 *  june 7 2021 by jhr, move from .js to .ts, ie Typescript, AssemblyScript
 *  june 10 2021 by jhr, .nox file extension
 *  june 27 2021 by jhr, forth hello world is ok, use literate comment in Inox
 */


import { assert, memory } from "console";

function inox(){

  // import { assert, memory } from "console";

// Starts running an Inox machine, returns a json encoded new state.
// ToDo: return diff instead of new state.
// The source parameter is a string, maybe the content of a .nox text file.

// Inox targets the webassembly virtual machine but runs on other
// architectures too, including micro controllers like the esp32.
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
//   Complex     - I know, sorry about that, you may skip it
//    Real       - whatever that means
//     Rational  - Not so much
//      Integer  - a kind of Number I guess, native size, minus decoration
//      Unsigned - unsigned integers, eqv webassembly's usize
//      i8, u8, i6, u16, i32, u32, i64, u64 - webassembly
//  Float        - another kind of numbers, huge
//   f32, f64    - webassembly
//
// Text          - like strings in javascript, immutable, not like C's 0 ending
// Any           - webassembly's anyref
//
// Address       - address of a word in memory, 16 bits word for now
// Cell          - a pointer to a memory cell, each one has type/name/value
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
// programming style, ToDo.
//
// This is the reference implementation. It defines the syntax and semantic
// of the language. Production quality version of the virtual machine would
// have to be hard coded in some machine code to be efficient I guess.
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
// These instructions are called "inox words".
// Some instructions are primitives, other are user defined. They are both
// named "words". Like in Forth a word can execute in interpreted mode
// or in compile mode. In the later case, during source parsing, the
// word can prepare stuff to be used when in interpreted mode, compute
// relative jumps for example.
//
// Inox is stack based like Forth and token based like BASIC. Using
// dialects, it is possible to mix vocabularies from different languages
// in the same source file. That way, you can leverage your past
// knowledge and feel at home right away. Almost.


/* -----------------------------------------------------------------------------
 *  Let's go.
 *   some debug tools first.
 */

// my de&&bug darling, de flag could be a variable
const de       = true;

// Traces can be enabled "by domain", aka "categories"
const check_de = de && true;
const eval_de  = de && false;
const token_de = de && false;
const run_de   = de && false;
const stack_de = de && false;
const nde      = false;


function bug( msg: string ){
// de&&bug( a_message )
  assert( typeof msg === "string" );
  console.log( msg );
}


function mand( condition : boolean ){
// de&&mand( a_condition ), aka asserts
  if( condition )return;
  assert( false );
};


function mand_eq( a : number, b : number ){
// Check that two numbers are equal
  if( a == b )return;
  console.log( "!!! not eq " + a + "/" + b );
  assert( false );
}


assert(   de ); // Not ready for production, please wait :)
de&&mand( de ); // Like assert but that can be disabled for speed

de&&bug( "Inox starting." );


/* -----------------------------------------------------------------------------
 *  Make it work in the javascript machine, it's the portable scheme.
 *  When compiled using AssemblyScript some changes are required.
 */

const PORTABLE = true;

// ToDo: if( PORTABLE ){

// Let's say Typescript is AssemblyScript for a while (june 7 2021)
type i8    = number;
type u8    = number;
type i16   = number;
type u16   = number;
type i32   = number;
type u32   = number;
type isize = number; // native size of integers, 32 bits typically
type usize = number; // native size of addresses or unsigned integers
type u64   = number;
type float = number; // assumed to be larger then isize

// ToDo: should do that when?
// require( "assemblyscript/std/portable" );

// } // PORTABLE


/* -----------------------------------------------------------------------------
 *  Types and constants related to types
 */

type InoxAddress     = u32; // Arbitrary address in VM memory, aka a pointer
type InoxWord        = u16; // Smallest entities at an InoxAddress in VM memory
type InoxIndex       = u16; // Index in rather small arrays
type InoxOid         = u32; // objects have a unique id
type InoxValue       = u32; // payload, sometimes an index, sometimes a pointer
type InoxCode        = u16; // Inox word definitions include an array of codes
type InoxCell        = u32; // Pointer to a cell's value
type InoxInfo        = u32; // type & name info parts of a cell
type InoxType        = u8;  // packed with name, 3 bits, at most 8 types
type InoxName        = u32; // 29 bits actually, type + info is 32 bits

const size_of_word    = 2;   // 2 bytes, 16 bits
const size_of_value   = 4;   // 4 bytes, 32 bits
const size_of_cell    = 8;   // 8 bytes, 64 bits
const words_per_cell  = size_of_cell  / size_of_word; // 4

// In memory, the value is stored first, then the type & name info
const offset_of_cell_info = size_of_value / size_of_word;

// Strings is jargon but text is obvious
type text = string;


/* ---------------------------------------------------------------------------
 *  Low level memory management.
 *  The Inox virtual machine uses an array of 16 bits words to store both
 *  the content of "cells" (2 words) and arrays of "code tokens" (1 word). A
 *  cell is the basic value manipulated everywhere. A code is a token that
 *  reference either a javascript defined primitive or an Inox defined word.
 *  The notion of user defined "words" comes from the Forth language.
 */

// -----------------------------------------------------------------------------
// ToDo: if( PORTABLE ){

// Portable versions of load() and store()
// For the webassembly version, see https://wasmbyexample.dev/examples/webassembly-linear-memory/webassembly-linear-memory.assemblyscript.en-us.html


// This is "the data segment" of the virtual machine.
// the "void" first cell is allocated at absolute address 0.
// That array of 32 bits words is indexed using 29 bits addresses
// with odd addresses to address 16 bits inox words.
// 16 bits is the standard size for UTF16 encoded texts.
// ToDo: study webassembly modules
// See https://webassembly.github.io/spec/core/syntax/modules.html

const memory8  = new ArrayBuffer( 1024 * 64 ); // 64 kb
const memory16 = new Uint16Array(    memory8 );
const memory32 = new Int32Array(     memory8 );
const memory64 = new BigUint64Array( memory8 );


function load64( index : InoxAddress ) : u64 {
  // The right shift translates 16 bits aligned addresses into 32 bits ones
  let value = memory32[ index >>> 2 ];
  // de&&bug( "Load 32 @" + index + " " + value );
  return value;
}


function store64( index : InoxAddress, value : u64 ) : void {
   memory32[ index >>> 2 ] = value;
   // de&&bug( "store 32 @ " + index + " " + value );
   de&&mand_eq( load32( index ), value );
}


function load32( index : InoxAddress ) : InoxValue {
  // The right shift translates 16 bits aligned addresses into 32 bits ones
  let value : InoxValue = memory32[ index >>> 1 ];
  // de&&bug( "Load 32 @" + index + " " + value );
  return value;
}


function store32( index : InoxAddress, value : InoxValue ) : void {
   memory32[ index >>> 1 ] = value;
   // de&&bug( "store 32 @ " + index + " " + value );
   de&&mand_eq( load32( index ), value );
}


function load16( index : InoxAddress ) : u16 {
  let word : InoxWord = memory16[ index ];
  // de&&bug( "Load 16 @ " + index + " " + word );
  return word;
}


function store16( index : InoxAddress, word : InoxWord ) : void {
  memory16[ index ] = word;
  // de&&bug( "store16 @" + index + " " + word );
  de&&mand_eq( load16( index ), word );
}

// } // PORTABLE


/* -----------------------------------------------------------------------------
 *  Not portable version is AssemblyScript syntax
 *  ToDo: figure out what @inline means exactly
 *  ToDo: figure out some method to avoid the right shift when
 *  optimizing for speed instead of for memory
 *  The resulting vm would then have access to less cells,
 *  half of them, but faster.
 */

if( ! PORTABLE ){ /*


@inline function load64( index : InoxAddress ) : u64 {
  return load< u64 >( index << 1 );
}


@inline function store64( index : InoxAddress, value : u64 ) : void {
  store< u64 >( index << 1, value );
}


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
  *  Else the name is a "symbol", a fixed abritrary value. In some languages
  *  like Lisp symbols are called "atoms".
  *
  *  The encoding stores all of that in a 64 bits word.
  *  cell's type is a numeric id, 0..7
  *  cell's name is the address of a Symbol type of cell (xor next in lists).
  *  cell's value depends on type, often a pointer to some object.
  *
  *  eqv C like struct InoxCell {
  *    value : InoxValue; // 32 bits word
  *    info  : InoxInfo;  // packed type & name
  *  };
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

/*
abstract class InoxCellContent {
// A memory cell has an address, a type, a value and a name maybe.
// When the type is "list", the name is the address of the rest of the list.
// The encoding stores all of that in a 64 bits word.
// Derived classes defines additional methods.

    type  : InoxType;  // 0..7
    name  : InoxCell;  // address of some other memory cell
    value : InoxValue; // value depends on type, often a pointer to an object

    constructor( cell : InoxCell ){
      let info : InoxInfo = get_cell_info( cell );
      this.type  = unpack_type( info );
      this.name  = unpack_name( info );
      this.value = get_cell_value( cell );
    }

}
*/

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

// This next-cell would be HERE in Forth
// See https://forth-standard.org/standard/core/HERE
let next_cell : InoxAddress = first_cell;


function allocate_cell() : InoxCell {
  let top = next_cell;
  // Each cell is made of 4 16 bits words, 64 bits total
  next_cell += words_per_cell;
  return top;
}


function allocate_bytes( size : InoxValue ) : InoxAddress {
  // Align on 64 bits, size of a cell
  var aligned_size
  = ( size       + ( size_of_cell - 1 ) )
  & ( 0xffffffff - ( size_of_cell - 1 ) );
  // ToDo: malloc() style allocation?
  var top = next_cell;
  // Divide by 2 because memory is 16 bits words, not bytes
  next_cell += ( aligned_size / size_of_word );
  de&&mand_eq( load32( top ), 0 );
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
  de&&mand_eq( fetch( address ), value );
}


// @inline
function fetch( address : InoxAddress ) : InoxAddress {
  return load32( address );
}


// @inline
function set_cell_value( cell : InoxCell, value : InoxValue ) : void {
  store32( cell, value );
  de&&mand_eq( get_cell_value( cell ), value );
}


// @inline
function get_cell_value( cell : InoxCell ) : InoxValue {
  return load32( cell );
}


// @inline
function set_cell_info( cell : InoxCell, info : InoxInfo ) : void {
  store32( cell + offset_of_cell_info, info );
  de&&mand_eq( get_cell_info( cell ), info );
}


// @inline
function get_cell_info( cell : InoxCell ) : InoxInfo {
  return load32( cell + offset_of_cell_info );
}


// @inline
function pack( type : InoxType, name : InoxName ) : InoxInfo {
// Pack type and name together.
  // Name is a 64 bits aligned pointer to a symbol type of cell
  let pack = name << 3 | type;
  de&&mand_eq( unpack_type( pack ), type );
  de&&mand_eq( unpack_name( pack ), name );
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

function set_cell_type( cell : InoxCell, type : InoxIndex ){
  set_cell_info( cell, pack( type, unpack_name( get_cell_info( cell ) ) ) );
}


function make_cell(
  type  : InoxType,
  name  : InoxName,
  value : InoxValue
) : InoxCell {
// Allocate a new cell or reuse one, then initialize it
  let cell : InoxCell = fast_allocate_cell();
  // Store value first
  store32( cell, value );
  // Then store type and name packed together
  store32( cell + offset_of_cell_info, pack( type, name ) );
  de&&mand_eq( get_cell_type(  cell ), type  );
  de&&mand_eq( get_cell_name(  cell ), name  );
  de&&mand_eq( get_cell_value( cell ), value );
  return cell;
}


function get_cell_type( cell : InoxCell ) : InoxType {
// Returns the type of a cell, 0..7 range
  return unpack_type( get_cell_info( cell ) );
}


function get_cell_name( cell : InoxCell ) : InoxName {
// Returns the name of a cell, as a Symbol id
  return unpack_name( get_cell_info( cell ) );
}


function set_cell_name( cell : InoxCell, name : InoxName ) : void {
  set_cell_info( cell, pack( get_cell_type( cell ), name ) );
}


// @inline
function get_next_cell( cell : InoxCell ) : InoxCell {
// Assuming cell is a list member, return next cell in list
  return unpack_name( get_cell_info( cell ) );
}


function set_next_cell( cell : InoxCell, next : InoxCell ) : void {
// Assuming cell is a list member, set the next cell in list
  // ToDo: assume type is 0 maybe?
  let info = get_cell_info( cell );
  let type = unpack_type( info );
  set_cell_info( cell, pack( type, next ) );
  de&&mand_eq( get_next_cell( cell ), next );
}


function copy_cell( source : InoxCell, destination : InoxCell ) : void {
// Change the content of a cell
  // ToDo: this should be a single 64 bits word copy
  // See BigUint64Array and copyWithin( destination << 2, source << 2, 1 );
  set_cell_value( destination, get_cell_value( source ) );
  set_cell_info(  destination, get_cell_info(  source ) );
  de&&mand_eq( get_cell_type(  destination ), get_cell_type(  source ) );
  de&&mand_eq( get_cell_name(  destination ), get_cell_name(  source ) );
  de&&mand_eq( get_cell_value( destination ), get_cell_value( source ) );
}


// This is initialy the sentinel tail of reallocatable cells
let nil_cell : InoxCell = 0 // it will soon be the void/void/void cell

// Linked list of free cells
var free_cells : InoxCell = nil_cell;


function fast_allocate_cell() : InoxCell {
// Allocate a new cell or reuse an free one
  if( free_cells == nil_cell )return allocate_cell();
  let cell = free_cells;
  let next_cell = get_next_cell( free_cells );
  free_cells =  next_cell;
  return cell;
}


function free_cell( cell : InoxCell ) : void {
// free a cell, add it to the free list
  set_next_cell( cell, free_cells );
  free_cells = cell;
}


/* -----------------------------------------------------------------------
 *  Symbol & Void, type 1 & type 0
 *
 *  Symbols have an id, it is an integer. Whenever the value of a symbol
 *  is required as a number, that id is used. Whenever it is the text
 *  representation that is required, it's the name of the symbol that
 *  is used.
 *    0 is both void and false
 *    1 is true, it's symbolic!
 */

// Symbol with id 0 is void
const type_void_name   = "void";
const type_void_id     = 0;
const type_symbol_name = "symbol";
const type_symbol_id   = type_void_id + 1;

// the dictionary of symbols
const all_symbol_cells_by_name = new Map< text, InoxCell >();
const all_symbol_cells_by_id   = new Array< InoxCell >();
const all_symbol_names_by_id   = new Array< text >()

let next_symbol_id : u32 = 0;
// The first symbol, void, will be id 0


function make_symbol_cell( name : text ) : InoxCell {

  de&&mand( name != "" );
  if( name == "" )return symbol_void_cell;

  if( all_symbol_cells_by_name.has( name ) ){
    return all_symbol_cells_by_name.get( name );
  }

  let id = next_symbol_id++;
  let cell = make_cell( type_symbol_id, id, id );

  // Update symbol dictionary
  all_symbol_cells_by_name.set( name, cell );
  all_symbol_cells_by_id[ id ] = cell;
  all_symbol_names_by_id[ id ] = name;

  de&&mand(    symbol_id_to_text( id ) == name );
  de&&mand_eq( get_symbol_by_id( id  ), cell   );
  de&&mand_eq( get_cell_value(  cell ), id     );
  de&&mand_eq( get_cell_name(   cell ), id     );
  de&&mand_eq( get_cell_type(   cell ), 1      );

  return cell;

}

function symbol( name : text ) : InoxName {
  const cell = make_symbol_cell( name );
  return get_cell_value( cell );
}


// First cell ever
const the_void_cell    = make_cell( type_void_id, type_void_id, 0 );
const symbol_void_cell = make_symbol_cell( type_void_name );
const symbol_void_id   = get_cell_name( symbol_void_cell );

// Symbol with id 1 is #symbol
const symbol_symbol_cell = make_symbol_cell( type_symbol_name );
const symbol_symbol_id   = get_cell_name( symbol_symbol_cell );

// Symbol with id 2 is #work, used by global work cells of each cell type
const symbol_work_cell = make_symbol_cell( "work" );
const symbol_work_id   = get_cell_name( symbol_work_cell );

const the_symbol_work_cell = make_symbol_cell( "working" );
set_cell_name( the_symbol_work_cell, symbol_work_id );


function symbol_id_to_text( id : u32 ) : text {
  return all_symbol_names_by_id[ id ];
}


function get_symbol_by_id( id : u32 ) : InoxCell {
// Return the address of the cell that holds the symbol singleton
  return all_symbol_cells_by_id[ id ];
}


function is_void_cell( cell : InoxCell ) : InoxValue {
  if( get_cell_type( cell ) == type_void_id )return 1;
  return 0;
}


function is_symbol_cell( cell : InoxCell ) : InoxValue {
  if( get_cell_type( cell ) == type_integer_id )return 1;
  return 0;
}


/* -----------------------------------------------------------------------
 *  Integer, type 2, 31 bits
 *  When more than 31 bits is needed, value points to some larger object.
 *  ToDo: u8+ style to deal with less common arrays of bits.
 */

const type_integer_name = "integer";
const type_integer_id   = type_symbol_id + 1;

const symbol_integer_cell = make_symbol_cell( type_integer_name );
const symbol_integer_id   = get_cell_name( symbol_integer_cell );


function make_integer_cell( value ){
  return make_cell( type_integer_id, symbol_integer_id, value );
}


const the_integer_work_cell =  make_integer_cell( 0 );
set_cell_name( the_integer_work_cell, symbol_work_id );
const the_boolean_work_cell =  make_integer_cell( 0 );
set_cell_name( the_integer_work_cell, symbol( "boolean" ) );


function get_cell_integer( cell : InoxCell ) : InoxValue {
  de&&mand_eq( get_cell_type( cell ), type_integer_id );
  return get_cell_value( cell );
}


function is_integer_cell( cell : InoxCell ) : InoxValue {
  if( get_cell_type( cell ) == type_integer_id )return 1;
  return 0;
}


function is_bigint_cell( cell : InoxCell ) : InoxValue {
  de&&mand( !! is_integer_cell( cell ) );
  const value = get_cell_value( cell );
  if( ( value & 0x80000000 ) != 0 )return 1;
  return 0;
}


/* -----------------------------------------------------------------------
 *  Text, type 3
 *
 *  Currently implemented using an opaque object
 */

const type_text    = "text";
const type_text_id = type_integer_id + 1;
const symbol_text_cell = make_symbol_cell( type_text );
const symbol_text_id   = get_cell_name( symbol_text_cell );

// texts are stored in some opaque objet in this implementation
// Access to oject is opaque, there is an indirection
// Each object has an integer id, starting at 0

let next_object_id = 0;

let free_objects : InoxOid = 0;

// Indirection table to get access to an object using it's id
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


function get_cell_opaque_object( cell : InoxCell ){
  let oid = get_cell_value( cell );
  return get_opaque_object_by_id( oid );
}


function object_id_to_text( id : InoxOid ) : text {
  let obj : any = get_opaque_object_by_id( id );
  return obj.toString();
}


function free_object( id : InoxOid ){
  // ToDo: list of free objects to reallocate
  all_objects_by_id[ id ] = 0;
  free_objects = id;
}


const the_empty_text_cell = make_cell(
  type_text_id,
  symbol_text_id,
  make_opaque_object( "" )
);


function make_text_cell( value : text ) : InoxCell {
  if( value.length === 0 )return the_empty_text_cell;
  // ToDo: share strings of symbols?
  const cell = make_cell(
    type_text_id,
    symbol_text_id,
    make_opaque_object( value )
  );
  de&&mand( cell_to_text( cell ) == value );
  return cell;
}


const the_text_work_cell = make_text_cell( "work" );
set_cell_name( the_text_work_cell, symbol_work_id );


/* -----------------------------------------------------------------------
 *  Object, type 4
 */

const type_object_name = "object";
const type_object_id   = type_text_id + 1;
const symbol_object_cell = make_symbol_cell( type_object_name );
const symbol_object_id   = get_cell_name( symbol_object_cell );


function make_object( object : Object ) : InoxCell {
  let symbol = make_symbol_cell( object.constructor.name );
  return make_cell( type_object_id, symbol , make_opaque_object( object ) );
}

const the_object_work_cell = make_object( {} );
set_cell_name( the_object_work_cell, symbol_work_id );


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

const type_act_name = "act";
const type_act_id   = type_object_id + 1;
const symbol_act_cell    = make_symbol_cell( type_act_name );

type RefCount = InoxValue;

 class Act {
  filler   : InoxAddress;  // type and name, packed
  locals   : InoxCell;     // = make_map() or void if none
  refcount : RefCount;     // free when no more references
}


function make_act( caller : InoxCell ) : InoxCell {
  let address = allocate_bytes( words_per_cell + words_per_cell / 2 );
  set_cell_info( address, pack( type_act_id, get_cell_info( caller ) ) );
  // No local variables initially
  set_cell_value( address, the_void_cell );
  // Store reference counter
  store32( address + words_per_cell, 1 );
  return address;
}

const the_act_work_cell = make_act( 0 );
set_cell_name( the_act_work_cell, symbol_work_id );


function get_act_refcount( address : InoxAddress ) : RefCount {
  return fetch( address + 8 );
}


function set_act_refcount(
  address : InoxAddress,
  count   : InoxValue
) : void {
  set_cell_value( address, count );
}


var free_acts = the_void_cell;


function allocate_act( caller : InoxCell ) : InoxCell {
  if( free_acts == the_void_cell )return make_act( caller );
  let act = free_acts;
  free_acts = get_next_cell( act );
  set_cell_info( act, pack( type_act_id, get_cell_info( caller ) ) );
  return act;
}


function free_act( act : InoxCell ) : void {
  set_next_cell( act, free_acts );
  free_acts = act;
}


function ref_act( act : InoxCell ) : void {
  set_act_refcount( act, get_act_refcount( act ) + 1 );
}


function deref_act( act : InoxCell ) : void {
  var count = get_act_refcount( act );
  count--;
  if( count == 0 ){
    free_act( act );
  }
}


/* -----------------------------------------------------------------------
 *  Word, type 6
 *    the name of the Inox word is an integer id, an index in the symbol
 *    table.
 *    the value is the address where the Inox word is defined is the VM
 *    memory using 16 bits memory words
 */


const type_word_name = "word";
const type_word_id = type_act_id + 1;
const symbol_word_cell = make_symbol_cell( type_word_name );

// The dictionary of all Inox words
let next_inox_word_id = 0;
let all_inox_word_cells_by_id = Array< InoxAddress >();
let all_inox_word_ids_by_name = new Map< text, InoxValue >()


function make_inox_word( cell : InoxCell ) : InoxCell {
// Define an Inox word. It's name is the name of the cell.
  // The cell's value is the adress where the word definition starts.
  // The definition is an array of 16 bits words with primitive ids and
  // word ids. See run_fast() where the definition is interpreted.
  // ToDo: Forth also requires a pointer to the previous definition of
  // the word.
  let id = next_inox_word_id++;
  let name = unpack_name( get_cell_info( cell ) );
  let word_cell : InoxCell
  = make_cell( type_word_id, name, get_cell_value( cell ) );
  all_inox_word_cells_by_id[ id ] = word_cell;
  all_inox_word_ids_by_name.set( symbol_id_to_text( name ), id );
  return word_cell;
}


function get_inox_word_cell_by_id( id : InoxValue ) : InoxAddress {
  return all_inox_word_cells_by_id[ id ];
}


function inox_word_name_to_text( id : InoxValue ): text {
  let word_cell = get_inox_word_cell_by_id( id );
  let name = get_cell_name( word_cell );
  let str_name : text = symbol_id_to_text( get_cell_value( name ) );
  return str_name;
}


function get_inox_word_definition_by_name( name : text ) : InoxAddress {
  // ToDo: implement header with flags, length and pointer to previous
  let id : InoxIndex;
  let cell : InoxCell;
  if( all_inox_word_ids_by_name.has( name ) ){
    id   = all_inox_word_ids_by_name.get( name );
    cell = all_inox_word_cells_by_id[ id ];
  }else if( all_primitive_ids_by_name.has( name ) ){
    id   = all_primitive_ids_by_name.get( name );
    cell = all_primitive_cells_by_id[ id ];
  }else{
    // Not found, return void cell, aka 0
    de&&bug( "Name not found: " + name );
    return the_void_cell;
  }
  return get_cell_value( cell );
}


function get_inox_word_id_by_name( name : text ){
  let id : InoxIndex;
  if( all_inox_word_ids_by_name.has( name ) ){
    return all_inox_word_ids_by_name.get( name );
  }else{
    // Not found, return void cell, aka 0
    de&&bug( "Name not found: " + name );
    return 0;
  }
}


function get_inox_word_definition_by_id( id : InoxIndex  ) : InoxAddress {
  let cell : InoxCell = all_inox_word_cells_by_id[ id ];
  return get_cell_value( cell );
}


function get_definition_length( bytes : InoxAddress ) : InoxIndex {
  return load16( bytes - 1 ) & 0x0fff;
}


function set_inox_word_immediate_flag( id : InoxIndex ) : void {
  const bytes = get_inox_word_definition_by_id( id );
  store16( bytes - 1, load16( bytes - 1 ) | 0x8000 );
}


function is_immediate_inox_word( id : InoxIndex ) : InoxValue {
  const bytes = get_inox_word_definition_by_id( id );
  return ( load16( bytes - 1 ) & 0x8000 ) != 0 ? 1 : 0;
}


function set_inox_word_hidden_flag( id : InoxIndex ) : void {
  const bytes = get_inox_word_definition_by_id( id );
  store16( bytes - 1, load16( bytes - 1 ) | 0x4000 );
}


function is_hidden_inox_word( id : InoxIndex ) : InoxValue {
  const bytes = get_inox_word_definition_by_id( id );
  return ( load16( bytes - 1 ) & 0x4000 ) != 0 ? 1 : 0;
}


function set_inox_word_operator_flag( id : InoxIndex ) : void {
  const bytes = get_inox_word_definition_by_id( id );
  store16( bytes - 1, load16( bytes - 1 ) | 0x2000 );
}


function is_operator_inox_word( id : InoxIndex ) : InoxValue {
  const bytes = get_inox_word_definition_by_id( id );
  return ( load16( bytes - 1 ) & 0x2000 ) != 0 ? 1 : 0;
}


function set_inox_word_stream_flag( id : InoxIndex ) : void {
  // See Icon language goal directed backtrackings
  // https://lib.dr.iastate.edu/cgi/viewcontent.cgi?article=1172&context=cs_techreports
  const bytes = get_inox_word_definition_by_id( id );
  store16( bytes - 1, load16( bytes - 1 ) | 0x1000 );
}


function is_stream_inox_word( id : InoxIndex ) : InoxValue {
  const bytes = get_inox_word_definition_by_id( id );
  return ( load16( bytes - 1 ) & 0x1000 ) != 0 ? 1 : 0;
}


/* -----------------------------------------------------------------------------
 *  Float, Array, Map, List
 *  Currently implemented as opaque objects
 *  ToDo: implement lists using name and value of cell
 */


const type_float_name = "float";
const type_float_id   = type_object_id;
const symbol_float_cell = make_symbol_cell( type_float_name );


function make_float( value : float ){
  return make_cell(
    type_object_id,
    symbol_object_id,
    make_opaque_object( value )
  );
}


const type_array_name = "array";
const symbol_array_cell = make_symbol_cell( type_array_name );
const symbol_array_id = get_cell_name( symbol_array_cell );


function make_array( obj? : Object ) : InoxCell {
  let array = obj;
  if( ! obj ){
    array = new Array< InoxCell >();
  }
  return make_cell(
    type_object_id,
    symbol_array_id,
    make_opaque_object( array )
  );
}


const type_map = "map";
const symbol_map_cell = make_symbol_cell( type_map );

const symbol_map_id = get_cell_name( symbol_map_cell );

function make_map( obj? : Object ){
  let map = obj;
  if( ! obj ){
    map = new Map< InoxOid, InoxCell >();
  }
  return make_cell(
    type_object_id,
    symbol_map_id,
    make_opaque_object( map )
  );
}


const type_list = "list";
const symbol_list_cell = make_symbol_cell( type_list );
const symbol_list_id = get_cell_name( symbol_list_cell );


function make_list( obj? : Object ) : InoxCell {
  // ToDo: value should a linked list of cells
  let list = obj;;
  if( ! obj ){
    list = new Array< InoxCell >();
  }
  return make_cell(
    type_object_id,
    symbol_list_id,
    make_opaque_object( list )
  );
}


/* --------------------------------------------------------------------------
 *  Task
 *  ToDo: make it a first class type?
 */

const type_task   = "task";
const symbol_task_cell = make_symbol_cell( type_task );
const symbol_task_id = get_cell_name( symbol_task_cell );

// Global state about currently running task
let current_task : Task;
let current_ip   : InoxAddress;
let current_rsp  : InoxAddress;
let current_dsp  : InoxAddress;


class CpuContext {

  ip  : InoxAddress; // Current instruction pointer in code
  dsp : InoxCell;    // Data stack pointer, goes downward
  rsp : InoxCell;    // Stack pointer for call returns, goes downward

  constructor(
    ip  : InoxAddress,
    dsp : InoxCell,
    rsp : InoxCell
  ){
    this.ip  = ip;
    this.dsp = dsp;
    this.rsp = rsp;
  }

}


class Task {
// Inox machines run cooperative tasks, actors typically

  cell         : InoxCell;    // Cell that references this object
  parent       : InoxCell;    // Parent task
  act          : InoxCell;    // Current activation record
  memory       : InoxCell;    // Memory pointer, in ram array, goes upward
  stack        : InoxCell;    // Base address of data stack cell array
  return_stack : InoxAddress; // Base address of return stack, 32 entries
  ctx          : CpuContext;  // Include ip, dsp & rsp

  constructor(
    parent   : InoxCell,
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
    // Room for stacks, both data parameters and returns
    this.memory = allocate_bytes( size );
    // Return stack is at the very end, with small room for underflow
    this.return_stack
    = this.memory + ( ( size / size_of_word ) - 2 * words_per_cell );
    // Data stack is just below the return stack made of 32 levels
    this.stack = this.return_stack - ( words_per_cell * 32 );
    this.ctx = new CpuContext( ip, this.stack, this.return_stack );
    de&&mand( this.ctx.dsp <= this.stack );
    de&&mand( this.ctx.dsp >  this.memory );
  }

  get_context() : CpuContext {
    return this.ctx;
  }

  restore_context( ctx : CpuContext ) : void {
    current_task = this;
    current_ip   = this.ctx.ip  = ctx.ip;
    current_dsp  = this.ctx.dsp = ctx.dsp;
    current_rsp  = this.ctx.rsp = ctx.rsp;
  }
}


function make_task( parent : InoxCell, act : InoxCell ) : InoxCell {
  let size = 1024 * 16; // 1 kb, for parameters & returns stacks; ToDo
  var new_task = new Task( parent, 1, act, size );
  // Fill parameter stack with act's parameters
  // ToDo [ act.locals ];
  let cell = make_object( new_task );
  new_task.cell = cell;
  return cell;
};


// Current task is the root task
let root_task: InoxCell = make_task( the_void_cell, the_void_cell );
current_task = get_cell_opaque_object( root_task );

// Current task changes at context switch
task_switch( current_task );

// There is nothing in the free list
let free_tasks = the_void_cell;


function allocate_task( parent : InoxCell, act:InoxCell ) : InoxCell {
  if( free_tasks == the_void_cell )return make_task( parent, act );
  let task = free_tasks;
  let task_object = get_cell_opaque_object( task );
  task_object.ctx.ip = 1;
  task_object.parent = parent;
  task_object.act = act;
  return task;
}


function free_task( task : InoxCell ){
// add task to free list
  set_next_cell( task, free_tasks );
  free_tasks = task;
}


// primitive to switch to another task
function primitive_task_switch() : void {
  var next_task = this.pop();
  task_switch( get_cell_opaque_object( next_task ) );
}


function task_switch( task : Task ) : void {
  task.restore_context( task.get_context() );
}
function primitive_make_task() : void {
  let ip : InoxAddress = get_cell_value( this.dsp() );
  var act = allocate_act( current_task.cell );
  var new_task : InoxCell = allocate_task( current_task.cell, act );
  // ToDo: push( parameters ); into new task
  let t : Task = get_cell_opaque_object( new_task );
  t.ctx.ip = ip;
  copy_cell(
    make_cell( type_object_id, symbol_task_id, new_task ),
    this.dsp()
  );
  de&&mand( t.ctx.dsp <= t.stack );
  de&&mand( t.ctx.dsp >  t.memory );
};


/* -----------------------------------------------------------------------
 *  primitives
 *
 *  ToDo: use failure/success insteqd of false/true,
 *  See Icon at https://lib.dr.iastate.edu/cgi/viewcontent.cgi?article=1172&context=cs_techreports
 */

let next_primitive_id             = 0;
let all_primitive_cells_by_id     = new Array< InoxCell >();
let all_primitive_fumctions_by_id = new Array< Function >();
let all_primitive_ids_by_name     = new Map< text, InoxIndex >();


function primitive( name : text, fn : Function ) : InoxCell {
// Helper to define a primitive
// It also defines an Inox word that calls that primitive

  // Allocate a cell that points on the Function object
  let function_cell = make_object( fn );

  // Will store primitive's name as a symbol
  let symbol_cell = make_symbol_cell( name );

  // Make sure the name of the cell is as desired
  set_cell_info(
    function_cell,
    pack(
      get_cell_type( function_cell ),
      get_cell_name( symbol_cell   )
    )
  );

  // Assign a new primitive id to the new primitive
  let id = next_primitive_id++;

  // Associate name, primitive id and cell in all directions
  all_primitive_cells_by_id[ id ] = function_cell;
  all_primitive_fumctions_by_id[ id ] = fn;
  all_primitive_ids_by_name.set( name, id );

  // Make also an Inox word that calls the primitives
  // 16 bits with the primitive id and 16 bits with "next" instruction code
  let bytes : InoxAddress = allocate_bytes( 6 );
  store16( bytes,     2           ); // flags and length
  store16( bytes + 1, 0x4000 + id ); // primitive
  store16( bytes + 2, 0           ); // "next" special code

  // Use symbol_cell as a tmp cell to make well named new word
  const save = get_cell_value( symbol_cell );
  set_cell_value( symbol_cell, bytes + 1 ); // points to code
  let word_cell = make_inox_word( symbol_cell );
  // Restore the proper value of the symbol, a constant, its numeric id
  set_cell_value( symbol_cell, save );

  de&&mand_eq( get_inox_word_definition_by_name( name ), bytes + 1 );
  de&&mand_eq(
    load16( get_inox_word_definition_by_name( name ) ),
   ( 0x4000 + id )
  );

  de&&bug( inox_word_cell_to_text_definition( word_cell ) );

  return word_cell;

}


function immediate_primitive( name : text, fn : Function ) : InoxCell {
// Helper to define an immediate primitive
// In inox-eval, immediate Inox words are executed instead of being
// added to the new Icon word definition that follows the : word
  let cell = primitive( name, fn );
  set_inox_word_immediate_flag( get_inox_word_id_by_name( name ) );
  return cell;
}


function operator_primitive( name : text, fn : Function ) : InoxCell {
// Helper to define an operator primitive
  let cell = primitive( name, fn );
  set_inox_word_operator_flag( get_inox_word_id_by_name( name ) );
  return cell;
}


primitive( "inox-next", function inox_next(){
// primitive with id 0 is "next", jump to return address
  let rsp : InoxAddress = this.rsp();
  this.set_rsp( rsp + words_per_cell );
  this.set_ip( load32( rsp ) );
  de&&mand( this.ip() );
} );


de&&mand_eq(
  load16( get_inox_word_definition_by_name( "inox-next" ) ),
  0x4000
);


primitive( "go-jump", function go_jump(){
// Primitive with id 1 is "jump" to some relative position
  // ToDo: conditional jumps
  this.set_ip( this.ip() + load32( this.pop() ) );
} );


primitive( "make_task",   primitive_make_task   );
primitive( "task_switch", primitive_task_switch );

// ToDo: core dictionary

// Parameters stack manipulations
primitive( "push", function primitive_push() { this.push() } );
primitive( "drop", function primitive_drop() { this.pop()  } );


primitive( "it",   function primitive_it(){
// Recover last consumed stack entry
  copy_cell( this.dsp(), this.push() );
} );


primitive( "dup",  function primitive_dup(){
  copy_cell( this.dsp(), this.push() );
} );

const tmp_cell = make_cell( type_void_id, symbol_void_id, 0 );

primitive( "swap",  function primitive_swap(){
  const dsp0 = this.dsp();
  const dsp1 = dsp0 + words_per_cell;
  copy_cell( dsp0, tmp_cell );
  copy_cell( dsp1, dsp0 );
  copy_cell( tmp_cell, dsp1 );
} );


function integer_cell_to_text( cell : InoxCell ) : text {

  const value = get_cell_value( cell );

  // ToDo: direct small integer or opaque pointer to bigger object
  /*
  if( ( value & 0x80000000 ) == 0 ){
    return "" + value;
  }else{
    return get_opaque_object_by_id( value & 0x7fffffff ).toString();
  }
 */

  return "" + value;

}


function cell_to_symbol( cell : InoxCell ) : InoxCell {

  let value : InoxValue = get_cell_value( cell );
  let info  : InoxInfo  = get_cell_info(  cell );
  let type  : InoxType  = unpack_type( info );

  if( type == type_symbol_id )return all_symbol_cells_by_id[ value ];
  return make_symbol_cell( cell_to_text( cell ) );

}


function cell_to_text( cell : InoxCell ) : text {

  let value : InoxValue = get_cell_value( cell );
  let info  : InoxInfo  = get_cell_info(  cell );
  let type  : InoxType  = unpack_type( info );

  // Fast with text objects
  if( type == type_text_id ){
    return all_objects_by_id[ value ];
  }else if( type == type_symbol_id ){
    return all_symbol_names_by_id[ value ];
  }else if( type == type_integer_id ){
    return integer_cell_to_text( cell );
  }else if( type == type_void_id ){
    return "void";
  }

  let name : InoxName = unpack_name( info );
  let buf : text = "";

  if( de ){
    buf += "(" + "&" + cell;
    buf += "," + symbol_id_to_text( type ) + "/" + type;
    buf += "," + symbol_id_to_text( name ) + "/" + name + ")";
  }

  switch( type ){
    case type_void_id :
      buf += "<void>";
    break;
    case type_symbol_id :
      buf += "#" + symbol_id_to_text( value );
    break;
    case type_integer_id :
      buf += integer_cell_to_text( cell );
    break;
    case type_text_id :
      buf += all_objects_by_id[ value ];
    break;
    case type_object_id :
      if( all_objects_by_id[ value ] ){
        let obj : any = all_objects_by_id[ value ];
        buf += "<" + obj.name + "." + value + ">";
      }else{
        buf += "<?." + value + ">";
      }
    break;
    case type_act_id : buf += "<act:" + value + ">";
    break;
    case type_word_id : buf += "<word:" + value + ">";
    break;
    default :
      de&&mand( false );
      buf += "<???/" + type + ":" + value + ">";
    break;
  }

  return buf;

}


function dump_stack( dsp: InoxAddress, base: InoxAddress ){

  const p0 = dsp;
  const p1 = p0 + words_per_cell;
  const p2 = p1 + words_per_cell;
  const x0 = get_cell_value( p0 );
  const x1 = get_cell_value( p1 );
  const x2 = get_cell_value( p2 );

  de&&bug( "STACK: "
    +   "&" + p0 + ", v0=" + x0
    + ", &" + p1 + ", v1=" + x1
    + ", &" + p2 + ", v2=" + x2 + "."
  );

  let ptr = dsp;

  if( ptr > base ){
    bug(
      "Stack underflow, top " + dsp + ", base " + base
      + ", delta " + ( base - dsp )
      + ", excess pop " + ( ( base - dsp ) / words_per_cell )
    )
  }

  let nn = 0;
  while( ptr <= base ){
    bug( ""
      + nn + " -> &" + ptr
      + ": " + cell_to_text( ptr )
      + ( ptr == current_task.stack ? " <= BASE" : "" )
    );
    ptr += words_per_cell;
    nn++;
  }

  bug( "." );

}

/* ---------------------------------------------------------------------------
 *  Some type checking
 */


function mand_integer( cell ){
  if( get_cell_type( cell ) == type_integer_id )return;
  bug( "!!! integer expected, instead: "
  + get_cell_type( cell ) + "/" + cell_to_text( cell ) )
  assert( false );
}


function mand_symbol( cell ){
  if( get_cell_type( cell ) == type_symbol_id )return;
  bug( "!!! symbol expected, instead: "
  + get_cell_type( cell ) + "/" + cell_to_text( cell ) )
  assert( false );
}


function mand_text( cell ){
  if( get_cell_type( cell ) == type_text_id )return;
  bug( "!!! text expected, instead: "
  + get_cell_type( cell ) + "/" + cell_to_text( cell ) )
  assert( false );
}


/* ---------------------------------------------------------------------------
 *  Some operators
 */

operator_primitive( "+", function primitive_add(){
  const p1 = this.pop();
  const x1 = get_cell_value( p1 );
  const p0 = this.dsp();
  const x0 = get_cell_value( p0 );
  if( check_de ){
    if( get_cell_type( p1 ) != type_integer_id ){
      bug( "bad type, expecting integer second operand to +" );
      assert( false );
      return;
    }
    if( get_cell_type( p0 ) != type_integer_id ){
      bug( "bad type, expecting integer first operand to +" );
      assert( false );
      return;
    }
  }
  const r  = x0 + x1;
  set_cell_value( p0, r );
} );


primitive( "inox-if", function primitive_if(){
  const p1 = this.pop();
  if( get_cell_value( p1 ) == 0 ){
    // inox-call will detect void and do nothing accordingly
    copy_cell( the_void_cell, this.dsp() );
  }
} );


primitive( "inox-to-R", function primitive_inox_to_R(){
  const rsp = this.rsp() - words_per_cell;
  copy_cell( this.pop(), rsp );
  this.set_rsp( rsp );
} );


primitive( "inox-from-R", function primitive_inox_from_R(){
  const rsp = this.rsp();
  copy_cell( rsp, this.push() );
  this.set_rsp( rsp + words_per_cell );
} );


primitive( "inox-fetch-R", function primitive_inox_fetch_R(){
  copy_cell( this.rsp(), this.push() );
} );


primitive( "inox-while", function primitive_while(){

  const body_block      = get_cell_value( this.pop() );
  const condition_block = get_cell_value( this.pop() );

  const rsp = this.rsp();
  const next_rsp = this.rsp() - words_per_cell;
  set_cell_value( next_rsp, 0x0000 );

  loop: while( true ){

    this.set_rsp( next_rsp );
    this.set_ip( condition_block );
    this.run();
    de&&mand_eq( next_rsp, this.rsp() );
    de&&mand_eq( get_cell_value( next_rsp ), 0x0000 );

    if( get_cell_value( this.pop() ) == 0 ){
      // ToDo: should check type?
      break;
    }

    this.set_ip( body_block );
    this.run();
    de&&mand_eq( next_rsp, this.rsp() );
    de&&mand_eq( get_cell_value( next_rsp ), 0x0000 );

  }

  this.set_rsp( rsp );

} );


function operator( name : text, fun : Function ) : void {

  operator_primitive(
    name,
    function primitive_binary_operator(){
      const p1 = this.pop();
      const p0 = this.dsp();
      if( check_de ){
        if( get_cell_type( p1 ) != type_integer_id ){
          bug( "bad type, expecting integer second operand" );
          assert( false );
          return;
        }
        if( get_cell_type( p0 ) != type_integer_id ){
          bug( "bad type, expecting integer first operand" );
          assert( false );
          return;
        }
      }
      const r  = fun.call( this, get_cell_value( p0 ), get_cell_value( p1 ) );
      // dump_stack( p0, p0 + ( 5 * words_per_cell ) );
      set_cell_value( p0, r );
    }
  );

}


operator( "-",    ( a, b ) => a *   b );
operator( "*",    ( a, b ) => a *   b ); // multiply
operator( "/",    ( a, b ) => a /   b );
operator( "%",    ( a, b ) => a %   b ); // remainder
operator( "**",   ( a, b ) => a **  b ); // exponentation
operator( "<<",   ( a, b ) => a <<  b ); // left binary shift
operator( ">>",   ( a, b ) => a >>  b ); // right binary shift
operator( ">>>",  ( a, b ) => a >>> b ); // idem but with 0 highest bit
operator( "AND",  ( a, b ) => a &   b ); // binary and
operator( "OR",   ( a, b ) => a |   b ); // binary or
operator( "XOR",  ( a, b ) => a ^   b ); // binary xor
operator( ">",    ( a, b ) => ( a >   b ) ? 1 : 0 );
operator( "<",    ( a, b ) => ( a <   b ) ? 1 : 0 );
operator( ">=",   ( a, b ) => ( a >=  b ) ? 1 : 0 );
operator( "<=",   ( a, b ) => ( a <=  b ) ? 1 : 0 );
operator( "is=",  ( a, b ) => ( a ==  b ) ? 1 : 0 ); // ToDo: term or failure
operator( "==",   ( a, b ) => ( a ==  b ) ? 1 : 0 );
operator( "not=", ( a, b ) => ( a !=  b ) ? 1 : 0 ); // ToDo: terme or failure
operator( "!=",   ( a, b ) => ( a !=  b ) ? 1 : 0 );
operator( "and",  ( a, b ) => ( a &&  b ) ? 1 : 0 ); // ToDo: return left term
operator( "&&",   ( a, b ) => ( a &&  b ) ? 1 : 0 );
operator( "or",   ( a, b ) => ( a ||  b ) ? 1 : 0 ); // ToDo: return first true
operator( "||",   ( a, b ) => ( a ||  b ) ? 1 : 0 );


function unary_operator( name : text, fun : Function ) : void {
  operator_primitive( name, function primitive_unary_operator(){
    const p0 = this.dsp();
    const r  = fun.call( this, get_cell_value( p0 ) );
    // dump_stack( p0, p0 + ( 5 * words_per_cell ) );
    set_cell_value( p0, r );
  } );
}

unary_operator( "not",      ( x ) => x       ?  0 :  1 );
unary_operator( "=0",       ( x ) => x == 0  ?  1 :  0 );
unary_operator( "false?",   ( x ) => x == 0  ?  1 :  0 );
unary_operator( "true?",    ( x ) => x == 0  ?  0 :  1 );
unary_operator( "=1",       ( x ) => x == 1  ?  1 :  0 );
unary_operator( "=-1",      ( x ) => x == -1 ?  1 :  0 );
unary_operator( "=0",       ( x ) => x == 0  ?  1 :  0 );
unary_operator( "<0",       ( x ) => x  < 0  ?  1 :  0 );
unary_operator( "<=0",      ( x ) => x <= 0  ?  1 :  0 );
unary_operator( ">0",       ( x ) => x  > 0  ?  1 :  0 );
unary_operator( ">=0",      ( x ) => x >= 0  ?  1 :  0 );
unary_operator( "NOT",      ( x ) => ~x                );
unary_operator( "negative", ( x ) => -x                );
unary_operator( "sign",     ( x ) => x < 0   ? -1 :  1 );
unary_operator( "abs",      ( x ) => x > 0   ?  x : -x );


operator_primitive( "&", function primitive_text_concat(){
  const p1 = this.pop();
  const p0 = this.dsp();
  const r  = make_text_cell( cell_to_text( p0 ) + cell_to_text( p1 ) );
  copy_cell( r, p0 );
} );


operator_primitive( "as\"\"", function primitive_as_test(){
  const p = this.dsp();
  if( get_cell_type( p ) == type_text_id )return;
  copy_cell( make_text_cell( cell_to_text( p ) ), p );
} );


operator_primitive( "is\"\"", function primitive_is_empty_text(){
  const p0 = this.dsp();
  set_cell_value(
    the_boolean_work_cell,
    get_cell_type( p0 ) == type_text_id
    && get_cell_value( p0 ) == get_cell_value( the_empty_text_cell )
    ? 1 : 0
  );
  copy_cell( the_boolean_work_cell, p0 );
} );


// ToDo: handle method dispatch and function call to undefined words
const symbol_method_missing = make_symbol_cell( "method-missing" );
const symbol_word_missing   = make_symbol_cell( "word-missing"   );


function inox_code_to_text( word16 : InoxIndex ){
// what type of code is this, Inox word, primitive, literal, jump?

  let type      : usize;
  let code      : usize;
  let word_cell : InoxCell;
  let primitive : InoxCell;
  let name_id   : InoxIndex;
  let name_str  : text;
  let fun       : Function;

  type = word16 >>> 14;
  code = word16 & 0x3fff;

  // If code is a primitive
  if( type == 1 ){

    primitive = all_primitive_cells_by_id[ code ];
    name_id = get_cell_name( primitive );
    fun = all_primitive_fumctions_by_id[ code ];

    return symbol_id_to_text( name_id )
    + " ( primitive " + fun.name + " )";

  // If code is a literal
  }else if( type == 2 ){

    // ToDo: decode small integers
    if( ( code & 0x2000 ) == 0x2000 ){
      return "" + ( code & 0x1fff )  + " ( 13 bits integer literal )";
    }
    return cell_to_text( code << 2 ) + " ( literal " + ( code << 2 ) + " )";

  // If code is a jump
  }else if ( type == 3 ){
    return " jump " + code

  // If code is the integer id of an Inox word, a token
  }else{
    word_cell = get_inox_word_cell_by_id( code );
    name_id   = get_cell_name( word_cell );
    name_str  = symbol_id_to_text( name_id );
    return name_str + " ( word " + code + " )";
  }

}


function inox_word_to_text_definition( id : InoxIndex ) : text {
// Return the decompiled source code that defined the Inox word
  // A non primitive Inox word is defined using 16 bits codes that
  // reference other Inox words, primitive words, text and integer
  // literals and jump destinations

  let name = inox_word_id_to_text( id );

  // The definition is an array of 16 bits inox_words in memory
  let def : InoxAddress = get_inox_word_definition_by_id( id );

  // An additional memory word, before codes, stores flags & length
  let flags_and_length = load16( def - 1 );
  let flags  = flags_and_length & 0xf000;
  let length = flags_and_length & 0x0fff;

  // ToDo: add a pointer to the previous word definition

  let buf = ": ( definition of " + name + ", word " + id
  + ", cell " + def + ", flags " + flags + ", length " + length + " )\n";

  let ip = 0;
  let word16    : usize;

  while( ip < length ){

    word16 = load16( def + ip );

    buf += "" + inox_code_to_text( word16 ) + " ( " + ip + " )\n";

    ip++;

  }

  return buf;

}


function inox_word_id_to_text( id : InoxIndex ) : text {
  let word_cell = get_inox_word_cell_by_id( id );
  let name_id   = get_cell_name( word_cell );
  return symbol_id_to_text( name_id );
}


function inox_word_cell_to_text_definition( cell : InoxCell ) : text {
  const name_id = get_cell_name( cell );
  const id = all_inox_word_ids_by_name.get( symbol_id_to_text( name_id ) );
  return inox_word_to_text_definition( id );
}


/* -----------------------------------------------------------------------
 *  constants, global variables, static variables, local variables and
 *  block local variables.
 *  ToDo: task local variables?
 */


function primitive_constant(){

  const cell = fast_allocate_cell();
  copy_cell( this.pop(), cell );

  // Create symbol if necessary
  const symbol_cell = cell_to_symbol( this.pop() );
  const name = cell_to_text( symbol_cell );

  // ToDo: don't use 2, use size_of_something instead
  let bytes = allocate_bytes( ( 1 + 2 ) * 2 );

  // flags and length need an extra word, so does then ending "next"
  store16( bytes, 1 + 1 );

  store16( bytes + 1, 0x8000 | ( cell >> 2 ) );

  // Add code to return from word, aka "next" special code
  store16( bytes + 1 + 2, 0 );

  const save = get_cell_value( symbol_cell );
  set_cell_value( symbol_cell, bytes + 1 ); // skip flags and length

  make_inox_word( symbol_cell );

  // Restore the proper value of the symbol, its numeric id
  set_cell_value( symbol_cell, save );

  de&&mand_eq( get_inox_word_definition_by_name( name ), bytes + 1 );
  de&&mand_eq(
    load16( get_inox_word_definition_by_name( name ) + 2 ),
    0
  );

}
primitive( "constant", primitive_constant );


primitive( "global", function primitive_global(){
  primitive_constant.call( this );
} )


immediate_primitive( "@", function primitive_address_of(){
  let token = get_next_token();
  if( check_de ){
    if( token.type != "word" ){
      bug( "Not the expected variable name"
       + ", instead: " + token.type + "/" + token.value );
       copy_cell( the_void_cell, this.push() );
       return;
    }
  }
  let definition = get_inox_word_definition_by_name( token.value );
  if( check_de ){
    if( definition == the_void_cell ){
      bug( "Not the expected variable name"
       + ", instead: " + token.type + "/" + token.value );
       copy_cell( the_void_cell, this.push() );
       return;
    }
  }
  // The cell is encoded as a literal
  let cell = ( load16( definition ) & 0x7fff ) << 2;
  set_cell_value( the_integer_work_cell, cell );
  do_literal_function.call( this, the_integer_work_cell );
} );


primitive( "set!", function primitive_set_content(){
  const p1 = this.pop();
  const p0 = this.pop();
  copy_cell( p0, get_cell_value( p1 ) );
} );

primitive( "get", function primitive_get(){
  const cell = this.dsp();
  copy_cell( get_cell_value( cell ), cell );
} );



/* -----------------------------------------------------------------------
 *  runner, fast, excute 16 bits encoded machine codes
 */

class InoxExecutionContext {

    ip:      Function; // instruction pointer
    rsp:     Function; // return stack point
    dsp:     Function; // data stqck pointer
    set_ip:  Function;
    set_rsp: Function;
    set_dsp: Function;
    pop:     Function; // returns dsp++
    push:    Function; // --dsp
    run:     Function; // points to runner() closure

    is_eval: InoxValue;

}

const TheInoxExecutionContext = new InoxExecutionContext();


function run_fast( ctx : CpuContext ){
// This is the one function that needs to run fast.
// It should be optimized by hand depending on the target CPU.
  // See https://muforth.nimblemachines.com/threaded-code/
  // Also http://www.ultratechnology.com/1xforth.htm
  // and http://www.bradrodriguez.com/papers/moving1.htm

  // Setup cpu context, instruction pointer, data & return stacks
  // These variables would be stored in some CPU registers if this routine
  // was coded in machine code
  let   IP  : InoxAddress = ctx.ip;
  let   RSP : InoxAddress = ctx.rsp;
  let   DSP : InoxAddress = ctx.dsp;
                        de && mand(DSP <= current_task.stack);

  de&&mand( !! IP );


  // primitives have a limited access to the environment, but fast
  const inox = TheInoxExecutionContext;
  inox.ip  = function ip(){  return IP;  };
  inox.rsp = function rsp(){ return RSP; };
  inox.dsp = function dsp(){ return DSP; };
  // ToDo gmp & tmp, global memory pointer and task memory pointer
  // ToDo ap, current Act pointer
  inox.set_ip  = function set_ip(  v : InoxAddress ){ return IP  = v; };
  inox.set_rsp = function set_rsp( v : InoxAddress ){ return RSP = v; };
  inox.set_dsp = function set_dsp( v : InoxAddress ){ return DSP = v; };

  inox.push = function push(){
    return DSP -= words_per_cell;
  };

  inox.pop = function pop(){
    const x = DSP;
    DSP += words_per_cell;
    return x;
  }
  inox.run     = runner;


  function runner(){

    const mem16 = new Uint16Array( memory8 );

    let word : usize;
    let code : usize;

    while( true ){

      // Get 16 bits word to execute, 2 bits code, 14 bits operand
      word = mem16[ IP ];
      run_de&&bug( "run " + IP + " " + inox_code_to_text( word ) );
      stack_de&&dump_stack( DSP, DSP + 4 * words_per_cell );

      // Special "next" code, 0x0000, is a jump to the return address
      // Machine code equivalent would be a return from subroutine
      if( word == 0x0000 ){
        IP = load32( RSP );
        if( IP == 0 )break; // That's the only way to exit the loop
        RSP += words_per_cell;
        continue;
      }

      // What type of code this is, primitive, Inox word, literal or jump
      switch( word >>> 14 ){   // 2 bits for type

      case 0 : // Call sub routine
        RSP -= words_per_cell;
        store32( RSP, IP + 1 );
        // When definition's address is short, inside the first 0x1fff memory
        // words, the indirection could be avoided. This would be ok for most
        // of the core dictionary and some user defined words.
        // ToDo: evaluate that option
        IP = get_inox_word_definition_by_id( word ); de&&mand( IP != 0 );
      continue;

      case 1 : // Call primitive
        IP++;
        if( !de ){
          all_primitive_fumctions_by_id[ word & 0x3fff ].call( inox );
          continue;
        }
        // Some debug tool to detect suspicious return stack or IP manipulations
        if( run_de && ( word & 0x3fff ) != 61 ){ // inox-auote is special
          let old_rsp = RSP;
          let old_ip  = IP;
          all_primitive_fumctions_by_id[ word & 0x3fff ].call( inox );
          if( RSP != old_rsp ){
            let word_id = word & 0x3fff;
            let fun = all_primitive_fumctions_by_id[ word_id ];
            let name = fun.name;
            if( RSP < old_rsp ){
              bug( "??? small RSP, excess returns "
              + ( old_rsp - RSP ) / words_per_cell );
            }else{
              bug( "??? big RSP, excess calls "
              + ( RSP - old_rsp ) / words_per_cell );
            }
            de&&bug( "Due to " + inox_code_to_text( word ) );
          }
          if( IP && IP != old_ip ){
            bug( "run, IP change due to " + inox_code_to_text( word ) );
          }
        }else{
          all_primitive_fumctions_by_id[ word & 0x3fff ].call( inox );
        }
      continue;

      case 2 : // Push literal
        // ToDo: primitives could do that, one for each literal, see "constant"
        DSP -= words_per_cell;
        code = word & 0x3fff; // 14 bits for code
        // If this is some cell
        if( ( code & 0x2000 ) == 0 ){
          copy_cell( code << 2, DSP );
        // If this is a small integer, 0..1fff, 13 bits
        }else{
          // Handle negative numbers
          if( code & 0x1000 ){
            set_cell_value( DSP, - ( code & 0x0fff ) );
          }else{
            set_cell_value( DSP,   ( code & 0x0fff ) );
          }
          // ToDo: pre compute constant info for integer literals
          set_cell_info(  DSP, pack( type_integer_id, type_integer_id ) );
        }
        IP++;
      continue;

      case 3 : // Jump somewhere, conditional or not
        // ToDo: some primitives could do that, using a litteral sometimes
        if( ( code & 0x1 ) == 0x1 ){
          if( get_cell_value( DSP ) == 0 ){
            IP += ( code & 0x3ffe );
          }else{
            IP++;
          }
          DSP -= words_per_cell;
        }else{
          IP += ( code & 0x3ffe );
        }
      }
    }
  } // runner()


  runner();

  return new CpuContext( IP, DSP, RSP );

} // run_fast()


function run(){

  const task = current_task;
  de&&mand( current_dsp <= current_task.stack );
  de&&mand( current_dsp >  current_task.memory );

  // Provide minimal context to run_fast()
  let current_ctx = new CpuContext(
    current_ip,
    current_dsp,
    current_rsp
  );

  let new_ctx = run_fast( current_ctx );

  // Ajust current context based on run_fast()'s changes
  current_ip  = new_ctx.ip;
  current_dsp = new_ctx.dsp;
  current_rsp = new_ctx.rsp;

  de&&mand( task == current_task );
  de&&mand( current_dsp <= current_task.stack );
  de&&mand( current_dsp >  current_task.memory );

}


function run_inox_word( word : text ){
  current_ip = get_inox_word_definition_by_name( word );
  de&&mand( !! current_ip );
  run();
}


/* ----------------------------------------------------------------------------
 *  aliases and dialects
 */

let all_aliases = new Map< text, text >();

const all_aliases_by_style = new Map< text, Map< text, text > >();


function define_alias( style : text, alias : text, word : text ){
  let all_aliases = get_aliases_by_style( style );
  all_aliases.set( alias, word );
}


function get_alias( a : text ){
  if( !  all_aliases.has( a ) )return null;
  return all_aliases.get( a );
}

function alias( a : text ){
  if( !  all_aliases.has( a ) )return a;
  return all_aliases.get( a );
}


function set_alias_style( style : text ) : void {
  all_aliases = all_aliases_by_style.get( style );
}


function get_aliases_by_style( style : text ) : Map< text, text > {
  if( ! all_aliases_by_style.has( style ) ){
    // On the fly style creation
    return make_style_aliases( style );
  }
  return all_aliases_by_style.get( style );
}


function make_style_aliases( style : text ) : Map< text, text > {
  let new_map = new Map< text, text >();
  all_aliases_by_style.set( style, new_map );
  return new_map;
}


let inox_style         = make_style_aliases( "inox"       );
let forth_aliases      = make_style_aliases( "forth"      );
let c_aliases          = make_style_aliases( "c "         );
let javascript_aliases = make_style_aliases( "javascript" );
let list_aliases       = make_style_aliases( "lisp"       );


primitive( "inox-dialect", function primitive_inox_dialect(){
  set_style( "inox" );
});


primitive( "forth-dialect", function primitive_forth_dialect(){
  set_style( "forth" );
});


primitive( "inox-alias", function primitive_inox_alias(){
  const new_text = cell_to_text( this.pop() );
  const word = cell_to_text( this.pop() );
  define_alias( style, word, new_text );
} );




/* ----------------------------------------------------------------------------
 *  word and block compilation related
 */

// In that mode, Inox source code evaluator treats all words as if immediate
let immediate_mode         : InoxIndex = 0;

// This is the id of the word beeing defined or last defined
let last_inox_word_defined : InoxIndex = 0;

let last_quoted_word_id    : InoxIndex = 0;


// Last tokenized word
const last_token_cell = make_integer_cell( 0 );


// These functions are defined in inox-eval
let do_literal_function         : Function;
let add_code_function           : Function;
let tokenize_next_word_function : Function;


immediate_primitive( "inox>", function primitive_inox_enter_immediate_mode(){
  immediate_mode++;
} );


primitive( "<inox", function primitive_inox_leave_immediate_mode(){
  de&&mand( !! immediate_mode );
  immediate_mode--;
} );


primitive( "inox-literal", function primitive_inox_literal(){
// Add a literal to the Inox word beeing defined or to a block
  const cell = fast_allocate_cell();
  copy_cell( this.pop(), cell );
  do_literal_function.call( this, cell );
} );


primitive( "inox-add-code", function primitive_inox_add_code(){
// Add an Inox word code id to the Inox word beeing defined or to a block
  add_code_function.call( this, get_cell_value( this.pop() ) );
} );


immediate_primitive( "inox", function primitive_inox(){
// Read the next word from the source code input stream
// and get it's Inox word code id. Defaults to 0 if next token in source
// is not a defined Inox word
  tokenize_next_word_function.call( this );
} );


primitive( "inox-quote", function primitive_inox_quote(){
// Get the next word from the currently executing word and skip it
  // MUST BE INLINED
  // let rsp : InoxAddress = this.rsp();
  // let ip  : InoxAddress = load32( rsp );
  // de&&mand( !! ip );
  // this.set_rsp( rsp + words_per_cell );
  const ip = this.ip();
  let word_id = load16( ip );
  last_quoted_word_id = word_id;
  set_cell_value( the_integer_work_cell, word_id );
  copy_cell(      the_integer_work_cell, this.push() );
  // Skip the quoted word
  this.set_ip( ip + 1 );
} );


primitive( "inox-immediate", function primitive_inox_immediate(){
  set_inox_word_immediate_flag( last_inox_word_defined );
} );


primitive( "inox-hidden", function primitive_inox_hidden(){
  set_inox_word_hidden_flag( last_inox_word_defined );
} );


primitive( "inox-operator", function primitive_inox_operator(){
  set_inox_word_operator_flag( last_inox_word_defined );
} );


primitive( "inox-last-word", function primitive_inox_word(){
  copy_cell( last_token_cell, this.push() );
} );


/* -------------------------------------------------------------------------
 *  ip manipulation
 */

primitive( "inox-symbol", function primitive_inox_symbol(){
// Make a symbol, from a text typically
  const dsp = this.dsp();
  set_cell_value( the_symbol_work_cell, symbol( cell_to_text( dsp ) ) );
  copy_cell( the_symbol_work_cell, dsp );
});


primitive( "inox-call-by-name", function primitive_inox_call_by_name(){
// Call word by name
  const name = cell_to_text( this.pop() );
  let word_id = get_inox_word_id_by_name( name );
  if( word_id == 0 ){
    copy_cell( make_symbol_cell( name ), this.push() );
    word_id = get_inox_word_id_by_name( "word-missing" );
  }
  this.set_ip( get_inox_word_definition_by_id( word_id ) );
} );


primitive( "inox-definition", function primitive_inox_definition(){
// Get the address of the definition of a word
  const dsp = this.dsp();
  const name = cell_to_text( dsp );
  const word_id = get_inox_word_id_by_name( name );
  if( word_id == 0 ){
    set_cell_value( the_integer_work_cell, 0 );
    copy_cell( the_integer_work_cell, dsp );
    return;
  }
  const ip = get_inox_word_definition_by_id( word_id );
  set_cell_value( the_integer_work_cell, ip );
  copy_cell( the_integer_work_cell, dsp );
} );


primitive( "inox-jump", function primitive_inox_jump(){
  this.set_ip( get_cell_value( this.pop() ) );
} );


primitive( "inox-call", function primitive_inox_call(){
// run block unless none
  const ip = this.ip();
  const next_ip = get_cell_value( this.pop() );
  if( next_ip == 0 )return;
  this.set_rsp( this.rsp() - words_per_cell );
  set_cell_value( this.rsp(), ip );
  this.set_ip( next_ip );
} );


primitive( "inox-run", function primitive_inox(){
  // "inox Hello inox-run" does what "Hello" does alone
  this.set_ip(
    get_inox_word_definition_by_id(
      get_cell_value( this.pop() )
    )
  );
} );


primitive( "inox-block", function primitive_inox_block(){
// Skip block code after IP but push it's address. Ready for inox-call
  const ip = this.ip();
  // 0x1fff because length is encoded as a short int literal machine code
  const block_length = load16( ip ) & 0x1fff;
  if( check_de ){
    set_cell_value( the_integer_work_cell, ip + 1 );
    copy_cell( the_integer_work_cell, this.push() );
  }else{
    set_cell_value( this.push(), ip + 1 );
  }
  this.set_ip( ip + block_length + 1 );
} );


/* -----------------------------------------------------------------------
 *  Tokenizer
 */

type Token = {
  type   : text,  // comments, words, pre and post words, texts,
  value  : text,
  index  : u32,   // position in source code. To: line/column
  line   : u32,
  column : u32
};

const void_token : Token = {
  type   : "",
  value  : "",
  index  : 0,
  line   : 0,
  column : 0
};

// Tokens are extracted from a text that is "the source code"
let text         : text;
let text_length  : number;

// Count lf to help locate errors
let line_number  : number;

// There is a finite state automata, aka FSM Finite State Machine
let token_state  : text;

// The next token starts after some position in the source code
let text_cursor  : number;

// Alias expansion is "one pass only", inserted text is skipped
let alias_cursor : number;

// Some constructions detect two tokens at once, the second is delivered next
let back_token  = void_token;

// Changing the style makes it easy to customize various syntax elements
let style : text;

// Smart detection of comment style syntax, somehow
let comment_monoline_begin        : text;
let comment_monoline_begin_begin  : text;
// ToDo: nesting multiline comments
let comment_multiline_begin       : text;
let comment_multiline_begin_begin : text;
let comment_multiline_end         : text;
let comment_multiline_end_end     : text;

// Once the first comment is seen, the style is known
let first_comment_seen : boolean;


function set_style( new_style : text ) : void {
// Set the new style for future token detections

  set_alias_style( new_style );

  if( new_style == "c"
  ||  new_style == "javascript"
  ||  new_style == "inox"
  ){
    comment_monoline_begin        = "//";
    comment_monoline_begin_begin  = "/";
    comment_multiline_begin       = "/*";
    comment_multiline_begin_begin = "/";
    comment_multiline_end         = "*/";
    comment_multiline_end_end     = "/";

  }else if( new_style == "forth" ){
    comment_monoline_begin        = "\\";
    comment_monoline_begin_begin  = "\\";
    comment_multiline_begin       = "(";
    comment_multiline_begin_begin = "(";
    comment_multiline_end         = ")";
    comment_multiline_end_end     = ")";

  }else if( new_style == "list" ){
    comment_monoline_begin        = ";";
    comment_monoline_begin_begin  = ";";
    comment_multiline_begin       = "";
    comment_multiline_begin_begin = "";
    comment_multiline_end         = "";
    comment_multiline_end_end     = "";

  }else if( new_style == "prolog" ){
    comment_monoline_begin        = "%";
    comment_monoline_begin_begin  = "%";
    comment_multiline_begin       = "";
    comment_multiline_begin_begin = "";
    comment_multiline_end         = "";
    comment_multiline_end_end     = "";
  }

  style = new_style;

  // Don't guess the style because user made it explicit
  first_comment_seen = true;

}


function tokenizer_restart( source : text ){

  // The source code to process
  text        = source;
  text_length = text.length;

  // Track progress in the source code
  text_cursor  = 0;
  alias_cursor = 0;
  line_number  = 1;

  // Default style
  set_style( "inox" );

  // First char of source code defines style of comments and aliases
  first_comment_seen = false;
  token_state  = "comment";

  // Obviously there is no previously detected token to deliver
  back_token  = void_token;

  // ToDo: make it reentrant
  // some enter/leave logic could stack the tokenizer state

}


primitive( "inox-start-input", function(){
  tokenizer_restart( cell_to_text( this.pop() ) );
} );


primitive( "inox-input", function primitive_inox_input(){
// Get UTF16 integer code of next character in source code, or void

  if( text_cursor >= text_length ){
    copy_cell( the_void_cell, this.dsp() );
    return;
  }

  const ch = text[ text_cursor ];
  text_cursor += 1;

  copy_cell(  make_integer_cell( ch.charCodeAt( 0 ) ), this.dsp() );

} );


primitive( "inox-input-until", function primitive_inox_input_until(){

  let buf = "";
  let limit = cell_to_text( this.dsp() );
  let ch;

  while( true ){

    if( text_cursor >= text_length ){
      copy_cell( the_void_cell, this.dsp() );
      return;
    }

    ch = text[ text_cursor++ ];

    if( ch == limit ){
      copy_cell( make_text_cell( buf ), this.dsp() );
      return;
    }

    buf += ch;

  }

} );


function unget_token( token : Token ) : void {
  back_token = token;
}

primitive( "inox-pushback-token", function primitive_inox_pushback_token(){
  const cell = this.pop();
  const name = get_cell_name( cell );
  unget_token( {
    type:   symbol_id_to_text( name ),
    value:  cell_to_text( cell ),
    index:  0,
    line:   0,
    column: 0
  } );
} );


function get_next_token() : Token {
// Split source code into syntax tokens

  // ToDo: horn clauses, prolog syle
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
  // ToDo: use a "    " fixed size text?
  let next_ch  = [ " ", " ", " ", " " ];


  function ch_is_space( ch : text ){
    // ToDo: avoid regexp
    return /\s/.test( ch.charAt( 0 ) );
  }


  function ch_is_eol( ch : text ){
    // ToDo: handle crlf better
    if( ch == "\n" )return true;
    if( ch == "\r" )return true;
    return false;
  }


  eat: while( true ){

    // EOF is like end of line
    if( ii == text_length ){
      is_eof = true;
      if( state == "base" ){
        token = { type : "eof", value : "", index : ii, line: 0, column: 0 }
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
    is_eol   = ch_is_eol( ch );

    // Track line number
    if( is_eol ){
      line_number++;
    }

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
      // Different programming language have different styles
      // Icon uses literate programming with code lines started using >
      // See https://en.wikipedia.org/wiki/Comment_(computer_programming)

      if( ! first_comment_seen && !is_space ){

        // ToDo: skip #! shebang
        // see https://en.wikipedia.org/wiki/Shebang_(Unix)

        // C style of comment, either // or /* xxx */
        if( ch == "/" ){
          set_style( "inox" );

        // Forth style, either \ or ( xxx )
        }else if( ch == "(" ){
          set_style( "forth" );

        // Lisp style, ;
        }else if( ch == ";" ){
          set_style( "lisp" );

        // Prolog style, %
        }else if( ch == "%" ){
          set_style( "prolog" );
        }
      }

      // If this is a monoline comment ending, emit it
      if( is_eol
      && comment_monoline_begin != ""
      && ( buf.slice( 0, comment_monoline_begin.length )
        == comment_monoline_begin )
      ){
        // Emit token, without start of comment sequence
        token = {
          type:   "comment",
          value:  buf.slice(
            comment_monoline_begin.length,
            buf.length - comment_monoline_begin.length
          ),
          index:  ii,
          line:   line_number,
          column: 0
        };
        state = "base";
        break eat;
      }

      // If this terminates the multiline comment, emit the comment
      if( ch == comment_multiline_end_end
      && buf.slice( buf.length - comment_multiline_end.length )
        == comment_multiline_end
      && buf.slice( 0, comment_multiline_begin.length )
        == comment_multiline_begin
      ){
        // Emit token, without start & end of comment sequence
        token = {
          type  : "comment_multiline",
          value : buf.slice(
            comment_multiline_begin.length,
            buf.length - comment_multiline_end.length
          ),
          index : ii,
          line:   line_number,
          column: 0
        };
        state = "base";
        break eat;
      }

      // Premature end of file, something else was expected
      if( is_eof ){
        token = {
          type  : "error",
          value : "eof in token " + state,
          index : ii,
          line:   line_number,
          column: 0
        };
        break eat;
      }

      // Keep Collecting characters
      continue eat;

    } // comment state

    if( state == "base" ){

      // skip whitespaces
      if( is_space ){
        continue eat;
      }

      // Texts start with ", unless Forth
      if( ch == "\"" && style != "forth" ){
        // ToDo: handle single quote 'xx' and backquote `xxxx`
        // ToDo: handle template text literals
        state = "text";
        continue eat;
      }

      // ToDo: JSON starts with ~ ?
      // See https://www.json.org/json-en.html

      // Comments start differently depending on style
      if( ch == comment_monoline_begin
      ||  ch == comment_multiline_begin
      ){
        buf = ch;
        state = "comment";
        continue eat;
      }

      // Else, it is a "word", including "separators" sometimes
      state = "word";

      // Do again with same character but different state
      ii--;
      continue eat;

    } // base state

    // Collect text until final "
    if( state == "text" ){

      // End of text or end of file
      if( ch == "\""
      || is_eof
      ){
        token = {
          type  : "text",
          value : buf,
          index : ii,
          line:   line_number,
          column: 0
        };
        state = "base";
        break eat;
      }

      // ToDo: handle escape sequences
      buf += ch;
      continue eat;

    } // text state

    // Collect word characters until separator
    if( state == "word" ){

      // Detect start of comment
      if( buf == comment_monoline_begin
      ||  buf == comment_multiline_begin
      ){
        state = "comment";
        continue eat;
      }

      // Space is a terminator
      if( is_space ){

        // Detect numbers
        if( is_integer( buf ) ){
          token =  {
            type  : "word", // ToDo: "number"?
            value : buf,
            index : ii - 1,
            line:   line_number,
            column: 0
          } ;
          state = "base";
          break eat;
        }

        // In Forth, things are pretty simple
        if( style == "forth" ){
          token =  {
            type  : "word",
            value : alias( buf ),
            index : ii - 1,
            line:   line_number,
            column: 0
          } ;
          state = "base";
          break eat;
        }
        // Normalize all whitespaces into a single space character
        ch = " ";
      }

      // In Forth everthing between spaces is a word
      if( style == "forth" ){
        buf += ch;
        continue eat;
      }

      // ; is a terminator
      if( ch == ";" ){
        token = {
          type  : ch,
          value : "",
          index : ii,
          line:   line_number,
          column: 0
        };
        state = "base";
        break eat;
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

      // (, [ and { are words of a special type, so is : when before a space
      if( ch == "("
      ||  ch == '['
      ||  ch == '{'
      ||  ( ch == ':' && next_ch[ 0 ] == " " )
      ){

        token = {
          type  : ch,
          value : "",
          index : ii,
          line:   line_number,
          column: 0
        };

        // If xxx( or xxx: are special
        if( buf.length > 0 ){
          if( ch == ":" ){
            buf += ch;
          }
          token.value = alias( buf );
        }

        state = "base";
        break eat;
      }

      // ), ] and } are also words of a special type
      if( ch == ")"
      ||  ch == "]"
      ||  ch == "}"
      ){

        token = {
          type  : ch,
          value : "",
          index : ii,
          line:   line_number,
          column: 0
        };

        // If right after something, emit two tokens
        if( buf.length > 0 ){
          unget_token( token );
          token = {
            type  : "word",
            value : alias( buf ),
            index : ii - 1,
            line:   line_number,
            column: 0
          };
        }

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
      //||  ch == ":" // ToDo: what about :: ?
      ||  ch == "." // ToDo: what about .. ?
      ||  ch == ","
      ||  ch == "'" // ToDo: detect xxx's
      ||  ch == "'"
      ||  ch == "`"
      ||  ch == '"'
      ||  ch == "(" // ToDo: what about ()
      ||  ch == ")"
      ||  ch == "[" //ToDo: what about [] ?
      ||  ch == "]"
      ||  ch == "{" // ToDo: trailing lambdas where { x... } ev do x... end
      ||  ch == "}" // ToDo: what about {}, ){, ]} ?
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

        // Change word if some alias was defined for it
        let word_alias = get_alias( buf );

        // In Inox style the aliases can expand into multiple words
        if( style == "inox" && word_alias ){
          let index_space = word_alias.indexOf( " " );
          token_de&&bug( "alias for " + buf + " is " + word_alias );
          if( index_space != -1 ){
            // When this happens, restart as if from new source, base state
            // Change source code to insert the extra stuff and scan again
            // ToDo: this breaks the index/line/column scheme
            text = word_alias + text.substring( ii - 1 );
            text_length  = text.length;
            alias_cursor = word_alias.length;
            ii = 0;
            buf = "";
            state = "base";
            continue eat;
          }
        }

        // Either a word followed by the separator
        if( buf.length ){
          token = {
            type   : "word",
            value  : word_alias || buf,
            index  : ii - 1,
            line   : line_number,
            column : 0
          };
          // Also push back a separator token unless it is just a space
          if( ch != " " ){
            // But only if there is a space right after it
            if( next_ch[ 0 ] == " " )
            unget_token( {
              type   : "post",
              value  : ch,
              index  : ii,
              line   : line_number,
              column : 0
            } );
          }

        // Or just the separator itself, with nothing before it
        }else{
          token = {
            type   : ch,
            value  : ch,
            index  : ii,
            line   : line_number,
            column : 0
          };
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
      type   : "error",
      value  : "error, bad state in get_next_token()",
      index  : ii,
      line   :   line_number,
      column : 0
    };
    break eat;

  } // eat loop

  text_cursor = ii;
  token_state = state;

  token_de&&bug( "\n"
    + "next token is " + token.value + ". "
    + "type is " + token.type + ". "
    + "line " + line_number + " is " + text.substring(
      text.lastIndexOf( "\n", ii ),
      text.indexOf( "\n", ii )
    )
  );

  return token;

} // get_next_token()


primitive( "inox-input-token", function primitive_inox_input_token(){
  const token = get_next_token();
  const cell = make_text_cell( token.value );
  set_cell_name( cell, symbol( token.type ) );
  copy_cell( cell, this.push() );
} );


/* ----------------------------------------------------------------------------
 *  eval
 *  This is the source code interpretor. It reads a text made of words and
 *  execute it.
 *  It detects a special word that starts the definition of a new word.
 *  That definition is made of next words that are either added to the
 *  new word or sometime executed immediatly instead because they help to
 *  build the new word.
 *  Once a new word is defined, it can be executed by the code interpretor
 *  that you can find in the run_fast function somewhere below.
 */


// Stack pointers should get back to base across calls to "eval"
const base_rsp = current_rsp;
const base_dsp = current_dsp;

function chk(){

  de&&mand_eq( load32( base_rsp ), 0 );

  if( current_rsp != base_rsp ){bug(
      "Return stack mismatch, now " + current_rsp
      + ", base " + base_rsp
      + ", delta " + ( base_rsp - current_rsp )
      + ", extra push " + ( base_rsp - current_rsp ) / words_per_cell
    )
    de&&mand_eq( current_rsp, base_rsp );
    current_rsp = base_rsp;
  }

  if( current_dsp != base_dsp ){
    bug(
      "Data stack mismatch, now " + current_dsp
      + ", base " + base_dsp
      + ", delta " + ( base_dsp - current_dsp )
      + ", extra push " + ( base_dsp - current_dsp ) / words_per_cell
    )
    dump_stack( current_dsp, base_dsp );
    de&&mand_eq( current_dsp, base_dsp );
    current_dsp = base_dsp;
  }

}


function is_integer( buf : text ){
  const parsed = parseInt( buf );
  if( isNaN( parsed ) )return 0;
  return 1;
}


function is_small_number( buf : text ){
  const parsed = parseInt( buf );
  if( parsed >   ( 1 << 12 ) )return false;
  if( parsed < - ( 1 << 12 ) )return false;
  return true;
}

function text_to_integer( buf : text ){
  return parseInt( buf );
}


primitive( "inox-eval", function primitive_inox_eval() : void {

  de && chk();

  const old_rsp = this.rsp();
  const old_ip  = this.ip();

  const that = this;

  // ToDo: should enable reentrant calls to eval()
  const save_eval_mode = this.is_eval;
  this.is_eval = 1;

  // The source code to evaluate is at the top of the stack
  const source = cell_to_text( this.dsp() );
  copy_cell( the_void_cell, this.dsp() );

  // Reinitialize the stream of tokens
  tokenizer_restart( source );
  de&&bug( "inox-eval " + source );

  let token;
  let type    : text;
  let value   : text;
  let word    : InoxAddress;
  let word_id : InoxIndex;

  // ToDo: these should be globals

  // A block is an array of encoded words from {} delimited source code
  type InoxBlock = Array< InoxCode >;

  // Some syntactic constructions can nest, function call, sub expressions, etc
  type Level = {
    depth           : InoxIndex;  // Levels nest, starting with a "base" level 0
    type            : text;       // "new yord", "(", ":" or "{"
    name            : text;       // Often the name of a word
    word            : InoxWord;   // It's code id when such word is defined
    arguments_count : InoxIndex;  // ToDo: variadic words
    codes           : InoxBlock;  // Compiled machine code
    codes_count     : InoxIndex;  // How many machine codes in codes arrays
    block_start     : InoxIndex;  // For type "{", blocks, where it starts
  }

  // This is a stack of levels
  const levels = new Array< Level >();

  // The base level is the initial state
  levels[ 0 ] = {
    depth           : 0,
    type            : "base",
    name            : "",
    word            : 0,
    arguments_count : 0,
    codes           : null,
    codes_count     : 0,
    block_start     : 0
  };

  // The current level
  let level = levels[ 0 ];

  function bug_levels( title : string){
    let buf = "eval, " + title + " ";
      let ii = 0;
      while( ii <= level.depth ){
        buf += ii + " " + levels[ ii ].type
        + ( levels[ ii ].name ? "=" + levels[ ii ].name : "" ) + ". ";
        ii++;
      }
      bug( buf );
  }

  function enter_level( type : text ){
  // Entering a ( xx yy ), a f( xx yy ), a key: x word: y; or a {} block
    let next_level = levels[ level.depth + 1 ] = {
      depth           : level.depth + 1,
      type            : type, // one of ( : or {
      name            : "",
      word            : 0,
      arguments_count : 0,
      codes           : level.codes,        // Share codes with upper level
      codes_count     : level.codes_count,
      block_start     : 0
    };
    level = next_level;
    eval_de&&bug_levels( "entered" );

  }


  function leave_level(){

    eval_de&&bug_levels( "leaving" );

    let previous_level = level;
    level = levels[ level.depth - 1 ];
    level.codes_count = previous_level.codes_count;

    // Close all infix operators at once
    if( previous_level.type == "infix" ){
      do_code( previous_level.word );
      if( level.type == "infix" ){
        leave_level();
      }
    }

  }


  // Will points to a level after some start of definition, fun or : typically
  let new_word : Level = null;


  function start_new_word(){
    enter_level( "new word" );
    level.codes       = Array< InoxCode >();
    level.codes_count = 0;
    new_word           = level;
  }


  function add_new_inox_word(){

    let symbol_cell = make_symbol_cell( new_word.name );

    // ToDo: don't use 2, use size_of_something instead
    let bytes = allocate_bytes( ( new_word.codes.length + 2 ) * 2 );

    // flags and length need an extra word, so does then ending "next"
    store16( bytes, new_word.codes_count + 1 );

    // Copy word definition into newly allocated memory
    let ii = 0;
    while( ii < new_word.codes_count ){
      store16( bytes + 1 + ii, new_word.codes[ ii ] );
      ii++;
    }

    // Add code to return from word, aka "next" special code
    store16( bytes + 1 + ii, 0 );

    // ToDo: remove this hack
    const save = get_cell_value( symbol_cell );

    set_cell_value( symbol_cell, bytes + 1 ); // skip flags and length
    let word_cell = make_inox_word( symbol_cell );

    // Restore the proper value of the symbol, its numeric id
    set_cell_value( symbol_cell, save );

    de&&mand_eq( get_inox_word_definition_by_name( new_word.name ), bytes + 1 );
    de&&mand_eq(
      load16( get_inox_word_definition_by_name( new_word.name ) + ii ),
      0
    );

    leave_level();
    new_word = null;

    de&&bug( inox_word_cell_to_text_definition( word_cell ) );

  } // add_new_inox_word()


  function is_compiling() : boolean {
    if( new_word    )return true;
    if( level.codes )return true;
    return false;
  }


  function do_literal( cell ){

    eval_de&&bug( "eval, do_literal &" + cell + "=" + cell_to_text( cell ) );

    if( is_compiling() ){

      // Avoid using a cell if small enough integer, 13 bits
      if( get_cell_type( cell ) == type_integer_id ){

        // Handle small integers, 13 bits, sign and 12 bits value
        const limit = 0xfff;
        const negative_limit = -limit;
        const value = get_cell_value( cell );

        // Small positive integer
        if( value >= 0 && value <= limit ){
          level.codes[ level.codes_count++ ]
          = 0x8000 | 0x2000 | ( value & 0xfff );

        // Small negative integer
        }else if( value < 0 && value >= negative_limit ){
          level.codes[ level.codes_count++ ]
          = 0x8000 | 0x2000 | 0x1000 | ( value & 0xfff );

        // Regular integer, need a cell for itself
        }else{
          level.codes[ level.codes_count++ ]
          = 0x8000 | ( make_integer_cell( value ) >> 2 );
        }

      // Not an integer. Assume caller allocated the cell properly
      }else{

        // This is either a text or a symbol
        level.codes[ level.codes_count++ ]
        = 0x8000 | ( cell >> 2 );
      }

    }else{
      copy_cell( cell, that.push() );
      stack_de && dump_stack( that.dsp(), that.dsp() + 5 * words_per_cell );
    }

  };
  do_literal_function = do_literal;


  function add_code( code_id ){
  // Add a word to the beeing built block or word

    de&&mand( is_compiling() );

    // Inline code definition if it is short
    const definition = get_inox_word_definition_by_id( code_id );
    const length = get_definition_length( definition ) - 1; // skip "next"
    if( length <= 2 ){
      let ii : InoxIndex = 0;
      while( ii < length ){
        level.codes[ level.codes_count++ ] = load16( definition + ii );
        ii++;
      }
    }else{
      level.codes[ level.codes_count++ ] = code_id;
    }

    set_cell_value( last_token_cell, word_id );

  }

  add_code_function = do_code;


  function do_code( code_id ){

    eval_de&&bug(
      "eval, do_code " + code_id + " " + inox_word_id_to_text( code_id )
    );

    // Run now or add to definition of a new word?
    if( ! is_compiling() || is_immediate_inox_word( code_id ) || immediate_mode ){
      stack_de && dump_stack( that.dsp(), that.dsp() + 5 * words_per_cell );
      that.set_ip( get_inox_word_definition_by_id( code_id ) );
      that.run();
      if( de ){
        if( that.rsp() != old_rsp ){
          bug( "??? eval, do_code, RSP changed by "
          + inox_word_id_to_text( code_id ) );
        }
        let ip =  that.ip();
        if( ip && ip != old_ip ){
          bug( "??? eval, do_code, IP changed by "
          + inox_word_id_to_text( code_id ) );
        }
      }

    // When adding to the definition of a new word
    }else{
      add_code( code_id );
    }

  };


  let must_not_compile_next_word = false;


  tokenize_next_word_function = function add_word(){
    must_not_compile_next_word = true;
  };


  // Words to start and terminate a new word definition
  let fun     : text = "fun"; // That's for the Inox dialect
  let end_fun : text = "ok";

  while( true ){

    de&&mand( that.dsp() <= current_task.stack );

    token = get_next_token();
    type  = token.type;
    value = token.value;

    eval_de&&bug( "eval, token /" + type + "/" + value + "/" );

    if( type == "comment" || type == "comment_multiline" ) {
      // ToDo: word for definitions should be normal words
     continue;
    }

    if( type == "error" ){
      bug( "Eval syntax error " + value + " at " + token.index );
      break;
    }

    if( type == "eof" ){
      break;
    }

    // If start of a new Inox word definition
    if( style == "forth" ){
      fun     = ":";
      end_fun = ";";
    }else if( style == "inox" ){
      fun     = "fun";
      end_fun = "ok";
    }
    if( level.type == "base" && ( value == fun || type == fun ) ){
      // ToDo: make that a primitive
      // ToDo: enable nested definitions?
      start_new_word();
      continue;
    }

    // If name for the new Inox word
    if( new_word && new_word.name == "" ){
      // ToDo: make that a primitive
      new_word.name = value;
      eval_de&&bug( "eval, new word is " + value );
      // Update global for primitive_inox_immediate & co
      set_cell_name( last_token_cell, get_cell_name( symbol( value ) ) );
      set_cell_value( last_token_cell, next_inox_word_id );
      continue;
    }

     // If end of definition of the new Inox word
    if( new_word
    &&  level.type == "new word"
    &&  value == end_fun
    ){
      // ToDo: make that a primitive
      add_new_inox_word();
      continue;
    }

    // A common error is to forget some ; ) or }
    if( new_word
    && ( value == end_fun || value == fun )
    && type == "word"
    ){
      bug( "Eval nesting error, unexpected " + value
      + " at line " + token.line
      + " while expecting the end of " + level.type );
      debugger;
      break;
    }

    // If ; or ) or } terminator, close all postponed infix operators
    if( level.type == "infix"
    && (
      type == ";" || type == ")" || type == "}"
    ) ){
      leave_level();
    }

    // If something to execute, as a defined word or as a text literal
    if( type == "word" || type == "text" ){

      word_id = 0;

      if( type == "word" ){
        word_id = get_inox_word_id_by_name( value );
      }

      // function calls, keyword method calls and sub expressions
      if( level.depth > 0
      &&  word_id != 0
      &&  level.word == 0
      ){

        // If building a function call and expecting the function name
        if( level.type == "x("
        &&  level.name == ""
        ){
          level.name = value;
          level.word = word_id;
          continue;
        }

        // If building a keyword method call
        if( level.type == ":"
        &&  value.slice( -1 ) == ":"
        ){
          level.name += value;
          de&&bug( "eval, collecting keywords:" + level.name );
          continue;
        }
      }

      if( must_not_compile_next_word ){
        de&&bug( "eval, must not compile, " + value );
        must_not_compile_next_word = false;
        if( ! word ){
          // ToDo: should store text?
          copy_cell( make_text_cell( value ), this.push() );
        }else{
          set_cell_value( last_token_cell, word_id );
          copy_cell( last_token_cell, this.push() );
        }
        continue;
      }

      // If operator, transform order to get to RPN, Reverse Polish Notation
      if( word_id
      &&  is_operator_inox_word( word_id )
      &&  level.type != "x("
      ){
        // Processing of postponed operators occurs at ; or start of keyword
        enter_level( "infix" );
        level.word = word_id;
        continue;
      }

      // If text literal
      if( type == "text" ){

        do_literal( make_text_cell( value ) );

      // If known word, run it or add it to the new word beeing built
      }else if( word_id ){

        do_code( word_id );

      // Else, this is a literal
      }else{

        // ToDo: parse negative numbers
        if( value[ 0 ] == "#" ){
          do_literal( make_symbol_cell( value.substring( 1 ) ) );
        }else if( is_integer( value ) ){
          do_literal( make_integer_cell( text_to_integer( value) ) );
        }else{
          do_literal( make_text_cell( value ) );
        }
      }

    // Start of a nestable construction
    }else if( type == "(" || type == ":" || type == "{" ){

      // If xx: then first close all nested infix operators
      if( type == ":" && level.type == "infix" ){
        leave_level();
      }

      // If currently collecting keywords of method call, add new keyword item
      if( type == ":" && level.type == ":" ){

        level.name += value;

      // If first element of a xxx: aaa yyy: bbb keyword method call
      }else if( type == ":" ){

        enter_level( type );
        level.name = value;

      // If xxx( type of call or ( xxx yyy ) sub expression
      }else if( type == "(" ){

        // if xxx(
        if( value != "" ){

          enter_level( "x(" );

          word_id = get_inox_word_id_by_name( value );

          // If xxx is a defined word then it has to be called last
          if( word_id != 0 ){
            level.name = value;
            level.word = word_id;

          // If word is not defined, use it as a text literal
          }else{
            // ToDo: if # prefixed word, use it as a symbol?
            do_literal( make_text_cell( value ) );
          }

        // if ( expr )
        }else{
          enter_level( "(" );
        }

      // If start of a block inside a new word definition
      }else if( type == "{" && is_compiling() ){

        enter_level( type );

        // ToDo: value could be a qualifier about the block
        do_code( get_inox_word_id_by_name( "inox-block" ) );
        level.block_start = level.codes_count;

        // Reserve word for block's length
        level.codes[ level.codes_count++ ] = 0;

      // If start of a block but not within a definition
      }else if( type == "{" ){
        // ToDo: handle this case, avoiding memory leak
        bug( "Cannot compile block, not in a definition" );
        debugger;
      }

    }else if( type == "}" && level.type == "{" ){

      // Add a "next" at the end of the block
      level.codes[ level.codes_count++ ] = 0x0000;
      const block_length = level.codes_count - level.block_start;

      // Set argument for inox-block, make it look like a valid litteral
      level.codes[ level.block_start ]
      = 0x8000 | 0x2000 | ( block_length - 1 ); // -1 not to add the length word

      leave_level();

    // End of function call or sub expression
    }else if( type == ")" && ( level.type == "(" || level.type == "x(" ) ){

      // If word(), process word
      if( level.word != 0 && value == "" ){
        do_code( level.word );

      // If word( expr )abc, process word & name result
      }else if( level.word != 0 && value != "" ){
        do_code( level.word );
        do_literal( make_symbol_cell( value ) );
        do_code( get_inox_word_id_by_name( "inox-name-it" ) );

      // if abc( expr ), word-missing,
      }else if( level.name != "" && value == "" ){
        do_literal( make_symbol_cell( level.name ) );
        do_code( get_inox_word_id_by_name( "word-missing" ) );

      // if abc( expr )efg, ToDo: word-missing
      }else if( level.name != "" && value != "" ){
        do_literal( make_symbol_cell( level.name ) );
        do_code( get_inox_word_id_by_name( "word-missing" ) );
        do_literal( make_symbol_cell( value ) );
        do_code( get_inox_word_id_by_name( "inox-name-it" ) );
      }

      leave_level();

    // ; marks the end of the keyword method call, if any
    }else if( type == ";" && level.type == ":" ){

      word_id = get_inox_word_id_by_name( level.name );

      // If word does not exist, use method-missing instead
      if( word_id == 0 ){
        // Tell method_missing about the number of arguments?
        // set_cell_value( the_integer_work_cell, level.length );
        set_cell_value( the_symbol_work_cell, symbol( level.name ) );
        do_literal( the_symbol_work_cell );
        // ToDo: Add call to method_missing
        do_code( get_inox_word_id_by_name( "word-missing" ) );
        // Method missing will add the class of the target to find the desired
        // method or will call a class specific method_missing found in the
        // class hierarchy
        // This implements a dynamic dispatch

      }else{
        do_code( word_id );
      }

      leave_level();

    }

  }

  do_literal_function         = null;
  add_code_function           = null;
  tokenize_next_word_function = null;
  this.is_eval = save_eval_mode;

  de && chk();

} );  // primitive inox-eval


/* ----------------------------------------------------------------------------
 *  Some bootstrap stuff
 */

// Setup Forth dialect first

define_alias( "forth", "LITERAL",   "inox-literal"   );
define_alias( "forth", "IMMEDIATE", "inox-immediate" );
define_alias( "forth", "SWAP",      "swap"           );
define_alias( "forth", "DROP",      "drop"           );
define_alias( "forth", "DUP",       "dup"            );
define_alias( "forth", ">R",        "inox-to-R"      );
define_alias( "forth", "R>",        "inox-to-R"      );
define_alias( "forth", "@R",        "inox-fetch-R"   );


primitive( "CR", function primitive_CR(){
  // ToDo: output to stdout when running on POSIX systems
  console.log( "OUTPUT CR" );
} );


function primitive_trace(){
  // ToDo: output to stdout when running on POSIX systems
  console.log( "OUTPUT " + cell_to_text( this.dsp() ) );
}
primitive( "trace", primitive_trace );


primitive( "out", function primitive_out(){
  primitive_trace.call( this );
  this.pop();
} );


define_alias( "forth",  ".",      "out" );

// In some other dialects there are other names for this
define_alias( "basic",  "PRINT",  "out" );
define_alias( "icon",   "write",  "out" );
define_alias( "python", "print",  "out" );
define_alias( "c",      "printf", "out" );
define_alias( "prolog", "write",  "out" );


// Compile the bootstrap vocabulary; ANSI Forth core inspired
let bootstrap_code : text =
`( let's go forth )

: ." " inox-input-until LITERAL inox-quote . inox-add-code ; IMMEDIATE

`;


copy_cell( make_text_cell( bootstrap_code ), current_dsp );
run_inox_word( "inox-eval" );


/* ----------------------------------------------------------------------------
 *  exports
 */

function evaluate( source_code : string ) : string {
  copy_cell( make_text_cell( source_code), current_dsp );
  run_inox_word( "inox-eval" );
  return cell_to_text( current_dsp );
}


function process(
  json_state  : string,
  json_event  : string,
  source_code : string
) : string {
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

  // If source code was provided, push it on the parameter stack
  // See http://c2.com/cybords/pp4.cgi?muforth/README

  copy_cell( make_text_cell( source_code), current_dsp );
  run_inox_word( "inox-eval" );

  // ToDo: return diff to apply instead of new state
  let new_state = JSON.stringify( cell_to_text( current_dsp ) );
  return new_state;

} // process()


return {
  primitive: primitive,
  evaluate:  evaluate,
  process:   process
  // ToDo: to_genotype(), from_genotype(), to build & use precompiled species
};

} // inox()


/* --------------------------------------------------------------------------
 *  Smoke test
 */

const I = inox();

I.primitive( "debugger", function primitive_debugger(){
  debugger;
} );

I.evaluate( "/**/fun debug debugger ok inox-immediate" );

I.process( "{}", "{}",
`/* Inox */

fun word-missing   "word-missing "   swap out( & ) ok
fun method-missing "method-missing " swap out( & ) ok

global( #ii 0 );

fun decrement
  ( 1 negative ) + ;
ok

fun set_ii
  @ ii set! ;
ok

fun decrement_ii
  ii decrement set_ii ;
ok

fun if:then:
  inox-if inox-call
ok

fun while:repeat:
  inox-while
ok

fun if:then:else: // ( boolean then-block else-block -- )
  // Save else-block in Return alternative stack
  inox-to-R
  // Get condition to the top of the stack
  swap
  // Duplicate boolean condition, an integer
  dup
  // Save it in the Return alternative stack
  inox-to-R
  // Consume boolean and turn then block on stack into void if boolean is false
  inox-if
  // Call then-block unless turned into void by inox-if
  inox-call
  // Restore condition
  inox-from-R
  // Restore else-block
  inox-from-R
  // Get condition to the top of the stack
  swap
  // Consume boolean after inversing it and turn block to void if needed
  not ; inox-if
  // Call then-block unless turned into void by inox-if
  inox-call
ok

fun test_loop1
  set_ii( 10 ) ;
  while: { decrement_ii ; ( ii > 0 ) } repeat: {
    if:    ( ii % 2 ) 0 is=
    then:  { ii & " is even" ; out }
    else:  { ii & " is odd"  ; out } ;
  } ;
ok

debug test_loop1


fun InoxStyle
  inox-dialect // set fun/ok and cooment delimiters
  inox-alias( "Define"      " fun "                )
  inox-alias( "EndDefine"   " ; ok "               )
  inox-alias( "While"       " while: { ( "         )
  inox-alias( "Do"          " ) ; } repeat: { ( "  )
  inox-alias( "EndWhile"    " ) ; } "              )
  inox-alias( "If",         " if: ( "              )
  inox-alias( "Then"        " ) then: { ( "        )
  inox-alias( "Else"        " ) ; } else: { ( "    )
  inox-alias( "EndIf"       " ) ; } ; "            )
  // macro( "Debug"       "$$"                )
  // macro( "NoDebug"     ""                  )
ok

InoxStyle

Define TestLoop2
  set_ii( 10 ) ;
  While decrement_ii ; ii > 0 Do
    If ( ii % 2 ) is= 0 Then
      ii & " is even" ; out
    Else
      ii & " is odd"  ; out
    EndIf
  EndWhile
EndDefine

debug

TestLoop2



` /*

( ( "A" & "a" ) & ( "B" & "b" ) & ( "C" & "c" ) ) out

"a" & "b"; out



out( &( "a" "b" ) )

fun word-missing   "word-missing "   out out ok
fun method-missing "method-missing " out out ok

constant( #Place "Corsica" );

"I love " & Place ; out

fun constant:is:
  constant
ok

constant: #inox-version is: "v0.1";

global( #ii, 0 )

fun global:is:
  global
ok

global: #JJ is: 0;

( II + 1 @ II

out( "Address of II is " & @ II )

"Indirect II set" @II !

&( "New II is : " @II @) out

out( "II is " + II );

out( "Hello " + Place + "!" )

fun say:to:
  swap
  out
  out( " " )
  out
ok

say: "Hello" to: "Smalltalk world!";

( (+ 1 2) + (100 + 100) )
trace(
  (
    (3 +)
    +(4)
    (+ 1000)
    + 2000
  )
)
out

fun hello
  out( "Hello world!" )
ok

hello()

forth-dialect ( forth )

: HELLO CR ." Hello forth world!" ;
HELLO

inox-dialect

HELLO()

( "Bonjour" & " le " ) & ( "monde" & " " & "!" ) out

"HELLO" inox-call-by-name
"HELLO" inox-definition inox-call

fun if:then:
 0 if:then:else
ok

fun while:repeat:
ok

fun repeat:until:
ok

fun times:repeat:
ok

fun items:repeat:
ok


fun test
  { HELLO } inox-call
  { hello } 1 if inox-call
  if: 1 then: {
    HELLO
  } else: {
    hello
  };
ok

test



`
//*/
);


// Pseudo code for a statefull event processor
/*
function processor( identity: string ){
  while( true ){
    const event = await get_next_event( identity );
    const state = await load_state( identity );
    const source_code = state.source_code;
    const new_state = inox().process( state, event, source_code );
    await store_state( identity, new_state );
  }
}
*/


// exports.inox = inox;
