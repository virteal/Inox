/*  inox.js
 *  Inox is a mminimalist concatenative dynamic programming glue language.
 *
 *  It is basic/forth/smalltalk/icon/lisp/prolog/erlang inspired.
 *
 *  june  3 2021 by jhr
 *  june  7 2021 by jhr, move from .js to .ts, ie Typescript, AssemblyScript
 *  june 10 2021 by jhr, .nox file extension
 *  june 27 2021 by jhr, forth hello world is ok, use literate comment in Inox
 *  july 17 2021 by jhr, turing complete
 *  july 28 2021 by jhr, use 64 bits instructions, code and data unification
 *  october 10 2021 by jhr, source code cleanup
 *  december 7 2022 by jhr, class and object
 */

// import { assert } from "console";
// import { assert } from 'node:assert';
const assert = require( "assert" );

function inox(){

console.log( "Hello Inox" );

// Starts running an Inox machine, returns a json encoded new state.
// ToDo: return diff instead of new state.
// The source parameter is a string, maybe the content of a .nox text file.
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
// BASIC. Program is stored in memory in a very compact form using "tokens".
// REM starts a comment, DIM declares an array, GOSUB <LineNumber>, etc.
// See https://www.infinite-loop.at/Power20/Documentation/Power20-controleadMe/AA-VIC-20_BASIC.html
// Inox uses tokens to store code. Each instructions is a 16 bits word.
// These instructions are called "inox words".
// Some instructions are primitives, other are user defined. They are both
// named "words". Like in Forth a word can execute in interpreted mode
// or in compile mode. In the later case, during source parsing, the
// word can prepare stuff to be used when in interpreted mode, compute
// relative jumps for example.


/* -----------------------------------------------------------------------------
 *  Let's go.
 *   some debug tools first.
 */

// my de&&bug darling, de flag could be a variable
const de  = true;  // true if debug mode
const nde = false; // not debug

// Traces can be enabled "by domain", aka "categories"
const mem_de   = de && true;
const check_de = de && true; // Enable runtime errors
const eval_de  = de && true;
const token_de = de && true;
const run_de   = de && true;
const stack_de = de && true; // Trace data stack
const alloc_de = de && true; // heap allocations integrity check

// Global flag to filter out all console.log until one needs them
var can_log = false;
var bug = !can_log ? debug : console.log;


function debug( msg: string ){
// de&&bug( a_message )
  assert( typeof msg === "string" );
  if( !can_log ){
    return;
  }
  bug = console.log;
  console.log( msg );
}


function mand( condition : boolean ) : boolean {
// de&&mand( a_condition ), aka asserts; return true if assertion fails
  if( condition )return false;
  assert( false );
  return true;
};


function mand_eq( a : number, b : number ) : boolean {
// Check that two numbers are equal, return true if that's not the case
  if( a == b )return false;
  console.log( "!!! not eq " + a + "/" + b );
  assert( false );
  return true;
}


assert(   de ); // Not ready for production, please wait :)
de&&mand( de ); // Like assert but that can be disabled for speed

de&&bug( "Inox starting." );


/* -----------------------------------------------------------------------------
 *  First, make it work in the javascript machine, it's the portable scheme.
 *  When compiled using AssemblyScript some changes will be required.
 */

const PORTABLE = true;

// ToDo: if( PORTABLE ){

// Let's say Typescript is AssemblyScript for a while (june 7 2021)
type u8    = number;
type u32   = number;
type float = number; // assumed to be larger then isize

// ToDo: should do that when?
// require( "assemblyscript/std/portable" );

// } // PORTABLE


/* -----------------------------------------------------------------------------
 *  Types and constants related to types
 */

type InoxAddress     = u32; // Arbitrary address in VM memory, aka a raw pointer
type InoxWord        = u32; // Smallest entities at an InoxAddress in VM memory
type InoxIndex       = u32; // Index in rather small arrays usually
type InoxSize        = u32; // Size in bytes
type InoxLength      = u32; // Size in number of contained items, often cells
type InoxBoolean     = u32; // 0 for false, anything else for true
type InoxOid         = u32; // proxy objects have a unique id
type InoxCell        = u32; // Pointer to a cell's value, typed and named
type InoxValue       = u32; // payload, sometimes an integer, sometimes an address
type InoxInfo        = u32; // type & name info parts of a cell's value
type InoxType        = u8;  // packed with name, 3 bits, at most 8 types
type InoxName        = u32; // 29 bits actually, type + info is 32 bits

const InoxTrue  : InoxBoolean = 1;
const InoxFalse : InoxBoolean = 0;

const size_of_word    = 4;   // 4 bytes, 32 bits
const size_of_value   = 4;   // 4 bytes, 32 bits
const size_of_cell    = 8;   // 8 bytes, 64 bits
const words_per_cell  = size_of_cell  / size_of_word; // 2

// In memory, the value is stored first, then the type & name info, packed
const offset_of_cell_info = size_of_value / size_of_word; // 1

// String is jargon but text is obvious
type text = string;


/* ---------------------------------------------------------------------------
 *  Low level memory management.
 *  The Inox virtual machine uses an array of 32 bits words to store both
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

const memory8  = new ArrayBuffer( 1024 * 256 ); // 256 kb
const memory32 = new Int32Array(     memory8 );


function load32( index : InoxAddress ) : InoxValue {
  let value : InoxValue = memory32[ index ] |0;
  // |0 is a pre webassembly trick to coerce value to a 32 bits integer
  // de&&bug( "Load 32 @" + index + " " + value );
  return value |0;
}


function store32( index : InoxAddress, value : InoxValue ) : void {
   memory32[ index ] = value |0;
   // de&&bug( "store 32 @ " + index + " " + value );
   mem_de&&mand_eq( load32( index ), value );
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


@inline function load32( index : InoxAddress ) : u32 {
  return load< u32 >( index << 1 );
}


@inline function store32( index : InoxAddress, value : InoxValue ) : void {
  store< InoxValue >( index << 1, value );
}

*/} // ! PORTABLE?


// 0 means different things depending on the context, it is "void",
// "false", "return" instruction code, null object, etc.
const _ = 0; // undefined;


/* -----------------------------------------------------------------------------
  *  Cell
  *
  *  A memory cell seats at an address and has a type, a value and a name.
  *  When type is "list", the name is the address of the rest of the list.
  *  Else the name is a "tag", a fixed abritrary value. In some languages
  *  like Lisp tags are called "atoms" or "symbols".
  *
  *  The encoding stores all of that in a 64 bits word.
  *  cell's type is a numeric id, 0..7
  *  cell's name is the address of a tag type of cell (xor next in lists).
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
// to 32 bits words, this is equivalent to a 31 bits pointer
// pointing to bytes. That's 2 giga bytes and 256 millions of cells.
//
// I used these named values 30 years ago, when I designed the
// object oriented version of a scriting language named Emul. It was
// used in a single project, a network supervision system named SAGE.
// SAGE managed X25 devices that could interop with the french public
// data network named Transpac. The Minitel national program used that
// network to serve 1200 bauds clients using X25 connected servers.
// It all exploded when Internet arrived, circa 1995 approximatly.
// I survived. That makes me a software "veteran" I guesss.

// cell number 0 is reserved, special, 0/0/0, void/void/void
let the_first_cell = 0;

// Some basic memory allocation, purely growing.
// This is like sbrk() on Unix
// See https://en.wikipedia.org/wiki/Sbrk
// There is some reallocation of cells when some of them are
// freed, see fast_allocate_cell()
// Smart pointers use a malloc/free scheme with reference counters.
// ToDo: a better  C style malloc()/free() combo.

// This next-cell would be HERE in Forth
// See https://forth-standard.org/standard/core/HERE
let the_next_cell : InoxAddress = the_first_cell;


function allocate_cell() : InoxCell {
  let top = the_next_cell;
  // Each cell is made of 2 32 bits words, 64 bits total
  the_next_cell += words_per_cell;
  return top;
}


// Linked list of free byte areas, initialy empty, malloc/free related
var the_free_area      : InoxCell = the_first_cell;
var the_free_area_tail : InoxCell = the_free_area;


function aligned_bytes_size( size : InoxIndex ) : InoxIndex {
// Align on 64 bits, size of a cell plus size for heap management
  var aligned_size
  = ( size       + ( size_of_cell - 1 ) )
  & ( 0xffffffff - ( size_of_cell - 1 ) );
  // Add space for header used by heap management
  aligned_size += size_of_cell;
  return aligned_size;
}


function allocate_bytes( size : InoxIndex ) : InoxAddress {
  if( de ){
    if( size > 1000 ){
      bug( "Large memory allocation, " + size );
      if( size != 8192 )debugger;
    }
  }
  // Align on 64 bits, size of a cell, plus size of header
  var aligned_size = aligned_bytes_size( size );
  // ToDo: search for free area
  let area : InoxAddress = the_free_area;
  while( area ){
    const area_size = get_cell_info( area );
    if( area_size < size )continue;
    // The area is big enough
    if( area_size > size * 2 )continue;
    // The area is less that twice what we need, more would be a waste
    // ToDo: break area and release extra space
    the_free_area = get_next_cell( area );
    break;
  }
  // If nothing was found, use flat space further
  if( ! area ){
    area = the_next_cell;
    // Divide by 2 because memory is 32 bits words, not bytes
    the_next_cell += ( aligned_size / size_of_word );
    mem_de&&mand_eq( load32( area ), 0 );
  }
  // Area is unlocked initialy, once, see lock_bytes()
  raw_set_cell_value( area, 0 );
  // Remember size of area, this does not include the header overhead
  set_cell_info( area, size );
  return area + size_of_cell;
}


function get_bytes_size( address : InoxAddress ) : InoxIndex {
// Returns the size initially required when allocate_bytes() was called.
  const header_address = address - size_of_cell;
  alloc_de&&mand( safe_bytes_header( header_address ) );
  // That size was stored in allocate_bytes() in the info part of a cell
  const size = get_cell_info( header_address );
  // Warning: this is not the aligned size
  return size;
}


function get_aligned_bytes_size( address : InoxAddress ) : InoxIndex {
// Returns the actual size allocated by allocate_bytes(), including header
  const header_address = address - size_of_cell;
  // That size was stored in allocate_bytes() in the info part of a cell
  const size = get_cell_info( header_address );
  return aligned_bytes_size( size );
}


function resize_bytes(
  address  : InoxAddress,
  size     : InoxValue
) : InoxAddress {
  const new_mem = allocate_bytes( size );
  let ii : InoxIndex = get_bytes_size( address );
  while( true ){
    ii -= size_of_cell;
    move_cell( address + ii * size_of_cell, new_mem + ii * size_of_cell );
    if( ii == 0 )break;
  }
  free_bytes( address );
  return new_mem;
}


function free_bytes( address : InoxAddress ){
  // ToDo: add to pool for malloc()
  // ToDo: a simple solution is to split the array into cells
  // and call free_cell() for each of them. That's easy.
  // Another solution is to keep lists of free zones of
  // frequent sizes.
  // Other malloc/free style solution would not be much more complex.
  const header_address = address - size_of_cell;
  alloc_de&&mand( safe_bytes_header( header_address ) );
  const old_count = get_cell_value( header_address );
  // Free now if not locked
  if( old_count === 0 ){
    // ToDo: add area to some free list
    if( alloc_de ){
      // ToDo: use info instead of value to avoid breaking the nil_cell?
      raw_set_cell_value( header_address, 2147483647 ); // i32.MAX_VALUE
    }
    // Add area in free list, at the end to avoid premature reallocation
    // ToDo: insert area in sorted list instead of at the end?
    // I should do this to coalesce adjacent free areas to avoid fragmentation
    set_cell_info( header_address, the_free_area_tail );
    the_free_area_tail = header_address;
    set_next_cell( the_free_area_tail, nil_cell );
    return;
  }
  // Decrement reference counter
  const new_count = old_count - 1;
  raw_set_cell_value( header_address, new_count );
}


function lock_bytes( address : InoxAddress ) : void {
// Increment reference counter of bytes area allocated using allocate_bytes().
// When free_bytes() is called, that counter is decremented and the area
// is actually freed only when it reaches zero.
  const header_address = address - size_of_cell;
  alloc_de&&mand( safe_bytes_header( header_address ) );
  const old_count = get_cell_value( header_address );
  // Increment reference counter
  const new_count = old_count + 1;
  raw_set_cell_value( header_address, new_count );
}


function is_last_reference_to_bytes( address : InoxAddress ) : boolean {
// When the last reference disappears the bytes must be freed
  const header_address = address - size_of_cell;
  alloc_de&&mand( safe_bytes_header( header_address ) );
  return get_cell_value( header_address ) === 0;
}


function get_bytes_refcount( address : InoxAddress ) : InoxIndex {
  const header_address = address - size_of_cell;
  alloc_de&&mand( safe_bytes_header( header_address ) );
  return get_cell_value( header_address );
}


function safe_bytes_header( address : InoxAddress ) : boolean {
// Trie to determine whether the address points to a valid area allocated
// using allocates_bytes() and not already released.
  // This helps to debug unbalanced calls to lock_bytes() and free_bytes().
  const value : InoxAddress = get_cell_value( address );
  if( value === 2147483647 )return false;
  return true;
}


function increment_object_refcount( cell : InoxCell ){
  lock_bytes( cell );
}


function decrement_object_refcount( cell : InoxCell ){
  free_bytes( cell );
}


function raw_set_cell_value( cell : InoxCell, value : InoxValue ) : void {
  store32( cell, value );
  mem_de&&mand_eq( get_cell_value( cell ), value );
}


function set_cell_value( cell : InoxCell, value : InoxValue ) : void {
// Change the cell's value, deals with references
  const old_value = get_cell_value( cell );
  if( old_value ){
    if( is_reference_cell( cell ) ){
      clear_cell_value( cell );
    }
  }
  raw_set_cell_value( cell, value );
}


function get_cell_value( cell : InoxCell ) : InoxValue {
  return load32( cell );
}


// @inline
function set_cell_info( cell : InoxCell, info : InoxInfo ) : void {
  store32( cell + offset_of_cell_info, info );
  mem_de&&mand_eq( get_cell_info( cell ), info );
}


// @inline
function get_cell_info( cell : InoxCell ) : InoxInfo {
  return load32( cell + offset_of_cell_info );
}


function pack( type : InoxType, name : InoxName ) : InoxInfo {
// Pack type and name together
  let info = name | type << 29;
  if( mem_de ){
    de&&mand_eq( unpack_type( info ), type );
    de&&mand_eq( unpack_name( info ), name );
  }
  return info
}


function unpack_type( info : InoxInfo ) : InoxType {
  return info >>> 29; // 3 bits
}


function unpack_name( info : InoxInfo ) : InoxName {
  return info << 3 >>> 3;
}


function set_cell_type( cell : InoxCell, type : InoxType ){
  set_cell_info( cell, pack( type, unpack_name( get_cell_info( cell ) ) ) );
}


function make_cell(
  type  : InoxType,
  name  : InoxName,
  value : InoxValue
) : InoxCell {
// Allocate a new cell or reuse one, then initialize it
  let cell : InoxCell = fast_allocate_cell();
  raw_set_cell( cell, type, name, value );
  if( is_reference_cell( cell ) ){
    // ToDo: is it the best place to do this?
    increment_object_refcount( value );
  }
  return cell;
}


function raw_set_cell(
  cell  : InoxCell,
  type  : InoxType,
  name  : InoxName,
  value : InoxValue
){
  // Store value first
  store32( cell, value );
  // Then store type and name packed together
  store32( cell + offset_of_cell_info, pack( type, name ) );
  if( mem_de ){
    de&&mand_eq( get_cell_type(  cell ), type  );
    de&&mand_eq( get_cell_name(  cell ), name  );
    de&&mand_eq( get_cell_value( cell ), value );
  }
}


function get_cell_type( cell : InoxCell ) : InoxType {
// Returns the type of a cell, 0..7 range
  return unpack_type( get_cell_info( cell ) );
}


function get_cell_name( cell : InoxCell ) : InoxName {
// Returns the name of a cell, as a tag id
  return unpack_name( get_cell_info( cell ) );
}


function set_cell_name( cell : InoxCell, name : InoxName ) : void {
  set_cell_info( cell, pack( get_cell_type( cell ), name ) );
}


function get_next_cell( cell : InoxCell ) : InoxCell {
// Assuming cell is a list member, return next cell in list
  // When a cell is unused, the info becomes a cell pointer
  return unpack_name( get_cell_info( cell ) );
}


function set_next_cell( cell : InoxCell, next : InoxCell ) : void {
// Assuming cell is a list member, set the next cell in list
  // ToDo: assume type is 0 maybe?
  let info = get_cell_info( cell );
  let type = unpack_type( info );
  set_cell_info( cell, pack( type, next ) );
  mem_de&&mand_eq( get_next_cell( cell ), next );
}


function copy_cell( source : InoxCell, destination : InoxCell ) : void {
// Copy the content of a cell
  clear_cell( destination );
  set_cell_value( destination, get_cell_value( source ) );
  set_cell_info(  destination, get_cell_info(  source ) );
  if( mem_de ){
    de&&mand_eq( get_cell_type(  destination ), get_cell_type(  source ) );
    de&&mand_eq( get_cell_name(  destination ), get_cell_name(  source ) );
    de&&mand_eq( get_cell_value( destination ), get_cell_value( source ) );
  }
  // If the source was a pointer, increment the reference counter
  if( is_reference_cell( source ) ){
    increment_object_refcount( get_cell_value( source ) );
  }
}


function move_cell( source : InoxCell, destination : InoxCell ) : void {
// Move the content of a cell
  // ToDo: optimize to avoid increment/decrement of reference count
  clear_cell( destination );
  set_cell_value( destination, get_cell_value( source ) );
  set_cell_info(  destination, get_cell_info(  source ) );
  if( mem_de ){
    de&&mand_eq( get_cell_type(  destination ), get_cell_type(  source ) );
    de&&mand_eq( get_cell_name(  destination ), get_cell_name(  source ) );
    de&&mand_eq( get_cell_value( destination ), get_cell_value( source ) );
  }
  clear_cell( source );
}


function clear_cell_value( cell : InoxCell ) : void {
// Turn cell into void cell, handle object reference counters
  if( is_reference_cell( cell ) ){
    if( is_last_reference_to_bytes( cell ) ){
      if( is_pointer_cell( cell ) ){
        // Clear all attributes
        // ToDo: avoid recursion?
        const length = get_object_length( cell );
        let ii : InoxIndex = 0;
        while( ii < length ){
          clear_cell_value( cell + ii * size_of_cell );
        }
      }else{
        // ToDo: handle array/map/lists
        free_proxy( get_cell_proxy( cell ) );
      }
      free_bytes( cell );
    }else{
      decrement_object_refcount( get_cell_value( cell ) );
    }
  }
  raw_set_cell_value( cell, 0 );
}


function clear_cell( cell : InoxCell ) : void {
  clear_cell_value( cell );
  set_cell_info( cell, 0 );
}


function get_object_length( cell : InoxCell ) : InoxIndex {
// Get the number of cells of the object
  // This does not include the header used for memory management
  const length = get_bytes_size( cell ) / size_of_cell;
  return length;
}


// This is initialy the sentinel tail of the list of reallocatable cells
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
  // ToDo: unused yet
  set_next_cell( cell, free_cells );
  free_cells = cell;
}


/* -----------------------------------------------------------------------
 *  Tag & Void, type 1 & type 0
 *
 *  Tags have an id, it is an integer. Whenever the value of a tag
 *  is required as a number, that id is used. Whenever it is the text
 *  representation that is required, it's the name of the tag that
 *  is used.
 *    0 is both void and false
 *    1 is true
 */

// Tag with id 0 is void
const type_void_id = 0;
const type_tag_id  = type_void_id + 1;

// the dictionary of tags
const all_tag_cells_by_label = new Map< text, InoxCell >();
const all_tag_cells_by_id    = new Array< InoxCell >();
const all_tag_labels_by_id   = new Array< text >()

let next_tag_id : u32 = 0;
// The first tag, void, will be id 0


function make_tag_cell( name : text ) : InoxCell {

  de&&mand( name != "" );
  if( name == "" )return tag_void_cell;

  if( all_tag_cells_by_label.has( name ) ){
    return all_tag_cells_by_label.get( name );
  }

  // ToDo: use the cell address for the id?
  let id = next_tag_id++;
  let cell = make_cell( type_tag_id, id, id );

  // Update tag dictionary
  all_tag_cells_by_label.set( name, cell );
  all_tag_cells_by_id[  id ] = cell;
  all_tag_labels_by_id[ id ] = name;

  if( de ){
    de&&mand(    tag_id_to_text(     id   ) == name );
    de&&mand_eq( get_tag_cell_by_id( id   ), cell   );
    de&&mand_eq( get_cell_value(     cell ), id     );
    de&&mand_eq( get_cell_name(      cell ), id     );
    de&&mand_eq( get_cell_type(      cell ), 1      );
  }

  return cell;

}


function tag( name : text ) : InoxName {
  const cell = make_tag_cell( name );
  // ToDo: use the cell address for the tag id?
  return get_cell_value( cell );
}


// First cell ever
const the_void_cell = make_cell( 0, 0, 0 );
const tag_void_cell = make_tag_cell( "void" );
const tag_void_id   = get_cell_name( tag_void_cell );

de&&mand_eq( tag_void_id, 0x0 );

// Tag with id 1 is #tag
const tag_tag_cell = make_tag_cell( "tag" );
const tag_tag_id   = get_cell_name( tag_tag_cell );

de&&mand_eq( tag_tag_id, 0x1 );


function tag_id_to_text( id : u32 ) : text {
  return all_tag_labels_by_id[ id ];
}


function get_tag_cell_by_id( id : InoxName ) : InoxCell {
// Return the address of the cell that holds the tag singleton
  return all_tag_cells_by_id[ id ];
}


function is_void_cell( cell : InoxCell ) : InoxBoolean {
  if( get_cell_type( cell ) == type_void_id )return 1;
  return 0;
}


function is_tag_cell( cell : InoxCell ) : InoxBoolean {
  if( get_cell_type( cell ) == type_tag_id )return 1;
  return 0;
}


/* -----------------------------------------------------------------------
 *  Integer, type 2, 32 bits
 *  ToDo: Double integers, 64 bits.
 *  ToDo: BigInt objects to deal with arbitrary long integers.
 */

const type_integer_id = type_tag_id + 1;

const tag_integer_cell = make_tag_cell( "integer" );
const tag_integer_id   = get_cell_name( tag_integer_cell );

de&&mand_eq( type_integer_id, 0x2 );


function make_integer_cell( value ){
  return make_cell( type_integer_id, tag_integer_id, value );
}


function get_cell_integer( cell : InoxCell ) : InoxValue {
  de&&mand_eq( get_cell_type( cell ), type_integer_id );
  return get_cell_value( cell );
}


/* -----------------------------------------------------------------------
 *  Pointer, type 3, 32 bits to reference a dynamically allocated array
 *  of cells, aka a smart pointer to an Inox object.
 */

const type_pointer_id  = type_integer_id + 1;
const tag_pointer_cell = make_tag_cell( "pointer" );
const tag_pointer_id   = get_cell_name( tag_pointer_cell );


function make_pointer_cell( value ){
  return make_cell( type_pointer_id, tag_integer_id, value );
}


function is_pointer_cell( cell : InoxCell ) : boolean {
  if( get_cell_type( cell ) == type_pointer_id )return true;
  return false;
}


function get_cell_pointer( cell : InoxCell ) : InoxValue {
  check_de&&mand( is_pointer_cell( cell ) );
  return get_cell_value( cell );
}


/* -----------------------------------------------------------------------
 *  Proxy opaque object, type 4
 *  These objects are platform provided objects. Access is done using an
 *  indirection table.
 *  ToDo: implement using dynamically allocated bytes.
 *  ToDo: define a base class to be derived by more specific classes.
 */

const type_proxy_id  = type_pointer_id + 1;
const tag_proxy_cell = make_tag_cell( "proxy" );
const tag_proxy_id   = get_cell_name( tag_proxy_cell );


function is_reference_cell( cell : InoxCell ){
// Only void and integer are used by value, other types are by reference
  const type = get_cell_type( cell );
  return type >= type_proxy_id;
}


de&&mand_eq( type_proxy_id, 0x4 );

class InoxProxyObject {
  object: any;
  constructor( opaque_object ){
    this.object = opaque_object;
  }
}


// Access to proxied object is opaque, there is an indirection
// Each object has an id which is a cell address

// Indirection table to get access to an object using it's id
let all_proxies_by_id = new Map< InoxCell, any >();

function make_proxy( object : any ){
  let proxy = allocate_bytes( size_of_cell );
  all_proxies_by_id.set( proxy, object );
  let class_name = tag( object.constructor.name );
  set_cell_value( proxy, class_name );
  // ToDo: use info field to store rtti, runtime type identification
  set_cell_info( proxy, class_name );
  return proxy;
}


function make_proxy_cell( object : any ) : InoxOid {
  // ToDo: return object directly, it fits inside a cell's 32 bits value
  let proxy = make_proxy( object );
  let class_name = tag( object.constructor.name );
  let cell = make_cell( type_proxy_id, class_name, proxy );
  return cell;
}


function free_proxy( cell : InoxCell ){
  // This is called by clear_cell() when reference counter reaches zero
  all_proxies_by_id.delete( cell );
}


function get_proxy_by_id( id : InoxCell ) : any {
  return all_proxies_by_id.get( id );
}


function get_cell_proxy( cell : InoxCell ){
  let oid = get_cell_value( cell );
  return get_proxy_by_id( oid );
}


function proxy_to_text( id : InoxCell ) : text {
  // Some special cases produce an empty string.
  if( !id )return "";
  if( !all_proxies_by_id.has( id ) )return "";
  let obj = all_proxies_by_id.get( id );
  return obj.toString();
}


function proxy_cell_to_text_cell( cell : InoxCell ){
  // ToDo: shallow copy if already a text
  // ToDo: check type, should be proxy
  const proxy = get_cell_proxy( cell );
  const new_proxy = make_proxy( proxy_to_text( proxy ) );
  // Keep name but change type
  set_cell_value( cell, proxy );
  set_cell_type( cell, type_text_id );
}


/* -----------------------------------------------------------------------
 *  Text, type 5
 *  Currently implemented using a proxy object, a string.
 */

const type_text_id  = type_proxy_id + 1;
const tag_text_cell = make_tag_cell( "text" );
const tag_text_id   = get_cell_name( tag_text_cell );

de&&mand_eq( type_text_id, 0x5 );

const the_empty_text_cell = make_cell(
  type_text_id,
  tag_text_id,
  make_proxy( "" )
);


function make_text_cell( value : text ) : InoxCell {
  if( value.length === 0 )return the_empty_text_cell;
  // ToDo: share text object of preexisting tags?
  // ToDo: always return same cell for same text?
  const cell = make_cell(
    type_text_id,
    tag_text_id,
    make_proxy( value )
  );
  de&&mand( cell_to_text( cell ) == value );
  return cell;
}


/* -----------------------------------------------------------------------
 *  Word, type 6
 *  the name of the Inox word is an integer id, an index in the tag
 *  table.
 *  the value is the address where the Inox word is defined is the VM
 *  memory, the definition is built using 64 bits regular cells.
 *  Words are never deallocated, like tags.
 */

const type_word_id  = type_text_id + 1;
const tag_word_cell = make_tag_cell(  "word" );

de&&mand_eq( type_word_id, 0x6 );

// The dictionary of all Inox words
let all_inox_word_cells_by_id  = Array< InoxAddress >();
let all_inox_word_ids_by_label = new Map< text, InoxValue >()


function make_inox_word(
  name : InoxName,
  def_first_cell : InoxCell
) : InoxCell {
// Define an Inox word. It's name is the name of the cell.
  // The cell's value is the adress of another cell where the word definition
  // starts. There is q header is the previous cell, for length & flags.
  // The definition is an array of cells with primitive ids and
  // word ids, aka a block. See runner() where the definition is interpreted.
  // ToDo: Forth also requires a pointer to the previous definition of
  // the word.
  const word_cell = make_cell( type_word_id, name, def_first_cell );
  all_inox_word_cells_by_id[ name ] = word_cell;
  all_inox_word_ids_by_label.set( tag_id_to_text( name ), name );
  return word_cell;
}


function get_inox_word_cell_by_id( id : InoxValue ) : InoxAddress {
  return all_inox_word_cells_by_id[ id ];
}


function inox_word_name_to_text( id : InoxValue ): text {
  let word_cell = get_inox_word_cell_by_id( id );
  let name = get_cell_name( word_cell );
  let str_name : text = tag_id_to_text( get_cell_value( name ) );
  return str_name;
}


function get_inox_word_definition_by_label( name : text ) : InoxAddress {
  // ToDo: implement header with flags, length and pointer to previous
  let id : InoxIndex;
  let cell : InoxCell;
  if( all_inox_word_ids_by_label.has( name ) ){
    id   = all_inox_word_ids_by_label.get( name );
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
  if( all_inox_word_ids_by_label.has( name ) ){
    return all_inox_word_ids_by_label.get( name );
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


function get_definition_length( def : InoxAddress ) : InoxIndex {
  // The header with length & flags is right before the code
  const length = get_cell_value( def - words_per_cell ) & 0xffff;
  if( de ){
    if( length > 100 ){
      bug( "Large definition" );
      debugger;
    }
  }
  return length;
}


function set_inox_word_flag( id : InoxWord, flag : InoxValue ){
  const def = get_inox_word_definition_by_id( id ) - words_per_cell;
  raw_set_cell_value( def, get_cell_value( def ) | flag );
}


function test_inox_word_flag( id : InoxWord, flag : InoxValue ){
  const def = get_inox_word_definition_by_id( id ) - words_per_cell;
  return ( get_cell_value( def ) & flag ) == flag ? 1 : 0;
}


function set_inox_word_immediate_flag( id : InoxIndex ) : void {
  set_inox_word_flag( id, 0x80000 );
}


function is_immediate_inox_word( id : InoxIndex ) : InoxValue {
  return test_inox_word_flag( id, 0x80000 );
}


function set_inox_word_hidden_flag( id : InoxIndex ) : void {
  set_inox_word_flag( id, 0x40000 );
}


function is_hidden_inox_word( id : InoxIndex ) : InoxValue {
   return test_inox_word_flag( id, 0x40000 )
}


function set_inox_word_operator_flag( id : InoxIndex ) : void {
  set_inox_word_flag( id, 0x20000 );
}


function is_operator_inox_word( id : InoxIndex ) : InoxValue {
  return test_inox_word_flag( id,  0x20000 );
}


function set_stream_inox_word_stream_flag( id : InoxIndex ) : void {
  // See Icon language goal directed backtrackings
  // https://lib.dr.iastate.edu/cgi/viewcontent.cgi?article=1172&context=cs_techreports
  set_inox_word_flag( id, 0x10000 );
}


function is_stream_inox_word( id : InoxIndex ) : InoxValue {
  return test_inox_word_flag( id, 0x10000 );
}


function set_inlined_inox_word_flag( id : InoxIndex ) : void {
  set_inox_word_flag( id,  0x08000 );
}


function is_inlined_inox_word( id : InoxIndex ) : InoxValue {
  return test_inox_word_flag( id, 0x08000 );
}


/* -----------------------------------------------------------------------------
 *  Tempory work cells, one for each type, and some more
 */

const tag_work_cell = make_tag_cell( "work-cell" );
const tag_work_id   = get_cell_name( tag_work_cell );

const the_tag_work_cell = make_tag_cell( "work-tag" );
set_cell_name( the_tag_work_cell, tag_work_id );

const the_integer_work_cell =  make_integer_cell( 0 );
set_cell_name( the_integer_work_cell, tag_work_id );

const the_boolean_work_cell =  make_integer_cell( 0 );
set_cell_name( the_boolean_work_cell, tag( "boolean" ) );

const the_true_work_cell = make_integer_cell( 1 );
set_cell_name( the_true_work_cell, tag( "true" ) );

const the_false_work_cell = make_integer_cell( 0 );
set_cell_name( the_false_work_cell, tag( "false" ) );

const the_fail_work_cell = make_integer_cell( -1 );
set_cell_name( the_fail_work_cell, tag(  "fail" ) );

const the_just_work_cell = make_integer_cell( 1 );
set_cell_name( the_just_work_cell, tag( "just" ) );

const the_text_work_cell = make_text_cell( "work" );
set_cell_name( the_text_work_cell, tag_work_id );

const the_proxy_work_cell = make_proxy_cell( 0 );
set_cell_name( the_proxy_work_cell, tag_work_id );

const the_pointer_work_cell =  make_pointer_cell( 0 );
set_cell_name( the_pointer_work_cell, tag_work_id );


/* -----------------------------------------------------------------------------
 *  Float, Array, Map, List
 *  Currently implemented as proxy objects
 *  ToDo: implement arrays as dynamically allocated arrays of cells
 *  ToDo: implement maps as dynamically allocated arrays of cells
 *  ToDo: implement lists using name and value of cell?
 */

const type_float_id    = type_proxy_id;
const tag_float_cell   = make_tag_cell(  "float" );

function make_float( value : float ){
  return make_proxy_cell( value );
}


const tag_array_cell   = make_tag_cell( "array" );
const tag_array_id     = get_cell_name( tag_array_cell );

function make_array( obj? : Object ) : InoxCell {
  let array = obj;
  if( ! obj ){
    array = new Array< InoxCell >();
  }
  return make_proxy_cell( array );
}


const tag_map_cell = make_tag_cell(  "map" );
const tag_map_id   = get_cell_name( tag_map_cell );

function make_map( obj? : Object ){
  let map = obj;
  if( ! obj ){
    map = new Map< InoxOid, InoxCell >();
  }
  return make_proxy_cell( map );
}


const tag_list_cell = make_tag_cell(  "list" );
const tag_list_id   = get_cell_name( tag_list_cell );

function make_list( obj? : Object ) : InoxCell {
  // ToDo: value should a linked list of cells
  let list = obj;;
  if( ! obj ){
    list = new Array< InoxCell >();
  }
  return make_proxy_cell( list );
}


/* --------------------------------------------------------------------------
 *  Task
 *  ToDo: make it a first class type?
 */

const tag_task_cell = make_tag_cell( "task" );
const tag_task_id   = get_cell_name( tag_task_cell );

// Global state about currently running task
let current_task : Task;
let current_ip   : InoxAddress;
let current_csp  : InoxAddress;
let current_dsp  : InoxAddress;


class CpuContext {

  ip  : InoxAddress; // Current instruction pointer in code
  dsp : InoxCell;    // Data stack pointer, goes downward
  csp : InoxCell;    // Control stack pointer for call returns, goes downward

  constructor(
    ip  : InoxAddress,
    dsp : InoxCell,
    csp : InoxCell
  ){
    this.ip  = ip;
    this.dsp = dsp;
    this.csp = csp;
  }

}


class Task {
// Inox machines run cooperative tasks, actors typically

  cell          : InoxCell;   // Cell that references this object
  parent        : InoxCell;   // Parent task
  act           : InoxCell;   // Current activation record
  memory        : InoxCell;   // Memory pointer, in ram array, goes upward
  stack         : InoxCell;   // Base address of data stack cell array,downward
  control_stack : InoxCell;   // Base address of control stack, goes down too
  ctx           : CpuContext; // Include ip, dsp & csp

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
    // Room for heap and stacks, both data data and control
    this.memory = allocate_bytes( size );
    // Control stack is at the very end, with small room for underflow
    this.control_stack
    = this.memory + ( ( size / size_of_word ) - 2 * words_per_cell );
    // Data stack is just below the control stack made of 1024
    this.stack = this.control_stack - ( words_per_cell * 1024 );
    this.ctx = new CpuContext( ip, this.stack, this.control_stack );
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
    current_csp  = this.ctx.csp = ctx.csp;
  }
}


function make_task( parent : InoxCell, act : InoxCell ) : InoxCell {
  let size = 1024 * size_of_cell; // for parameters & control stacks; ToDo
  var new_task = new Task( parent, 1, act, size );
  // Fill parameter stack with act's parameters
  // ToDo [ act.locals ];
  let cell = make_proxy_cell( new_task );
  new_task.cell = cell;
  return cell;
};


// Current task is the root task
let root_task: InoxCell = make_task( the_void_cell, the_void_cell );
current_task = get_cell_proxy( root_task );

// Current task changes at context switch
task_switch( current_task );

// There is nothing in the free list
let free_tasks = the_void_cell;


function allocate_task( parent : InoxCell, act:InoxCell ) : InoxCell {
  if( free_tasks == the_void_cell )return make_task( parent, act );
  let task = free_tasks;
  let task_object = get_cell_proxy( task );
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
  task_switch( get_cell_proxy( next_task ) );
}


function task_switch( task : Task ) : void {
  task.restore_context( task.get_context() );
}


function primitive_make_task() : void {
  let ip : InoxAddress = get_cell_value( this.dsp() );
  var act = 0 // ToDo: allocate_act( current_task.cell );
  var new_task : InoxCell = allocate_task( current_task.cell, act );
  // ToDo: push( parameters ); into new task
  let t : Task = get_cell_proxy( new_task );
  t.ctx.ip = ip;
  copy_cell( new_task, this.dsp() );
  de&&mand( t.ctx.dsp <= t.stack );
  de&&mand( t.ctx.dsp >  t.memory );
};


/* -----------------------------------------------------------------------
 *  primitives
 *
 *  ToDo: use failure/success insteqd of false/true,
 *  See Icon at https://lib.dr.iastate.edu/cgi/viewcontent.cgi?article=1172&context=cs_techreports
 */

let all_primitive_cells_by_id     = new Array< InoxCell >();
let all_primitive_fumctions_by_id = new Array< Function >();
let all_primitive_ids_by_name     = new Map< text, InoxIndex >();

const tag_return_id = tag( "inox-return" );

function set_return_cell( cell : InoxCell ){
  raw_set_cell_value( cell, 0 );
  set_cell_info(  cell, 0x0 ); // instead of tag_return_id
}


function primitive( name : text, fn : Function ) : InoxCell {
// Helper to define a primitive
// It also defines an Inox word that calls that primitive

  // Allocate an object cell that points on the Function object
  let function_cell = make_proxy( fn );

  // Will store primitive's name as a tag
  let tag_cell = make_tag_cell( name );

  // Make sure the name of the cell is as desired
  set_cell_info(
    function_cell,
    pack(
      get_cell_type( function_cell ),
      get_cell_name( tag_cell   )
    )
  );

  // Assign a new primitive id to the new primitive
  let id = get_cell_name( tag_cell );

  // Associate name, primitive id and cell in all directions
  all_primitive_cells_by_id[ id ] = function_cell;
  all_primitive_fumctions_by_id[ id ] = fn;
  all_primitive_ids_by_name.set( name, id );

  // Make also an Inox word that calls the primitives
  let def : InoxAddress = allocate_bytes( 3 * size_of_cell );

  // flags and length
  raw_set_cell( def, type_word_id, id, 2 );

  // Skip that header
  def += words_per_cell;

  // Add primitive
  raw_set_cell( def + 0 * words_per_cell, type_void_id, id, 0 );

  // Add "return"
  set_return_cell( def + words_per_cell );;

  let word_cell = make_inox_word( tag( name ), def );

  de&&mand_eq( get_inox_word_definition_by_label( name ), def  );
  de&&mand_eq(
    get_cell_name( get_inox_word_definition_by_label( name ) ),
    id
  );

  de&&bug( inox_word_cell_to_text_definition( word_cell ) );

  return word_cell;

}


function immediate_primitive( name : text, fn : Function ) : InoxCell {
// Helper to define an immediate primitive
// In inox-eval, immediate Inox words are executed instead of being
// added to the new Inox word definition that follows the "define" word
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


primitive( "inox-return", function inox_return(){
// primitive "return" is jump to return address
  debugger;
  let csp : InoxCell = this.csp();
  this.set_csp( csp + words_per_cell );
  this.set_ip( get_cell_value( csp ) );
} );


// Special case for primitive inox-return, it gets two ids
all_primitive_cells_by_id[ 0 ]
= all_primitive_cells_by_id[ tag( "inox-return" ) ];
all_primitive_fumctions_by_id[ 0 ]
= all_primitive_fumctions_by_id[ tag( "inox-return" ) ];
// Also patch word definition to reference word 0
set_return_cell( get_inox_word_definition_by_label( "inox-return" ) );


primitive( "inox-cast", function(){
// Change the type of a value. That's unsafe.
  const type = get_cell_value( this.pop() );
  check_de&&mand( type < 8 )&&_or_FATAL.call( this, "Invalid type" );
  set_cell_type( this.dsp, type );
} );


primitive( "inox-rename", function primitive_inox_name(){
// Change the name of a value
  const name = get_cell_value( this.pop() );
  set_cell_name( this.dsp(), name );
  de&&mand_eq( get_cell_name( this.dsp() ), name );
} );


primitive( "inox-jump", function go_jump(){
// Primitive is "jump" to some relative position
  // ToDo: conditional jumps
  this.set_ip( this.ip() + get_cell_value( this.pop() ) );
} );


primitive( "make_task",   primitive_make_task   );
primitive( "task_switch", primitive_task_switch );

// ToDo: core dictionary

// Data stack manipulations

primitive( "push", function primitive_push() { this.push() } );


primitive( "drop", function primitive_drop() { clear_cell( this.pop() ) } );


primitive( "dup",  function primitive_dup(){
  copy_cell( this.dsp(), this.push() );
} );


const tmp_cell = make_cell( type_void_id, tag_void_id, 0 );

primitive( "swap",  function primitive_swap(){
  const dsp0 = this.dsp();
  const dsp1 = dsp0 + words_per_cell;
  copy_cell( dsp0, tmp_cell );
  copy_cell( dsp1, dsp0 );
  copy_cell( tmp_cell, dsp1 );
} );


primitive( "over", function primitive_over(){
  copy_cell( this.dsp() + words_per_cell, this.push() );
} );


primitive( "rotate", function primitive_rotate(){
  const dsp0 = this.dsp();
  const dsp1 = dsp0 + words_per_cell;
  const dsp2 = dsp1 + words_per_cell;
  copy_cell( dsp0, tmp_cell );
  copy_cell( dsp1, dsp0 );
  copy_cell( dsp2, dsp1 );
  copy_cell( tmp_cell, dsp2 );
} );


primitive( "pick", function primitive_pick(){
  const dsp = this.dsp();
  const nth = get_cell_integer( dsp );
  copy_cell( dsp + nth * words_per_cell, dsp );
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


function cell_to_tag( cell : InoxCell ) : InoxCell {
  let value : InoxValue = get_cell_value( cell );
  let info  : InoxInfo  = get_cell_info(  cell );
  let type  : InoxType  = unpack_type( info );
  if( type == type_tag_id )return all_tag_cells_by_id[ value ];
  return make_tag_cell( cell_to_text( cell ) );
}


function cell_to_text( cell : InoxCell ) : text {

  let value : InoxValue = get_cell_value( cell );
  let info  : InoxInfo  = get_cell_info(  cell );
  let type  : InoxType  = unpack_type( info );

  if( type == type_text_id ){
    return proxy_to_text( value );
  }else if( type == type_tag_id ){
    return all_tag_labels_by_id[ value ];
  }else if( type == type_integer_id ){
    return integer_cell_to_text( cell );
  }else if( type == type_void_id ){
    return "";
  }else{
    return ""
  }

}


/* ----------------------------------------------------------------------------
 *  debug tool
 */


function cell_to_dump_text( cell : InoxCell ) : text {

  let value : InoxValue = get_cell_value( cell );
  let info  : InoxInfo  = get_cell_info(  cell );
  let type  : InoxType  = unpack_type( info );

  let name : InoxName = unpack_name( info );
  let buf : text = "" + tag_id_to_text( name );

  switch( type ){
    case type_void_id :
      if( name != type ){
        buf += ":<void>";
      }
    break;
    case type_tag_id :
      if( value != name ){
        buf += ":" + tag_id_to_text( value );
      }
    break;
    case type_integer_id :
      buf += ":" + integer_cell_to_text( cell );
    break;
    case type_text_id :
      buf += ":" + get_cell_value( value );
    break;
    case type_proxy_id :
      buf += ":@" + integer_cell_to_text( cell );
    break;
    case type_word_id : buf += ":<word:" + value + ">";
    break;
    case type_pointer_id :
      buf += ":*" + integer_cell_to_text( cell );
    break;
    default :
      de&&mand( false );
      buf += ":<???/" + type + ":" + value + ">";
    break;
  }

  buf += " - " + tag_id_to_text( type ) + "@" + cell;
  return buf;

}


function dump_stacks( dsp : InoxAddress, csp : InoxAddress ){

  let buf  = "DATA STACK:";

  let ptr  = dsp;
  let base = current_task.stack;

  if( ptr > base ){
    bug(
      "Data stack underflow, top " + dsp + ", base " + base
      + ", delta " + ( base - dsp )
      + ", excess pop " + ( ( base - dsp ) / words_per_cell )
    )
    base = ptr + 5 * words_per_cell;
  }

  let nn = 0;
  while( ptr <= base ){
    buf += "\n"
    + nn + " -> "
    + cell_to_dump_text( ptr )
    + ( ptr == current_task.stack ? " <= BASE" : "" );
    if( ptr == current_task.stack )break;
    ptr += words_per_cell;
    nn++;
    if( nn > 10 ){
      buf += "...";
      break;
    }
  }

  let return_base = current_task.control_stack;
  ptr = csp;

  if( ptr > return_base ){
    bug(
      "Controls stack underflow, top " + csp + ", base " + return_base
      + ", delta " + ( return_base - csp )
      + ", excess pop " + ( ( return_base - csp ) / words_per_cell )
    )
    return_base = ptr + 5 * words_per_cell;
  }

  buf += "\CONTROL STACK: ";
  nn = 0;
  let ip : InoxAddress ;
  let name : text = "";
  while( ptr <= return_base ){
    ip = get_cell_value( ptr );
    buf += nn + ": " + ip;
    name = tag_id_to_text( get_cell_name( ptr ) );
    buf += " (" + get_cell_name( ptr ) + "/" + name +  "), " ;
    if( ptr == current_task.control_stack ){
      buf += "/end/";
    }
    if( nn > 10 ){
      buf += "...";
      break;
    }
    ptr += words_per_cell;
    nn++;
  }

  bug( buf );

}


primitive( "inox-log", function primitive_inox_log(){
  let cell = this.pop();
  let type = get_cell_type( cell );
  if( type == type_tag_id ){
    let tag_id = get_cell_value( cell );
    if( tag_id == tag( "dont" ) ){
      can_log = false;
    }
    if( tag_id == tag( "do" ) ){
      can_log = true;
    }
    return;
  }
  clear_cell( cell );
} );


primitive( "inox-get-type", function primitive_inox_get_type(){
// Get type as an integer.
// ToDo: get as a tag?
  let cell = this.dsp();
  let type = get_cell_type( cell );
  set_cell_value( the_integer_work_cell, type );
  copy_cell( the_integer_work_cell, cell );
} );


primitive( "inox-get-name", function primitive_inox_get_name(){
  let cell = this.dsp();
  let name = get_cell_name( cell );
  set_cell_value( the_tag_work_cell, name );
  copy_cell( the_tag_work_cell, cell );
} );


primitive( "inox-get-value", function primitive_inox_get_value(){
  let cell = this.dsp();
  let value = get_cell_value( cell );
  set_cell_value( the_integer_work_cell, value );
  copy_cell( the_integer_work_cell, cell );
} );


/* ---------------------------------------------------------------------------
 *  Some type checking
 */


function mand_integer( cell ): void{
  if( get_cell_type( cell ) == type_integer_id )return;
  bug( "!!! integer expected, instead: "
  + get_cell_type( cell ) + "/" + cell_to_text( cell ) )
  assert( false );
}


function mand_tag( cell ){
  if( get_cell_type( cell ) == type_tag_id )return;
  bug( "!!! tag expected, instead: "
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
  raw_set_cell_value( p0, r );
} );


primitive( "inox-if", function primitive_if(){
// Disable block unless top of stack is true. ( bool block -- block-or-f )
  const block = this.pop();
  if( get_cell_value( this.dsp() ) != 0 ){
    copy_cell( block, this.dsp() );
  // Else inox-call will detect false and do nothing accordingly
  }

} );


primitive( "inox-ifelse", function primitive_ifelse(){
// Disable block unless top of stack is true. ( bool then-block else-block condition -- block )
  const else_block = this.pop();
  const then_block = this.pop();
  if( get_cell_value( this.dsp() ) != 0 ){
    copy_cell( then_block, this.dsp() );
  }else{
    copy_cell( else_block, this.dsp() );
  }
} );


primitive( "inox-to-control", function primitive_inox_to_control(){
  const csp = this.csp() - words_per_cell;
  copy_cell( this.pop(), csp );
  this.set_csp( csp );
} );


primitive( "inox-from-control", function primitive_inox_from_control(){
  const csp = this.csp();
  copy_cell( csp, this.push() );
  this.set_csp( csp + words_per_cell );
} );


primitive( "inox-fetch-control", function primitive_inox_fetch_control(){
  copy_cell( this.csp(), this.push() );
} );


function FATAL( message : text ){
// Display error and stacks. Clear stack & get back to eval loop
  bug( "\nFATAL: " + message );
  dump_stacks( this.dsp(), this.csp() );
  this.set_csp( current_task.control_stack );
  this.set_dsp( current_task.stack );
  this.set_ip( 0 );
  debugger;
}


// For use in xxx_de&&mand( xxx )&&_or_FATAL( msg )
const _or_FATAL = FATAL;


const inox_while_tag_id = tag( "inox-while" );

primitive( "inox-while-1", function primitive_inox_while_1(){
// Low level words to build inox-while( { condition } { body } )
  // : inox-while
  //   inox-while-1 ( save blocks in control stack )
  //   inox-while-2 ( run condition block )
  //   inox-while-3 ( run body or exit word )
  // ; inox-inlined
  const body_block      = this.pop();
  const condition_block = this.pop();
  // IP is expected to points to inox-while-2
  de&&mand_eq( get_cell_value( this.ip() ), 0x40000000 | tag( "inox-while-2" ) );
  // Save info for inox-break-loop, it would skip to after inox-while-3
  let csp = this.csp();
  csp -= words_per_cell;
  set_cell_value( csp, this.ip() + 2 );
  set_cell_info( csp, tag( "inox-loop-sentinel" ) );
  // Move condition and body to control stack
  csp -= words_per_cell;
  copy_cell( body_block, csp );
  if( de ){
    set_cell_info( csp, tag( "inox-while-body" ) );
  }
  csp -= words_per_cell;
  copy_cell( condition_block, csp );
  if( de ){
    set_cell_info( csp, tag( "inox-while-condition" ) );
  }
  this.set_csp( csp );
  // The control stack now holds:
  //   IP for inox-break, named inox-loop-sentinel
  //   IP for the body block
  //   IP for the condition block
  // Execution continues inside inox-while-2
} );


primitive( "inox-while-2", function primitive_inox_while_2(){
  // IP is expected to point to inox-while-3
  de&&mand_eq( get_cell_value( this.ip() ), 0x40000000 | tag( "inox-while-3" ) );
  const csp = this.csp();
  const condition_block = get_cell_value( csp );
  // Invoke condition, like inox-call would
  const next_csp = csp - words_per_cell;
  set_cell_value( next_csp, this.ip() );
  set_cell_info(  next_csp, tag( "inox-goto-while-3" ) );
  this.set_csp( next_csp );
  this.set_ip( condition_block );
  // The control stack now holds:
  //   IP for the body block, named #inox-while-body in debug mode
  //   IP for the condition block, named #inox-while-condition in debug mode
  //   IP addres of inox-while-3, the condition block will return to it
} );


function primitive_inox_while_3(){

  const csp = this.csp();
  let   bool = get_cell_value( this.pop() );

  // If the condition is met, run the body and loop
  if( bool != 0 ){
    const body_block = get_cell_value( csp + words_per_cell );
    // The inox-return of the body block must jump to inox-while-2
    const next_csp = csp - words_per_cell;
    set_cell_value( next_csp, this.ip() - 2 );
    set_cell_info(  next_csp, tag( "inox-goto-while-2" ) );
    this.set_csp( next_csp );
    // CSP must point to inox-while-2
    de&&mand_eq(
      get_cell_value( get_cell_value( this.csp() ) ),
      0x40000000 | tag( "inox-while-2" )
    );
    this.set_ip( body_block );

  // The while condition is not met, it's time to exit the loop
  }else{
    // Drop loop sentinel, condition and body from control stack
    // ToDo: use lookup instead of fixed value
    this.set_csp( this.csp() + 3 * words_per_cell );
    // const next_csp = csp + words_per_cell * 2;
    // this.set_ip( get_cell_value( next_csp ) );
    // this.set_csp( next_csp + words_per_cell );
  }
}

primitive( "inox-while-3", primitive_inox_while_3 );


primitive( "inox-until-3", function primitive_inox_until_3(){
// Like while loop but with the boolean reversed
  const dsp = this.dsp();
  if( get_cell_value( dsp ) == 0 ){
    set_cell_value( dsp, 1 );
  }else{
    set_cell_value( dsp, 0 );
  }
  primitive_inox_while_3.call( this );
} );


primitive( "inox-loop", function primitive_loop(){
  const body_block = get_cell_value( this.pop() );
  let next_csp = this.csp() - words_per_cell;
  set_cell_value( next_csp, this.ip() );
  set_cell_info( next_csp, tag( "inox-loop-sentinel" ) );
  // Invoke body block, it will return to itself, loopimg until some break
  next_csp -= words_per_cell;
  set_cell_value( next_csp, body_block );
  set_cell_info( next_csp, tag( "inox-loop-body" ) );
  this.set_csp( next_csp );
  this.set_ip( body_block );
} );


function lookup_sentinel( csp : InoxCell, tag : InoxName ) : InoxCell {
  let next_csp = csp + words_per_cell;
  let limit = 10000;
  // Drop anything until sentinel
  while( limit-- ){
    // ToDo: test type against Act boundary
    if( get_cell_name( next_csp ) == tag )return next_csp ;
    next_csp += words_per_cell;
  }
  return 0;
}


primitive( "inox-break", function inox_break(){
// Like inox-return but to exit a loop control structure
  const csp : InoxCell = this.csp();
  let next_csp = lookup_sentinel( csp, tag( "inox-loop-sentinel" ) );
  // ToDo: raison exception if not found
  if( next_csp == 0 ){
    FATAL.call( this, "inox-break sentinel missing" );
    return;
  }
  // ToDo: self modifying code to avoid loop next time
  // Return to IP previously saved in inox-loop or inox-while-3
  this.set_ip( get_cell_value( next_csp ) );
  this.set_csp( next_csp + words_per_cell );
} );


primitive( "inox-enter", function primitive_inox_enter(){
  let next_csp = this.csp() - words_per_cell;
  set_cell_value( next_csp, this.ip() );
  set_cell_info( next_csp, tag( "inox-enter-sentinel" ) );
} );


primitive( "inox-leave", function inox_leave(){
// Non local return to last inox-enter caller
  const csp : InoxCell = this.csp();
  let next_csp = lookup_sentinel( csp, tag( "inox-enter-sentinel" ) );
  // ToDo: raison exception if not found
  if( next_csp == 0 ){
    FATAL.call( this, "inox-enter sentinel missing" );
    return;
  }
  // ToDo: self modifying code to avoid loop next time
  // Return to IP previously saved in inox-loop or inox-while-3
  this.set_ip( get_cell_value( next_csp ) );
  this.set_csp( next_csp + words_per_cell );
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
      const r = fun.call( this, get_cell_value( p0 ), get_cell_value( p1 ) );
      raw_set_cell_value( p0, r );
    }
  );

}


operator( "-",     ( a, b ) => a -   b );
operator( "*",     ( a, b ) => a *   b ); // multiply
operator( "/",     ( a, b ) => a /   b );
operator( "%",     ( a, b ) => a %   b ); // remainder
operator( "**",    ( a, b ) => a **  b ); // exponentation
operator( "<<",    ( a, b ) => a <<  b ); // left binary shift
operator( ">>",    ( a, b ) => a >>  b ); // right binary shift
operator( ">>>",   ( a, b ) => a >>> b ); // idem but with 0 highest bit
operator( "AND",   ( a, b ) => a &   b ); // binary and
operator( "OR",    ( a, b ) => a |   b ); // binary or
operator( "XOR",   ( a, b ) => a ^   b ); // binary xor
operator( ">?",    ( a, b ) => ( a >   b ) ? 1 : 0 );
operator( "<?",    ( a, b ) => ( a <   b ) ? 1 : 0 );
operator( ">=?",   ( a, b ) => ( a >=  b ) ? 1 : 0 );
operator( "<=?",   ( a, b ) => ( a <=  b ) ? 1 : 0 );
operator( "=?",    ( a, b ) => ( a ==  b ) ? 1 : 0 ); // ToDo: term or failure
operator( "==?",   ( a, b ) => ( a ==  b ) ? 1 : 0 );
operator( "not=?", ( a, b ) => ( a !=  b ) ? 1 : 0 ); // ToDo: term or failure
operator( "!=?",   ( a, b ) => ( a !=  b ) ? 1 : 0 );
operator( "and?",  ( a, b ) => ( a &&  b ) ? 1 : 0 ); // ToDo: return left term
operator( "&&",    ( a, b ) => ( a &&  b ) ? 1 : 0 );
operator( "or?",   ( a, b ) => ( a ||  b ) ? 1 : 0 ); // ToDo: return first true
operator( "||",    ( a, b ) => ( a ||  b ) ? 1 : 0 );


function unary_operator( name : text, fun : Function ) : void {
  operator_primitive( name, function primitive_unary_operator(){
    const p0 = this.dsp();
    const r  = fun.call( this, get_cell_value( p0 ) );
    set_cell_value( p0, r );
  } );
}

unary_operator( "not?",     ( x ) => x       ?  0 :  1 );
unary_operator( "!?",       ( x ) => x       ?  0 :  1 );
unary_operator( "not=0?",   ( x ) => x == 0  ?  0 :  1 );
unary_operator( "true?",    ( x ) => x == 0  ?  0 :  1 );
unary_operator( "false?",   ( x ) => x == 0  ?  1 :  0 );
unary_operator( "=1?",      ( x ) => x == 1  ?  1 :  0 );
unary_operator( "=-1?",     ( x ) => x == -1 ?  1 :  0 );
unary_operator( "=0?",      ( x ) => x == 0  ?  1 :  0 );
unary_operator( "<0?",      ( x ) => x  < 0  ?  1 :  0 );
unary_operator( "<=0?",     ( x ) => x <= 0  ?  1 :  0 );
unary_operator( ">0?",      ( x ) => x  > 0  ?  1 :  0 );
unary_operator( ">=0?",     ( x ) => x >= 0  ?  1 :  0 );
unary_operator( "NOT",      ( x ) => ~x                );
unary_operator( "negative", ( x ) => -x                );
unary_operator( "sign",     ( x ) => x < 0   ? -1 :  1 );
unary_operator( "abs",      ( x ) => x > 0   ?  x : -x );


operator_primitive( "&", function primitive_text_concat(){
// String concatenation
  const p1 = this.pop();
  const p0 = this.dsp();
  const r  = make_text_cell( cell_to_text( p0 ) + cell_to_text( p1 ) );
  copy_cell( r, p0 );
} );


operator_primitive( "as\"\"", function primitive_as_text(){
  const p = this.dsp();
  if( get_cell_type( p ) == type_text_id )return;
  copy_cell( make_text_cell( cell_to_text( p ) ), p );
} );


operator_primitive( "is\"\"?", function primitive_is_empty_text(){
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
const tag_method_missing = make_tag_cell( "method-missing" );
const tag_word_missing   = make_tag_cell( "word-missing"   );


function inox_code_to_text( word : InoxCell ){
// what type of code is this, Inox word, primitive, literal, jump?

  let type      : InoxIndex;
  let name      : InoxCell;
  let word_cell : InoxCell;
  let primitive : InoxCell;
  let name_id   : InoxIndex;
  let name_str  : text;
  let fun       : Function;

  type = get_cell_type( word );
  name = get_cell_name( word );

  // If code is a primitive
  if( type == type_void_id ){
    primitive = all_primitive_cells_by_id[ name ];
    name_id   = get_cell_name( primitive );
    fun       = all_primitive_fumctions_by_id[ name ];
    return tag_id_to_text( name_id )
    + " ( " + ( fun ? fun.name : "???" ) + " )";

  // If code is the integer id of an Inox word, an execution token
  }else if ( type == type_word_id ){
    word_cell = get_inox_word_cell_by_id( name );
    name_id   = get_cell_name( word_cell );
    name_str  = tag_id_to_text( name_id );
    if( name_id == 0x0000 ){
      debugger;
      name_str = "inox-return";
    }
    return name_str + " ( word " + name + " )";

  // If code is a literal
  }else{
    return cell_to_dump_text( word )
      + " ( literal )";
  }

}


function inox_word_to_text_definition( id : InoxIndex ) : text {
// Return the decompiled source code that defined the Inox word
  // A non primitive Inox word is defined using an array of cells that
  // are either other words, primitives or literal values

  let name = inox_word_id_to_text( id );

  // The definition is an array of cells
  let def : InoxCell = get_inox_word_definition_by_id( id );

  // The prior cell stores flags & length
  let flags_and_length = get_cell_value( def - words_per_cell );
  let flags  = flags_and_length & 0xffff0000;
  let length = flags_and_length & 0xffff;

  // ToDo: add a pointer to the previous word definition

  let buf = ": ( definition of " + name + ", word " + id
  + ", cell " + def + ", flags " + flags + ", length " + length + " )\n";

  let ip : InoxIndex = 0;
  let cell : InoxCell;

  while( ip < length ){
    cell = def + ip * words_per_cell;
    // Filter out final "return"
    if( ip + 1 == length ){
      de&&mand_eq( get_cell_value( cell ), 0x0 );
      de&&mand_eq( get_cell_type(  cell ), type_void_id );
      // de&&mand_eq( get_cell_name(  cell ), tag_return_id );
      break;
    }
    buf += "" + ip + ": " + inox_code_to_text( cell ) + "\n";
    ip++;
  }

  return buf;

}


function inox_word_id_to_text( id : InoxIndex ) : text {
  let word_cell = get_inox_word_cell_by_id( id );
  let name_id   = get_cell_name( word_cell );
  return tag_id_to_text( name_id );
}


function inox_word_cell_to_text_definition( cell : InoxCell ) : text {
  const name_id = get_cell_name( cell );
  const id = all_inox_word_ids_by_label.get( tag_id_to_text( name_id ) );
  return inox_word_to_text_definition( id );
}


/* -----------------------------------------------------------------------
 *  Constants and variables
 *  a constant is just a word that pushes a literal on the data stack.
 *  a global variable is a regular static cell.
 *  a local variable is a transient cell in the control stack.
 *  a stack variable is a transient cell in the data stack.
 *  Read and write access to variables is possible directly or via a pointer.
 */


function primitive_inox_constant(){

  // Get value
  const value_cell = this.pop();

  // Create tag if necessary
  const tag_cell = cell_to_tag( this.pop() );
  const name = cell_to_text( tag_cell );
  const name_id = tag( name );

  // If no specific name, id void, was used, name the value of the new cell
  if( get_cell_name( value_cell ) == 0 ){
    set_cell_name( value_cell, name_id );
  }

  // Allocate space for word header, value and return instruction
  let def = allocate_bytes( ( 1 + 2 ) * size_of_cell );

  // flags and length need an extra word, so does then ending "return"
  raw_set_cell( def, type_integer_id, tag( name ), 1 + 1 );

  // Skip that header
  def += words_per_cell;

  // Add Literal value
  copy_cell( value_cell, def + 0 * words_per_cell );

  // Add return instruction
  set_return_cell( def + words_per_cell );

  make_inox_word( name_id, def );

  de&&mand_eq( get_inox_word_definition_by_label( name ), def );
  de&&mand_eq(
    get_cell_value(
      get_inox_word_definition_by_label( name ) + words_per_cell
    ),
    0
  );

}
primitive( "inox-constant", primitive_inox_constant );


primitive( "inox-global", function primitive_inox_global(){
  primitive_inox_constant.call( this );
} )


primitive( ".set!", function primitive_set_value(){
// Like @set! but preserve the name of the destination cell
  const p1 = this.pop();
  const p0 = this.pop();
  const name = get_cell_name( p1 );
  copy_cell( p0, get_cell_value( p1 ) );
  set_cell_name( p1, name );
} );


primitive( "inox-local-create", function primitive_inox_local_create(){
// Create a local variable in the control stack
  const csp = this.csp();
  move_cell( this.pop(), csp );
  this.set_csp( csp - words_per_cell );
} );


primitive( "inox-local-get", function primitive_inox_local_get(){
// Copy the value of a local variable from the control stack to the data one
  const dsp = this.dsp();
  let   ptr = this.csp();
  const name = get_cell_name( dsp );
  while( get_cell_name( ptr ) != name ){
    ptr += words_per_cell;
    if( check_de ){
      if( ptr >= current_task.control_stack ){
        FATAL.call( this,
        "Local variable not found, named " + tag_id_to_text( name ) );
        return;
      }
    }
  }
  copy_cell( ptr, dsp );
} );


primitive( "inox-local-set", function primitive_inox_local_set(){
// Set the value of a local variable in the control stack
  const dsp   = this.pop();
  const name = get_cell_name( dsp );
  let   ptr = this.csp();
  while( get_cell_name( ptr ) != name ){
    ptr += words_per_cell;
    if( check_de ){
      if( ptr >= current_task.control_stack ){
        FATAL.call( this,
        "Local variable not found, named " + tag_id_to_text( name ) );
        return;
      }
    }
  }
  move_cell( this.pop(), ptr );
} );


primitive( "inox-stack-get", function primitive_inox_stack_get(){
// Copy the value of a local variable from the data stack
  const dsp  = this.dsp();
  let   ptr  = dsp + words_per_cell;
  const name = get_cell_name( dsp );
  while( get_cell_name( ptr ) != name ){
    ptr += words_per_cell;
    if( check_de ){
      if( ptr > current_task.stack ){
        FATAL.call( this,
        "Stack variable not found, named " + tag_id_to_text( name ) );
        return;
      }
    }
  }
  copy_cell( ptr, dsp );
} );


primitive( "inox-stack-set", function primitive_inox_stack_set(){
// Set the value of a local variable in the data stack
  const dsp  = this.pop();
  const name = get_cell_name( dsp );
  const cell = dsp + words_per_cell;
  let   ptr  = cell + words_per_cell;
  while( get_cell_name( ptr ) != name ){
    ptr += words_per_cell;
    if( check_de ){
      if( ptr > current_task.stack ){
        FATAL.call( this,
        "Stack variable not found, named " + tag_id_to_text( name ) );
        return;
      }
    }
  }
  clear_cell( dsp );
  copy_cell( cell, ptr );
  this.set_dsp( cell + words_per_cell );
} );


primitive( "inox-object-get", function primitive_inox_object_get(){
// Copy the value of an instance variable from an object
  const dsp = this.pop();
  const obj = dsp + words_per_cell;
  if( check_de ){
    if( get_cell_type( obj ) != type_pointer_id ){
      // ToDo: fatal error
      de&&mand_eq( get_cell_type( obj ), type_pointer_id );
      return;
    }
  }
  let ptr  = get_cell_value( obj );
  let limit;
  if( check_de ){
    limit = ptr + get_object_length( ptr ) * words_per_cell;
  }
  const name = get_cell_name( dsp );
  while( get_cell_name( ptr ) != name ){
    // ToDo: go backward
    ptr += words_per_cell;
    if( check_de ){
      if( ptr >= limit ){
        FATAL.call( this,
        "Object member not found, named " + tag_id_to_text( name ) );
        return;
      }
    }
  }
  copy_cell( ptr, obj );
} );


primitive( "inox-object-set", function primitive_inox_object_set(){
// Set the value of an instance variable in some object.
  const name_cell = this.pop();
  const name = get_cell_name( name_cell );
  const obj = this.pop();
  const dsp  = this.pop();
  if( check_de ){
    if( get_cell_type( obj ) != type_pointer_id ){
      // ToDo: fatal error
      de&&mand_eq( get_cell_type( obj ), type_pointer_id );
      return;
    }
  }
  let ptr  = get_cell_value( obj );
  let limit : InoxAddress;
  if( check_de ){
    limit = ptr + get_object_length( ptr ) * words_per_cell;
  }
  while( get_cell_name( ptr ) != name ){
    // ToDo: go backward
    ptr += words_per_cell;
    if( check_de ){
      if( ptr >= limit ){
        FATAL.call( this,
        "Object member not found, named " + tag_id_to_text( name ) );
        return;
      }
    }
  }
  // Like move_cell() but preserve the target cell's name
  raw_set_cell_value( ptr, get_cell_value( dsp ) );
  set_cell_type(  ptr, get_cell_type(  dsp ) );
  clear_cell( dsp );
} );


primitive( "inox-size-of-cell", function primitive_inox_size_of_cell(){
  const cell = this.push();
  copy_cell( the_integer_work_cell, cell );
  set_cell_value( cell, size_of_cell );
} );


primitive( "inox-words-per-cell", function primitive_inox_words_per_cell(){
  const cell = this.push();
  copy_cell( the_integer_work_cell, cell );
  set_cell_value( cell, words_per_cell );
} );


primitive( "inox-make-pointer", function primitive_inox_make_pointer() {
// Make an object from values plus header. v1 v2 ... vnn name:nn -- name:ptr
// Returns a pointer value that points to the new object in dynamic memory.
// Whenever that pointer is copied, a reference counter is incremented.
// Whenever a pointer is disposed, the counter is decremented.
// When the counter reaches zero, each member is also disposed and the
// dynamic memory to store the object is released back to the heap of
// cells.
  const header = this.dsp();
  const name   = get_cell_name( header );
  const length = get_cell_value( header );
  const dest   = allocate_bytes( ( 1 + length ) * size_of_cell );
  if( dest == 0 ){
    // ToDo: raise an exception
    set_cell_value( the_integer_work_cell, 0 );
    copy_cell( the_integer_work_cell, this.push() );
    return;
  }
  // ToDo: no values should raise an exception
  let ii : InoxIndex = 0;
  while( true ){
    move_cell(
      header + ii * words_per_cell,
      dest   + ii * words_per_cell
    );
    ii++;
    if( ii > length )break;
  }
  // The first element is the named length
  // ToDo: the length is redundant with info in malloc
  de&&mand_eq( get_cell_value( dest ), length );
  this.set_dsp( header + ii * words_per_cell );
  set_cell_value( the_pointer_work_cell, dest );
  set_cell_name(  the_pointer_work_cell, name );
  copy_cell( the_pointer_work_cell, this.dsp() );
} );


primitive( "inox-with-it", function primitive_inox_with_it(){
// Create an it local variable in the return stack
  const csp = this.csp() - words_per_cell;
  move_cell( this.pop(), csp );
  set_cell_name( csp, tag( "it" ) );
  this.set_csp( csp  );
} );


primitive( "inox-at-it", function primitive_inox_at_it(){
// Get the address of the it local variable in the control stack
  const name = tag( "it" );
  let   ptr  = this.csp();
  while( get_cell_name( ptr ) != name ){
    ptr += words_per_cell;
    if( check_de ){
      if( ptr >= current_task.control_stack ){
        FATAL.call( this,
        "Local variable not found, named " + tag_id_to_text( name ) );
      }
      return;
    }
  }
  const dsp = this.push();
  copy_cell( ptr, dsp );
} );


/* ---------------------------------------------------------------------------
 *  low level unsafe access to csp, dsp & ip registers
 */

primitive( "inox-words-per-cell", function primitive_inox_words_per_cell(){
  set_cell_value( the_integer_work_cell, words_per_cell );
  copy_cell( the_integer_work_cell, this.push() );
} );


primitive( "inox-csp", function primitive_inox_csp(){
  set_cell_value( the_integer_work_cell, this.csp() );
  copy_cell( the_integer_work_cell, this.push() );
} );


primitive( "inox-set-csp", function primitive_set_csp(){
  this.set_csp( get_cell_value( this.pop() ) );
} );


primitive( "inox-dsp", function primitive_inox_dsp(){
  set_cell_value( the_integer_work_cell, this.dsp() );
  copy_cell( the_integer_work_cell, this.push() );
} );


primitive( "inox-set-csp", function primitive_set_dsp(){
  this.set_csp( get_cell_value( this.pop() ) );
} );


primitive( "inox-ip", function primitive_inox_ip(){
  set_cell_value( the_integer_work_cell, this.ip() );
  copy_cell( the_integer_work_cell, this.push() );
} );


primitive( "inox-set-ip", function primitive_set_ip(){
  this.set_ip( get_cell_value( this.pop() ) );
} );


/* -----------------------------------------------------------------------
 *  runner, fast, execute 32 bits encoded instructions
 */

class InoxExecutionContext {
    ip:      Function; // instruction pointer
    csp:     Function; // control stack point
    dsp:     Function; // data stack pointer
    set_ip:  Function;
    set_csp: Function;
    set_dsp: Function;
    pop:     Function; // returns dsp++
    push:    Function; // returns --dsp
    run:     Function; // points to runner() closure
}

const TheInoxExecutionContext = new InoxExecutionContext();


function run_fast( ctx : CpuContext ){
// This is the one function that needs to run fast.
// It should be optimized by hand depending on the target CPU.
  // See https://muforth.nimblemachines.com/threaded-code/
  // Also http://www.ultratechnology.com/1xforth.htm
  // and http://www.bradrodriguez.com/papers/moving1.htm

  // Setup cpu context, instruction pointer, data & control stacks
  // These variables would be stored in some CPU registers if this routine
  // was coded in machine code
  let   IP  : InoxAddress = ctx.ip;
  let   CSP : InoxAddress = ctx.csp;
  let   DSP : InoxAddress = ctx.dsp;
  de&&mand( DSP <= current_task.stack );
  de&&mand( !! IP );

  // primitives have a limited access to the environment, but fast
  const inox = TheInoxExecutionContext;
  inox.ip  = function ip(){  return IP;  };
  inox.csp = function csp(){ return CSP; };
  inox.dsp = function dsp(){ return DSP; };
  // ToDo gmp & tmp, global memory pointer and task memory pointer
  // ToDo ap, current Act pointer
  inox.set_ip  = function set_ip(  v : InoxAddress ){ return IP  = v; };
  inox.set_csp = function set_csp( v : InoxAddress ){ return CSP = v; };
  inox.set_dsp = function set_dsp( v : InoxAddress ){ return DSP = v; };

  inox.push = function push(){
    return DSP -= words_per_cell;
  };

  inox.pop = function pop(){
    const x = DSP;
    DSP += words_per_cell;
    return x;
  }

  inox.run = runner;

  function runner(){

    let word : u32;

    loop: while( true ){

      assert( IP );
      if( !IP )break;

      // Get name and type of value to run
      word = get_cell_info( IP );
      run_de&&bug(
        "\nRUN, IP " + IP
        + ", " + inox_code_to_text( IP ) + " in "
        + inox_code_to_text( get_cell_value( CSP ) )
      );
      stack_de && dump_stacks( DSP, CSP );

      // Special "next" code, 0x0000, is a jump to the return address
      // Machine code equivalent would be a return from subroutine
      if( word == 0x0000 ){
        IP = get_cell_value( CSP );
        if( run_de ){
          bug( "run, return to IP " + IP + " from "
          + inox_code_to_text( get_cell_name( CSP ) ) );
        }
        if( IP == 0 )break loop; // That's the only way to exit the loop
        CSP += words_per_cell;
        continue;
      }

      // What type of code this is, primitive, Inox word or literal
      const type = unpack_type( word );

      // Call to another word
      if( type == type_word_id ){

        CSP -= words_per_cell;
        set_cell_value( CSP, IP + words_per_cell );
        // Store routine name also, cool for stack traces
        // ToDo: set type to Act
        set_cell_info( CSP, word );
        // ToDo: The indirection could be avoided.
        IP = get_inox_word_definition_by_id( unpack_name( word ) );
        // bug( inox_word_to_text_definition( unpack_name( word ) ) );

     // Call to a primitive
     } else if( type == type_void_id ){

        IP += words_per_cell;
        if( !de ){
          all_primitive_fumctions_by_id[ word ].call( inox );
          if( IP == 0 )break loop;
          continue;
        }
        // Some debug tool to detect bad control stack or IP manipulations
        let word_id = word;
        if( run_de && ( word_id ) != 61 ){ // inox-quote is special
          let old_csp = CSP;
          let fun = all_primitive_fumctions_by_id[ word_id ];
          fun.call( inox );
          if( CSP != old_csp
          && word_id != tag( "inox-call" )
          && word_id != tag( "inox-call-by-name" )
          && word_id != tag( "inox-call-method-by-name" )
          && word_id != tag( "inox-returns" )
          && word_id != tag( "inox-while-1" )
          && word_id != tag( "inox-while-2" )
          && word_id != tag( "inox-while-3" )
          && word_id != tag( "inox-until-3" )
          && word_id != tag( "inox-loop" )
          && word_id != tag( "inox-break" )
          && word_id != tag( "inox-with-it" )
          && word_id != tag( "inox-from-control" )
          ){
            debugger;
            if( CSP < old_csp ){
              bug( "??? small CSP, excess calls "
              + ( old_csp - CSP ) / words_per_cell );
            }else{
              bug( "??? big CSP, excess returns "
              + ( CSP - old_csp ) / words_per_cell );
            }
            de&&bug( "Due to " + fun.name + ", " + inox_code_to_text( word ) );
            CSP = old_csp;
          }
          let old_ip  = IP;
          if( IP && IP != old_ip ){
            bug( "run, IP change, due to " + fun.name
            + ", "  + inox_code_to_text( word ) );
          }
          if( IP == 0 ){
            bug( "run, IP 0 due to " + fun.name );
            break loop; // That's not supposed to be a way to exit the loop
          }
        }else{
          all_primitive_fumctions_by_id[ word_id ].call( inox );
          if( IP == 0 )break loop;
        }

      // Push literal
      }else{
        DSP -= words_per_cell;
        set_cell_value( DSP, get_cell_value( IP ) );
        set_cell_info(  DSP, word );
        IP += words_per_cell;
      }
    }
  } // runner()


  runner();

  return new CpuContext( IP, DSP, CSP );

} // run_fast()


function run(){

  const task = current_task;
  de&&mand( current_dsp <= current_task.stack );
  de&&mand( current_dsp >  current_task.memory );

  // Provide minimal context to run_fast()
  let current_ctx = new CpuContext(
    current_ip,
    current_dsp,
    current_csp
  );

  let new_ctx = run_fast( current_ctx );

  // Ajust current context based on run_fast()'s changes
  current_ip  = new_ctx.ip;
  current_dsp = new_ctx.dsp;
  current_csp = new_ctx.csp;

  de&&mand( task == current_task );
  de&&mand( current_dsp <= current_task.stack );
  de&&mand( current_dsp >  current_task.memory );

}


function run_inox_word( word : text ){
  current_ip = get_inox_word_definition_by_label( word );
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
let c_aliases          = make_style_aliases( "c"          );
let javascript_aliases = make_style_aliases( "javascript" );
let lisp_aliases       = make_style_aliases( "lisp"       );


primitive( "inox-dialect", function primitive_inox_dialect(){
  set_style( "inox" );
});


primitive( "forth-dialect", function primitive_forth_dialect(){
  set_style( "forth" );
});


primitive( "inox-alias", function primitive_inox_alias(){
  const new_text_cell = this.pop();
  const new_text = cell_to_text( new_text_cell );
  clear_cell( new_text_cell );
  const old_text_cell = this.pop();
  const word = cell_to_text( old_text_cell );
  clear_cell( new_text_cell );
  define_alias( tokenizer.style, word, new_text );
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


// These functions are defined in inox-eval()
let eval_do_literal_function         : Function;
let eval_do_code_function            : Function;
let eval_tokenize_next_word_function : Function;
let eval_begin_block_function        : Function;
let eval_end_block_function          : Function;
let eval_begin_word_function         : Function;
let eval_end_word_function           : Function;


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
  move_cell( this.pop(), cell );
  eval_do_literal_function.call( this, cell );
} );


primitive( "inox-code", function primitive_inox_do_code(){
// Add an Inox word code id to the Inox word beeing defined or to a block
  eval_do_code_function.call( this, get_cell_value( this.pop() ) );
} );


immediate_primitive( "inox", function primitive_inox(){
// Read the next word from the source code input stream
// and get it's Inox word code id. Defaults to 0 if next token in source
// is not a defined Inox word
  eval_tokenize_next_word_function.call( this );
} );


primitive( "inox-quote", function primitive_inox_quote(){
// Get the next word from the currently executing word and skip it
  // MUST BE INLINED
  const ip = this.ip();
  let word_id = get_cell_name( ip );
  last_quoted_word_id = word_id;
  set_cell_value( the_integer_work_cell, word_id );
  copy_cell(      the_integer_work_cell, this.push() );
  // Skip the quoted word
  this.set_ip( ip + words_per_cell );
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


primitive( "inox-inlined", function primitive_inox_inlined(){
  set_inlined_inox_word_flag( last_inox_word_defined );
} );


primitive( "inox-last-word", function primitive_inox_word(){
  copy_cell( last_token_cell, this.push() );
} );


/* -------------------------------------------------------------------------
 *  ip manipulation
 */

primitive( "inox-tag", function primitive_inox_tag(){
// Make a tag, from a text typically
  const dsp = this.dsp();
  set_cell_value( the_tag_work_cell, tag( cell_to_text( dsp ) ) );
  copy_cell( the_tag_work_cell, dsp );
});


primitive( "inox-call-by-name", function primitive_inox_call_by_name(){
// Call word by name
  const dsp = this.pop();
  const name = cell_to_text( dsp );
  clear_cell( dsp );
  let word_id = get_inox_word_id_by_name( name );
  if( word_id == 0 ){
    copy_cell( make_tag_cell( name ), this.push() );
    word_id = get_inox_word_id_by_name( "word-missing" );
  }
  this.set_csp( this.csp() - words_per_cell );
  set_cell_value( this.csp(), this.ip() );
  set_cell_name( this.csp(),  tag( name ) );
  this.set_ip( get_inox_word_definition_by_id( word_id ) );
} );


primitive( "inox-call-method-by-name",
  function primitive_inox_call_method_by_name(){
// Call method by name
  const dsp = this.pop();
  const name = cell_to_text( dsp );
  clear_cell( dsp );
  let target = this.dsp();
  const type = get_cell_type( target );
  // ToDo: lookup using name of value ?
  // Dereference pointer
  if( type == type_pointer_id ){
    target = get_cell_value( target );
  }
  let target_class_name = tag_id_to_text( get_cell_name(  target ) );
  const full_name = target_class_name + ":" + name;
  let word_id = get_inox_word_id_by_name( full_name );
  if( word_id == 0 ){
    // ToDo: lookup in class hierarchy
    // ToDo: on the fly creation of the target method if found
    if( word_id == 0 ){
      // ToDo: lookup based on type, unless pointer
      if( type != type_pointer_id ){
        // ToDo: get type as string, then add : and method name
      }
      if( word_id == 0 ){
        copy_cell( make_tag_cell( full_name ), this.push() );
        word_id = get_inox_word_id_by_name( "method-missing" );
      }
    }
  }
  this.set_csp( this.csp() - words_per_cell );
  set_cell_value( this.csp(), this.ip() );
  set_cell_name( this.csp(),  tag( name ) );
  this.set_ip( get_inox_word_definition_by_id( word_id ) );
} );


primitive( "inox-definition", function primitive_inox_definition(){
// Get the address of the first element of the definition of a word
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

// ToDo: inox-block-length & inox-word-flags


primitive( "inox-call", function primitive_inox_call(){
// run block unless none
  // Get block address
  const next_ip = get_cell_value( this.pop() );
  // Do nothing if none
  if( next_ip == 0 )return;
  // Push return address
  const csp = this.csp();
  const next_csp = csp - words_per_cell;
  this.set_csp( next_csp );
  set_cell_value( next_csp, this.ip() );
  set_cell_info(  next_csp, tag( "inox-call" ) );
  // Jump to block code
  this.set_ip( next_ip );
} );


primitive( "inox-run", function primitive_inox(){
  // "inox Hello inox-run" does what Hello does alone
  this.set_ip( get_inox_word_definition_by_id( get_cell_value( this.pop() ) ) );
  // ToDo: check missing word
} );


primitive( "inox-block", function primitive_inox_block(){
// Skip block code after IP but push it's address. Ready for inox-call
  const ip = this.ip();
  const block_length = get_cell_value( ip - words_per_cell );
  if( check_de ){
    set_cell_value( the_integer_work_cell, ip );
    copy_cell( the_integer_work_cell, this.push() );
  }else{
    set_cell_value( this.push(), ip );
  }
  this.set_ip( ip + block_length * words_per_cell );
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

class TokenizerContext {

  style : text                  = "";
  define : text                 = "";
  end_define : text             = "";
  terminator_sign : text        = ";";
  separator_sign : text         = ",";
  comment_monoline_begin        = "";
  comment_monoline_begin_begin  = "";
  comment_multiline_begin       = "";
  comment_multiline_begin_begin = "";
  comment_multiline_end         = "";
  comment_multiline_end_end     = "";

  text         : text           = "";
  text_length  : number         = 0;
  line_number  : number         = 0;
  column       : number         = 0;
  text_cursor  : number         = 0;
  alias_cursor : number         = 0;

  first_comment_seen : boolean  = false;

  back_token   : Token    = void_token;
  post_literal_name       = "";

  last_front_spaces_count = 0;
  non_space_seen          = false;

  // The last seen token
  token : Token = {
    type   : "",
    value  : "",
    index  : 0,
    line   : 0,
    column : 0
  };

}

let tokenizer : TokenizerContext = new TokenizerContext();

// Tokens are extracted from a text that is "the source code"
//let text         : text;
//let text_length  : number;

// Count lf to help locate errors
//let line_number  : number;

// The next token starts after some position in the source code
//let text_cursor  : number;

// Some constructions detect two tokens at once, the second is delivered next
//let back_token  = void_token;

// text, tag and number literals can be prefixed by a name, post processed
//let post_literal_name = "";

// Indentation changes related
//let last_front_spaces_count = 0;
//let non_space_seen          = false;

// Changing the style makes it easy to customize various syntax elements
//let style : text;

// statement/expression/definition terminators, single characters
//let terminator_sign = ";"

// item separator, a single character, in addition to space
// ToDo: give it more semantic, not just a comment
//let separator_sign = ",";

// Smart detection of comment style syntax, somehow
//let comment_monoline_begin        : text;
//let comment_monoline_begin_begin  : text;
// ToDo: nesting multiline comments
//let comment_multiline_begin       : text;
//let comment_multiline_begin_begin : text;
//let comment_multiline_end         : text;
//let comment_multiline_end_end     : text;

// Once the first comment is seen, the style is known
//let first_comment_seen : boolean;

// Start/end of words definitions, depend on dialect
//let define     : text;
//let end_define : text;


function set_style( new_style : text ) : void {
// Set the new style for future token detections

  set_alias_style( new_style );

  if( new_style == "c"
  ||  new_style == "javascript"
  ||  new_style == "inox"
  ){
    tokenizer.comment_monoline_begin        = "//";
    tokenizer.comment_monoline_begin_begin  = "/";
    tokenizer.comment_multiline_begin       = "/*";
    tokenizer.comment_multiline_begin_begin = "/";
    tokenizer.comment_multiline_end         = "*/";
    tokenizer.comment_multiline_end_end     = "/";
    if( new_style == "inox" ){
      // Using "to" is Logo style, it's turtles all the way
      tokenizer.define = "to";
      tokenizer.end_define = ".";
    }else{
      tokenizer.define = "function";
      tokenizer.end_define = "}";
    }

  }else if( new_style == "forth" ){
    tokenizer.comment_monoline_begin        = "\\";
    tokenizer.comment_monoline_begin_begin  = "\\";
    tokenizer.comment_multiline_begin       = "(";
    tokenizer.comment_multiline_begin_begin = "(";
    tokenizer.comment_multiline_end         = ")";
    tokenizer.comment_multiline_end_end     = ")";
    tokenizer.define = ":";
    tokenizer.end_define = ";";

  }else if( new_style == "lisp" ){
    tokenizer.comment_monoline_begin        = ";";
    tokenizer.comment_monoline_begin_begin  = ";";
    tokenizer.comment_multiline_begin       = "";
    tokenizer.comment_multiline_begin_begin = "";
    tokenizer.comment_multiline_end         = "";
    tokenizer.comment_multiline_end_end     = "";
    tokenizer.define = "defn";
    tokenizer.end_define = ")";


  }else if( new_style == "prolog" ){
    tokenizer.comment_monoline_begin        = "%";
    tokenizer.comment_monoline_begin_begin  = "%";
    tokenizer.comment_multiline_begin       = "";
    tokenizer.comment_multiline_begin_begin = "";
    tokenizer.comment_multiline_end         = "";
    tokenizer.comment_multiline_end_end     = "";
    tokenizer.define = "clause";
    tokenizer.end_define = ".";
  }

  tokenizer.style = new_style;

  // Don't guess the style because user made it explicit
  tokenizer.first_comment_seen = true;

}


function tokenizer_restart( source : text ){

  // The source code to process
  tokenizer.text        = source;
  tokenizer.text_length = tokenizer.text.length;

  // Track progress in the source code
  tokenizer.text_cursor  = 0;
  tokenizer.line_number  = 1;

  // Default style
  set_style( "inox" );

  // First char of source code defines style of comments and aliases
  tokenizer.first_comment_seen = false;

  // Obviously there is no previously detected token to deliver
  tokenizer.back_token  = void_token;

  // Idem for the past literal name
  tokenizer.post_literal_name = "";

  // Idem regarding indentation, restart fresh
  tokenizer.last_front_spaces_count = 0;
  tokenizer.non_space_seen          = false;

  // ToDo: make it reentrant
  // some enter/leave logic could stack the tokenizer state

}


primitive( "inox-start-input", function(){
  tokenizer_restart( cell_to_text( this.pop() ) );
} );


primitive( "inox-input", function primitive_inox_input(){
// Get UTF16 integer code of next character in source code, or void

  if( tokenizer.text_cursor >= tokenizer.text_length ){
    copy_cell( the_void_cell, this.dsp() );
    return;
  }

  const ch = tokenizer.text[ tokenizer.text_cursor ];
  tokenizer.text_cursor += 1;
  // ToDo: handle line number if lf

  copy_cell(  make_integer_cell( ch.charCodeAt( 0 ) ), this.dsp() );

} );


primitive( "inox-input-until", function primitive_inox_input_until(){

  let buf = "";
  let limit = cell_to_text( this.dsp() );
  let ch;

  while( true ){

    if( tokenizer.text_cursor >= tokenizer.text_length ){
      copy_cell( the_void_cell, this.dsp() );
      return;
    }

    ch = tokenizer.text[ tokenizer.text_cursor++ ];

    if( ch == limit ){
      // ToDo: avoid text cell creation
      copy_cell( make_text_cell( buf ), this.dsp() );
      return;
    }

    buf += ch;

  }

} );


function unget_token( token : Token ) : void {
  tokenizer.back_token = token;
}


primitive( "inox-pushback-token", function primitive_inox_pushback_token(){
  const cell = this.pop();
  const name = get_cell_name( cell );
  unget_token( {
    type:   tag_id_to_text( name ),
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

  // If there is some token already, if so deliver it
  let token : Token = tokenizer.back_token;
  if( token !== void_token ){
    tokenizer.back_token = void_token;
    return token;
  }
  token = tokenizer.token;

  // Get to where things were before
  let ii = tokenizer.text_cursor;

  // Default to "word" type of token
  token.type = "word";
  token.value  = "";
  token.index  = ii;
  token.line   = tokenizer.line_number;
  token.column = tokenizer.column;

  let state = tokenizer.first_comment_seen ? "base" : "comment";;

  // Buffer to collect token text
  let buf      = "";

  // One character at a time
  let ch       = "";
  let is_space = false;
  let is_eol   = false; // End Of Line
  let is_eof   = false; // End Of File

  // Space is the normal limit between words, there are speciql cases
  let is_limit = false;

  // Some small lookahead to detect some constructs
  // ToDo: use a "    " fixed size text?
  let next_ch  = [ " ", " ", " ", " " ];
  let next_ch_ii = 0;


  function ch_is_space( ch : text ){
    // ToDo: some more semantic for , in Inox, not just a whitespace
    if( ch == tokenizer.separator_sign
    && tokenizer.style == "inox" )return true;
    // ToDo: avoid regexp
    return /\s/.test( ch.charAt( 0 ) );
  }

  function ch_is_digit( ch : text ){
    // ToDo: avoid regexp
    return /\d/.test( ch.charAt( 0 ) );
  }


  function ch_is_eol( ch : text ){
    // ToDo: handle crlf better
    if( ch == "\n" )return true;
    if( ch == "\r" )return true;
    return false;
  }

  function ch_is_limit( ch : text ){
    if( ch == " " )return true;
    if( tokenizer.style != "inox" )return false;
    if( ch == ":"
    ||  ch == ";" // ToDo: ?
    ||  ch == "~" // ToDo: ?
    ||  ch == "^" // ToDo: ?
    //||  ch == "." // ToDo: dot notation where a.b( c ) eqv b( a, c )
    ||  ch == "'" // ToDo: detect xxx's
    ||  ch == "'"
    ||  ch == "`"
    ||  ch == "("
    ||  ch == ")"
    ||  ch == "["
    ||  ch == "]"
    ||  ch == "{"
    ||  ch == "}"
    // ToDo: what about all two characters combinations with (, { and [ ?
    )return true;
    return false;
  }


  function refill_next_ch(){
    // Don't do it twice if same location
    if( next_ch_ii == ii )return;
    for( let jj = 0 ; jj < 4 ; jj++ ){
      if( ( ii + jj ) >= tokenizer.text_length ){
        next_ch[ jj ] = " ";
      }else{
        next_ch[ jj ] = tokenizer.text[ ii + jj ];
        // Treat lf like a space
        if( ch_is_eol( next_ch[ jj ] ) ){
          next_ch[ jj ] = " ";
        }
      }
    }
    next_ch_ii = ii;
  }

  let front_spaces = 0;

  let previous_ii    = 0;
  let previous_state = "";

  eat: while( true ){

    if( de ){
      if( ii == previous_ii && state == previous_state ){
        bug( "Infinite loop detected in get_next_token" );
        debugger;
        ii = tokenizer.text_length;
      }
      previous_ii    = ii;
      previous_state = state;
    }

    // EOF, end of file
    if( ii == tokenizer.text_length ){
      is_eof = true;
      if( state != "word" && state != "comment" ){
        token.type = "eof";
        break eat;
      }
      // Simulate a space to end the current word
      ch = " ";

    // Get next character in source
    }else{
      ch = tokenizer.text[ ii++ ];
    }

    // Is it some space or something equivalent?
    is_space = ch_is_space( ch );
    is_eol   = ch_is_eol( ch );

    // Normalize all whitespaces into a single space character
    if( is_space ){
      ch = " ";
    }

    // If end of line, detect it
    if( is_eol ){
      tokenizer.line_number++;
      front_spaces = 0;
      tokenizer.non_space_seen = false;
      // Process it as if it were a space
      ch = " ";
      is_space = true;

    // Count front spaces on new line
    }else if( ! tokenizer.non_space_seen ){
      if( is_space ){
        front_spaces++;
      // If first non space on new line
      }else{
        tokenizer.non_space_seen = true;
        // Emit an indentation decrease token if decreasing, a terminator
        if( state == "base"
        && front_spaces < tokenizer.last_front_spaces_count
        && front_spaces == 0 // ToDo: make it possible not just one level 0
        ){
          token.type = ";";
          tokenizer.last_front_spaces_count = front_spaces;
          // Make sure non space is processed next time
          ii--
          break eat;
        }
        tokenizer.last_front_spaces_count = front_spaces;
      }
    }

    // Base state, the initial state of the automata
    if( state == "base" ){

      // Default is to expect a "word", including "separators" sometimes
      state = "word";

      // skip whitespaces, including separator
      // ToDo: handle separator sign ("," if Inox) with more semantic
      if( is_space ){
        state = "base";
        continue eat;

      // Texts start with ", unless Forth
      // ToDo: make it configurable?
      }else if( ch == "\"" && tokenizer.style != "forth" ){
        // ToDo: handle single quote 'xx' and backquote `xxxx`
        // ToDo: handle template text literals
        state = "text";
        continue eat;

      // Comments start differently depending on style
      }else if( ch == tokenizer.comment_monoline_begin_begin
      ||        ch == tokenizer.comment_multiline_begin_begin
      ){
        state = "comment";
      }

    } // base state

    // Collect comment
    if( state == "comment" ){

      buf += ch;

      // When inside the first comment at the very beginning of the file
      // Different programming language have different styles
      // Icon uses literate programming with code lines started using >
      // See https://en.wikipedia.org/wiki/Comment_(computer_programming)

      if( ! tokenizer.first_comment_seen && !is_space ){

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
      if( ( is_eol || is_eof )
       && tokenizer.comment_monoline_begin != ""
      && ( buf.slice( 0, tokenizer.comment_monoline_begin.length )
        == tokenizer.comment_monoline_begin )
      ){
        // Emit token, without start of comment sequence and without lf
        token.type = "comment";
        token.value = buf.slice(
          tokenizer.comment_monoline_begin.length,
          buf.length - 1 // - tokenizer.comment_monoline_begin.length
        );
        state = "base";
        break eat;
      }

      // If this terminates the multiline comment, emit the comment
      if( ch == tokenizer.comment_multiline_end_end
      && buf.slice( buf.length - tokenizer.comment_multiline_end.length )
        == tokenizer.comment_multiline_end
      && buf.slice( 0, tokenizer.comment_multiline_begin.length )
        == tokenizer.comment_multiline_begin
      ){
        // Emit token, without start & end of comment sequence
        token.type = "comment_multiline";
        token.value = buf.slice(
          tokenizer.comment_multiline_begin.length,
           buf.length - tokenizer.comment_multiline_end.length
        );
        state = "base";
        break eat;
      }

      // Premature end of file, something else was expected
      if( is_eof ){
        token.type  = tokenizer.first_comment_seen
        ? "error" : "eof";
        token.value = tokenizer.first_comment_seen
        ? "eof in token " + state : "";
        break eat;
      }

      // Keep Collecting characters
      continue eat;

    } // comment state

    // Collect text until final "
    if( state == "text" ){

      // End of text or end of file
      if( ch == "\"" ){
        token.type  = "text";
        token.value = buf;
        break eat;
      }

      if( ch == "\n" ){
        tokenizer.line_number++;
        tokenizer.column = 0;
      }

      // ToDo: handle escape sequences
      buf += ch;
      continue eat;

    } // text state

    // Collect word characters until some limit
    if( state == "word" ){

      // space is a word delimiter
      if( is_space ){
        // ToDo: expand alias
        token.value = alias( buf );
        state = "base";
        break eat;
      }

      // Get next next characters, some lookahead helps sometimes
      refill_next_ch();

      // Handle line continuation when \ is last character on line
      if( ch == "\\" && ch_is_eol( next_ch[ 0 ] ) ){
        ii++;
        // Handle crlf
        if( next_ch[ 0 ] == "\n" ){
          ii++;
        }
        continue eat;
      }

      // . is a limit if followed by space or if after something
      if( ch == tokenizer.end_define ){
        is_limit = buf.length != 0 || ch_is_space( next_ch[ 0 ] );

      // ; is a limit
      }else if( ch == tokenizer.terminator_sign ){
        is_limit = true;

      // Some other special characters are a limit too
      }else{
        is_limit = ch_is_limit( ch );
      }

      // If no limit is reached, add new character to buffer and keep going
      if( ! is_limit ){
        buf += ch;
        continue eat;
      }

      // If there was nothing before the limit, emit a single char token
      if( buf.length == 0 && ! is_space ){
        token.value = ch;

      // If there was something before the limit, deal with that
      }else if( buf.length >= 0 ){

        // (, [ and { are words of a special type, so is : when before a space
        if( ch == "("
        ||  ch == '['
        ||  ch == '{'
        ||  ( ch == ':' && next_ch[ 0 ] == " " )
        ){
         buf = buf + ch;
         ii++;

        // ), ] and } are also words of a special type
        } else if( ch == ")"
        ||         ch == "]"
        ||         ch == "}"
        ){

          // If followed by space or special characters, emit now
          if(   next_ch[ 0 ] == " "
          ||  ( next_ch[ 1 ] == " " && ch_is_limit( next_ch[ 0 ] ) )
          ||  ( next_ch[ 2 ] == " " && ch_is_limit( next_ch[ 1 ] ) )
          ||  ( next_ch[ 3 ] == " " && ch_is_limit( next_ch[ 2 ] ) )
          ){
            // ( xxx ):: is like ( xxx ) :: because : is special
            // ToDo: make special characters configurable
            buf = buf + ch;
            ii++;
          }

        // xxx:", xxx:123, xxx:-123, xxx:#yyy, to name expressions
        } else if( ch == ":" ){

          // End of word if : is before a literal or another delimiter
          // ToDo: enable :: in words?
          if( next_ch[ 0 ] == "\""
          ||  next_ch[ 0 ] == "#"
          ||  next_ch[ 0 ] == "-"
          ||  ch_is_digit( next_ch[ 0 ] )
          ||  ch_is_limit( next_ch[ 0 ] )
          ){
            tokenizer.post_literal_name = ":" + buf;
            buf = "";
          }else{
            buf += ":";
          }
          continue eat;
        }

        // A well separated word was collected, before or with the limit
        ii--;

        // Change word if some alias was defined for it
        let word_alias = get_alias( buf );

        // In Inox style the aliases can expand into multiple words
        if( tokenizer.style == "inox" && word_alias ){
          let index_space = word_alias.indexOf( " " );
          token_de&&bug( "alias for " + buf + " is " + word_alias );
          if( index_space != -1 ){
            // When this happens, restart as if from new source, base state.
            // Change source code to insert the extra stuff and scan again
            // ToDo: this breaks the index/line/column scheme
            tokenizer.text = word_alias + tokenizer.text.substring( ii - 1 );
            tokenizer.text_length  = tokenizer.text.length;
            tokenizer.alias_cursor = word_alias.length;
            ii = 0;
            buf = "";
            state = "base";
            continue eat;
          }
        }

        token.value = word_alias || buf;

      }

      if( token.value ){
        // If a xxx: naming prefix was there, it will come next
        if( tokenizer.post_literal_name != "" ){
          unget_token( {
            type  : "word",
            value : tokenizer.post_literal_name,
            index : ii,
            line:   tokenizer.line_number,
            column: 0
          } );
          tokenizer.post_literal_name = "";
        }
        state = "base";
        break eat;
      }

    } // word state

    // ??? state
    token.type  = "error";
    token.value = "error, bad state in get_next_token()";
    break eat;

  } // eat loop


  // If a xxx: naming prefix was there, it comes next
  if( tokenizer.post_literal_name != "" ){
    unget_token( {
      type  : "word",
      value : tokenizer.post_literal_name,
      index : ii,
      line:   tokenizer.line_number,
      column: 0
    } );
    tokenizer.post_literal_name = "";
  }

  // Save state for next call to get_next_token()
  tokenizer.text_cursor = ii;

  token_de&&bug( "\n"
    + "token, next is " + token.type + "/" + token.value + ". "
    + "line " + tokenizer.line_number + " is " + tokenizer.text.substring(
      tokenizer.text.lastIndexOf( "\n", ii ) + 1,
      tokenizer.text.indexOf( "\n", ii )
    )
  );

  return token;

} // get_next_token()


// Some basic tests of the tokenizer

function test_token( type : text, value : text ){

  // Save tokenizer context
  const save_cursor = tokenizer.text_cursor;
  const save_seen   = tokenizer.first_comment_seen;
  const token = get_next_token();
  let error = false;
  if( token.type != type  ){
    bug( "Bad type from get_next_token(), " + token.type + " vs " + type );
    error = true;
  }
  if( value != null && token.value != value ){
    bug( "Bad value from get_next_token(), " + token.value + " vs " + value );
    error = true;
  }
  if( error ){
    // Restore tokenizer context
    tokenizer.text_cursor = save_cursor;
    tokenizer.first_comment_seen = save_seen;
    debugger;
    test_token( type, value );
  }
}

tokenizer_restart( "" );
test_token( "eof", "" );

tokenizer_restart(  "/**/" );
test_token( "comment_multiline", "" );
test_token( "eof", "" );

tokenizer_restart(  "/* test *///\n// test" );
test_token( "comment_multiline", " test " );
test_token( "comment", "" );
test_token( "comment", " test" );
test_token( "eof", "" );


tokenizer_restart( "( test1 )\\\n\\test2" );
test_token( "comment_multiline", " test1 " );
test_token( "comment", "" );
test_token( "comment", "test2" );
test_token( "eof", "" );

tokenizer_restart( "() 0 1234 + : abc ; , ." );
test_token( "comment_multiline", "" );
test_token( "word", "0" );
test_token( "word", "1234" );
test_token( "word", "+" );
test_token( "word", ":" );
test_token( "word", "abc" );
test_token( "word", ";" );
test_token( "word", "," );
test_token( "word", "." );
test_token( "eof", "" );

tokenizer_restart( "( forth )\n : .\" out abc ; " );
test_token( "comment_multiline", " forth " );
test_token( "word", ":" );
test_token( "word", ".\"" );
test_token( "word", "out" );
test_token( "word", "abc" );
test_token( "word", ";" );
test_token( "eof", "" );

tokenizer_restart( "/**/ to debugger inox-debugger." );
test_token( "comment_multiline", "" );
test_token( "word", "to" );
test_token( "word", "debugger" );
test_token( "word", "inox-debugger" );
test_token( "word", "." );
test_token( "eof", "" );


tokenizer_restart(
  "/**/ to aa ct: void is: as_v(void:0);bb."
);
test_token( "comment_multiline", "" );
test_token( "word", "to" );
test_token( "word", "aa" );
test_token( "word", "ct:" );
test_token( "word", "void" );
test_token( "word", "is:" );
test_token( "word", "as_v(" );
test_token( "word", "0" );
test_token( "word", ":void" );
test_token( "word", ")" );
test_token( "word", ";" );
test_token( "word", "bb" );
test_token( "word", "." );
test_token( "eof", "" );

tokenizer_restart(
  "/**/ to ct:is: aa:bb void:0 .x!"
);
test_token( "comment_multiline", "" );
test_token( "word", "to" );
test_token( "word", "ct:is:" );
test_token( "word", "aa:bb" );
test_token( "word", "0" );
test_token( "word", ":void" );
test_token( "word", ".x!" );
test_token( "eof", "" );

tokenizer_restart(
  "/**/ it.x dup.:out dup.out() "
);
test_token( "comment_multiline", "" );
test_token( "word", "it" );
test_token( "word", ".x" );
test_token( "word", "dup" );
test_token( "word", ".:out" );
test_token( "word", "dup" );
test_token( "word", ".out(" );
test_token( "word", ")" );
test_token( "eof",  "" );


primitive( "inox-input-token", function primitive_inox_input_token(){
  const token = get_next_token();
  // ToDo: avoid cell creation
  const cell = make_text_cell( token.value );
  set_cell_name( cell, tag( token.type ) );
  copy_cell( cell, this.push() );
} );


/* ----------------------------------------------------------------------------
 *  eval
 *  This is the source code interpretor. It reads a text made of words and
 *  executes it.
 *  It detects a special word that starts the definition of a new word.
 *  That definition is made of next words that are either added to the
 *  new word or sometime executed immediatly instead because they help to
 *  build the new word.
 *  Once a new word is defined, it can be executed by the code interpretor
 *  that can be found in the runner() function.
 */


// Stack pointers should get back to base across calls to "eval"
const base_csp = current_csp;
const base_dsp = current_dsp;


function chk(){

  de&&mand_eq( get_cell_value( base_csp ), 0x0000 );

  if( current_csp != base_csp ){
    bug(
      "Control stack mismatch, now " + current_csp
      + ", base " + base_csp
      + ", delta " + ( base_csp - current_csp )
      + ", extra push " + ( base_csp - current_csp ) / words_per_cell
    )
    dump_stacks( current_dsp, current_csp );
    de&&mand_eq( current_csp, base_csp );
    current_csp = base_csp;
  }

  if( current_dsp != base_dsp ){
    bug(
      "Data stack mismatch, now " + current_dsp
      + ", base " + base_dsp
      + ", delta " + ( base_dsp - current_dsp )
      + ", extra push " + ( base_dsp - current_dsp ) / words_per_cell
    )
    dump_stacks( current_dsp, current_csp );
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


immediate_primitive(
  "inox-begin-block",
  function primitive_inox_begin_block(){
    eval_begin_block_function.call( this );
  }
);


immediate_primitive(
  "inox-end-block",
  function primitive_inox_end_block(){
    eval_end_block_function.call( this );
  }
);


immediate_primitive(
  "inox-begin-word",
  function primitive_inox_begin_word(){
    eval_begin_word_function.call( this );
  }
);


immediate_primitive(
  "inox-end-word",
  function primitive_inox_end_word(){
    eval_end_word_function.call( this );
  }
);


primitive( "inox-eval", function primitive_inox_eval() : void {

  de && chk();

  const old_csp = this.csp();
  const old_ip  = this.ip();

  const that = this;

  // The source code to evaluate is at the top of the stack
  const source = cell_to_text( this.dsp() );
  copy_cell( the_void_cell, this.dsp() );

  // Reinitialize the stream of tokens
  tokenizer_restart( source );
  de&&bug( "inox-eval " + source );

  let token;
  let type    : text;
  let value   : text;
  let word_id : InoxIndex;

  // ToDo: these should be globals

  type WordDefinition = { type: InoxIndex, name: InoxName, value: InoxValue };


  // A block is an array of encoded words from {} delimited source code
  type InoxBlock = Array< WordDefinition >;

  // Some syntactic constructions can nest, function call, sub expressions, etc
  type Level = {
    depth           : InoxIndex;  // Levels nest, starting with a "base" level 0
    type            : text;       // "word", "(", ":" or "{"
    name            : text;       // Often the name of a word
    word            : InoxWord;   // It's code id when such word is defined
    arguments_count : InoxIndex;  // ToDo: variadic words
    codes           : InoxBlock;  // Compiled machine code
    codes_count     : InoxIndex;  // How many machine codes in codes array
    block_start     : InoxIndex;  // For type "{", blocks, where it starts
    line            : InoxIndex;  // Position in source code, for err messages
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
    block_start     : 0,
    line            : 0
  };

  // The current level
  let level = levels[ 0 ];

  function bug_levels( title : string ){
    let buf = "eval, " + title + " ";
    let ii = 0;
    while( ii <= level.depth ){
      buf += ii + " " + levels[ ii ].type
      + ( levels[ ii ].name ? " = " + levels[ ii ].name : "" )
      + ", line " + level.line
      + ". ";
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
      arguments_count : 0, // ToDo: unused
      codes           : level.codes,        // Share codes with upper level
      codes_count     : level.codes_count,
      block_start     : 0,
      line            : token.line ? token.line : level.line
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
      eval_do_code( previous_level.word );
      if( level.type == "infix" ){
        leave_level();
      }
    }

  }


  // Will points to a level after some start of definition, "to" or : typically
  let new_word : Level = null;


  function eval_begin_word(){
  // Called when entering a new word definition, "to"" or : typically
  // ToDo: should be an immediate primitive
    enter_level( "new word" );
    level.codes       = Array< WordDefinition >();
    level.codes_count = 0;
    new_word           = level;
  }

  eval_begin_word_function = eval_begin_word;


  function eval_end_word(){
  // Called when terminating a new word definition, . or ; typically

    // ToDo: should be an immediate defining word

    const tag_cell = make_tag_cell( new_word.name );

    // Allocate cells, including space for header and final return
    let def = allocate_bytes( ( new_word.codes.length + 2 ) * size_of_cell );

    // flags and length need an extra word, so does then ending "return"
    set_cell_value( def, new_word.codes_count + 1 );

    // Skip that header
    def += words_per_cell;

    // Copy word definition into newly allocated memory
    let ii = 0;
    let w : WordDefinition;
    while( ii < new_word.codes_count ){
      w = new_word.codes[ ii ];
      raw_set_cell( def + ii * words_per_cell, w.type, w.name, w.value );
      ii++;
    }

    // Add code to return from word, aka "return" special code
    set_return_cell( def + ii * words_per_cell );

    const word_cell = make_inox_word( get_cell_name( tag_cell ), def );

    // Update the global variable that definition flag setters use
    last_inox_word_defined = get_cell_name( word_cell );

    if( de ){
      const chk_def = get_inox_word_definition_by_label( new_word.name );
      de&&mand_eq( chk_def, def );
      de&&mand_eq( get_cell_value( chk_def + ii * words_per_cell ), 0 );
    }

    leave_level();

    // Change compilation state
    new_word = null;

    eval_de&&bug( "\n" + inox_word_cell_to_text_definition( word_cell ) );

  } // eval_add_new_inox_word()

  eval_end_word_function = eval_end_word;


  function is_compiling() : boolean {
    if( new_word    )return true;
    if( level.codes )return true;
    return false;
  }


  function eval_do_literal( cell ){

    eval_de&&bug( "eval, do_literal &" + cell + "=" + cell_to_text( cell ) );

    if( is_compiling() && ! immediate_mode ){
      level.codes[ level.codes_count++ ] = {
        type:  get_cell_type( cell ),
        name:  get_cell_name( cell ),
        value: get_cell_value( cell )
      };

    }else{
      copy_cell( cell, that.push() );
      stack_de && dump_stacks( that.dsp(), that.csp() );
    }

  };

  eval_do_literal_function = eval_do_literal;


  function add_code( code_id ){
  // Add a word to the beeing built block or new word

    de&&mand( is_compiling() );

    // If code is not a word id due to inlining, add it as it is
    // This occurs after inox-quote typically
    // if( ( code_id >>> 14 ) != 0 ){
    //  level.codes[ level.codes_count++ ] = code_id;
    //  return;
    // }

    // Inline code definition if it is very short or if word requires it
    const definition = get_inox_word_definition_by_id( code_id );
    const length = get_definition_length( definition ) - 1; // skip "return"
    if( length <= 2 || is_inlined_inox_word( code_id ) ){
      let ii : InoxIndex = 0;
      while( ii < length ){
        level.codes[ level.codes_count++ ] = {
          type:  get_cell_type(  definition + ii * words_per_cell ),
          name:  get_cell_name(  definition + ii * words_per_cell ),
          value: get_cell_value( definition + ii * words_per_cell )
        };
        ii++;
      }
    }else{
      level.codes[ level.codes_count++ ] = {
        type:  type_word_id,
        name:  code_id,
        value: 0
      }
    }

    // Remember last code added
    set_cell_value( last_token_cell, word_id );

  }


  function eval_do_code( code_id : InoxName ){

    eval_de&&bug(
      "eval, do_code " + code_id + " " + inox_word_id_to_text( code_id )
    );

    // Run now or add to definition of a new word?
    if( ! is_compiling()
    || is_immediate_inox_word( code_id )
    || immediate_mode
    ){
      // Remember in control stack what word is beeing entered
      set_cell_info( that.csp(), pack( type_integer_id, code_id ) );
      that.set_ip( get_inox_word_definition_by_id( code_id ) );
      // bug( inox_word_to_text_definition( code_id ) );
      de&&mand( that.dsp() <= current_task.stack );
      // ToDo: should reverse control and never use .run(), ie be stack less
      if( de && that.ip() == 0 ){
        bug( "Eval, do_code invalid " + code_id );
        debugger;
      }else{
        that.run();
      }
      de&&mand( that.dsp() <= current_task.stack );
      if( de ){
        stack_de && dump_stacks( that.dsp(), that.csp() );
        if( that.csp() != old_csp ){
          bug( "??? eval, do_code, CSP changed by "
          + inox_word_id_to_text( code_id ) );
          debugger;
          that.set_csp( old_csp );
        }
        let ip = that.ip();
        if( ip && ip != old_ip ){
          bug( "??? eval, do_code, IP changed by "
          + inox_word_id_to_text( code_id ) );
          debugger;
          that.set_ip( old_ip );
        }
      }

    // When adding to the definition of a new word
    }else{
      add_code( code_id );
    }

  };

  eval_do_code_function = eval_do_code;


  let must_not_compile_next_word = false;

  eval_tokenize_next_word_function = function eval_tokenize_next_word(){
    must_not_compile_next_word = true;
  };


  function eval_begin_block(){
    enter_level( "{" );
    // ToDo: value could be a qualifier about the block
    eval_do_code( get_inox_word_id_by_name( "inox-block" ) );
    level.block_start = level.codes_count;
    // Reserve one word for block's length, like for word definitions
    level.codes[ level.codes_count++ ] = {
      type:  type_integer_id,
      name:  tag( "block-info" ),
      value: 0
    };
  }

  eval_begin_block_function = eval_begin_block;


  function eval_end_block(){
    // Add a "return" at the end of the block
    level.codes[ level.codes_count++ ] = {
      type:  type_void_id,
      name:  tag( "inox-return" ),
      value: 0
    };
    // const block_length = level.codes_count - level.block_start;
    // Set argument for inox-block, make it look like a valid litteral
    // level.codes[ level.block_start ]
    // = 0x80000000 | 0x20000000 | ( block_length - 1 );
    // -1 not to add the length word
    leave_level();
  }

  eval_end_block_function = eval_end_block;

  // Word to start a new word definition
  let define : text = "to";
  // That's for the Inox dialect, Forth uses shorter :

  function operand1(value: text) {
    // remove first character, ex .a becomes a
    if (value.length <= 1) return value;
    return value.substring(1);
  }

  function operand2(value: text) {
    // remove firts two characters
    if (value.length <= 2) return value;
    return value.substring(2);
  }

  function operand3(value: text) {
    // remove first and last characters
    if (value.length <= 2) return value;
    return value.substring(1, value.length - 1);
  }

  function operand4(value: text) {
    // remove last character
    if (value.length <= 2) return value;
    return value.substring(0, value.length - 1);
  }

  // Eval loop, until error or eof
  // ToDo: stackless eval loop
  while( true ){

    de&&mand( that.dsp() <= current_task.stack );

    token = get_next_token();

    type  = token.type;
    value = token.value;

    // eval_de&&bug( "eval, token " + type + "/" + value );

    // Skip comments
    if( type == "comment" || type == "comment_multiline" ) {
      // ToDo: word for definitions should be normal words
     continue;
    }

    // Exit loop on error
    if( type == "error" ){
      bug( "Eval, syntax error " + value + " at line " + token.line );
      break;
    }

    // Exit loop at end of input stream
    if( type == "eof" ){
      // ToDo: signal premature end of file
      break;
    }

    // If start of a new Inox word definition
    if( tokenizer.style == "forth" ){
      define = ":";
    }else if( tokenizer.style == "inox" ){
      define = "to";
    }

    // Detected only at the base level
    if( level.type == "base"
    &&  value == define
    && ( type == "word" || type == define )
    ){
      // ToDo: make that a primitive
      // ToDo: enable nested definitions?
      eval_begin_word();
      continue;
    }

    // If name for the new Inox word
    if( new_word && new_word.name == "" ){
      // ToDo: make that a primitive
      new_word.name = value;
      eval_de&&bug( "eval, new word is " + value );
      // Update global for primitive_inox_immediate & co
      set_cell_name(  last_token_cell, get_cell_name( tag( value ) ) );
      set_cell_value( last_token_cell, get_cell_name( last_token_cell ) );
      continue;
    }

    // If ; or ) or } terminator, first close all postponed infix operators
    if( level.type == "infix"
    && ( type == "word" )
    && ( value == ";" || value == ")" || value == "}" )
    ){
      leave_level();
    }

    // A common error is to forget some ; ) or }
    if( new_word && value == define && type == "word" ){
      bug( "Eval, nesting error, unexpected " + value
      + " at line " + token.line
      + " while expecting the end of " + level.type
      + " at line " + level.line
      );
      debugger;
      break;
    }

    // If something to execute, as a defined word or as a text literal

    // If text literal
    if( type == "text" ){
      eval_do_literal( make_text_cell( value ) );
      continue;
    }

    // If decreased Indentation
    if( type == ";" ){
      // Simulate a .
      type = "word";
      value = tokenizer.end_define;
    }

    // If word
    if( type != "word" ){
      bug( "Eval, invalid type of token " + type
        + " with value " + value
        + " at line " + token.line
      );
      debugger;
      break;
    }

    if( must_not_compile_next_word ){
      de&&bug( "eval, must not compile, " + value );
      must_not_compile_next_word = false;
      // ToDo: should store text?
      copy_cell( make_tag_cell( value ), this.push() );
      continue;
    }

    word_id = get_inox_word_id_by_name( value );

    // If operator, transform order to get to RPN, Reverse Polish Notation
    if( word_id != 0 && is_operator_inox_word( word_id ) ){

      // If after another operator, left association
      // ToDo: configurable associativity
      if( level.type == "infix" ){
        leave_level();
      }

      // Otherwise processing occurs later at ; or start of keyword
      enter_level( "infix" );
      level.word = word_id;
      continue;

    }

    // function calls, keyword method calls and sub expressions
    if( level.depth > 0 && word_id != 0 && level.word == 0 ){

      // If building a function call and expecting the function name
      if( level.type == "x(" &&  level.name == "" ){
        level.name = value;
        level.word = word_id;
        continue;
      }

      // If building a keyword method call
      if( level.type == ":" && value.slice( -1 ) == ":" ){
        level.name += value;
        eval_de&&bug( "eval, collecting keywords:" + level.name );
        continue;
      }

    }

    // If known word, run it or add it to the new word beeing built
    if( word_id && ! is_operator_inox_word( word_id ) ){
      // This does not apply to operators
      eval_do_code( word_id );
      continue;
    }

    // If end of definition of the new Inox word reached
    if( new_word
    && type == "word"
    && value == tokenizer.end_define
    && level.type == "new word"
    ){
      eval_end_word();
      continue;
    }

    // ToDo: in Forth style, unknown word should generate an error
    if( tokenizer.style != "inox" && word_id == 0 ){
      eval_do_literal( make_tag_cell( value ) );
      continue;
    }

    let first_ch
    = value.length > 0 ? value[ 0 ]                : "";
    let second_ch
    = value.length > 1 ? value[ 1 ]                : "";
    let last_ch
    = value.length > 1 ? value[ value.length - 1 ] : "";

    // If xxx: it's a keyword call
    if( last_ch == ":" ){

      // first close all previous nested infix operators
      if( level.type == "infix" ){
        leave_level();
      }

      // If already collecting keywords of call, add new keyword item
      if( level.type == ":" ){
        level.name += value;

      // If first element of a xxx: aaa yyy: bbb keyword call
      }else{
        enter_level( ":" );
        level.name = value;
      }

      continue;
    }

    // xxx( type of call or ( xxx yyy ) sub expression
    if( last_ch == "(" ){

      // if ( expr )
      if( value == "(" ){
        enter_level( "(" );

      // if xxx() or .xxx() calls
      }else{

        enter_level( "x(" );

        // Detect method calls .xx( or normal calls xx(
        let operand : text = first_ch  == "."
        ? operand3( value )
        : operand4( value );

        word_id = get_inox_word_id_by_name( operand );

        // If xxx is a defined word then it has to be called last
        if( word_id != 0 ){
          level.name = operand;
          level.word = word_id;

        // If word is not defined, use it as a tag literal
        }else{
          // ToDo: if # prefixed word, use it as a tag?
          eval_do_literal( make_tag_cell( operand4( value ) ) );
        }

      }

    // If start of a block inside a new word definition
    }else if( value == "{" && is_compiling() ){
      eval_begin_block();

    // If start of a block but not within a definition
    }else if( value == "{" ){
      // ToDo: handle this case, avoiding memory leak
      bug( "Cannot compile block, not in a definition, at line "
      + token.line );
      debugger;

    }else if( value == "}" ){

      if( level.type == "{" ){
        eval_end_block();

      // Premature/unexpected }
      }else{
        bug( "Eval, nesting warning, unexpected } "
        + " at line " + token.line
        + " while expecting the end of " + level.type );
      }

    // End of function call or sub expression
    }else if( first_ch == ")"
    && ( level.type == "(" || level.type == "x(" )
    ){

      // If word(), process word
      if( level.word != 0 && value == ")" ){
        eval_do_code( level.word );

      // If word( expr )abc, process word & name result
      }else if( level.word != 0 && value != ")" ){
        eval_do_code( level.word );
        eval_do_literal( make_tag_cell( operand1( value ) ) );
        eval_do_code( get_inox_word_id_by_name( "inox-rename" ) );

      // If ( expr )abc, process word & name result
      }else if( level.word == 0 && value != ")" ){
        eval_do_literal( make_tag_cell( operand1( value ) ) );
        eval_do_code( get_inox_word_id_by_name( "inox-rename" ) );

      // if abc( expr ), word-missing,
      }else if( level.name != "" && value == ")" ){
        // Detect method calls
        if( level.name[ 0 ] == "." ){
          eval_do_literal( make_tag_cell( operand1( level.name ) ) );
          eval_do_code( get_inox_word_id_by_name( "method-missing" ) );
        }else{
          eval_do_literal( make_tag_cell( level.name ) );
          eval_do_code( get_inox_word_id_by_name( "word-missing" ) );
        }

      // if abc( expr )efg, ToDo: word-missing
      }else if( level.name != "" && value != ")" ){
        // Detect method calls
        if( second_ch == "." ){
          eval_do_literal( make_tag_cell( operand4( level.name ) ) );
          eval_do_code( get_inox_word_id_by_name( "method-missing" ) );
        }else{
          eval_do_literal( make_tag_cell( level.name ) );
          eval_do_code( get_inox_word_id_by_name( "word-missing" ) );
        }
        eval_do_literal( make_tag_cell( operand1( value ) ) );
        eval_do_code( get_inox_word_id_by_name( "inox-rename" ) );
      }

      leave_level();

    // ; (or .) marks the end of the keyword method call, if any
    }else if( ( value == ";" || value == tokenizer.end_define )
    && level.type == ":"
    ){

      while( level.type == ":" ){

        word_id = get_inox_word_id_by_name( level.name );

        // If word does not exist, use method-missing instead
        if( word_id == 0 ){
          // Tell method_missing about the number of arguments?
          // set_cell_value( the_integer_work_cell, level.length );
          set_cell_value( the_tag_work_cell, tag( level.name ) );
          eval_do_literal( the_tag_work_cell );
          // ToDo: Add call to method_missing
          eval_do_code( get_inox_word_id_by_name( "method-missing" ) );
          // Method missing will add the class of the target to find the desired
          // method or will call a class specific method_missing found in the
          // class hierarchy
          // This implements a dynamic dispatch

        }else{
          eval_do_code( word_id );
        }

        leave_level();

        // Close all calls if terminating ., not when ;
        if( value == ";" )break;

      }

    // If #xxxx, it's a tag
    }else if( first_ch == "#" ){
      eval_do_literal( make_tag_cell( operand1( value ) ) );

    // If |xxxx|, it's a create in the control stack
    }else if( first_ch == "|" && last_ch == "|" ){
      eval_do_literal( make_tag_cell( operand4( value ) ) );
      eval_do_code( tag( "inox-local-create" ) );

    // If @|xxxx, it's a lookup in the control stack
    }else if( first_ch == "@" && second_ch == "|" ){
      eval_do_literal( make_tag_cell( operand2( value ) ) );
      eval_do_code( tag( "inox-local-at" ) );

      // If |xxxx!, it's a lookup in the control stack with store
    }else if( first_ch == "|" && last_ch == "!" ){
      eval_do_literal( make_tag_cell( operand3( value ) ) );
      eval_do_code( tag( "inox-local-set" ) );

    // If |xxxx, it's a lookup in the control stack with fetch
    }else if( first_ch  == "|" ){
      eval_do_literal( make_tag_cell( operand1( value ) ) );
      eval_do_code( tag( "inox-local-get" ) );

    // If @.xxxx, it's a lookup in a value
    }else if( first_ch == "@" && second_ch == "." ){
      eval_do_literal( make_tag_cell( operand2( value ) ) );
      eval_do_code( tag( "inox-value-at" ) );

      // If .:xxxx, it's a method call
    }else if( first_ch == "." && second_ch == ":" ){
      eval_do_literal( make_tag_cell( operand2( value ) ) );
      eval_do_code( tag( "inox-call-method-by-name" ) );

    // If .xxxx!, it's a lookup in a value with store
    }else if( first_ch == "." && last_ch == "!" ){
      eval_do_literal( make_tag_cell( operand3( value ) ) );
      eval_do_code( tag( "inox-array-set" ) );

    // If .xxxx, it's a lookup in an array value with fetch
    }else if( first_ch  == "." ){
      eval_do_literal( make_tag_cell( operand1( value ) ) );
      eval_do_code( tag( "inox-array-get" ) );

    // If @*xxxx, it's a lookup in a value, thru a pointer
    }else if( first_ch == "@" && second_ch == "*" ){
      eval_do_literal( make_tag_cell( operand2( value ) ) );
      eval_do_code( tag( "inox-pointer-at" ) );

    // If *xxxx!, it's a lookup in a value with store, thru a pointer
    }else if( first_ch == "*" && last_ch == "!" ){
      eval_do_literal( make_tag_cell( operand3( value ) ) );
      eval_do_code( tag( "inox-pointer-set" ) );

    // If *xxxx, it's a lookup in a value with fetch, thru a pointer
    }else if( first_ch  == "*" ){
      eval_do_literal( make_tag_cell( operand1( value ) ) );
      eval_do_code( tag( "inox-pointer-get" ) );

    // If @_xxxx, it's a lookup in the data stack
    }else if( first_ch == "@"&& second_ch == "_" ){
      eval_do_literal( make_tag_cell( operand2( value ) ) );
      eval_do_code( tag( "inox-stack-at" ) );

    // If _xxxx!, it's a lookup in the data stack with store
    }else if( first_ch == "_" && last_ch == "!" ){
      eval_do_literal( make_tag_cell( operand3( value ) ) );
      eval_do_code( tag( "inox-stack-set" ) );

    // If _xxxx, it's a lookup in the data stack with fetch
    }else if( first_ch == "_" ){
      eval_do_literal( make_tag_cell( operand1( value ) ) );
      eval_do_code( tag( "inox-stack-get" ) );

    // If :xxxx, it's a naming operation, explicit, Forth style compatible
    }else if( first_ch == ":" ){
      // ToDo: optimize the frequent literal #tag inox-rename sequences
      eval_do_literal( make_tag_cell( operand1( value ) ) );
      eval_do_code( tag( "inox-rename" ) );

    // ( start of subexpression
    }else if( value == "(" ){
        enter_level( "(" );

    // if xxx(
    }else if( last_ch == "(" ){

      enter_level( "x(" );

      // If early binding function call, xxx( ... )
      if( first_ch != "." ){
        word_id = get_inox_word_id_by_name( operand3( value ) );
        // If xxx is a defined word then it has to be called last
        if( word_id != 0 ){
          level.name = value;
          level.word = word_id;

        // If word is not defined, use it as a tag literal
        }else{
          // ToDo: if # prefixed word, use it as a tag?
          eval_do_literal( make_tag_cell( value ) );
        }

      // If .xxx late binding method call, .xxx( ... target )
      }else{
        word_id = get_inox_word_id_by_name( operand4( value ) );
      }

    // Else, this is a literal, either a number or a symbol
    }else{
      if( first_ch == "-" && is_integer( value.substring( 1 ) ) ){
        eval_do_literal( make_integer_cell( - text_to_integer( value) ) );
      }else if( is_integer( value ) ){
        eval_do_literal( make_integer_cell(   text_to_integer( value) ) );
      }else{
        eval_do_literal( make_tag_cell( value ) );
      }
    }
  }

  // Free closures
  eval_do_literal_function         = null;
  eval_do_code_function            = null;
  eval_tokenize_next_word_function = null;
  eval_begin_block_function        = null;
  eval_end_block_function          = null;
  eval_begin_word_function         = null;
  eval_end_word_function           = null;

  de && chk();

} );  // primitive inox-eval


/* ----------------------------------------------------------------------------
 *  Some bootstrap stuff
 */

// Setup Forth dialect first

define_alias( "forth", "LITERAL",   "inox-literal"       );
define_alias( "forth", "IMMEDIATE", "inox-immediate"     );
define_alias( "forth", "SWAP",      "swap"               );
define_alias( "forth", "DROP",      "drop"               );
define_alias( "forth", "DUP",       "dup"                );
define_alias( "forth", "OVER",      "over"               );
define_alias( "forth", "PICK",      "pick"               );
define_alias( "forth", "DUP",       "dup"                );
define_alias( "forth", "ROT",       "rotate"             );
define_alias( "forth", ">R",        "inox-to-control"    );
define_alias( "forth", "R>",        "inox-from-control"  );
define_alias( "forth", "@R",        "inox-fetch-control" );


primitive( "CR", function primitive_CR(){
  // ToDo: output to stdout when running on POSIX systems
  console.log( "OUTPUT CR" );
} );


function primitive_trace(){
  // ToDo: output to stdout when running on POSIX systems
  console.log( "OUTPUT " + cell_to_text( this.dsp() ) );
}
primitive( "inox-trace", primitive_trace );


primitive( "out", function primitive_out(){
  primitive_trace.call( this );
  this.pop();
} );


primitive( "inox-trace-stacks", function primitive_inox_trace_stacks(){
  dump_stacks( this.dsp(), this.csp() );
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

: ." " inox-input-until LITERAL inox-quote . inox-code ; IMMEDIATE

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
  process:   process,
  // ToDo: to_genotype(), from_genotype(), to build & use precompiled species
};

} // inox()


/* --------------------------------------------------------------------------
 *  Smoke test
 */

const I = inox();

I.primitive( "inox-debugger", function primitive_debugger(){
  debugger;
} );

I.evaluate( "/**/ to debugger inox-debugger." );

const smoke = require( "fs" ).readFileSync( "test/smoke.nox", 'utf8');

I.process( "{}", "{}", smoke );


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

exports.inox = inox;
//# sourceMappingURL=inox.js.map
