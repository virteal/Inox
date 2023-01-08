/*  inox.js
 *    Inox is an object oriented concatenative script language.
 *
 *  june  3 2021 by jhr
 *  june  7 2021 by jhr, move from .js to .ts, ie Typescript, AssemblyScript
 *  june 10 2021 by jhr, .nox file extension
 *  june 27 2021 by jhr, forth hello world is ok, use literate comment in Inox
 *  july 17 2021 by jhr, turing complete
 *  july 28 2021 by jhr, use 64 bits instructions, code and data unification
 *  october 10 2021 by jhr, source code cleanup
 *  december 7 2022 by jhr, class, object, malloc/free, refcount gc
 *  decembre 26 2022 by jhr, reactive dataflows and reactive sets from Toubkal
 */

// import { assert } from "console";
// import { assert } from 'node:assert';
const assert = require( "assert" );

function inox(){

/*
 * Starts running an Inox machine, returns a json encoded new state.
 * ToDo: return diff instead of new state.
 * The source parameter is a string, maybe the content of a .nox text file.
 *
 * This is the reference implementation. It defines the syntax and semantic
 * of the language. Production quality version of the virtual machine would
 * have to be hard coded in some machine code to be efficient I guess.
 *
 */


/* -----------------------------------------------------------------------------
 *  Let's go.
 *   some debug tools first.
 */

// my de&&bug darling, de flag could be a variable
const de : boolean  = true;   // true if debug mode
const nde = false;            // not debug. Sugar to comment out a de&&bug

// Traces can be enabled "by domain", ie "by category"
const mem_de   : boolean = de && true;  // Check for very low level load/store
const alloc_de : boolean = de && true;  // Heap allocations integrity check
const check_de : boolean = de && true;  // Enable runtime error checking, slow
let   token_de : boolean = de && false; // Trace tokenization
let   parse_de : boolean = de && false; // Trace parsing
let   eval_de  : boolean = de && true;  // Trace evaluation by text interpretor
let   run_de   : boolean = de && true;  // Trace execution by word runner
let   stack_de : boolean = de && true;  // Trace stacks
let   step_de  : boolean = de && false; // Invoke debugger before each step

// Global flag to filter out all console.log until one needs them.
// See inox-log primitive to enable/disable traces.
var can_log = false;
var bug = !can_log ? debug : console.log;


function debug( msg: string ){
// de&&bug( a_message ) to log a message using console.log()
  if( !can_log ){
    // Don't get called as long as global flag can_log, see primitive inox-log.
    bug = console.log;
    return;
  }
  // AssemblyScript supports a simpler version of console.log()
  assert( typeof msg == "string" );
  console.log( msg );
}


function mand( condition : boolean ) : boolean {
// de&&mand( a_condition ), aka asserts; return true if assertion fails
  // ToDo: should raise an exception?
  if( condition )return false;
  debugger;
  assert( false );
  return true;
};


function mand_eq( a : any, b : any ) : boolean {
// Check that two numbers are equal, return true if that's not the case
  if( a == b )return false;
  debugger;
  assert( false, "bad eq " + a + " / " + b );
  return true;
}


function mand_neq( a : any, b : any ) : boolean {
  // Check that two numbers are equal, return true if that's not the case
  if( a != b )return false;
  debugger;
  assert( false, "bad neq " + a + " / " + b );
  return true;
}


assert(   de );  // Not ready for production, please wait :)
de&&mand( de );  // Like assert but that can be disabled for speed

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
type float = number;  // assumed to be larger then isize

// ToDo: should do that when?
// require( "assemblyscript/std/portable" );

// } // PORTABLE


/* -----------------------------------------------------------------------------
 *  Types and constants related to types
 */

type InoxAddress     = u32;  // Address in VM memory, aka a raw pointer
type InoxWord        = u32;  // Smallest entities at an InoxAddress in VM memory
type InoxIndex       = u32;  // Index in rather small arrays usually
type InoxBoolean     = u32;  // 0 is false, 1 or anything else is true
type InoxSize        = u32;  // Size in bytes
type InoxLength      = u32;  // Size in number of contained items, often cells
type InoxOid         = u32;  // proxy objects have a unique id
type InoxCell        = u32;  // Pointer to a cell's value, typed and named
type InoxValue       = u32;  // Payload. ToDo: should be an int32
type InoxInfo        = u32;  // Type & name info parts of a cell's value
type InoxType        = u8;   // Packed with name, 3 bits, at most 8 types
type InoxName        = u32;  // 29 bits actually, type + info is 32 bits
type InoxTag         = u32;  // The id of a tag
type InoxText        = text;

const InoxTrue  : InoxBoolean = 1;
const InoxFalse : InoxBoolean = 0;

// Memory is made of words that contains cells. Cells are made of a value and
// information, info. Info is type and name of value. See pack().
const size_of_word    = 4;   // 4 bytes, 32 bits
const size_of_value   = 4;   // 4 bytes, 32 bits
const size_of_info    = 4;   // type & name, packed
const size_of_cell    = size_of_value + size_of_info;
const words_per_cell  = size_of_cell  / size_of_word;

// Other layouts could work. 2 bytes word, 4 bytes value, 2 bytes info.
// This would make 6 bytes long cells instead of 8. ok for a 32 bits cpu.
// 4 bytes cells using 2 bytes word, 2 bytes value & 2 bytes info.
// This would mean short integers and names, ok for an ESP32 style cpu.

// In memory, the value is stored first, then the type & name info, packed
const offset_of_cell_info = size_of_value / size_of_word;  // 1

const stack_cell = -words_per_cell; // add it to push, substract it to pop

// Shorthand for string, 4 vs 6 letters.
type text = string;


/* ---------------------------------------------------------------------------
 *  Low level memory management.
 *  The Inox virtual machine uses an array of 32 bits words to store both
 *  the content of "cells" (2 words) and arrays of "code tokens" (2 words). A
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
// It's an array of 32 bits words indexed using 29 bits addresses.
// That's a 31 bits address space, 2 giga bytes, plenty.
// ToDo: study webassembly modules
// See https://webassembly.github.io/spec/core/syntax/modules.html

const INOX_HEAP_SIZE = 1024 * 256; // 256 kb, > 30k cells

const memory8  = new ArrayBuffer( INOX_HEAP_SIZE  ); // 256 kb
const memory32 = new Int32Array( memory8 );


function load32( index : InoxAddress ) : InoxValue {
  // ToDo: ? index <<= 1;
  let value : InoxValue = memory32[ index ] |0;
  // |0 is a pre webassembly trick to coerce value to a 32 bits integer
  // de&&bug( "Load 32 @" + index + " " + value );
  return value |0;
}


function store32( index : InoxAddress, value : InoxValue ) : void {
  // ToDo: ? index <<= 1;
  if( value == 2416 )debugger;
  memory32[ index ] = value |0;
  // de&&bug( "store 32 @ " + index + " " + value );
  mem_de&&mand_eq( load32( index ), value );
}


function load32info( index : InoxAddress ) : InoxValue {
  return load32( index + 1 );
}


function store32info( index : InoxAddress, value : InoxValue ) : void {
  store32( index + 1, value );
}


function set_cell_value( cell : InoxCell, value : InoxValue ) : void {
// eqv cell.value = value
  store32( cell, value );
}


function get_cell_value( cell : InoxCell ) : InoxValue {
// eqv cell.value if memory cells were an array of {value:int,info:int}
  return load32( cell );
}


// @inline
function set_cell_info( cell : InoxCell, info : InoxInfo ) : void {
// eqv cell.info = info
  store32info( cell, info );
}


// @inline
function get_cell_info( cell : InoxCell ) : InoxInfo {
// eqv cell.info, returns a 32 bits number
  return load32info( cell );
}


// }  // PORTABLE


/* -----------------------------------------------------------------------------
 *  Not portable version is AssemblyScript syntax
 *  ToDo: figure out what @inline means exactly
 *  ToDo: figure out some solution to avoid the right shift when
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

*/}  // ! PORTABLE?


// 0 means different things depending on the context, it is "void",
// "false", "return" instruction code, null object, etc.
const _ = 0;  // undefined;


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
  *  cell's value depends on type, often an integer or the address of a cell.
  *
  *  eqv C like struct InoxCell {
  *    value : InoxValue;  // 32 bits word
  *    info  : InoxInfo;   // packed type & name
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
// ToDo: a better C style malloc()/free() combo.

// This last cell would be HERE in Forth
// See https://forth-standard.org/standard/core/HERE
let the_last_cell : InoxAddress = the_first_cell;


/* ---------------------------------------------------------------------------
 * Arrays of cells.
 *  Dynamic memory allocation of cells in the heap.
 *  Bytes areas are allocated and freed using a reference counter.
 */


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
    alloc_de&&mand( size != 0 );
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
    area = get_next_cell( area );
    break;
  }
  // If nothing was found, use flat space further
  if( ! area ){
    // ToDo: check limit, ie out of memory
    area = the_last_cell + words_per_cell;
    // Divide by 4 because memory is 32 bits words, not bytes
    the_last_cell += ( aligned_size / size_of_word ); // - words_per_cell;
    mem_de&&mand_eq( get_cell_value( area ), 0 );
  }
  // Area is locked initialy, once, see lock_bytes()
  set_cell_value( area, 1 );
  // Remember size of area, this does not include the header overhead
  set_cell_info( area, size );
  // Return an address that is after the header, at the start of the payload
  alloc_de&&mand( safe_bytes_header( area ) );
  return area + ( size_of_cell / size_of_word );
}


function get_bytes_size( address : InoxAddress ) : InoxIndex {
// Returns the size initially required when allocate_bytes() was called.
  const header_address = address - ( size_of_cell / size_of_word );
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
    // ToDo: should copy cell if previous area is referenced somewhere?
    alloc_de&&mand( get_bytes_refcount( address ) <= 1 );
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
  if( address == 0 ){
    bug( "??? attempt to free_bytes at adress 0" );
    debugger;
    return;
  }
  const header_address = address - ( size_of_cell / size_of_word );
  alloc_de&&mand( safe_bytes_header( header_address ) );
  const old_count = get_cell_value( header_address );
  // Free now if not locked
  if( old_count == 0 ){
    // ToDo: add area to some free list
    if( alloc_de ){
      // ToDo: use info instead of value to avoid breaking the nil_cell?
      set_cell_value( header_address, 2147483647 );  // i32.MAX_VALUE
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
  set_cell_value( header_address, new_count );
}


function lock_bytes( address : InoxAddress ) : void {
// Increment reference counter of bytes area allocated using allocate_bytes().
// When free_bytes() is called, that counter is decremented and the area
// is actually freed only when it reaches zero.
  if( address == 0 ){
    bug( "??? Attempt to lock adress 0" );
    debugger;
    return;
  }
  const header_address = address - ( size_of_cell / size_of_word );
  alloc_de&&mand( safe_bytes_header( header_address ) );
  const old_count = get_cell_value( header_address );
  // Increment reference counter
  const new_count = old_count + 1;
  set_cell_value( header_address, new_count );
}


function is_last_reference_to_bytes( address : InoxAddress ) : boolean {
// When the last reference disappears the bytes must be freed.
// To be called by clear_cell() only, on non zero adresses.
  const header_address = address - ( size_of_cell / size_of_word );
  alloc_de&&mand( safe_bytes_header( header_address ) );
  return get_cell_value( header_address ) == 1;
}


function get_bytes_refcount( address : InoxAddress ) : InoxIndex {
  const header_address = address - ( size_of_cell / size_of_word );
  alloc_de&&mand( safe_bytes_header( header_address ) );
  return get_cell_value( header_address );
}


function safe_bytes_header( address : InoxAddress ) : boolean {
// Try to determine if the address points to a valid area allocated
// using allocates_bytes() and not already released.
  // This helps to debug unbalanced calls to lock_bytes() and free_bytes().
  const reference_counter : InoxAddress = get_cell_value( address );
  const size = get_cell_info( address );
  // zero is bad for both reference counter & size
  if( reference_counter == 0 ){
    bug( "Invalid reference counter " + reference_counter
    + " for bytes at address " + address );
    return false;
  }
  if( size == 0 ){
    bug( "Invalid 0 size for bytes at address " + address );
    return false;
  }
  // When one of the 3 most significant bits is set, that a type id probably
  if( reference_counter >= ( 1 << 29 ) ){
    const type = unpack_type( reference_counter );
    bug( "Invalid counter for address " + address
    + ", type " + type + "?" );
    return false;
  }
  if( size >= ( 1 << 29 ) ){
    const type = unpack_type( reference_counter );
    bug( "Invalid size for address " + address
    + ", type " + type + "?" );
    return false;
  }
  return true;
}


function safe_bytes( address : InoxAddress ) : boolean {
  const header_address = address - ( size_of_cell / size_of_word );
  return safe_bytes_header( header_address );
}


function increment_object_refcount( cell : InoxCell ){
  lock_bytes( cell );
}


function decrement_object_refcount( cell : InoxCell ){
  free_bytes( cell );
}


/* ---------------------------------------------------------------------------
 *  Scalar cells.
 *    For integer cells and list item cells.
 */


function allocate_cell() : InoxCell {
  // Each cell is made of 2 32 bits words, 64 bits total
  the_last_cell += words_per_cell;
  return the_last_cell;
}


function allocate_cells( how_many : InoxIndex ) : InoxCell {
  // Each cell is made of 2 32 bits words, 64 bits total
  const cell = the_last_cell + words_per_cell;
  the_last_cell += how_many * words_per_cell;
  return cell;
}


// This is initialy the sentinel tail of the list of reallocatable cells
let nil_cell : InoxCell = 0 // it will soon be the void/void/void cell

// Linked list of free cells
var the_first_free_cell : InoxCell = nil_cell;


function fast_allocate_cell() : InoxCell {
// Allocate a new cell or reuse an free one
  if( the_first_free_cell == nil_cell )return allocate_cell();
  let cell = the_first_free_cell;
  let next_cell = get_next_cell( the_first_free_cell );
  the_first_free_cell = next_cell;
  return cell;
}


function free_cell( cell : InoxCell ) : void {
// free a cell, add it to the free list
  // ToDo: check that cell is empty?
  // Special case when free is about the last allocated cell.
  if( cell == the_last_cell ){
    the_last_cell -= words_per_cell;
    return;
  }
  // Else, add cell to the linked list of free cells
  de&&mand_eq( get_cell_type( cell ), type_void_id );
  set_next_cell( cell, the_first_free_cell );
  the_first_free_cell = cell;
}


// ToDo: free_cells( cell, how_many )


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


function raw_make_cell(
// Like make_cell() but doen't increment reference counters
  type  : InoxType,
  name  : InoxName,
  value : InoxValue
) : InoxCell {
// Allocate a new cell or reuse one, then initialize it
  let cell : InoxCell = fast_allocate_cell();
  raw_set_cell( cell, type, name, value );
  return cell;
}


function pack( type : InoxType, name : InoxName ) : InoxInfo {
// Pack type and name together, use 3 most significant bits for type
  const info = name | type << 29;
  if( mem_de ){
    de&&mand_eq( unpack_type( info ), type );
    de&&mand_eq( unpack_name( info ), name );
  }
  return info
}


function unpack_type( info : InoxInfo ) : InoxType {
  return info >>> 29;  // 3 bits
}


function unpack_name( info : InoxInfo ) : InoxName {
  return info << 3 >>> 3;
}


function set_cell_type( cell : InoxCell, type : InoxType ){
  set_cell_info( cell, pack( type, unpack_name( get_cell_info( cell ) ) ) );
}


function raw_set_cell(
  cell  : InoxCell,
  type  : InoxType,
  name  : InoxName,
  value : InoxValue
){
  // Store value first
  set_cell_value( cell, value );
  // Then store type and name packed together
  set_cell_info( cell, pack( type, name ) );
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
  // If the source was a reference, increment the reference counter
  if( is_reference_cell( source ) ){
    // This would not be necessary if there were a classical GB
    // However, I may implement some destructor logic when an object
    // goes out of scope and it sometimes make sense to have that logic
    // excuted immediately instead of later on as would happen with a
    // classical GB. I could also have the best of both world depending
    // on some flag set inside the referenced object.
    // ToDo: make sure copy cell is called when a destructor could be
    // executed without corrupting anything. Alternatively the queue of
    // destructors could be processed by inox-return.
    increment_object_refcount( get_cell_value( source ) );
  }
}


function move_cell( source : InoxCell, destination : InoxCell ) : void {
// Move the content of a cell
  clear_cell( destination );
  set_cell_value( destination, get_cell_value( source ) );
  set_cell_info(  destination, get_cell_info(  source ) );
  if( mem_de ){
    de&&mand_eq( get_cell_type(  destination ), get_cell_type(  source ) );
    de&&mand_eq( get_cell_name(  destination ), get_cell_name(  source ) );
    de&&mand_eq( get_cell_value( destination ), get_cell_value( source ) );
  }
  set_cell_value( source, 0 );
  set_cell_info(  source, 0 );
}


function raw_move_cell( source : InoxCell, destination : InoxCell ) : void {
// Move the content of a cell. Assume no reference.
  set_cell_value( destination, get_cell_value( source ) );
  set_cell_info(  destination, get_cell_info(  source ) );
  if( mem_de ){
    de&&mand_eq( get_cell_type(  destination ), get_cell_type(  source ) );
    de&&mand_eq( get_cell_name(  destination ), get_cell_name(  source ) );
    de&&mand_eq( get_cell_value( destination ), get_cell_value( source ) );
  }
  set_cell_value( source, 0 );
  set_cell_info( source, 0 );
}


function clear_cell_value( cell : InoxCell ) : void {
// Turn cell into void cell, handle object reference counters
  if( is_reference_cell( cell ) ){
    const reference = get_cell_value( cell );
    if( is_last_reference_to_bytes( reference ) ){
      if( is_pointer_cell( reference ) ){
        // Clear all attributes
        // ToDo: avoid recursion?
        const length = get_object_length( reference );
        let ii : InoxIndex = 0;
        while( ii < length ){
          if( de ){
            clear_cell_value( reference + ii * size_of_cell );
          }else{
            clear_cell( reference + ii * size_of_cell );
          }

        }
      }else{
        // ToDo: handle array/map/lists
        free_proxy( reference );
      }
      free_bytes( reference );
    }else{
      decrement_object_refcount( reference );
    }
  }
  set_cell_value( cell, 0 );
}


function clear_cell( cell : InoxCell ) : void {
// Clear both value and info of cell, handle references
  clear_cell_value( cell );
  set_cell_info( cell, 0 );
}


function raw_clear_cell( cell : InoxCell ) : void {
// Like clear_cell() when target can safely be overwritten
  set_cell_value( cell, 0 );
  set_cell_info( cell, 0 );
}


function get_object_length( cell : InoxCell ) : InoxIndex {
// Get the number of cells of the object
  // This does not include the header used for memory management
  const length = get_bytes_size( cell ) / size_of_cell;
  return length;
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

// the dictionary of tag ids <-> tag cells
const all_tag_cells_by_text_name = new Map< text, InoxCell >();
const all_tag_cells_by_id        = new Array< InoxCell >();
const all_tag_text_names_by_id   = new Array< text >()

let next_tag_id : u32 = 0;
// The first tag, void, will be id 0


function make_tag_cell( text_name : text ) : InoxCell {

  de&&mand( text_name != "" );
  if( text_name == "" )return tag_void_cell;

  if( all_tag_cells_by_text_name.has( text_name ) ){
    return all_tag_cells_by_text_name.get( text_name );
  }

  // ToDo: use the cell address for the id?
  let id = next_tag_id++;
  let cell = raw_make_cell( type_tag_id, id, id );

  // Update tag dictionary
  all_tag_cells_by_text_name.set( text_name, cell );
  all_tag_cells_by_id[ id ] = cell;
  all_tag_text_names_by_id[ id ] = text_name;

  if( de ){
    de&&mand(    tag_id_to_text(     id   ) == text_name );
    de&&mand_eq( get_tag_cell_by_id( id   ), cell        );
    de&&mand_eq( get_cell_value(     cell ), id          );
    de&&mand_eq( get_cell_name(      cell ), id          );
    de&&mand_eq( get_cell_type(      cell ), 1           );
  }

  return cell;

}


function tag( name : text ) : InoxName {
  const cell = make_tag_cell( name );
  // ToDo: use the cell address for the tag id?
  return get_cell_value( cell );
}


// First cell ever. Tag with id 0 is /void
const the_void_cell = raw_make_cell( 0, 0, 0 );
const tag_void_cell = make_tag_cell( "void" );
const tag_void      = get_cell_name( tag_void_cell );

de&&mand_eq( tag_void, 0x0 );
de&&mand_eq( tag_void, tag( "void" ) );

// Tag with id 1 is /tag
const tag_tag_cell = make_tag_cell( "tag" );
const tag_tag   = get_cell_name( tag_tag_cell );

de&&mand_eq( tag_tag, 0x1 );
de&&mand_eq( tag_tag, tag( "tag" ) );


function tag_id_to_text( id : InoxName ) : text {
  const label = all_tag_text_names_by_id[ id ];
  return label;
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
const tag_integer     = get_cell_name( tag_integer_cell );

de&&mand_eq( type_integer_id, 0x2 );


function make_integer_cell( value ){
  return make_cell( type_integer_id, tag_integer, value );
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
const tag_pointer      = get_cell_name( tag_pointer_cell );


function make_pointer_cell( value ){
  return make_cell( type_pointer_id, tag_pointer, value );
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
const tag_proxy      = get_cell_name( tag_proxy_cell );

de&&mand_eq( type_proxy_id, 0x4 );


function is_reference_type( type : InoxType ){
  return type >= type_proxy_id && type != type_word_id;
}


function is_reference_cell( cell : InoxCell ){
// Only void, integers and words are used by value, other types are by reference
  // if( get_cell_value( cell ) == 0 )return false;
  const type = get_cell_type( cell );
  return is_reference_type( type );
}


// Access to proxied object is opaque, there is an indirection
// Each object has an id which is a cell address. Cells that
// reference proxied object use that cell address as a pointer.

// Indirection table to get access to an object using it's id.
// The id is the address of a dynamically allocated cell that is
// freed when the reference counter reaches zero.
// When that happens, the object is deleted from the map.
let all_proxied_objects_by_id = new Map< InoxCell, any >();


function make_proxy( object : any ){
  const proxy = allocate_bytes( size_of_cell );
  all_proxied_objects_by_id.set( proxy, object );
  de&&mand_eq( get_cell_value( proxy ), 0 );
  de&&mand_eq( get_cell_info(  proxy ), 0 );
  // ToDo: cache an _inox_tag into the constructor to avoid call to tag()
  const class_name = tag( object.constructor.name );
  // Proxy cell points to itself, ease copying. ToDo: unused yet
  set_cell_value( proxy, proxy );
  set_cell_info(  proxy, pack( type_proxy_id, class_name ) );
  // ToDo: use info field to store rtti, runtime type identification?
  alloc_de&&mand( safe_bytes( proxy ) );
  return proxy;
}

function get_proxy_class_name( proxy : InoxCell ){
  return unpack_name( proxy );
}

function make_proxy_cell( object : any ) : InoxCell {
  // ToDo: return object directly, it fits inside a cell's 32 bits value
  const proxy = make_proxy( object );
  alloc_de&&mand( safe_bytes( proxy ) );
  const class_name = get_proxy_class_name( proxy );
  const cell = raw_make_cell( type_proxy_id, class_name, proxy );
  return cell;
}


function free_proxy( proxy : InoxCell ){
  // This is called by clear_cell() when reference counter reaches zero
  alloc_de&&mand( safe_bytes( proxy ) );
  all_proxied_objects_by_id.delete( proxy );
}


function get_proxied_object_by_id( id : InoxCell ) : any {
  alloc_de&&mand( safe_bytes( id ) );
  return all_proxied_objects_by_id.get( id );
}


function get_cell_proxy( cell : InoxCell ) : InoxAddress {
  const proxy = get_cell_value( cell );
  alloc_de&&mand( safe_bytes( proxy ) );
  return proxy;
}


function get_cell_proxied_object( cell : InoxCell ) : any {
  const proxy = get_cell_proxy( cell );
  alloc_de&&mand( safe_bytes( proxy ) );
  return get_proxied_object_by_id( proxy );
}


function proxy_to_text( id : InoxCell ) : text {
  alloc_de&&mand( safe_bytes( id ) );
  // Some special cases produce an empty string.
  if( !id )return "";
  if( !all_proxied_objects_by_id.has( id ) )return "";
  let obj = all_proxied_objects_by_id.get( id );
  return obj.toString();
}


function proxy_cell_to_text_cell( cell : InoxCell ){
  // ToDo: shallow copy if already a text
  // ToDo: check type, should be proxy
  const proxy = get_cell_proxy( cell );
  alloc_de&&mand( safe_bytes( proxy ) );
  const new_proxy = make_proxy( proxy_to_text( proxy ) );
  // Forget previous proxy
  free_proxy( proxy );
  // Keep name but change type
  set_cell_value( cell, new_proxy );
  set_cell_type(  cell, type_text_id );
}


/* -----------------------------------------------------------------------
 *  Text, type 5
 *  Currently implemented using a proxy object, a string.
 */

const type_text_id  = type_proxy_id + 1;
const tag_text_cell = make_tag_cell( "text" );
const tag_text      = get_cell_name( tag_text_cell );

de&&mand_eq( type_text_id, 0x5 );

const the_empty_string_proxy = make_proxy( "" );

const the_empty_text_cell = raw_make_cell(
  type_text_id,
  tag_text,
  the_empty_string_proxy
);

// Patch proxied object map to have "" be at id 0 so that "" is falsy.
all_proxied_objects_by_id.set( 0, the_empty_string_proxy );
set_cell_value( the_empty_text_cell, 0 );


function make_text_cell( value : text ) : InoxCell {
  if( value.length == 0 )return the_empty_text_cell;
  // ToDo: share text object of preexisting tags?
  // ToDo: always return same cell for same text?
  const proxy = make_proxy( value )
  const cell = raw_make_cell(
    type_text_id,
    tag_text,
    proxy
  );
  de&&mand_eq( cell_to_text( cell ), value );
  return cell;
}


/* -----------------------------------------------------------------------
 *  Word, type 6
 *  The name of the Inox word is an integer id, an index in the tag table.
 *  The value is the address where the Inox word is defined is the VM
 *  memory, that definition is built using regular 64 bits cells.
 *  Words are never deallocated, like tags.
 */

const type_word_id  = type_text_id + 1;
const tag_word_cell = make_tag_cell( "word" );
const tag_word      = get_cell_name( tag_word_cell );
de&&mand_eq( type_word_id, 0x6 );


// The dictionary of all Inox words, including class.method words.
let all_inox_word_cells_by_tag      = new Array< InoxCell >();
let all_inox_word_tags_by_text_name = new Map< text, InoxName >()
let all_inox_word_cells_by_hashcode = new Map< InoxValue, InoxCell >();


function make_inox_word(
  word_id : InoxTag,
  def_first_cell : InoxCell
) : InoxCell {
// Define an Inox word. It's name is the name of the cell that's returned.
  // The cell's value is the adress of another cell where the word definition
  // starts. There is a header is the previous cell, for length & flags.
  // The definition is an array of words with primitive ids and
  // word ids, aka a block. See runner() where the definition is interpreted.
  // ToDo: Forth also requires a pointer to the previous definition of
  // the word.

  const word_cell = make_cell( type_word_id, word_id, def_first_cell );
  all_inox_word_cells_by_tag[ word_id ] = word_cell;

  // Detect cccc.mmmmm words
  const fullname = tag_id_to_text( word_id );
  const dot_position = fullname.indexOf( "." );
  if( dot_position > 0 ){
    const class_name  = fullname.slice( 0, dot_position );
    const method_name = fullname.slice( dot_position + 1 );
    if( method_name != "" ){
      const class_tag  = tag( class_name );
      const method_tag = tag( method_name );
      const hashcode = ( class_tag << 13 ) + method_tag;
      all_inox_word_cells_by_hashcode.set( hashcode, word_cell );
    }
  }
  all_inox_word_tags_by_text_name.set( fullname, word_id );
  return word_cell;
}


function get_inox_word_cell_by_tag( id : InoxTag ) : InoxCell {
  // ToDo: use .has()
  return all_inox_word_cells_by_tag[ id ];
}


function inox_word_id_to_text_name( id : InoxTag ): text {
  let word_cell = get_inox_word_cell_by_tag( id );
  let name = get_cell_name( word_cell );
  let str_name : text = tag_id_to_text( get_cell_value( name ) );
  return str_name;
}


function get_inox_word_definition_by_text_name( name : text ) : InoxAddress {
  // ToDo: pointer to previous
  let id   : InoxIndex;
  let cell : InoxCell;
  if( all_inox_word_tags_by_text_name.has( name ) ){
    id   = all_inox_word_tags_by_text_name.get( name );
    cell = all_inox_word_cells_by_tag[ id ];
  }else if( all_primitive_ids_by_text_name.has( name ) ){
    id   = all_primitive_ids_by_text_name.get( name );
    cell = all_primitive_cells_by_id[ id ];
  }else{
    // Not found, return void cell, aka 0
    de&&bug( "Word not found: " + name );
    if( name == "." )debugger;
    return 0;
  }
  return get_cell_value( cell );
}


function get_inox_word_id_by_text_name( name : text ){
  let id : InoxIndex;
  if( all_inox_word_tags_by_text_name.has( name ) ){
    return all_inox_word_tags_by_text_name.get( name );
  }else{
    // Not found, return void cell, aka 0
    eval_de&&bug( "Word not found: " + name );
    // if( eval_de && name == "." )debugger;
    return 0;
  }
}


function get_inox_word_definition_by_tag( id : InoxIndex  ) : InoxAddress {
  let cell : InoxCell = all_inox_word_cells_by_tag[ id ];
  const def = get_cell_value( cell );
  de&&mand( def != 0 )
  return def;
}


function get_definition_length( def : InoxAddress ) : InoxIndex {
  // The header with length & flags is right before the code
  const length = get_cell_value( def - words_per_cell ) & 0xfff;
  if( de ){
    if( length > 100 ){
      bug( "Large definition" );
      debugger;
    }
  }
  return length;
}


/* -----------------------------------------------------------------------------
 *  Flags for Inox words.
 */

const immediate_word_flag = 0x80000;  // When compiling a new word, run vs store
const hidden_word_flag    = 0x40000;  // ToDo: skipped when lookup
const operator_word_flag  = 0x20000;  // Parser knows about left associativity
const stream_word_flag    = 0x10000;  // ToDo: about generator
const inline_word_flag    = 0x08000;  // When compiling inline definition


function set_inox_word_flag( id : InoxWord, flag : InoxValue ){
  const def = get_inox_word_definition_by_tag( id ) - words_per_cell;
  set_cell_value( def, get_cell_value( def ) | flag );
}


function test_inox_word_flag( id : InoxWord, flag : InoxValue ){
  const def = get_inox_word_definition_by_tag( id ) - words_per_cell;
  return ( get_cell_value( def ) & flag ) == flag ? 1 : 0;
}


function set_inox_word_immediate_flag( id : InoxIndex ) : void {
  set_inox_word_flag( id, immediate_word_flag );
}


function is_immediate_inox_word( id : InoxIndex ) : InoxValue {
  return test_inox_word_flag( id, immediate_word_flag );
}


function set_inox_word_hidden_flag( id : InoxIndex ) : void {
  set_inox_word_flag( id, hidden_word_flag );
}


function is_hidden_inox_word( id : InoxIndex ) : InoxValue {
   return test_inox_word_flag( id, hidden_word_flag )
}


function set_inox_word_operator_flag( id : InoxIndex ) : void {
  set_inox_word_flag( id, operator_word_flag );
}


function is_operator_inox_word( id : InoxIndex ) : InoxValue {
  return test_inox_word_flag( id, operator_word_flag );
}


function set_stream_inox_word_stream_flag( id : InoxIndex ) : void {
  // See Icon language goal directed backtrackings
  // https://lib.dr.iastate.edu/cgi/viewcontent.cgi?article=1172&context=cs_techreports
  set_inox_word_flag( id, stream_word_flag );
}


function is_stream_inox_word( id : InoxIndex ) : InoxValue {
  return test_inox_word_flag( id, stream_word_flag );
}


function set_inline_inox_word_flag( id : InoxIndex ) : void {
  set_inox_word_flag( id,  inline_word_flag );
}


function is_inline_inox_word( id : InoxIndex ) : InoxValue {
  return test_inox_word_flag( id, inline_word_flag );
}


/* -----------------------------------------------------------------------
 *  Flow, type 7
 *  Reactive dataflows on reactive data sets from Toubkal.
 *  Currently implemented using a proxy object.
 *  See https://github.com/ReactiveSets/toubkal
 */

const type_flow_id  = type_word_id + 1;
const tag_flow_cell = make_tag_cell( "flow" );
const tag_flow      = get_cell_name( tag_flow_cell );

// a flow is about statefull/stateless, sync/async, greedy...lazy

de&&mand_eq( type_flow_id, 0x7 );


/* -----------------------------------------------------------------------------
 *  type invalid is for debugging mainly.
 */

const type_invalid_id  = type_flow_id + 1;
const tag_invalid_cell = make_tag_cell( "invalid" );
const tag_invalid      = get_cell_name( tag_invalid_cell );
de&&mand_eq( type_invalid_id, 0x8 );


/* -----------------------------------------------------------------------------
 *  Tempory work cells
 */


const the_tag_work_cell = make_tag_cell( "tag" );
set_cell_name( the_tag_work_cell, tag( "work-tag") );

const the_integer_work_cell = make_integer_cell( 0 );
set_cell_name( the_integer_work_cell, tag( "work-integer" ) );

const the_boolean_work_cell = make_integer_cell( 0 );
set_cell_name( the_boolean_work_cell, tag( "work-boolean" ) );

const the_block_work_cell = make_integer_cell( 0 );
set_cell_name( the_block_work_cell, tag( "block" ) );


/* -----------------------------------------------------------------------------
 *  Float, Array, Map, List
 *  Currently implemented as proxy objects
 *  ToDo: implement arrays as dynamically allocated arrays of cells
 *  ToDo: implement maps as dynamically allocated arrays of cells
 *  ToDo: implement lists using name and value of cell?
 */

function make_float( value : float ){
  return make_proxy_cell( value );
}


function make_array( obj? : Object ) : InoxCell {
  let array = obj;
  if( ! obj ){
    array = new Array< InoxCell >();
  }
  return make_proxy_cell( array );
}


function make_map( obj? : Object ){
  let map = obj;
  if( ! obj ){
    map = new Map< InoxOid, InoxCell >();
  }
  return make_proxy_cell( map );
}

function make_list( obj? : Object ) : InoxCell {
  // ToDo: value should a linked list of cells
  let list = obj;;
  if( ! obj ){
    list = new Array< InoxCell >();
  }
  return make_proxy_cell( list );
}


/* --------------------------------------------------------------------------
 *  Actor
 *  ToDo: make it a first class type?
 */


// Global state about currently running actor
let ACTOR : Actor;

// Global registers. They change when ACTOR changes.
let IP  : InoxAddress = 0;
let CSP : InoxAddress = 0;
let DSP : InoxAddress = 0;


class CpuContext {
  ip  : InoxAddress; // Current instruction pointer in code
  dsp : InoxCell;    // Data stack pointer, goes downward
  csp : InoxCell;    // Control stack pointer, goes downward
  constructor( ip  : InoxAddress, dsp : InoxCell, csp : InoxCell ){
    this.ip  = ip;
    this.dsp = dsp;
    this.csp = csp;
  }
}


class Actor {
// Inox machines run cooperative actors

  cell          : InoxCell;   // Proxy cell that references this object
  parent        : InoxCell;   // Parent actor
  act           : InoxCell;   // Current activation record
  memory        : InoxCell;   // Memory pointer, in ram array, goes upward
  stack         : InoxCell;   // Base address of data stack cell array,downward
  control_stack : InoxCell;   // Base address of control stack, goes down too
  ctx           : CpuContext; // ip, dsp & csp

  constructor(
    parent   : InoxCell,
    act      : InoxAddress,
    ip       : InoxAddress,
    ram_size : InoxValue
  ){
    // this.cell is set in make_actor()
    this.cell = 0;
    // Parent actor list, up to root actor
    this.parent = parent;
    // Current activation for the new actor
    this.act    = act;
    // Init memory and cpu context
    this.init( ip, ram_size );
  }

  init( ip : InoxAddress, ram_size : InoxValue ){
    // Round size to the size of a cell
    var size = ( ram_size / size_of_cell ) * size_of_cell;
    // Room for stacks, both data and control
    // ToDo: allocate two distinct areas so that each can grow
    this.memory = allocate_bytes( size );
    // Control stack is at the very end, with small room for underflow
    this.control_stack
    = this.memory + ( ( size / size_of_word ) - 2 * words_per_cell );
    // Data stack is just below the control stack made of 512 entries
    this.stack = this.control_stack - ( words_per_cell * 512 );
    this.ctx = new CpuContext( ip, this.stack, this.control_stack );
    de&&mand_eq( this.ctx.dsp, this.stack );
    de&&mand( this.ctx.dsp > this.memory );
  }

  get_context() : CpuContext {
    return this.ctx;
  }

  save_context(){
    this.ctx.ip  = IP;
    this.ctx.dsp = DSP;
    this.ctx.csp = CSP;
  }

  restore_context() : void {
    ACTOR = this;
    IP    = this.ctx.ip;
    DSP   = this.ctx.dsp;
    CSP   = this.ctx.csp;
  }

  switch_to( next_actor : Actor ){
    this.save_context();
    next_actor.restore_context();
  }

}


function make_actor( parent : InoxCell, act : InoxCell ) : InoxCell {
  let size = 1024 * size_of_cell;  // for parameters & control stacks; ToDo
  var new_actor = new Actor( parent, act, 0, size );
  // Fill parameter stack with act's parameters
  // ToDo [ act.locals ];
  let cell = make_proxy_cell( new_actor );
  new_actor.cell = cell;
  return cell;
};


// Current actor is the root actor
const root_actor: InoxCell = make_actor( the_void_cell, the_void_cell );
ACTOR = get_cell_proxied_object( root_actor );

// Current actor changes at context switch
ACTOR.restore_context();

// There is nothing in the free list
let free_actors = the_void_cell;


function allocate_actor( parent : InoxCell, act:InoxCell ) : InoxCell {
  if( free_actors == the_void_cell )return make_actor( parent, act );
  let actor = free_actors;
  let actor_object = get_cell_proxied_object( actor );
  actor_object.ctx.ip = 1;
  actor_object.parent = parent;
  actor_object.act = act;
  return actor;
}


function free_actor( actor : InoxCell ){
// add actor to free list
  set_next_cell( actor, free_actors );
  free_actors = actor;
}


// primitive to switch to another actor
function primitive_inox_actor_switch() : void {
  const tos = this.pop();
  const next_actor = get_cell_proxied_object( tos )
  clear_cell( tos );
  ACTOR.switch_to( next_actor );
}


function primitive_inox_make_actor() : void {
  let ip : InoxAddress = get_cell_value( this.tos() );
  var act = 0 // ToDo: allocate_act( ACTOR.cell );
  var new_actor : InoxCell = allocate_actor( ACTOR.cell, act );
  // ToDo: push( parameters ); into new actor
  let t : Actor = get_cell_proxied_object( new_actor );
  t.ctx.ip = ip;
  // ToDo: should be move_cell instead of copy_cell ?
  copy_cell( new_actor, this.tos() );
  de&&mand( t.ctx.dsp <= t.stack );
  de&&mand( t.ctx.dsp >  t.memory );
};


/* -----------------------------------------------------------------------
 *  primitives
 *
 *  ToDo: ? use failure/success insteqd of false/true,
 *  See Icon at https://lib.dr.iastate.edu/cgi/viewcontent.cgi?article=1172&context=cs_techreports
 */

let all_primitive_cells_by_id     = new Array< InoxCell >();
let all_primitive_functions_by_id = new Array< Function >();
// ToDo: names are small integers, I could use a spare array for speed?
let all_primitive_ids_by_text_name     = new Map< text, InoxIndex >();

const tag_inox_return = tag( "inox-return" );


function get_primitive_function_by_id( id : InoxIndex ){
  return all_primitive_functions_by_id[ id ];
}


function set_return_cell( cell : InoxCell ){
  set_cell_value( cell, 0 );
  set_cell_info(  cell, 0x0 );  // named void instead of tag_inox_return
}


function primitive( name : text, fn : Function ) : InoxCell {
// Helper to define a primitive
// It also defines an Inox word that calls that primitive

  // Allocate a proxy cell that points to the Function object
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
  let name_id = get_cell_name( tag_cell );

  // Associate name, primitive id and cell in all directions
  all_primitive_cells_by_id[ name_id ] = function_cell;
  all_primitive_functions_by_id[ name_id ] = fn;
  all_primitive_ids_by_text_name.set( name, name_id );

  // Make also an Inox word that calls the primitives
  let def : InoxAddress = allocate_bytes( 3 * size_of_cell );

  // flags and length, ToDo: reuse bytes area's size?
  raw_set_cell( def, type_word_id, name_id, 2 );

  // Skip that header
  def += words_per_cell;

  // Add opcode to invoke the primitive
  raw_set_cell( def + 0 * words_per_cell, type_void_id, name_id, 0 );

  // Add "return"
  set_return_cell( def + words_per_cell );;

  let word_cell = make_inox_word( tag( name ), def );

  de&&mand_eq( get_inox_word_definition_by_tag( name_id ), def  );
  de&&mand_eq(
    get_cell_name( get_inox_word_definition_by_tag( name_id ) ),
    name_id
  );

  nde&&bug( inox_word_cell_to_text_definition( word_cell ) );

  return word_cell;

}


function immediate_primitive( name : text, fn : Function ) : InoxCell {
// Helper to define an immediate primitive
// In inox-eval, immediate Inox words are executed instead of being
// added to the new Inox word definition that follows the "define" word
  let cell = primitive( name, fn );
  set_inox_word_immediate_flag( get_inox_word_id_by_text_name( name ) );
  return cell;
}


function operator_primitive( name : text, fn : Function ) : InoxCell {
// Helper to define an operator primitive
  let cell = primitive( name, fn );
  set_inox_word_operator_flag( get_inox_word_id_by_text_name( name ) );
  return cell;
}


primitive( "inox-return", function primitive_inox_return(){
// primitive "return" is jump to return address
  // ToDo: this should be primitive 0
  const csp : InoxCell = this.csp();
  const new_csp = csp + words_per_cell;
  this.set_csp( new_csp );
  const new_ip = get_cell_value( csp );
  // ToDo: detect special cases, including:
  // - spaggethi stacks, see https://wiki.c2.com/?SpaghettiStack
  // - stacks with a dynamic sizes, made of smaller stacks linked together.
  // One way to do this detection is simply to push a special word onto
  // the control stack, say inox-grown-stack for the dynamic size case.
  // Then that word could pop the address of the previous stack from to
  // bottom cell of the current one.
  // For spaggethi stacks, the child thread should increment the reference
  // counter of the parent dynamic stack so that it is not deallocated when
  // either the parent or the child thread returns but only when the parent
  // thread and all the child thread terminate. This would enable the
  // implementation of the infamous call/cc (call with continuation) to
  // implement various structures, including closures. See the unimplemented
  // "act" property, short for activation record, of the Actor class below.
  // Pushed to the extrement, every cell would need a reference counter. But
  // that would be too expensive and some better technic for garbage collection
  // would help. I may reconsider this when/if such garbage collection is
  // introduced in AssemblyScript or WebAssembly runtime itself.
  if( run_de ){
    bug( "primitive, return to IP " + new_ip + " from "
    + get_cell_name( csp ) );
  }
  raw_clear_cell( csp );
  this.set_ip( new_ip );
} );


// Special case for primitive inox-return, it gets two ids, 0 and normal.
// ToDo: avoid this
de&&mand_eq( tag_void, 0x0000 );
de&&mand_eq( tag_inox_return, 15 );
all_primitive_cells_by_id[ tag_void ]
= all_primitive_cells_by_id[ tag_inox_return ];
all_primitive_functions_by_id[ 0 ]
= all_primitive_functions_by_id[ tag_inox_return ];
// Patch word definition to reference word 0set_return_cell( get_inox_word_definition_by_tag( tag_inox_return ) );


primitive( "inox-cast", function(){
// Change the type of a value. That's unsafe.
  const type = get_cell_value( this.pop() );
  check_de&&mand( type < 8 )&&_or_FATAL.call( this, "Invalid type" );
  set_cell_type( this.dsp, type );
} );


primitive( "inox-rename", function primitive_inox_rename(){
// Change the name of a value
  const tos = this.pop();
  check_de&&mand_eq( get_cell_type( tos ), type_tag_id );
  const name = get_cell_value( tos );
  raw_clear_cell( tos );
  set_cell_name( this.tos(), name );
  de&&mand_eq( get_cell_name( this.tos() ), name );
} );


primitive( "inox-goto", function inox_goto(){
// Primitive is "jump" to some relative position
  // ToDo: conditional jumps
  this.set_ip( this.ip() + get_cell_value( this.pop() ) );
} );


primitive( "make_actor",   primitive_inox_make_actor   );
primitive( "actor_switch", primitive_inox_actor_switch );

// ToDo: core dictionary


/* -----------------------------------------------------------------------------
 *  Data stack manipulations.
 */


primitive( "push", function primitive_push() { this.push() } );


primitive( "drop", function primitive_drop() { clear_cell( this.pop() ) } );


primitive( "dup",  function primitive_dup(){
  copy_cell( this.tos(), this.push() );
} );


const tmp_cell = make_cell( type_void_id, tag_void, 0 );


primitive( "swap",  function primitive_swap(){
  const tos0 = this.tos();
  const tos1 = tos0 + words_per_cell;
  move_cell( tos0,     tmp_cell );
  move_cell( tos1,     tos0 );
  move_cell( tmp_cell, tos1 );
} );


primitive( "over", function primitive_over(){
  copy_cell( this.tos() + words_per_cell, this.push() );
} );


primitive( "rotate", function primitive_rotate(){
  const tos0 = this.tos();
  const tos1 = tos0 + words_per_cell;
  const tos2 = tos1 + words_per_cell;
  move_cell( tos0,     tmp_cell );
  move_cell( tos1,     tos0 );
  move_cell( tos2,     tos1 );
  move_cell( tmp_cell, tos2 );
} );


primitive( "pick", function primitive_pick(){
  const tos = this.tos();
  const nth = get_cell_integer( tos );
  copy_cell( tos + nth * words_per_cell, tos );
} );


function integer_to_text( value : InoxValue ) : text {
  return "" + value;
}


function integer_cell_to_text( cell : InoxCell ) : text {
  const value = get_cell_value( cell );
  return integer_to_text( value );
}


function cell_to_tag_cell( cell : InoxCell ) : InoxCell {
  let value : InoxValue = get_cell_value( cell );
  let info  : InoxInfo  = get_cell_info(  cell );
  let type  : InoxType  = unpack_type( info );
  if( type == type_tag_id )return all_tag_cells_by_id[ value ];
  return make_tag_cell( cell_to_text( cell ) );
}


/* -----------------------------------------------------------------------------
 *  Some memory integrity checks.
 */


function safe_proxy( proxy : InoxAddress ) : boolean {
  if( !safe_bytes( proxy ) )return false;
  return true;
}


function safe_pointer( pointer : InoxAddress ) : boolean {
  if( !safe_bytes( pointer ) )return false;
  return true;
}


function safe_cell( cell : InoxCell ) : boolean {
//  Try to determine if cell looks like a valid one

  const value : InoxValue = get_cell_value( cell );
  const info  : InoxInfo  = get_cell_info(  cell );
  const type  : InoxType  = unpack_type(    info );

  if( type == type_text_id ){
    const proxy = value;
    if( !safe_proxy( proxy ) ){
      bug( "Invalid proxy " + proxy + " for text cell " + cell );
      return false;
    }
    // ToDo: check it is a string
    return true;
  }else if( type == type_proxy_id ){
    const proxy = value;
    return safe_proxy( proxy );
  }else if( type == type_pointer_id ){
    const pointer = value;
    return safe_pointer( pointer );
    return true;
  }else if( type == type_tag_id ){
    const tag = value;
    if( ! all_tag_cells_by_id[ tag ] ){
      bug( "Invalid tag " + tag + " for cell " + cell );
    }
    return true;
  }else if( type == type_integer_id ){
    return true;
  }else if( type == type_word_id ){
    // ToDo: check
    return true;
  }else if( type == type_void_id ){
    return true;
  }else{
    bug( "Invalid type " + type + " for cell " + cell );
    return false;
  }
}


function tag_to_text( tag : InoxTag ) : text {
  const name = all_tag_text_names_by_id[ tag ];
  return name || "";
}


function cell_to_text( cell : InoxCell ) : text {

  alloc_de&&mand( safe_cell( cell ) );

  const value : InoxValue = get_cell_value( cell );
  const info  : InoxInfo  = get_cell_info(  cell );
  const type  : InoxType  = unpack_type(    info );

  if( type == type_text_id ){
    return proxy_to_text( value );
  }else if( type == type_tag_id ){
    return tag_to_text( value );
  }else if( type == type_integer_id ){
    return integer_to_text( value );
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

  const valid = safe_cell( cell );
  if( !valid ){
    debugger;
  }

  let value : InoxValue = get_cell_value( cell );
  let info  : InoxInfo  = get_cell_info(  cell );
  let type  : InoxType  = unpack_type( info );

  let name : InoxName = unpack_name( info );
  let buf  : text     = "" + tag_id_to_text( name ) + ": ";

  switch( type ){

    case type_void_id :
      buf += "<void:" + value + ">";
    break;

    case type_tag_id :
      buf += tag_id_to_text( value );
    break;

    case type_integer_id :
      buf += integer_cell_to_text( cell );
    break;

    case type_text_id :
      let text = cell_to_text( cell );
      if( text.length > 31 ){
        text = text.slice( 0, 31 ) + "...";
      }
      buf += "\"" + text + "\" @" + get_cell_value( value );
    break;

    case type_proxy_id :
      // ToDo: add class
      buf += "@" + get_cell_value( cell );
    break;

    case type_word_id :
      // ToDo: add name
      buf += "<word:" + value + ">";
    break;

    case type_pointer_id :
      // ToDo: add class
      buf += "*" + get_cell_value( cell );
    break;

    default :
      de&&mand( false );
      buf += "<???/" + type + ":" + value + ">";
      debugger;
    break;

  }

  buf += " - " + tag_id_to_text( type )
  + " " + get_cell_value( cell )
  + " @" + cell;
  return buf;

}


function stacks_dump( dsp : InoxAddress, csp : InoxAddress ) : text {

  let buf  = "DATA STACK:";
  let ptr  = dsp;

  if( get_cell_value( ptr - 2 * words_per_cell ) != 0 ){
    buf += "\n-2 DIRTY -> " + cell_to_dump_text( ptr - 2 * words_per_cell );
    debugger;
  }
  if( get_cell_value( ptr - words_per_cell ) != 0 ){
    buf += "\n-1 DIRTY -> " + cell_to_dump_text( ptr - words_per_cell );
    debugger;
  }

  let base = ACTOR.stack;

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
    + ( ptr == ACTOR.stack ? " <= BASE" : "" );
    if( ptr == ACTOR.stack )break;
    ptr += words_per_cell;
    nn++;
    if( nn > 10 ){
      buf += "...";
      break;
    }
  }


  buf += "\nCONTROL STACK: ";
  ptr = csp;

  if( get_cell_value( ptr - 2 * words_per_cell ) != 0 ){
    buf += "\n-2 DIRTY -> " + cell_to_dump_text( ptr - 2 * words_per_cell );
    debugger;
  }
  if( get_cell_value( ptr - words_per_cell ) != 0 ){
    buf += "\n-1 DIRTY -> " + cell_to_dump_text( ptr - words_per_cell );
    debugger;
  }

  let return_base = ACTOR.control_stack;

  if( ptr > return_base ){
    bug(
      "Controls stack underflow, top " + csp + ", base " + return_base
      + ", delta " + ( return_base - csp )
      + ", excess pop " + ( ( return_base - csp ) / words_per_cell )
    )
    return_base = ptr + 5 * words_per_cell;
  }

  nn = 0;
  let ip : InoxAddress ;
  let name : text = "";
  while( ptr <= return_base ){
    buf += "\n"
    + nn + " -> "
    + cell_to_dump_text( ptr )
    + ( ptr == ACTOR.control_stack ? " <= BASE" : "" );
    if( nn > 10 ){
      buf += "...";
      break;
    }
    ptr += words_per_cell;
    nn++;
  }

  return buf;

}


primitive( "inox-debugger", function primitive_inox_debugger(){
  // Activate lots of trace and invoke host debugger if any
  step_de  = true;
  run_de   = true;
  stack_de = true;
  eval_de  = true;
  token_de = true;
  debugger;
} );


primitive( "inox-log", function primitive_inox_log(){
  const verb_cell = this.pop();
  const type = get_cell_type( verb_cell );
  if( type == type_tag_id ){
    const verb = get_cell_value( verb_cell );
    if( verb == tag( "dont" ) ){
      can_log = false;
    }
    if( verb == tag( "do" ) ){
      can_log = true;
    }
    bug = can_log ? console.log : debug;
    if( verb == tag( "enable" ) ){
      const domain_cell = this.pop();
      const domain_id = get_cell_value( domain_cell );
      if( domain_id == tag( "eval" ) ){
        if( de ){ eval_de = true; }
      }
      if( domain_id == tag( "step" ) ){
        if( de ){ step_de = true; }
      }
      if( domain_id == tag( "run" ) ){
        if( de ){ run_de = true; }
      }
      if( domain_id == tag( "stack" ) ){
        if( de ){ stack_de = true; }
      }
      if( domain_id == tag( "token" ) ){
        if( de ){ token_de = true; }
      }
      clear_cell( domain_cell );
    }else if( verb == tag( "disable" ) ){
      // ToDo: implement this
      const domain_cell = this.pop();
      const domain_id = get_cell_value( domain_cell );
      if( domain_id == tag( "eval" ) ){
        if( de ){ eval_de = false; }
      }
      if( domain_id == tag( "step" ) ){
        if( de ){ step_de = false; }
      }
      if( domain_id == tag( "run" ) ){
        if( de ){ run_de = false; }
      }
      if( domain_id == tag( "stack" ) ){
        if( de ){ stack_de = false; }
      }
      if( domain_id == tag( "token" ) ){
        if( de ){ token_de = false; }
      }
      clear_cell( domain_cell )
    }
  }
  clear_cell( verb_cell );
} );


const tag_type  = tag( "type" );
const tag_name  = tag( "name" );
const tag_value = tag( "value" );


primitive( "inox-get-type", function primitive_inox_get_type(){
// Get type as an integer.
// ToDo: get as a tag?
  const tos = this.tos();
  const type = get_cell_type( tos );
  clear_cell( tos );
  set_cell_value( tos, type );
  set_cell_info( tos, pack( type_integer_id, tag_type ) );
} );


primitive( "inox-get-name", function primitive_inox_get_name(){
  const tos = this.tos();
  const name = get_cell_name( tos );
  clear_cell( tos );
  set_cell_value( tos, name );
  set_cell_info( tos, pack( type_tag_id, tag_name ) );
} );


primitive( "inox-get-value", function primitive_inox_get_value(){
  let tos = this.tos();
  let value = get_cell_value( tos );
  clear_cell( tos );
  set_cell_value( tos, value );
  set_cell_info( tos, pack( type_integer_id, tag_value ) );
} );


/* ---------------------------------------------------------------------------
 *  Some type checking. They work only when the global "de" flag is set.
 *  This is true if the interpreter was compiled in so called debug or
 *  development mode. Once a program is considered deployable, it is usually
 *  run by a runtime that does not provide most of the facilities that
 *  are available in debug/development mode, for speed reasons and compactness.
 */


// Type is encoded using 3 bits, hence there exists at most 8 types.
const type_id_to_text_array = new Array< text >;
const type_id_to_tag_array = new Array< InoxIndex >;
const type_name_to_id = new Map< text, InoxType >;


type_id_to_text_array[ type_void_id    ] = "void";
type_id_to_text_array[ type_tag_id     ] = "tag";
type_id_to_text_array[ type_integer_id ] = "integer";
type_id_to_text_array[ type_pointer_id ] = "pointer";
type_id_to_text_array[ type_proxy_id   ] = "proxy";
type_id_to_text_array[ type_text_id    ] = "text";
type_id_to_text_array[ type_word_id    ] = "word";
type_id_to_text_array[ type_flow_id    ] = "flow";
type_id_to_text_array[ 7               ] = "invalid";

type_id_to_tag_array[ type_void_id    ] = tag_void;    // "void"
type_id_to_tag_array[ type_tag_id     ] = tag_tag;     // "tag"
type_id_to_tag_array[ type_integer_id ] = tag_integer; // "integer"
type_id_to_tag_array[ type_pointer_id ] = tag_pointer; // "pointer"
type_id_to_tag_array[ type_proxy_id   ] = tag_proxy;   // "proxy"
type_id_to_tag_array[ type_text_id    ] = tag_text;    // "text"
type_id_to_tag_array[ type_word_id    ] = tag_word;    // "word"
type_id_to_tag_array[ type_flow_id    ] = tag_flow;    // "flow"
type_id_to_tag_array[ type_invalid_id ] = tag_invalid; // "invalid"

type_name_to_id.set( "void",    type_void_id    );
type_name_to_id.set( "tag",     type_tag_id     );
type_name_to_id.set( "integer", type_integer_id );
type_name_to_id.set( "pointer", type_pointer_id );
type_name_to_id.set( "proxy",   type_proxy_id   );
type_name_to_id.set( "text",    type_text_id    );
type_name_to_id.set( "word",    type_word_id    );
type_name_to_id.set( "flow",    type_flow_id    );
type_name_to_id.set( "invalid", type_invalid_id );


function type_id_to_text( type_id : InoxIndex ) : text {
  if( type_id < 0 || type_id > 7 )return "invalid";
  return type_id_to_text_array[ type_id ];
}


function type_id_to_tag( type_id : InoxIndex ) : InoxTag {
  if( type_id < 0 || type_id > 7 )return tag_invalid;
  return type_id_to_tag_array[ type_id ];
}


function type_name_to_type_id( name : text ) : InoxType {
  if( type_name_to_id.has( name ) )return type_name_to_id.get( name );
  return type_invalid_id;
}


function mand_type( actual : InoxIndex, expected : InoxIndex ){
  if( actual == expected )return;
  bug( "Bad type, " + actual + " (" + type_id_to_text( expected ) + ")"
  + " vs expected " + actual + " (" + type_id_to_text( actual ) + ")" );
  mand_eq( actual, expected );
}


function mand_name( actual : InoxIndex, expected : InoxIndex ){
  if( actual == expected )return;
  bug( "Bad name, " + actual + " (" + tag_id_to_text( actual ) + ")"
  + " vs expected " + expected + " (" + tag_id_to_text( expected ) + ")" );
  mand_eq( actual, expected );
}


function mand_cell_type( cell : InoxCell, type_id : InoxIndex ): void {
// Assert that the type of a cell is the integer type.
  if( get_cell_type( cell ) == type_id )return;
  bug( "Bad type for cell " + cell
  + ", " + type_id + " (" + type_id_to_text( type_id ) + ")"
  + " expected, versus actual "
  + get_cell_type( cell ) + "/" + type_id_to_text( get_cell_type( cell ) ) );
  // ToDo: should raise a type error
  mand_type( get_cell_type( cell ), type_id );
}


function mand_void_cell( cell : InoxCell ) : void {
// Assert that the type of a cell is the integer type.
  mand_cell_type( cell, type_void_id );
}


function mand_tag_cell( cell  : InoxCell ){
// Assert that the type of a cell is the pointer type.
  mand_cell_type( cell, type_tag_id );
}


function mand_pointer_cell( cell : InoxCell ) : void {
// Assert that the type of a cell is the integer type.
  mand_cell_type( cell, type_pointer_id );
}


function mand_proxy_cell( cell : InoxCell ) : void {
// Assert that the type of a cell is the integer type.
  mand_cell_type( cell, type_proxy_id );
}


function mand_text_cell( cell  : InoxCell ){
// Assert that the type of a cell is the text type.
  mand_cell_type( cell, type_text_id );
}


function mand_word_cell( cell : InoxCell ) : void {
// Assert that the type of a cell is the integer type.
  mand_cell_type( cell, type_word_id );
}


function get_cell_type_tag( cell : InoxCell ) : InoxTag {
// Get the most specific type of a cell's value
  const type = get_cell_type( cell );
  // For pointers, it's the name stored in the first cell of the object
  if( type == type_pointer_id ){
    return get_cell_name( get_cell_value( cell ) );
  }
  // For proxied object, it's the class name of the proxied object
  if( type == type_proxy_id ){
    const proxied_obj = get_proxied_object_by_id( get_cell_value( cell ) );
    const js_type = typeof proxied_obj;
    if( typeof proxied_obj == "object" ){
      return tag( proxied_obj.constructor.name );
    }
    return tag( js_type );
  }
  return type_id_to_tag( get_cell_type( cell ) );
}


const tag_class = tag( "class" );


primitive( "inox-get-class", function inox_get_class(){
// Get the most specific type name (as a tag) of the top of stack cell
  const tos = this.tos();
  const type_tag = get_cell_type_tag( tos );
  clear_cell( tos );
  set_cell_value( tos, type_tag );
  set_cell_info( tos, pack( type_tag_id, tag_class ) );
} );


/* ---------------------------------------------------------------------------
 *  Some ...
 */


primitive( "inox-if", primitive_inox_if );
function              primitive_inox_if(){
// Disable block unless top of stack is true. ( bool block -- block-or-f )
  const block = this.pop();
  if( get_cell_value( this.tos() ) != 0 ){
    move_cell( block, this.tos() );
  // Else inox-call will detect false and do nothing accordingly
  }else{
    if( de ){ raw_clear_cell( block ); }
  }
}


primitive( "inox-if-else", primitive_inox_if_else );
function                   primitive_inox_if_else(){
// keep one of two blocks  ( bool then-block else-block -- block )
  const else_block = this.pop();
  const then_block = this.pop();
  if( get_cell_value( this.tos() ) != 0 ){
    move_cell( then_block, this.tos() );
    clear_cell( else_block );
  }else{
    move_cell( else_block, this.tos() );
    clear_cell( then_block );
  }
}


primitive( "inox-to-control", function primitive_inox_to_control(){
  const csp = this.csp() - words_per_cell;
  move_cell( this.pop(), csp );
  this.set_csp( csp );
} );


primitive( "inox-from-control", function primitive_inox_from_control(){
  const csp = this.csp();
  move_cell( csp, this.push() );
  this.set_csp( csp + words_per_cell );
} );


primitive( "inox-fetch-control", function primitive_inox_fetch_control(){
  copy_cell( this.csp(), this.push() );
} );


function FATAL( message : text ){
// Display error and stacks. Clear stack & get back to eval loop
  bug( "\nFATAL: " + message + "\n" + stacks_dump( this.tos(), this.csp() ) );
  this.set_csp( ACTOR.control_stack );
  this.set_dsp( ACTOR.stack );
  this.set_ip( 0 );
  debugger;
}


// For use in xxx_de&&mand( xxx )&&_or_FATAL( msg )
const _or_FATAL = FATAL;


/* ----------------------------------------------------------------------------
 *  Low level control structures.
 */


const tag_inox_while_1         = tag( "inox-while-1" );
const tag_inox_while_2         = tag( "inox-while-2" );
const tag_inox_while_3         = tag( "inox-while-3" );
const tag_inox_goto_while_2    = tag( "inox-goto-while-2" );
const tag_inox_goto_while_3    = tag( "inox-goto-while-3" );
const tag_inox_while_body      = tag( "inox-while-body" );
const tag_inox_while_condition = tag( "inox-while-condition" );
const tag_inox_break_sentinel  = tag( "inox-break-sentinel" );
const tag_inox_loop_body       = tag( "inox-loop-body" );


primitive( "inox-while-1", function primitive_inox_while_1(){
// Low level words to build inox-while( { condition } { body } )
  // : inox-while
  //   inox-while-1 ( save blocks in control stack )
  //   inox-while-2 ( run condition block )
  //   inox-while-3 ( if condition ok, run body & jump to while-2 )
  // . inox-inline
  const body_block      = this.pop();
  const condition_block = this.pop();
  // IP is expected to points to inox-while-2
  de&&mand_eq( get_cell_name( this.ip() ), tag_inox_while_2 );
  // Save info for inox-break-loop, it would skip to after inox-while-3
  let new_csp = this.csp();
  new_csp -= words_per_cell;
  de&&mand_eq( get_cell_value( new_csp ), 0 );
  set_cell_value( new_csp, this.ip() + 2 * words_per_cell );
  set_cell_info(  new_csp, tag_inox_break_sentinel );
  // Move condition and body to control stack
  new_csp -= words_per_cell;
  move_cell( body_block, new_csp );
  if( de ){
    set_cell_info( new_csp, tag_inox_while_body );
  }
  new_csp -= words_per_cell;
  move_cell( condition_block, new_csp );
  if( de ){
    set_cell_info( new_csp, tag_inox_while_condition );
  }
  this.set_csp( new_csp );
  // The control stack now holds:
  //   IP for inox-break, named inox-loop-sentinel
  //   IP for the body block
  //   IP for the condition block
  // Execution continues inside inox-while-2
} );


primitive( "inox-while-2", function primitive_inox_while_2(){
  // IP is expected to point to inox-while-3
  de&&mand_eq( get_cell_name( this.ip() ), tag_inox_while_3 );
  const csp = this.csp();
  const condition_block = get_cell_value( csp );
  // Invoke condition, like inox-call would
  const next_csp = csp - words_per_cell;
  de&&mand_eq( get_cell_value( next_csp ), 0 );
  set_cell_value( next_csp, this.ip() );
  set_cell_info(  next_csp, tag_inox_goto_while_3 );
  this.set_csp( next_csp );
  // Jump into block, skip length header
  this.set_ip( condition_block + 1 * words_per_cell );
  // The control stack now holds:
  //   IP for the body block, named /inox-while-body in debug mode
  //   IP for the condition block, named /inox-while-condition in debug mode
  //   IP addres of inox-while-3, the condition block will return to it
} );


function primitive_inox_while_3(){

  const csp = this.csp();
  const tos = this.pop();
  let   bool = get_cell_value( tos );
  clear_cell( tos );

  // If the condition is met, run the body and loop
  if( bool != 0 ){
    const body_block = get_cell_value( csp + words_per_cell );
    // The inox-return of the body block must jump to inox-while-2
    const next_csp = csp - words_per_cell;
    de&&mand_eq( get_cell_value( next_csp ), 0 );
    // ip currently points after this primitive, hence while-2 is before
    set_cell_value( next_csp, this.ip() - 2 * words_per_cell );
    set_cell_info(  next_csp, tag_inox_goto_while_2 );
    this.set_csp( next_csp );
    // CSP must now point to inox-while-2 primitive word
    de&&mand_eq(
      get_cell_name( get_cell_value( this.csp() ) ),
      tag_inox_while_2
    );
    // Jump into the body block, after the block length header
    this.set_ip( body_block + 1 * words_per_cell );

  // The while condition is not met, it's time to exit the loop
  }else{
    // Drop loop sentinel, condition and body from control stack.
    // ToDo: use lookup instead of fixed value if optimistic guess failed.
    const new_csp = csp + 3 * words_per_cell;
    de&&mand_eq(
      get_cell_name( new_csp - words_per_cell ),
      tag_inox_break_sentinel
    );
    this.set_csp( new_csp );
    if( de ){
      raw_clear_cell( csp + 0 * words_per_cell );
      raw_clear_cell( csp + 1 * words_per_cell );
      raw_clear_cell( csp + 2 * words_per_cell );
    }
  }
}


primitive( "inox-while-3", primitive_inox_while_3 );


primitive( "inox-until-3", function primitive_inox_until_3(){
// Like while loop but with the boolean reversed
  const dsp = this.tos();
  if( get_cell_value( dsp ) == 0 ){
    set_cell_value( dsp, 1 );
  }else{
    set_cell_value( dsp, 0 );
  }
  primitive_inox_while_3.call( this );
} );


primitive( "inox-loop", function primitive_loop(){
  const tos = this.pop();
  const body_block = get_cell_value( tos );
  clear_cell( tos );
  // Save info for inox-break-loop, it would skip to after inox-loop
  let new_csp = this.csp() - words_per_cell;
  de&&mand_eq( get_cell_value( new_csp ), 0 );
  set_cell_value( new_csp, this.ip() );
  set_cell_info(  new_csp, tag_inox_break_sentinel );
  // Invoke body block, it will return to itself, loopimg until some break
  new_csp -= words_per_cell;
  set_cell_value( new_csp, body_block + 1 * words_per_cell );
  if( de ){
    set_cell_info( new_csp, tag_inox_loop_body );
  }
  this.set_csp( new_csp );
  // Jump into boby block, skip length header
  this.set_ip( body_block + 1 * words_per_cell );
} );


function lookup_sentinel( csp : InoxCell, tag : InoxName ) : InoxCell {
  let next_csp = csp + words_per_cell;
  // ToDo: init actor with a sentinel in the control stack
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
// Like inox-return but to exit a control structure, a non local return
  const csp : InoxCell = this.csp();
  let sentinel_csp = lookup_sentinel( csp, tag_inox_break_sentinel );
  // ToDo: raise exception if not found
  if( sentinel_csp == 0 ){
    FATAL.call( this, "inox-break sentinel missing" );
    return;
  }
  // Return to IP previously saved in break sentinel
  this.set_ip( get_cell_value( sentinel_csp ) );
  // Clear control stack up to sentinel
  let cell = csp;
  while( cell <= sentinel_csp ){
    raw_clear_cell( cell );
    cell += words_per_cell;
  }
  const new_csp = sentinel_csp + words_per_cell;
  this.set_csp( new_csp  );
} );


primitive( "inox-sentinel", function primitive_inox_sentinel(){
  const tos = this.pop();
  de&&mand_eq( get_cell_type( tos ), type_tag_id );
  const sentinel_name = get_cell_name( tos );
  raw_clear_cell( tos );
  let new_csp = this.csp() - words_per_cell;
  de&&mand_eq( get_cell_value( new_csp ), 0 );
  set_cell_value( new_csp, this.ip() );
  set_cell_info( new_csp, sentinel_name );
  this.set_csp( new_csp );
} );


primitive( "inox-jump", function inox_jump(){
// Non local return to some sentinel set using inox-sentinel
  const tos = this.pop();
  de&&mand_eq( get_cell_type( tos ), type_tag_id );
  const sentinel_name = get_cell_name( tos );
  raw_clear_cell( tos );
  const csp : InoxCell = this.csp();
  const sentinel_csp = lookup_sentinel( csp, sentinel_name );
  // ToDo: raise exception if not found
  if( sentinel_csp == 0 ){
    FATAL.call( this,
      "inox-jump, sentinel missing " + tag_id_to_text( sentinel_name )
    );
    return;
  }
  // ToDo: "continue" word to return to IP previously saved in sentinel
  // this.set_ip( get_cell_value( sentinel_csp ) );
  // Clear control stack up to sentinel
  let new_csp = csp;
  while( new_csp <= sentinel_csp ){
    clear_cell( new_csp );
    new_csp += words_per_cell;
  }
  this.set_csp( new_csp );
} );


/* -----------------------------------------------------------------------------
 *  Polymorphic methods
 */


const tag_method_missing   = tag( "method-missing"   );
const tag_word_missing     = tag( "word-missing"     );
const tag_operator_missing = tag( "operator-missing" );


function dispatch_binary_operator(
  operator_tag : InoxIndex,
  target_type  : InoxIndex
) : void {

  const tos = this.tos();
  const target = tos + words_per_cell;

  const target_class_name = is_reference_type( target_type )
  ? type_id_to_text( target_type )
  : tag_id_to_text( get_cell_name( target ) );
  const full_name = target_class_name + "." + tag_id_to_text( operator_tag );

  let word_id = get_inox_word_id_by_text_name( full_name );
  if( word_id == 0 ){
    // ToDo: lookup in class hierarchy
    // ToDo: on the fly creation of the target method if found
    if( word_id == 0 ){
      // ToDo: lookup based on type, unless pointer
      if( target_type != type_pointer_id ){
        // ToDo: get type as string, then add : and method name
      }
      if( word_id == 0 ){
        set_text_cell( this.push(), full_name );
        word_id = get_inox_word_id_by_text_name( "operator-missing" );
      }
    }
  }
  this.set_csp( this.csp() - words_per_cell );
  set_cell_value( this.csp(), this.ip() );
  set_cell_name( this.csp(),  tag( full_name ) );
  this.set_ip( get_inox_word_definition_by_tag( word_id ) );

}


// Arithmetic works on integers but also on the values of void & tag types
const all_integer_like_type_tags = [
  tag_void,
  tag_tag,
  tag_integer
];

type PrimitiveFunction      = () => void;
type UnaryOperatorFunction  = ( p : InoxValue ) => InoxValue;
type BinaryOperatorFunction = ( a : InoxValue, b : InoxValue ) => InoxValue;

// Maps integer.+ to some BinaryOperatorFunction, for all operators
const all_binary_operator_functions_by_tag
= new Map< InoxName, BinaryOperatorFunction >;

// Maps integer.not? to some UnaryOperatorFunction, for all operators
const all_unary_operator_functions_by_tag
= new Map< InoxName, UnaryOperatorFunction >;


function get_inox_word_id_by_type_and_word(
  target_type : InoxTag,
  name : InoxTag
) : InoxIndex {
  const fullname = tag_id_to_text( target_type ) + "." + tag_id_to_text( name );
  return all_primitive_ids_by_text_name.get( fullname );
}


function define_class_binary_operator_primitive(
  target_type : InoxType,
  operator_name : InoxTag,
  fun : BinaryOperatorFunction
){

  const primitive_name
  = tag_id_to_text( target_type ) + "." + tag_id_to_text( operator_name );

  // For reference types
  if( is_reference_type( target_type ) ){


  // For not reference types, including integer
  }else{

    const tos = this.tos();
    const target = tos + words_per_cell;

    let word_id = get_inox_word_id_by_type_and_word(
      target_type,
      operator_name
    );
    if( word_id == 0 ){
      // ToDo: lookup in class hierarchy
      // ToDo: on the fly creation of the target method if found
      if( word_id == 0 ){
        set_text_cell( this.push(), primitive_name );
        word_id = get_inox_word_id_by_text_name( "operator-missing" );
      }
    }
    this.set_csp( this.csp() - words_per_cell );
    set_cell_value( this.csp(), this.ip() );
    set_cell_name( this.csp(),  tag( primitive_name ) );
    this.set_ip( get_inox_word_definition_by_tag( word_id ) );
  }

}


function define_overloaded_binary_operator_primitives(
  operator_name : Text,
  fun : BinaryOperatorFunction,
){

  let primitive_name : text;
  let class_name : InoxTag;

  for( class_name of all_integer_like_type_tags ){
    define_class_binary_operator_primitive(
      class_name,
      tag( primitive_name ),
      fun
    );
  };

}



operator_primitive( "+", function primitive_add(){

  const tos = this.tos();
  const target = tos + words_per_cell;
  const target_type = get_cell_type( tos + words_per_cell );

  if( !is_reference_type( target_type ) ){
    const p2 = this.pop();
    const p1 = this.tos();
    if( check_de ){
      if( get_cell_type( p2 ) != type_integer_id ){
        clear_cell( p2 );
        bug( "bad type, expecting integer second operand to +" );
        assert( false );
        return;
      }
      if( get_cell_type( p1 ) != type_integer_id ){
        bug( "bad type, expecting integer first operand to +" );
        assert( false );
        return;
      }
    }
    const x2 = get_cell_value( p2 );
    raw_clear_cell( p2 );
    const x1 = get_cell_value( p1 );
    const r  = x1 + x2;
    set_cell_value( p1, r );
    return;
  }

  // Polymorphic case, with operator overloading
  dispatch_binary_operator.call( this, tag( "+" ), target_type );

} );


/*
 * =? - value equality
 */

const tag_is_equal = tag( "=?" );


function primitive_inox_is_equal(){

  const tos = this.pop();
  const p2  = tos;
  const p1  = this.tos();
  const value1 = get_cell_value( p1 );
  const value2 = get_cell_value( p2 );
  const type1  = get_cell_type( p1 );
  const type2  = get_cell_type( p2 );

  // Simple case if when both type and value are the same
  if( value1 == value2 ){
    if( type1 == type2 ){
      clear_cell( tos );
      // Special case for void:0, turn it into void:1
      if( type1 == type_void_id && value1 == 0 ){
        set_cell_value( p1, 1 );
      }
    }
    return;
  }

  // If neither is a reference, they're different
  let need_swap : boolean = false;
  if( !is_reference_cell( p1 ) ){
    if( !is_reference_cell( p2 ) ){
      clear_cell( tos );
      // Special case for void:0, turn it into void:1
      if( type1 == type_void_id && value1 == 0 ){
        set_cell_value( p1, 1 );
      }
      return;
    // If second operand is a reference whereas first not, swap
    }else{
      need_swap = true;
    }
  }

  // For text, compare content
  if( !need_swap && type1 == type_text_id && type2 == type_text_id ){
    const text1 : text = get_cell_proxied_object( p1 );
    const text2 : text = get_cell_proxied_object( p2 );
    // If same content, keep the first operand
    if( text2 == text1 ){
      clear_cell( p2 );
      return;
    }
    // Else return void:0
    clear_cell( p1 );
    clear_cell( p2 );
    return;
  }

  // Else, ToDo: delegate to a method of either p1 or p2 if swap needed
  debugger;
  clear_cell( p1 );
  clear_cell( p2 );

}


operator_primitive( "=?", primitive_inox_is_equal );


/*
 * <>? - value inequality, the boolean opposite of =? value equality.
 */


operator_primitive( "<>?", function primitive_inox_is_not_equal(){
  primitive_inox_is_equal.call( this );
  const tos = this.tos();
  const value = get_cell_value( tos );
  if( value == 0 ){
    set_cell_value( tos, 1 );
  }else{
    clear_cell( tos );
  }
} );


/*
 * ==? - object identicallity, ie shallow equality, not deep equality.
 */


function primitive_inox_is_identical(){

  const p2     = this.pop();
  const p1     = this.tos();
  const value1 = get_cell_value( p1 );
  const value2 = get_cell_value( p2 );
  const type1  = get_cell_type(  p1 );
  const type2  = get_cell_type(  p2 );

  clear_cell( p2 );
  clear_cell( p1 );

  // Simple case if when both type and value are the same
  if( value1 == value2 && type1 == type2 ){
    set_cell_value( p1, 1 );
  }

}


operator_primitive( "==?", primitive_inox_is_identical );


/*
 *  not==? - object inquality, boolean opposite of ==? shallow equality.
 */


operator_primitive( "not==?", function primitive_inox_is_not_identical(){
  primitive_inox_is_identical.call( this );
  const tos = this.tos();
  const value = get_cell_value( tos );
  if( value == 0 ){
    set_cell_value( tos, 1 );
  }else{
    set_cell_value( tos, 0 );
  }
} );


function operator( name : text, fun : Function ) : void {
// Build an operator primitive. Also built integer.xx, tag.xx
// and void.xx corresponding primitives.

  operator_primitive(
    name,
    function primitive_binary_operator(){
      const p2 = this.pop();
      const p1 = this.tos();
      if( check_de ){
        if( get_cell_type( p2 ) != type_integer_id ){
          clear_cell( p2 );
          bug( "bad type, expecting integer second operand" );
          assert( false );
          return;
        }
        if( get_cell_type( p1 ) != type_integer_id ){
          bug( "bad type, expecting integer first operand" );
          assert( false );
          return;
        }
      }
      const r = fun.call( this, get_cell_value( p1 ), get_cell_value( p2 ) );
      raw_clear_cell( p2 );
      set_cell_value( p1, r );
    }
  );

}


/*
 *  Generic solution for arithmetic & boolean operations
 */


operator( "-",     ( a, b ) => a -   b );
operator( "*",     ( a, b ) => a *   b ); // multiply
operator( "/",     ( a, b ) => a /   b ); // ToDo: division by zero
operator( "%",     ( a, b ) => a %   b ); // remainder. ToDo: /%
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
operator( "and?",  ( a, b ) => ( a &&  b ) ? 1 : 0 );
operator( "or?",   ( a, b ) => ( a ||  b ) ? 1 : 0 );


/*
 * Generic solution for arithmetic and boolean unary operations.
 */

function unary_operator( name : text, fun : Function ) : void {
  operator_primitive( name, function primitive_unary_operator(){
    const p0 = this.tos();
    const r  = fun.call( this, get_cell_value( p0 ) );
    set_cell_value( p0, r );
  } );
}

unary_operator( "?",        ( x ) => x       ?  1 :  0 );
unary_operator( "not?",     ( x ) => x       ?  0 :  1 );
unary_operator( "true?",    ( x ) => x == 0  ?  0 :  1 );
unary_operator( "false?",   ( x ) => x == 0  ?  1 :  0 );
unary_operator( "=1?",      ( x ) => x == 1  ?  1 :  0 );
unary_operator( "=-1?",     ( x ) => x == -1 ?  1 :  0 );
unary_operator( "=0?",      ( x ) => x == 0  ?  1 :  0 );
unary_operator( "<>0?",     ( x ) => x == 0  ?  0 :  1 );
unary_operator( "<0?",      ( x ) => x  < 0  ?  1 :  0 );
unary_operator( "<=0?",     ( x ) => x <= 0  ?  1 :  0 );
unary_operator( ">0?",      ( x ) => x  > 0  ?  1 :  0 );
unary_operator( ">=0?",     ( x ) => x >= 0  ?  1 :  0 );
unary_operator( "NOT",      ( x ) => ~x                );
unary_operator( "negative", ( x ) => -x                );
unary_operator( "sign",     ( x ) => x < 0   ? -1 :  1 );
unary_operator( "abs",      ( x ) => x > 0   ?  x : -x );


/*
 * & - text concatenation
 */


function primitive_inox_join_text(){
// Text concatenation, t1 t2 -- t3
  const p1 = this.pop();
  const p0 = this.tos();
  const r  = make_text_cell( cell_to_text( p0 ) + cell_to_text( p1 ) );
  clear_cell( p1 );
  copy_cell( r, p0 );
}


operator_primitive( "&", primitive_inox_join_text );

primitive( "inox-join-text", primitive_inox_join_text );


/*
 * as" - string representation
 */


operator_primitive( "as\"\"", function primitive_as_text(){
  const p = this.tos();
  if( get_cell_type( p ) == type_text_id )return;
  copy_cell( make_text_cell( cell_to_text( p ) ), p );
} );


/*
 * is""? - true only if value is the empty text.
 * ToDo: can"? - true if some string representation is possible.
 */

const the_empty_text_value = get_cell_value( the_empty_text_cell );


operator_primitive( "is\"\"?", function primitive_is_empty_text(){
  const p0 = this.tos();
  set_cell_value(
    the_boolean_work_cell,
    get_cell_type( p0 ) == type_text_id
    && get_cell_value( p0 ) == the_empty_text_value
    ? 1 : 0
  );
  copy_cell( the_boolean_work_cell, p0 );
} );


/* -----------------------------------------------------------------------------
 *
 */


function inox_machine_code_cell_to_text( cell : InoxCell ){
// Decompilation of a single machine code.

  // What type of code is this, Inox word, primitive, literal, jump?
  let type              : InoxType;
  let name              : InoxName;
  let word_cell         : InoxCell;
  let word_name_id      : InoxName;
  let primitive_cell    : InoxCell;
  let primitive_name_id : InoxName;
  let name_text         : InoxText;
  let fun               : Function;

  type = get_cell_type( cell );
  name = get_cell_name( cell );

  // If code is a primitivse. That's when type is void; what a trick!
  if( type == type_void_id ){
    // ToDo: ude .has()
    primitive_cell = all_primitive_cells_by_id[ name ];
    if( !primitive ){
      debugger;
      return "Invalid primitive cell " + cell + " named " + name
      + " (" + tag_id_to_text( name ) + ")";
    }
    primitive_name_id = get_cell_name( primitive_cell );
    if( de && name != 0x0000 ){
      // inox-return is special. ToDo: it should not be special.
      de&&mand_eq( primitive_name_id, name );
    }
    // ToDo: use .has()?
    fun = all_primitive_functions_by_id[ name ];
    if( !fun ){
      debugger
      return "Invalid primitive cell " + cell + ", bad function named " + name
      + " ( " + primitive_name_id + ", " + tag_id_to_text( name ) + ")";
    }
    name_text = tag_id_to_text( primitive_name_id );
    return "cell " + cell + " is " + name_text
    + " ( primitive " + primitive_name_id + ", " + fun.name + " )";

  // If code is the integer id of an Inox word, an execution token
  }else if ( type == type_word_id ){
    word_cell    = get_inox_word_cell_by_tag( name );
    word_name_id = get_cell_name( word_cell );
    name_text    = tag_id_to_text( word_name_id );
    if( word_name_id == 0x0000 ){
      debugger;
      name_text = "cell " + cell + " is word inox-return 0x0000";
    }
    return "cell " + cell + " is " + name_text + " ( word " + name + " )";

  // If code is a literal
  }else{
    return "cell " + cell + " is " + cell_to_dump_text( cell ) + " ( literal )";
  }

}


function inox_word_id_to_text_definition( id : InoxIndex ) : text {
// Return the decompiled source code that defines the Inox word.
  // A non primitive Inox word is defined using an array of cells that
  // are either other words, primitives or literal values

  let text_name = inox_word_id_to_text( id );

  // The definition is an array of cells
  let def : InoxCell = get_inox_word_definition_by_tag( id );

  // The prior cell stores flags & length
  let flags_and_length = get_cell_value( def - words_per_cell );
  let flags  = flags_and_length & 0xffff0000;
  let length = flags_and_length &     0xffff;

  // ToDo: add a pointer to the previous word definition

  let buf = ": ( definition of " + text_name + ", word " + id
  + ", cell " + def + ", flags " + flags + ", length " + length + " )\n";

  let ip   : InoxIndex = 0;
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
    buf += ip + ": " + inox_machine_code_cell_to_text( cell ) + "\n";
    ip++;
  }

  return buf;

}


function inox_word_id_to_text( id : InoxIndex ) : text {
  let word_cell = get_inox_word_cell_by_tag( id );
  let name_id   = get_cell_name( word_cell );
  return tag_id_to_text( name_id );
}


function inox_word_cell_to_text_definition( cell : InoxCell ) : text {
  const word_id = get_cell_name( cell );
  return inox_word_id_to_text_definition( word_id );
}


/* -----------------------------------------------------------------------------
 *  Class hierarchy
 */

const tag_thing = tag( "thing" );
const   tag_number = tag( "number" );
//const   tag_void = tag( "void" );
//const   tag_integer = tag( "integer" );
const     tag_float = tag( "float" );
const   tag_object = tag( "object" );
const   tag_native = tag( "native" );
const   tag_block  = tag( "block" );
const   tag_collection = tag( "collection" );
const   tag_array = tag( "array" );
const   tag_map   = tag( "map ");

const cell_tag_thing   = make_tag_cell( "thing" );
const cell_tag_value   = make_tag_cell( "value" );
const cell_tag_number  = make_tag_cell( "number" );
const cell_tag_integer = make_tag_cell( "integer" );
const cell_tag_object  = make_tag_cell( "object" );
const cell_tag_native  = make_tag_cell( "native" );
const cell_tag_block   = make_tag_cell( "block" );


primitive( "thing.class", function(){
  copy_cell( cell_tag_thing, this.push() );
} );


primitive( "value.class", function(){
  copy_cell( cell_tag_value, this.push() );
} );


primitive( "object.class", function(){
  copy_cell( cell_tag_object, this.push() );
} );


primitive( "number.class", function(){
  copy_cell( cell_tag_number, this.push() );
} );


primitive( "native.class", function(){
  copy_cell( cell_tag_native, this.push() );
} );


primitive( "void.class", function(){
  copy_cell( cell_tag_native, this.push() );
} );


primitive( "integer.class", function(){
  copy_cell( cell_tag_integer, this.push() );
} );



/* -----------------------------------------------------------------------------
 *  Constants and variables
 *  a constant is just a word that pushes a literal onto the data stack.
 *  a global variable is two word, xxx and xxx!, to get/set the value.
 *  a control variable is a transient cell in the control stack.
 *  a data variable is a transient cell in the data stack.
 *  Read and write access to variables is possible directly or by address.
 *  Local and data variables use dynanic scopes, ie the variables are
 *  searched in a stack, from top to bottom.
 *  See https://wiki.c2.com/?DynamicScoping
 */


primitive( "inox-peek", function primitive_inox_peek(){
// Get the value of a cell, using a cell's address. This is very low level.
  const dsp = this.tos();
  const source_cell = get_cell_value( dsp );
  copy_cell( source_cell, dsp );
} );


primitive( "inox-poke", function primitive_inox_poke(){
// Set the value of a cell, using a cell's address. Low level, unsafe.
  const address_cell = this.pop();
  const value_cell   = this.pop();
  move_cell( value_cell, get_cell_value( address_cell ) );
  raw_clear_cell( address_cell );
} );


function primitive_inox_constant_create(){
// Create a getter word that pushes a literal onto the data stack

  // Get value, then name
  const value_cell = this.pop();

  // Create a word to get the content, first get it's name
  const name_cell = this.pop();
  check_de&&mand_eq( get_cell_type( name_cell ), type_tag_id );
  const name_id = get_cell_value( name_cell );
  raw_clear_cell( name_cell );

  // Allocate space for word header, value and return instruction
  let def = allocate_bytes( ( 1 + 2 ) * size_of_cell );

  // flags and length need an extra word, so does then ending "return"
  raw_set_cell( def, type_integer_id, name_id, 1 + 1 + 1 );

  // Skip that header
  def += words_per_cell;

  // Add Literal value
  move_cell( value_cell, def + 0 * words_per_cell );

  // Add return instruction
  set_return_cell( def + 1 * words_per_cell );

  make_inox_word( name_id, def );

  de&&mand_eq( get_inox_word_definition_by_tag( name_id ), def );
  de&&mand_eq(
    get_cell_value(
      get_inox_word_definition_by_tag( name_id ) + words_per_cell
    ),
    0x0000  // inox-return
  );

}
primitive( "inox-constant-create", primitive_inox_constant_create );


primitive( "inox-global-create", function primitive_inox_global_create(){
// Create two words, a setter and a getter, unlike constant-create that
// creates only a getter.

  // Get info from data stack, expecting a value at the top of it and then a tag
  const dsp = this.tos();
  const name_cell = dsp - words_per_cell;
  de&&mand_eq( get_cell_type( name_cell ), type_tag_id );

  // Create a word to get the global variable like constants does
  primitive_inox_constant_create.call( this );

  // Create a setter word to set the global variable, xxx!
  const name_id = get_cell_value( name_cell );
  const name = tag_id_to_text( name_id );
  const setter_name = name + "!";
  const setter_name_id = tag( setter_name );

  // Allocate space for word header, cell address, getter and return instruction
  let def = allocate_bytes( ( 1 + 3 ) * size_of_cell );

  // flags and length need an extra word, so does then ending "return"
  raw_set_cell( def, type_integer_id, name_id, 1 + 1 + 1 + 1 );

  // Skip that header
  def += words_per_cell;

  // Add address of cell inside the word created to access a constant
  const getter_def = get_inox_word_definition_by_tag( name_id );
  const store_cell = getter_def;
  set_cell_value( getter_def, store_cell );
  set_cell_info(  getter_def, setter_name_id );

  // Add call to primitive peek to get the value when word runs
  set_cell_info( def + 1 * words_per_cell, tag( "inox-peek" ) );

  // Add return instruction
  set_return_cell( def + 2 * words_per_cell );

  make_inox_word( name_id, def );

} );


primitive( "inox-control-create", function primitive_inox_control_create(){
// Create a control variable in the control stack, with some initial value
  const csp = this.csp();
  const new_csp = csp - words_per_cell;
  this.set_csp( new_csp );
  const name_cell = this.pop();
  const name = get_cell_name( name_cell );
  raw_clear_cell( name_cell );
  const value_cell = this.pop();
  move_cell( value_cell, new_csp );
  set_cell_name( new_csp, name );
} );


const tag_inox_with = tag( "inox-with" );


primitive( "inox-with-control", function primitive_inox_with_control(){
// Create variables in the control stack for words with formal parameters

  let tos = this.tos();
  let csp = this.csp();

  // Count formal parameters up to inox-with sentinel included
  let new_tos = tos;
  let new_csp = csp;
  let count = 0;
  let cell_name;
  while( true ){
    cell_name = get_cell_name( new_tos );
    count++;
    if( cell_name == tag_inox_with )break;
    if( count > 10 ){
      bug( "Too many parameters, more then ten" );
      debugger;
      break;
    }
    new_tos += words_per_cell;
  }

  // Set value of parameters using values from the data stack
  let copy_count = 0;
  let delta_dsp = count * words_per_cell;
  let name : InoxName;

  // Go from sentinel argument back to tos, push each actual parameter
  const sentinel_dsp = new_tos;
  let actual_argument_cell  = csp;
  let formal_parameter_cell = new_tos;
  let source_argument_cell  = new_tos + ( count - 1 ) * words_per_cell;

  let sentinel_csp : InoxCell;
  de&&mand_name( get_cell_name( sentinel_dsp ), tag_inox_with );
  de&&mand_type( get_cell_type( sentinel_dsp ), type_tag_id );

  while( copy_count < count ){

    // Process sentinel cell, actual argument is number of formal parameters
    if( copy_count == 0 ){
      de&&mand_name( get_cell_name( formal_parameter_cell ), tag_inox_with );
      actual_argument_cell  -= words_per_cell;
      move_cell( sentinel_dsp, actual_argument_cell );
      set_cell_value( actual_argument_cell, count - 1 );
      set_cell_type(  actual_argument_cell, type_integer_id );
      formal_parameter_cell -= words_per_cell;
      de&&mand_name( get_cell_value( formal_parameter_cell ), tag( "a") );
      de&&mand_name( get_cell_name( formal_parameter_cell ), tag( "a") );
      copy_count++;
      continue;
    }

    if( copy_count == 1 ){
      mand_name( get_cell_value( formal_parameter_cell ), tag( "a" ) );
      mand_name( get_cell_name( formal_parameter_cell ), tag( "a" ) );
    }
    if( copy_count == 2 ){
      mand_name( get_cell_name( formal_parameter_cell ), tag( "b" ) );
    }

    actual_argument_cell  -= words_per_cell;
    move_cell( source_argument_cell, actual_argument_cell );
    source_argument_cell  -= words_per_cell;

    name = get_cell_name( formal_parameter_cell );
    clear_cell( formal_parameter_cell ); // ToDo: raw?
    formal_parameter_cell -= words_per_cell;

    if( copy_count == 1 ){
      mand_name( name, tag( "a" ) );
    }
    if( copy_count == 2 ){
      mand_name( name, tag( "b" ) );
    }

    set_cell_name( actual_argument_cell, name );

    // Check that names match
    if( de  ){
      mand_name( get_cell_name( actual_argument_cell ), name );
    }

    copy_count++;
    if( copy_count == count ){
      break;
    }
  }

  // Adjust both stack pointers
  new_tos = tos + ( 2 * count - 1 ) * words_per_cell;
  this.set_dsp( new_tos );
  new_csp = csp - count  * words_per_cell;
  this.set_csp( new_csp );

} );


primitive( "inox-without-with-control",
function primitive_inox_without_with_control()
{

  let csp = this.csp();
  const limit = csp + 10 * words_per_cell;

  while( get_cell_name( csp ) != tag_inox_with ){
    clear_cell( csp );
    csp += words_per_cell;
    if( csp > limit ){
      bug( "inox-with sentinel out of reach" );
      debugger;
      break;
    }
  }

  raw_clear_cell( csp );
  csp += words_per_cell;
  this.set_csp( csp );

} );


/*
 * Read/write access to variables inside the control stack.
 */


primitive( "inox-control-get", function primitive_inox_control_get(){
// Copy the value of a control variable from the control stack to the data one
  const dsp = this.tos();
  check_de&&mand_eq( get_cell_type( dsp ), type_tag_id );
  const name = get_cell_value( dsp );
  let   ptr = this.csp();
  while( get_cell_name( ptr ) != name ){
    ptr += words_per_cell;
    if( check_de ){
      if( ptr >= ACTOR.control_stack ){
        FATAL.call( this,
        "Local variable not found, named " + tag_id_to_text( name ) );
        return;
      }
    }
  }
  copy_cell( ptr, dsp );
} );


primitive( "inox-control-set", function primitive_inox_control_set(){
// Set the value of a control variable in the control stack
  const dsp   = this.pop();
  check_de&&mand_eq( get_cell_type( dsp ), type_tag_id );
  const name = get_cell_value( dsp );
  raw_clear_cell( dsp );
  let ptr = this.csp();
  while( get_cell_name( ptr ) != name ){
    ptr += words_per_cell;
    if( check_de ){
      if( ptr >= ACTOR.control_stack ){
        FATAL.call( this,
        "Local variable not found, named " + tag_id_to_text( name ) );
        return;
      }
    }
  }
  const value_cell = this.pop();
  move_cell( value_cell, ptr );
  set_cell_name( ptr, name );
} );


/*
 * Read/write access to variables inside the data stack.
 */


primitive( "inox-data-get", function primitive_inox_data_get(){
// Copy the value of a data variable from the data stack
  const dsp  = this.tos();
  check_de&&mand_eq( get_cell_type( dsp ), type_tag_id );
  const name = get_cell_value( dsp );
  let   ptr  = dsp + words_per_cell;
  while( get_cell_name( ptr ) != name ){
    ptr += words_per_cell;
    if( check_de ){
      if( ptr > ACTOR.stack ){
        FATAL.call( this,
        "Data variable not found, named " + tag_id_to_text( name ) );
        return;
      }
    }
  }
  copy_cell( ptr, dsp );
} );


primitive( "inox-data-set", function primitive_inox_data_set(){
// Set the value of a data variable in the data stack
  const dsp  = this.pop();
  check_de&&mand_eq( get_cell_type( dsp ), type_tag_id );
  const name = get_cell_value( dsp );
  const cell = this.pop();
  let   ptr  = cell + words_per_cell;
  while( get_cell_name( ptr ) != name ){
    ptr += words_per_cell;
    if( check_de ){
      if( ptr > ACTOR.stack ){
        FATAL.call( this,
        "Data variable not found, named " + tag_id_to_text( name ) );
        return;
      }
    }
  }
  clear_cell( dsp );
  copy_cell( cell, ptr );
  set_cell_name( ptr, name );
} );


primitive( "inox-size-of-cell", function primitive_inox_size_of_cell(){
  const cell = this.push();
  copy_cell( the_integer_work_cell, cell );
  de&&mand_eq( get_cell_value( cell ), 0 );
  set_cell_value( cell, size_of_cell );
} );


/*
 * Indirect access to variables, like pointers in C
 */


primitive( "inox-lookup", function primitive_find(){
// Get the address of a named value inside a range of cells, or void
  const end_cell   = this.pop();
  const end_ptr    = get_cell_value( end_cell );
  const start_cell = this.pop();
  const start_ptr  = get_cell_value( start_cell );
  const dsp = this.tos();
  const name = get_cell_name( dsp() );
  let found = 0;
  let ptr = start_ptr;
  if( start_ptr < end_ptr ){
    while( true ){
      if( get_cell_name( ptr ) == name ){
        found = ptr;
        break;
      }
      if( ptr == end_ptr )break;
      ptr++;
    }
  }else{
    while( true ){
      if( get_cell_name( ptr ) == name ){
        found = ptr;
        break;
      }
      if( ptr == end_ptr )break;
      ptr--;
    }
  }
  if( found ){
    set_cell_value( dsp, found );
  }else{
    raw_clear_cell( dsp )
  }
} );


/* -----------------------------------------------------------------------------
 *  Object creation and access to the it variable.
 */


// Javascript uses "this", some other languages use "self".
const tag_it = tag( "it" );


function make_circular_object_from_js( obj : any, met : Map< String, any> ){

  // The first item is the name of the class.
  const class_name = tag( obj.constructor.name );

  // How many properties are there inside that object?
  const keys = obj.keys();
  const length = keys.length;

  // Allocate enough memory to hold all of that
  const cell = allocate_bytes( length * size_of_cell );

  // First cell is name:length
  set_cell_value( cell, length );
  set_cell_info( cell, pack( type_integer_id, class_name ) );
  let top = cell + size_of_word;

  // Them come the properties, numeric indexes first, then named
  let ii : InoxIndex = 0;

  // Inox does handle sparse arrays
  // ToDo: implement sparse arrays, the Lua way.
  let sparse_idx = 0;

  if( length == 0 )return;

  // Check if object is an array, when it starts with numeric keys
  const first_key = obj[ 0 ];

  // First, process the array part, then the map part
  let array_part = true;
  const tag_item = tag( "item" );
  let name = tag_void;
  let value;
  while( ii < length ){
    const key = keys[ ii++ ];
    if( array_part ){
      if( typeof key != "number" ){
        array_part = false;
      }
      const idx : InoxIndex = key;
      // Detect floats
      if( !Number.isInteger( idx ) ){
        array_part = true;
      }else{
        // Detect sparse array
        if( idx != sparse_idx ){
          array_part = false;
        }else{
          sparse_idx = idx;
        }
      }
    }
    value = obj[ key ];
    if( array_part ){
      name = tag_item;
    }else{
      name = tag( key );
    }
    // Depending on type
    let new_cell : InoxCell;
    const js_type = typeof value;

    if( js_type == "number" ){
      if( Number.isInteger( value ) ){
        new_cell = make_integer_cell( value );
      }else{
        // ToDo: new_cell = make_float_cell( value )
      }

    }else if( js_type == "boolean" ){
      new_cell = make_integer_cell( value ? 1 : 0 );

    }else if( js_type == "string" ){
      new_cell = make_text_cell( value );

    }else if( js_type == "object" ){
      new_cell = make_circular_object_from_js( value, met );
    }
    if( new_cell == the_void_cell ){
      // Already void
    }else{
      move_cell( new_cell, top );
      set_cell_name( top, name );
      free_cell( new_cell );
    }
    top += words_per_cell;
  }

  return cell;

}


function make_object_from_js( obj : any ) : InoxCell {
// Build a new Inox object from a Javascript one, a deep clone.
  // Handle circular pointers
  let met_objects = new Map< String, any >;
  const new_cell = make_circular_object_from_js( obj, met_objects );
  // Free whatever memory the map uses
  met_objects = null;
  return new_cell;
}


primitive( "inox-make-object", function primitive_inox_make_object() {
// Make an object from values plus header. v1 v2 ... vnn name:nn -- name:ptr
// Returns a pointer value that points to the new object in dynamic memory.
// Whenever that pointer is copied, a reference counter is incremented.
// Whenever a pointer is disposed, the counter is decremented.
// When the counter reaches zero, each member is also disposed and the
// dynamic memory to store the object is released back to the heap of
// cells.
  const header = this.tos();
  const name   = get_cell_name( header );
  const length = get_cell_value( header );
  // Allocate a cell for the class/length and cells for the values
  const dest   = allocate_bytes( ( 1 + length ) * size_of_cell );
  if( dest == 0 ){
    // ToDo: raise an exception
    set_cell_value( the_integer_work_cell, 0 );
    copy_cell( the_integer_work_cell, this.tos() );
    return;
  }
  // ToDo: no values should raise an exception
  let ii : InoxIndex = 0;
  while( true ){
    move_cell(
      header + ii * words_per_cell,
      dest   + ii * words_per_cell
    );
    if( ii == length )break;
    ii++;
  }
  // The first element is the named length
  // ToDo: the length is redundant with info in malloc
  de&&mand_eq( get_cell_value( dest ), length );
  const dsp = header + ii * words_per_cell
  this.set_dsp( dsp );
  raw_set_cell( dsp, type_pointer_id, name, dest );
} );


primitive( "inox-object-get", function primitive_inox_object_get(){
// Copy the value of an instance variable from an object
  const dsp = this.pop();
  const obj = dsp + words_per_cell;
  let ptr = get_cell_value( obj );
  // Void from void
  if( ptr == 0x0 ){
    de&&mand( get_cell_info( obj ) == 0 );
    clear_cell( dsp );
    return
  }
  if( check_de ){
    if( get_cell_type( obj ) != type_pointer_id ){
      // ToDo: fatal error
      de&&mand_eq( get_cell_type( obj ), type_pointer_id );
      return;
    }
  }
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
  clear_cell( dsp );
  copy_cell( ptr, obj );
} );


primitive( "inox-object-set", function primitive_inox_object_set(){
// Set the value of an instance variable of an object.
  const name_cell = this.pop();
  const name = get_cell_name( name_cell );
  const obj = this.pop();
  const dsp = this.pop();
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
  // Skip the class name & length header first cell
  ptr += words_per_cell;
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
  clear_cell( ptr );
  move_cell( dsp, ptr );
  // Preserve initial name
  set_cell_name( ptr, name );
  clear_cell( obj );
  clear_cell( name_cell );
} );


primitive( "inox-with-it", function primitive_inox_with_it(){
// Create and initialize an it control variable in the control stack
  const csp = this.csp() - words_per_cell;
  move_cell( this.pop(), csp );
  set_cell_name( csp, tag_it );
  this.set_csp( csp  );
} );


primitive( "inox-without-it", function primitive_inox_without_it(){
// Clear the control stack down to the it control variable included
  let cell = this.csp();
  let found = false;
  let limit = 10;
  while( !found ){
    if( get_cell_name( cell ) === tag_it ){
      found = true;
    }
    clear_cell( cell );
    cell += words_per_cell;
    if( limit-- == 0 ){
      FATAL.call( this, "inox-without-it, it missing" );
      return;
    }
  }
  this.set_csp( cell );
} );


primitive( "inox-without", function primitive_inox_without(){
  // Clear control stack up to the specified control variable included
  const tos = this.pop();
  de&&mand_eq( get_cell_type( tos ), type_tag_id );
  const name = get_cell_name( tos );
  raw_clear_cell( tos );
  let cell = this.csp();
  let found = false;
  let limit = 10;
  while( !found ){
    if( get_cell_name( cell ) === name ){
      found = true;
    }
    clear_cell( cell );
    cell += words_per_cell;
    if( limit-- == 0 ){
      FATAL.call( this, "inox-without, missing " + tag_id_to_text( name ) );
      return;
    }
  }
  this.set_csp( cell );
} );

primitive( "inox-it", function primitive_inox_it(){
// Push the value of the it control variable onto the data stack
  let   ptr  = this.csp();
  while( get_cell_name( ptr ) != tag_it ){
    ptr += words_per_cell;
    if( check_de ){
      if( ptr >= ACTOR.control_stack ){
        FATAL.call( this,
        "Local variable 'it' not found" );
      }
    }
  }
  const dsp = this.push();
  copy_cell( ptr, dsp );
} );


function set_text_cell( cell : InoxCell, text : text ){
// Make a cell into a text cell
  const temp_text = make_text_cell( text );
  move_cell( temp_text, cell );
  free_cell( temp_text );
}


function set_tag_cell( cell : InoxCell, name : InoxTag ){
  clear_cell( cell );
  set_cell_info( cell, pack( type_tag_id, name ) );
  set_cell_value( cell, name );
}


primitive( "inox-call-method-by-name",
  function primitive_inox_call_method_by_text_name(){
// Call method by name
  const tos = this.pop();
  const name_id = get_cell_value( tos );
  const name = tag_id_to_text( name_id );
  clear_cell( tos );
  let target = this.tos();
  const target_type = get_cell_type( target );
  // ToDo: lookup using name of value ?
  let target_class_name = tag_id_to_text( get_cell_type_tag( target ) );
  const full_name = target_class_name + "." + name;
  let word_id = get_inox_word_id_by_text_name( full_name );
  if( word_id == 0 ){
    // ToDo: lookup in class hierarchy
    // ToDo: on the fly creation of the target method if found
    if( word_id == 0 ){
      // ToDo: lookup based on type, unless pointer
      if( target_type != type_pointer_id ){
        // ToDo: get type as string, then add : and method name
      }
      if( word_id == 0 ){
        set_tag_cell( this.push(), name_id );
        word_id = get_inox_word_id_by_text_name( "method-missing" );
      }
    }
  }
  this.set_csp( this.csp() - words_per_cell );
  set_cell_value( this.csp(), this.ip() );
  set_cell_name( this.csp(),  tag( full_name ) );
  this.set_ip( get_inox_word_definition_by_tag( word_id ) );
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
  set_cell_value( the_integer_work_cell, this.tos() );
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
 *  runner, fast, execute Inox words
 */


const type_primitive_id = type_void_id;


function ip(){  return IP;  }
function csp(){ return CSP; }
function tos(){ return DSP; }
function set_ip(  v : InoxAddress ){ IP  = v; }
function set_csp( v : InoxAddress ){ CSP = v; }
function set_dsp( v : InoxAddress ){ DSP = v; }
function push(){ return DSP -= words_per_cell; }
function pop(){  return DSP += words_per_cell; }


class InoxExecutionContext {
  ip:      Function;  // The instruction pointer
  csp:     Function;  // top of control stack pointer
  tos:     Function;  // top of data stack pointer
  set_ip:  Function;  // Set the instruction pointer
  set_csp: Function;  // Set top of control stack pointer
  set_dsp: Function;  // Set top of data stack pointer
  pop:     Function;  // Returns tos++
  push:    Function;  // Returns --tos
  run:     Function;  // Points to run_fast()
}

const TheInoxExecutionContext = new InoxExecutionContext();


function init_the_execution_context(){
  const inox = TheInoxExecutionContext;
  inox.ip      = ip;
  inox.csp     = csp;
  inox.tos     = tos;
  inox.set_ip  = set_ip;
  inox.set_csp = set_csp;
  inox.set_dsp = set_dsp;
  inox.push    = push;
  inox.pop     = pop;
  inox.run     = run_fast;
}

init_the_execution_context();


function run_fast(){
// This is the one function that needs to run fast.
// It should be optimized by hand depending on the target CPU.
  // See https://muforth.nimblemachines.com/threaded-code/
  // Also http://www.ultratechnology.com/1xforth.htm
  // and http://www.bradrodriguez.com/papers/moving1.htm

  de&&mand( DSP <= ACTOR.stack );
  de&&mand( !! IP );

  // primitives have a limited access to the environment, but fast
  const inox = TheInoxExecutionContext;
  inox.ip  = function ip(){  return IP;  };
  inox.csp = function csp(){ return CSP; };
  inox.tos = function tos(){ return DSP; };
  // ToDo: gmp & tmp, global memory pointer and actor memory pointer
  // ToDo: act, current Act pointer
  inox.set_ip  = function set_ip(  v : InoxAddress ){ IP  = v; };
  inox.set_csp = function set_csp( v : InoxAddress ){ CSP = v; };
  inox.set_dsp = function set_dsp( v : InoxAddress ){ DSP = v; };

  inox.push = function push(){
    return DSP -= words_per_cell;
  };

  inox.pop = function pop(){
    const x = DSP;
    DSP += words_per_cell;
    return x;
  }

  // Avoid infinite loops
  let credit_increment = 1000000;
  let remaining_credit = credit_increment;
  let total  = 0;
  let must_stop = false;

  inox.run = run_fast;

  // inox.run = runner;

  // function runner(){

  loop: while( true ){

    // ToDo: there should be a method to break this loop
    if( must_stop )break;

    // ToDo: the credit could vary depending on speed, ie instructions/second.
    remaining_credit = credit_increment;

    let info : InoxInfo;
    let type : InoxType;

    // ToDo: there should be a method to break this loop
    inner_loop: while( remaining_credit-- ){

      if( !IP )break loop;
      info = get_cell_info( IP );

      // The non debug loop is realy short
      if( !de ){
        type = unpack_type( info );
        // If primitive
        if( type == type_primitive_id /* 0 */ ){
          IP += words_per_cell;
          get_primitive_function_by_id( info ).call( inox );
        // If Inox defined word
        }else if( type == type_word_id ){
          CSP -= words_per_cell;
          set_cell_value( CSP, IP + words_per_cell );
          // I could use a cached new IP
          // IP = get_cell_value( cell ); if( IP )continue;
          IP = get_inox_word_definition_by_tag( unpack_name( info ) );
          // ToDo: I could cache the result inside the cell's value
          // set_cell_value( cell, IP );
        // If literal
        }else{
          DSP -= words_per_cell;
          copy_cell( IP, DSP );
          IP += words_per_cell;
        }
        continue inner_loop;
      }

      // The debug mode version has plenty checks and traces

      if( stack_de ){
        bug( "\nRUN IP: " + inox_machine_code_cell_to_text( IP ) + "\n"
        + stacks_dump( DSP, CSP ) );
      }else if( run_de ){
        bug( "\nRUN IP: " + inox_machine_code_cell_to_text( IP ) );
      }

if( step_de )debugger;

      // Special "next" code, 0x0000, is a jump to the return address.
      // Machine code equivalent would be a return from subroutine.
      if( info == 0x0000 ){
        IP = get_cell_value( CSP );
        if( run_de ){
          bug( "run, return to IP " + IP + " from "
          + get_cell_name( CSP ) );
        }
        raw_clear_cell( CSP );
        if( IP == 0x0000 )break loop;  // That's the only way to exit the loop
        CSP += words_per_cell;
        continue;
      }

      // What type of code this is, primitive, Inox word or literal
      type = unpack_type( info );

      // Call to another word, the name of the cell names it
      if( type == type_word_id ){
        // Push return address into control stack
        CSP -= words_per_cell;
        set_cell_value( CSP, IP + words_per_cell );
        // Store routine name also, cool for stack traces
        // ToDo: set type to Act?
        // ToDo: i could encode a word to execute that would sometimes
        // do something more sophisticated that just change the IP.
        set_cell_info( CSP, info & 0xfff );
        // ToDo: The indirection could be avoided.
        // ToDo: cache the address of the defininition into cell's value
        // ToDo: alternatively the cache could be orecomputed by add_code()
        IP = get_inox_word_definition_by_tag( unpack_name( info ) );
        // bug( inox_word_to_text_definition( unpack_name( word ) ) );
        continue;
      }

      // Call to a primitive, the name of the cell names it.
      // ToDo: use a type instead of tricking the void type?
      if( type == type_void_id /* 0 */ ){

        IP += words_per_cell;

        // Some debug tool to detect bad control stack or IP manipulations
        let word_id = info;
        if( run_de && ( word_id ) != 61 ){  // inox-quote is special

          let old_ip  = IP;
          let old_csp = CSP;

          let fun = all_primitive_functions_by_id[ word_id ];
          if( de ){
            if( !fun )debugger
          }
          fun.call( inox );

          if( CSP != old_csp
          && word_id != tag( "inox-return" )
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
          && word_id != tag( "inox-without-it" )
          && word_id != tag( "inox-from-control" )
          && word_id != tag( "inox-control-create" )
          && word_id != tag( "inox-without" )
          && word_id != tag( "inox-sentinel" )
          && word_id != tag( "inox-jump" )
          && word_id != tag( "inox-with-control" )
          && word_id != tag( "inox-without-with-control" )
          ){
            if( CSP < old_csp ){
              bug( "??? small CSP, excess calls "
              + ( old_csp - CSP ) / words_per_cell );
            }else{
              bug( "??? big CSP, excess returns "
              + ( CSP - old_csp ) / words_per_cell );
            }
            de&&bug( "Due to " + fun.name
            + ", " + inox_machine_code_cell_to_text( old_ip ) );
            debugger;
            // CSP = old_csp;
          }
          if( IP && IP != old_ip ){
            bug( "run, IP change, was " + old_ip + ", due to "
            + inox_machine_code_cell_to_text( old_ip ) );
          }
          if( IP == 0 ){
            bug( "run, IP 0 due to " + fun.name );
            // break loop;  // That's not supposed to be a way to exit the loop
          }


        }else{
          all_primitive_functions_by_id[ word_id ].call( inox );
          // if( IP == 0 )break loop;
        }

        continue;
      }

      // Else, push literal
      DSP -= words_per_cell;
      copy_cell( IP, DSP );
      // ToDo: optimize by inlining copy_cell()
      // set_cell_value( DSP, get_cell_value( IP ) );
      // set_cell_info(  DSP, word );
      // if( is_reference_cell( IP ) ){
      //   increment_object_refcount( get_cell_value( IP ) );
      // }
      IP += words_per_cell;

    }  // while( credit-- > 0 )

    // Update total number of instructions
    total += credit_increment - remaining_credit;

  }  // until must stop

  // } // runner()

  // runner();

} // run_fast()


function run(){

  const actor = ACTOR;
  de&&mand( DSP <= ACTOR.stack );
  de&&mand( DSP >  ACTOR.memory );

  run_fast();

  de&&mand( actor == ACTOR );
  de&&mand( DSP <= ACTOR.stack );
  de&&mand( DSP >  ACTOR.memory );

}


function run_inox_word( word : text ){
  IP = get_inox_word_definition_by_text_name( word );
  de&&mand( !! IP );
  run();
}


/* ----------------------------------------------------------------------------
 *  Aliases and dialects.
 *  An alias is an arbitray text that will replace the next token produced
 *  by the tokenizer. The new text is then scanned again to find the new next
 *  token. That new token can be aliased too, and so on.
 *  Dialects are a way to regroup multiple aliases under a common name space.
 *  In addition to aliases, each dialect define some special character sequences
 *  for the tokenizer, including the style of one liner and multiple lines
 *  comment and a few other things like "to" for word definitions and the dot
 *  terminator, etc.
 */

// Each dialect has a map of alias to text.
let the_current_style_aliases = new Map< text, text >();
const all_aliases_by_style = new Map< text, Map< text, text > >();


function define_alias( style : text, alias : text, word : text ){
// Set the definition of an alias inside a dialect/style.
  let aliases = get_aliases_by_style( style );
  aliases.set( alias, word );
}


function get_alias( a : text ){
// Get the potential aliased text for an alias in the durrent dialect/style.
  if( !  the_current_style_aliases.has( a ) )return null;
  return the_current_style_aliases.get( a );
}


function alias( a : text ){
  if( !  the_current_style_aliases.has( a ) )return a;
  return the_current_style_aliases.get( a );
}


function set_alias_style( style : text ) : void {
  the_current_style_aliases = all_aliases_by_style.get( style );
}


function get_aliases_by_style( style : text ) : Map< text, text > {
  if( ! all_aliases_by_style.has( style ) ){
    // On the fly style creation
    return make_style_aliases( style );
  }
  return all_aliases_by_style.get( style );
}


function make_style_aliases( style : text ) : Map< text, text > {
// Add a new dialect/style, named.
  let new_map = new Map< text, text >();
  all_aliases_by_style.set( style, new_map );
  return new_map;
}


// Some predefined dialects/styles
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
// Add an alias to the current style/dialect
  const new_text_cell = this.pop();
  const new_text = cell_to_text( new_text_cell );
  clear_cell( new_text_cell );
  const old_text_cell = this.pop();
  const word = cell_to_text( old_text_cell );
  // ToDo: should check that old text is a token
  clear_cell( old_text_cell );
  define_alias( tokenizer.style, word, new_text );
} );


/* ----------------------------------------------------------------------------
 *  word and block compilation related.
 */

// In that mode, Inox source code evaluator treats all words as if immediate.
let immediate_mode_level : InoxIndex = 0;

// This is the id of the word beeing defined or last defined
let the_last_inox_word_defined : InoxIndex = 0;

let the_last_quoted_word_id    : InoxIndex = 0;

// Last tokenized word. ToDo: used
const the_last_token_cell = make_integer_cell( 0 );

// These functions are defined in inox_eval()
let eval_quote_next_token_function  : Function;
let eval_do_literal_function        : Function;
let eval_do_machine_code_function   : Function;
let eval_begin_block_function       : Function;
let eval_end_block_function         : Function;
let eval_begin_definition_function  : Function;
let eval_end_definition_function    : Function;


immediate_primitive( "inox{", function primitive_inox_enter_immediate_mode(){
  immediate_mode_level++;
} );


immediate_primitive( "}inox", function primitive_inox_leave_immediate_mode(){
  de&&mand( !! immediate_mode_level );
  immediate_mode_level--;
} );


primitive( "inox-literal", function primitive_inox_literal(){
// Add a literal to the Inox word beeing defined or to a block
  const cell = fast_allocate_cell();
  move_cell( this.pop(), cell );
  eval_do_literal_function.call( this, cell );
} );


primitive( "inox-machine-code", primitive_inox_do_machine_code );
function                        primitive_inox_do_machine_code(){
// Add an Inox word code id to the Inox word beeing defined or to a block
  const tos = this.pop();
  de&&mand_eq( get_cell_type( tos ), type_integer_id );
  eval_do_machine_code_function.call( this, get_cell_value( tos ) );
  raw_clear_cell( tos );
}


primitive( "inox", function primitive_inox(){
// Read the next token from the source code input stream
// and get it's Inox word code id. Defaults to 0 if next token in source
// is not a defined Inox word.
// ToDo: could return a string instead of 0.
  eval_quote_next_token_function.call( this );
} );


primitive( "inox-quote", function primitive_inox_quote(){
// Get the next word from the currently executing word and skip it
  // MUST BE INLINED
  const ip = this.ip();
  let word_id = get_cell_name( ip );
  the_last_quoted_word_id = word_id;
  set_cell_value( the_integer_work_cell, word_id );
  copy_cell(      the_integer_work_cell, this.push() );
  // Skip the quoted word
  this.set_ip( ip + words_per_cell );
} );


primitive( "inox-immediate", function primitive_inox_immediate(){
  set_inox_word_immediate_flag( the_last_inox_word_defined );
} );


primitive( "inox-hidden", function primitive_inox_hidden(){
  set_inox_word_hidden_flag( the_last_inox_word_defined );
} );


primitive( "inox-operator", function primitive_inox_operator(){
  set_inox_word_operator_flag( the_last_inox_word_defined );
} );


primitive( "inox-inline", function primitive_inox_inline(){
  set_inline_inox_word_flag( the_last_inox_word_defined );
} );


primitive( "inox-last-token", function primitive_inox_last_token(){
  copy_cell( the_last_token_cell, this.push() );
} );


/* -------------------------------------------------------------------------
 *  ip manipulation
 */

primitive( "inox-tag", function primitive_inox_tag(){
// Make a tag, from a text typically
  const tos = this.tos();
  set_cell_value( the_tag_work_cell, tag( cell_to_text( tos ) ) );
  copy_cell( the_tag_work_cell, tos );
} );


primitive( "inox-call-by-tag", primitive_inox_call_by_tag );
function                       primitive_inox_call_by_tag(){
// Call word by name. ToDo: two versions, by-tag & by-text-name
  const tos = this.pop();
  de&&mand_type( type_tag_id, get_cell_type( tos ) );
  let word_id = get_cell_value( tos );
  raw_clear_cell( tos );

  // Lookup word, detect missing ones
  if( word_id == 0 ){
    set_text_cell( this.push(), tag_to_text( word_id ) );
    word_id = get_inox_word_id_by_text_name( "word-missing" );
  }

  // Push return address onto control stack
  const next_csp = this.csp() - words_per_cell;
  this.set_csp( next_csp );
  de&&mand_eq( get_cell_value( next_csp), 0 );
  set_cell_value( next_csp, this.ip() );
  set_cell_name( next_csp,  word_id );

  // Jump to word definition
  const def = get_inox_word_definition_by_tag( word_id );
  de&&mand( def != 0 );
  this.set_ip( def );
}


primitive( "inox-call-by-name", primitive_inox_call_by_text_name );
function                        primitive_inox_call_by_text_name(){
// Call word by name. ToDo: two versions, by-tag & by-text-name
  const tos = this.tos();
  const name = cell_to_text( tos );
  clear_cell( tos );

  // Lookup word, detect missing ones
  let word_id = get_inox_word_id_by_text_name( name );
  if( word_id == 0 ){
    set_text_cell( this.push(), name );
    word_id = get_inox_word_id_by_text_name( "word-missing" );
  }

  set_cell_value( tos, word_id );
  set_cell_type(  tos, type_tag_id );

  primitive_inox_call_by_tag.call( this );

}


primitive( "inox-definition", function primitive_inox_definition(){
// Get the address of the first element of the definition of a word
  const dsp = this.tos();
  const name = cell_to_text( dsp );
  const word_id = get_inox_word_id_by_text_name( name );
  if( word_id == 0 ){
    set_cell_value( the_integer_work_cell, 0 );
    copy_cell( the_integer_work_cell, dsp );
    return;
  }
  const ip = get_inox_word_definition_by_tag( word_id );
  set_cell_value( the_integer_work_cell, ip );
  copy_cell( the_integer_work_cell, dsp );
} );

// ToDo: inox-block-length & inox-word-flags

const tag_inox_call = tag( "inox-call" );


function primitive_inox_call(){
// run block unless none
  // Get block address
  const tos = this.pop();
  const block = get_cell_value( tos );
  // Do nothing if none
  if( block == 0 )return;
  if( de ){ clear_cell_value( tos ); }
  if( de && block < 5000 ){
    bug( "Not a block at " + block );
    debugger;
    return;
  }
  // Push return address
  const csp = this.csp();
  const ip  = this.ip();
  const next_csp = csp - words_per_cell;
  set_cell_value( next_csp, ip );
  set_cell_info(  next_csp, tag_inox_call );
  this.set_csp( next_csp );
  // Jump into block definition
  const return_ip = block + 1 * words_per_cell;
  this.set_ip( return_ip );
}
primitive( "inox-call", primitive_inox_call );


primitive( "inox-if-call", function primitive_inox_if_call(){
  primitive_inox_if.call( this );
  primitive_inox_call.call( this );
} );


primitive( "inox-run", function primitive_inox_run(){
  // "inox Hello inox-run" does what Hello does alone
  this.set_ip( get_inox_word_definition_by_tag( get_cell_value( this.pop() ) ) );
  // ToDo: check missing word
} );


const tag_block_length = tag( "block-length" );


primitive( "inox-block", function primitive_inox_block(){
// Skip block code after IP but push it's address. Ready for inox-call
  const ip = this.ip();
  check_de&&mand_eq( get_cell_name( ip ), tag_block_length );
  const block_length = get_cell_value( ip );
  if( check_de ){
    de&&mand( block_length != 0 );
    // For debugging purpose I store the block's ip somewhere
    set_cell_value( the_block_work_cell, ip );
    copy_cell( the_block_work_cell, this.push() );
  }else{
    const new_dsp = this.push();
    de&&mand_eq( get_cell_value( new_dsp ), 0 );
    set_cell_value( new_dsp, ip );
  }
  const new_ip = ip + ( 1 + block_length ) * words_per_cell;
  if( de ){
    const previous_cell = new_ip - words_per_cell;
    const previous_cell_value = get_cell_value( previous_cell );
    const previous_cell_type  = get_cell_type( previous_cell );
    const previous_cell_name  = get_cell_name( previous_cell );
    de&&mand_eq( previous_cell_value, 0 );
    de&&mand_eq( previous_cell_type, type_void_id );
    de&&mand_eq( previous_cell_name, tag_inox_return );
    //if( previous_cell_name != tag( "void" ) ){
    //  bug( "Bad opcode, not void, " + tag_id_to_text( previous_cell_name))
    //}
    //de&&mand_eq( previous_cell_name, tag( "void" ) );
  }
  this.set_ip( new_ip );
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


abstract class TextStreamIterator {
  // Get next text to tokenize. REPL would readline() on stdin typically
  abstract next() : text;
}


class TokenizerContext {

  style : text                  = "";
  define : text                 = "";  // "to" when Inox style
  end_define : text             = "";  // "." when Inox style
  terminator_sign : text        = ";"; // ";" when Inox style
  separator_sign : text         = ","; // Treated as a whitespace, decorative
  comment_monoline_begin        = "";  // "//" when Inox style
  comment_monoline_begin_begin  = "";
  comment_multiline_begin       = "";  // "/*" when Inox style
  comment_multiline_begin_begin = "";
  comment_multiline_end         = "";  // "*/" when Inox style
  comment_multiline_end_end     = "";

  stream       : TextStreamIterator;  // ToDo: for future REPL

  text         : text           = ""; // Being tokenized text
  text_length  : number         = 0;
  line_number  : number         = 0;  // ToDo: urealiable, buggy
  column       : number         = 0;
  text_cursor  : number         = 0;
  alias_cursor : number         = 0;

  first_comment_seen : boolean  = false;  // For style auto detection

  back_token   : Token          = void_token;  // One token ahead sometime
  post_literal_name             = "";  // ToDo: weird, explain

  last_front_spaces_count       = 0;  // Indentation based definition auto close
  non_space_seen                = false; // Indentation detection related

  // The last seen token
  token : Token = {
    type   : "",
    value  : "",
    index  : 0,
    line   : 0,
    column : 0
  };

  eager_mode : boolean = false; // When set, whitespaces are the only separators

}

let tokenizer : TokenizerContext = new TokenizerContext();


function set_style( new_style : text ) : void {
// Set the new style for future tokens detections

  set_alias_style( new_style );

  if( new_style == "inox" ){
    tokenizer.comment_monoline_begin        = "~~";
    tokenizer.comment_monoline_begin_begin  = "~";
    tokenizer.comment_multiline_begin       = "~|";
    tokenizer.comment_multiline_begin_begin = "~";
    tokenizer.comment_multiline_end         = "|~";
    tokenizer.comment_multiline_end_end     = "~";
    // Using "to" is Logo style, it's turtles all the way down
    tokenizer.define = "to";
    tokenizer.end_define = ".";

  }else if( new_style == "c"
  ||        new_style == "javascript"
  ){
    tokenizer.comment_monoline_begin        = "//";
    tokenizer.comment_monoline_begin_begin  = "/";
    tokenizer.comment_multiline_begin       = "/*";
    tokenizer.comment_multiline_begin_begin = "/";
    tokenizer.comment_multiline_end         = "*/";
    tokenizer.comment_multiline_end_end     = "/";
    if( new_style == "javascript" ){
      tokenizer.define = "function";
      tokenizer.end_define = "}";
    }

  }else if( new_style == "sh" ){
    tokenizer.define = "function";
    tokenizer.comment_monoline_begin        = "#";
    tokenizer.comment_monoline_begin_begin  = "#";
    tokenizer.comment_multiline_begin       = "";
    tokenizer.comment_multiline_begin_begin = "";
    tokenizer.comment_multiline_end         = "";
    tokenizer.comment_multiline_end_end     = "";
    tokenizer.define = "function";
    tokenizer.end_define = "}";

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


function tokenizer_set_stream( stream : TextStreamIterator ){
  tokenizer.stream = stream;
}


function tokenizer_restart( source : text ){

  // The source code to process.
  tokenizer.stream      = null;
  tokenizer.text        = source;
  tokenizer.text_length = source.length;

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
// Get next character in source code, or void
  const tos = this.push();
  const ch = tokenizer_peek();
  set_text_cell( tos, ch );
} );


const tag_token = tag( "token" );

primitive( "inox-input-until", function primitive_inox_input_until(){
  const tos = this.tos();
  let limit = cell_to_text( tos );
  let buf = "";
  let ch : text ;
  while( true ){
    ch = tokenizer_peek();
    if( ch == "" ){
      // Return void if source is empty
      clear_cell( tos );
      return;
    }
    if( ch == limit ){
      set_text_cell( tos, buf );
      set_cell_name( tos, tag_token );
      return;
    }
    buf += ch;
  }
} );


function unget_token( token : Token ) : void {
  tokenizer.back_token = token;
}


primitive(
  "inox-pushback-token",
  function primitive_inox_pushback_token(){
    const cell = this.pop();
    const name = get_cell_name( cell );
    unget_token( {
      type:   tag_id_to_text( name ),
      value:  cell_to_text( cell ),
      index:  0,
      line:   0,
      column: 0
    } );
  }
);


function tokenizer_peek() : text {
// Get/consume next token, or ""
  if( tokenizer.text_cursor >= tokenizer.text_length )return "";
  const ch = tokenizer.text[ tokenizer.text_cursor++ ];
  return ch;
}


function tokenizer_pushback( ch : "" ){
  // ToDo: do I need this?
}


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
  let buf = "";

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
    if( ch != "\n" && ch != "\r" )return false;
    return true;
  }

  function ch_is_limit( ch : text, next_ch : text ){
    if( ch == " " )return true;
    if( tokenizer.eager_mode )return false;
    if( tokenizer.style != "inox" )return false;
    if( ch == ":"
    ||  ch == ";"  // ToDo: ?
    ||  ( ch == "/" && next_ch != "(" ) // /a/b/c is /a /b /c, a/b/c is a/ b/ c
  //||  ch == "^"  // ToDo: ?
  //||  ch == "."  // ToDo: notation where x .b( c ) eqv c x .:b eqv c x /b .:
  //||  ch == "'"  // ToDo: xxx'yyy eqv xxx.yyy ?  _point'x _point'out()
  //||  ch == "`"  // ToDo: back tick for Lisp like quote ?
    || ( ch == "(" && next_ch == ")" ) // x() is x( and then )
    ){
      return true;
    }else{
      return false;
    }
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
      // If there is a stream, try to get more text from it
      if( tokenizer.stream ){
        const more_text = tokenizer.stream.next();
        if( more_text != "" ){
          tokenizer.text = more_text;
          tokenizer.text_length = more_text.length;
          ch = more_text[ 0 ];
          ii = 1;
          previous_ii = 0;
        }else{
          is_eof = true;
        }
      }else{
        is_eof = true;
      }
      if( is_eof && state != "word" && state != "comment" ){
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
    if( is_space && state != "comment" && state != "text" ){
      ch = " ";
    }

    // If end of line, detect it
    if( is_eol ){
      // Line numbering, don't double when \r\n
      if( ch != "\r" ){
        tokenizer.line_number++;
      }
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
        && front_spaces == 0  // ToDo: make it possible not just one level 0
        ){
          token.type = "terminating;";
          tokenizer.last_front_spaces_count = front_spaces;
          // Make sure non space is processed next time
          ii--
          break eat;
        }
        tokenizer.last_front_spaces_count = front_spaces;
      }
    }

    // State machine :
    // base -> word ->
    // base -> text ->
    // base -> comment -> base

    // Base state, the initial state of the automata
    if( state == "base" ){

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
      }

      // Comments start differently depending on style
      buf += ch;

      // If start of comment, change state
      if( buf == tokenizer.comment_monoline_begin
      ||  buf == tokenizer.comment_multiline_begin
      ){
        buf = buf.slice( 0, -1 );
        state = "comment";

      }else{

        // If potential start of comment, keep eating
        if( buf == tokenizer.comment_monoline_begin_begin
        || buf == tokenizer.comment_multiline_begin_begin
        ){
          continue eat;
        }

        // Forget buffer but keep the false start of comment part
        if( buf[0] == tokenizer.comment_monoline_begin_begin
        ||  buf[0] == tokenizer.comment_multiline_begin_begin
        ){
          buf = buf.slice( 0, -1 );
        } else {
          buf = "";
        }

        // Change state, the new ch will be added to the buffer, see below
        state = "word";
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


        // Inox style of comments, ~~ and ~| xxx |~
        if( ch == "~" ){
          set_style( "inox" );

        // sh shell type of comments, #
        }else if( ch == "#" ){
          set_style( "sh" );

        // C style of comments, either // or /* xxx */
        }else if( ch == "/" ){
          set_style( "c" );

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
          buf.length - 1  // - tokenizer.comment_monoline_begin.length
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

    // Collect text until final ". Multiline is ok.
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
      if(  is_space ){
        // ToDo: refactor
        let aliased = get_alias( buf );
        // If simple word substitution with an alias
        if( aliased && aliased.indexOf( " " ) == -1 ){
          token.value = aliased;
          state = "base";
          break eat;
        // Unless no alias or alias expands into more than a simple word
        }else if( !aliased ){
          token.value = buf;
          state = "base";
          break eat;
        }
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

      // . is a token if alone
      if( ch == tokenizer.end_define
      && !tokenizer.eager_mode
      ){
        is_limit = buf.length != 0 || ch_is_space( next_ch[ 0 ] );

      // ; is a token
      }else if( ch == tokenizer.terminator_sign
      && !tokenizer.eager_mode
      ){
        is_limit = true;

      // Some other special characters are a limit too
      }else{
        is_limit = ch_is_limit( ch, next_ch[ 0 ] );
      }

      // If no limit is reached, add new character to buffer and keep going
      if( ! is_limit ){
        buf += ch;
        continue eat;
      }

      // If there was nothing before the limit, emit a single char token
      if( buf.length == 0 && ! is_space ){
        if( ch != "/" ){
          token.value = ch;
        }else{
          if( buf.length == 0 ){
            buf += "/";
            continue eat;
          }
        }

      // If there was something before the limit, deal with that
      }else if( buf.length >= 0 ){

        // xx(, xx[ and xx{ are words of a special type.
        // so is xxx: when before a space or /xxx/yyy which is /xxx
        if( ch == "("
        ||  ch == '['
        ||  ch == '{'
        ||  ( ch == ':' && next_ch[ 0 ] == " " )
        || ch == '/' && buf[0] != "/"
        ){
         buf = buf + ch;
         ii++;

        // ) and } are also words of a special type
        } else if( ( ch == ")" || ch == "}" ) && ch_is_limit( next_ch[ 0 ], "" )
        ){
          buf = buf + ch;
          ii++;

        // xxx:", xxx:123, xxx:-123, to name literals
        } else if( ch == ":" ){

          // End of word if : is before a literal or another delimiter
          // ToDo: enable :: in words?
          if( next_ch[ 0 ] == "\""
          // ||  next_ch[ 0 ] == "/"
          ||  next_ch[ 0 ] == "-"
          ||  ch_is_digit( next_ch[ 0 ] )
          ||  ch_is_limit( next_ch[ 0 ], "" )
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
          if( index_space != -1 ){
            token_de&&bug( "alias for " + buf + " is " + word_alias );
            // When this happens, restart as if from new source, base state.
            // Change source code to insert the extra stuff and scan again
            // ToDo: this breaks the index/line/column scheme
            tokenizer.text = word_alias + tokenizer.text.substring( ii );
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

    } // depending on word state

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
    + "Token. next is " + token.type + ":" + token.value + ". "
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
    bug( "Bad type from get_next_token(), " + token.type
    + " vs expected " + type + "." );
    error = true;
  }
  if( value != null && token.value != value ){
    bug( "Bad value from get_next_token(), " + token.value
    + " vs expected " + value + "." );
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

tokenizer_restart( "#!/bin/inox\n#ok" );
test_token( "comment", "!/bin/inox" );
test_token( "comment", "ok" );
test_token( "eof", "" );

tokenizer_restart(  "/**/" );
test_token( "comment_multiline", "" );
test_token( "eof", "" );

tokenizer_restart(  "~| test |~~~ test" );
test_token( "comment_multiline", " test " );
test_token( "comment", " test" );
test_token( "eof", "" );

tokenizer_restart( "~~ test\n~| test |~" );
test_token( "comment", " test" );
test_token( "comment_multiline", " test " );
test_token( "eof", "" );

tokenizer_restart( "( test1 )\\\n\\test2" );
test_token( "comment_multiline", " test1 " );
test_token( "comment", "" );
test_token( "comment", "test2" );
test_token( "eof", "" );

tokenizer_restart( "() 0 1234 \",\" + : abc ; , ." );
test_token( "comment_multiline", "" );
test_token( "word", "0" );
test_token( "word", "1234" );
test_token( "word", "\",\"" );
test_token( "word", "+" );
test_token( "word", ":" );
test_token( "word", "abc" );
test_token( "word", ";" );
test_token( "word", "," );
test_token( "word", "." );
test_token( "eof", "" );

tokenizer_restart( "~~\n \",\" + : -: ( ) () o( o() (| |) (- -) (( )) [ ] " );
test_token( "comment", "" );
test_token( "text", "," );
test_token( "word", "+" );
test_token( "word", ":" );
test_token( "word", "-:" );
test_token( "word", "(" );
test_token( "word", ")" );
test_token( "word", "(" );
test_token( "word", ")" );
test_token( "word", "o(" );
test_token( "word", "o(" );
test_token( "word", ")" );
test_token( "word", "(|" );
test_token( "word", "|)" );
test_token( "word", "(-" );
test_token( "word", "-)" );
test_token( "word", "((" );
test_token( "word", "))" );
test_token( "word", "[" );
test_token( "word", "]" );
test_token( "eof", "" );

tokenizer_restart( "~~\n abc;,. [[ ]] #[ ]# xxx.[ ] " );
test_token( "comment", "" );
test_token( "word", "abc" );
test_token( "word", ";" );
test_token( "word", "." );
test_token( "word", "[[" );
test_token( "word", "]]" );
test_token( "word", "#[" );
test_token( "word", "]#" );
test_token( "word", "xxx" );
test_token( "word", ".[" );
test_token( "word", "]" );
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
  "~~\n to aa ct: void is: as_v( void:0 );bb. .)."
);
test_token( "comment", "" );
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
test_token( "word", ".)" );
test_token( "word", "." );
test_token( "eof", "" );

tokenizer_restart(
  "~||~ to ct:is: aa:bb void:0 .x! x| |x |x!"
);
test_token( "comment_multiline", "" );
test_token( "word", "to" );
test_token( "word", "ct:is:" );
test_token( "word", "aa:bb" );
test_token( "word", "0" );
test_token( "word", ":void" );
test_token( "word", ".x!" );
test_token( "word", "x|" );
test_token( "word", "|x" );
test_token( "word", "|x!" );
test_token( "eof", "" );

tokenizer_restart(
  "~||~ it.x dup.:m d.m: m() dup.m()"
);
test_token( "comment_multiline", "" );
test_token( "word", "it" );
test_token( "word", ".x" );
test_token( "word", "dup" );
test_token( "word", ".:m" );
test_token( "word", "d" );
test_token( "word", ".m:" );
test_token( "word", "m(" );
test_token( "word", ")" );
test_token( "word", "dup" );
test_token( "word", ".m(" );
test_token( "word", ")" );
test_token( "eof",  "" );

tokenizer_restart(
  "~||~ a/ /a /a/b/c a/b/c"
);
test_token( "comment_multiline", "" );
test_token( "word", "a/" );
test_token( "word", "/a" );
test_token( "word", "/a" );
test_token( "word", "/b" );
test_token( "word", "/c" );
test_token( "word", "a/" );
test_token( "word", "b/" );
test_token( "word", "c" );
test_token( "eof",  "" );


primitive( "inox-input-token", function primitive_inox_input_token(){
  const token = get_next_token();
  const cell = make_text_cell( token.value );
  set_cell_name( cell, tag( token.type ) );
  move_cell( cell, this.push() );
  free_cell( cell );
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
const base_csp = CSP;
const base_dsp = DSP;


function chk(){

  de&&mand_eq( get_cell_value( base_csp ), 0x0000 );

  if( CSP != base_csp ){
    bug(
      "Control stack mismatch, now " + CSP
      + ", base " + base_csp
      + ", delta " + ( base_csp - CSP )
      + ", extra push " + ( base_csp - CSP ) / words_per_cell
      + stacks_dump( DSP, CSP )
    );
    de&&mand_eq( CSP, base_csp );
    CSP = base_csp;
  }

  if( DSP != base_dsp ){
    bug(
      "Data stack mismatch, now " + DSP
      + ", base " + base_dsp
      + ", delta " + ( base_dsp - DSP )
      + ", extra push " + ( base_dsp - DSP ) / words_per_cell
      + "\n" + stacks_dump( DSP, CSP )
    );
    de&&mand_eq( DSP, base_dsp );
    DSP = base_dsp;
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
  "inox-begin-definition",
  function primitive_inox_begin_definition(){
    eval_begin_definition_function.call( this );
  }
);


immediate_primitive(
  "inox-end-definition",
  function primitive_inox_end_definition(){
    eval_end_definition_function.call( this );
  }
);


primitive( "inox-eval", function primitive_inox_eval() : void {
// This is both the "outer" interpreter and the compiler, much like in Forth.
  // It interprets a text input. That's not like the fast inner interpreter
  // that runs a compiled binary representation made of compiled codes.
  // However, using the define word, which is "to" usualy but ":" in the Forth
  // dialect, the outer interter is able to start the definition of a new word
  // or a redefinition, ie it compiles the following text until the end of the
  // word definition is reached. That end condition is either a dot or a line
  // whose indentation level is less than the indentation level of the opening
  // "to". Note that while going ahead in the input text, the outer interpreter
  // may encounter special words that are immediately executed instead of beeing
  // added to the word being defined. Such words, nammed immediate words, may
  // help to redefine the syntax of the language, I don't use that feature
  // much but Forth people use it a lot because the Forth compiler does more
  // work than I do here, like computing relative jumps for if/then control
  // structures for example whereas I use { } enclosed blocks instead.
  // See also https://www.reddit.com/r/Forth/comments/55b8ta/what_makes_immediate_mode_the_key_to_everything/
  // ToDo: use indendation in other usefull situations, not just the ending of a
  // word definition.
  // ToDo: simplify the compiler using more immediate words.
  // ToDo: rewrite that complex function in Inox so that the language can
  // bootstrap itself.
  // ToDo: a state less version.

  de && chk();

  // Primitive eval may return after changing the control stack or the IP
  // but that is most certainely due to a bug than intentionnal. Better
  // restore them to their initial values.
  const old_csp = this.csp();
  const old_ip  = this.ip();

  const that = this;

  // The source code to evaluate is at the top of the stack, get it
  const tos = this.tos();
  const source : text = cell_to_text( tos );
  clear_cell( tos );

  // Reinitialize the stream of tokens
  tokenizer_restart( source );
  eval_de&&bug( "inox-eval " + source.slice( 0, 100 ) );

  let token   : Token;     // The next token to process
  let type    : text;      // It's type: word, text, comment, indentation
  let value   : text;      // It's value
  let word_id : InoxIndex; // An existing word named like the token's value

  // ToDo: these should be globals

  // A word is made of named values, like cells. Let's name that Machine Codes.
  // ToDo: use actual cells.
  type MachineCode = { type: InoxIndex, name: InoxName, value: InoxValue };

  // A block is an array of encoded words from {} delimited source code.
  // The first cell is named block-length, it is the number of cells after it.
  // ToDo: it should be a normal array of cells, dynamically allocated.
  type InoxBlock = Array< MachineCode >;

  // Some syntactic constructions can nest: calls, sub expressions, etc.
  // ToDo: this should be a normal array of cells too, behaving like a stack.
  type ParseLevel = {
    depth           : InoxIndex;  // Levels nest, starting with a "base" level 0
    type            : text;       // Type of node in the AST
    name            : text;       // Often the name of a word
    word            : InoxWord;   // It's code id when such word is defined
    arguments_count : InoxIndex;  // ToDo: variadic words
    codes           : InoxBlock;  // Compiled machine code
    codes_count     : InoxIndex;  // How many machine codes in codes array
    block_start     : InoxIndex;  // For type "{", blocks, where it starts
    line            : InoxIndex;  // Position in source code, for err messages
  }

  // This is a stack of levels, a kind of AST, Abstract Syntax Tree.
  // ToDo: it should be a normal array of cells.
  const levels = new Array< ParseLevel >();

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

  // The current level is that base level
  let level = levels[ 0 ];

  function bug_levels( title : string ){
    let buf = "Parser. Error. " + title + " ";
    let ii = 0;
    while( ii <= level.depth ){
      buf += "\n" + ii + " " + levels[ ii ].type
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
      type            : type,  // type of node in the AST
      name            : "",
      word            : 0,
      arguments_count : 0,  // ToDo: unused
      codes           : level.codes,        // Share codes with upper level
      codes_count     : level.codes_count,
      block_start     : 0,
      line            : token.line ? token.line : level.line
    };
    level = next_level;
    parse_de&&bug_levels( "Parser. Entering level, type is "
    + type + ", depth is " + level.depth );
  }


  function leave_level(){

    parse_de&&bug_levels( "Parser. Leaving level, type is "
    + level.type + ", depth is " + level.depth );

    let previous_level = level;
    level = levels[ level.depth - 1 ];
    level.codes_count = previous_level.codes_count;

    // Close all infix operators at once
    if( previous_level.type == "infix" ){
      eval_do_machine_code( previous_level.word );
      if( level.type == "infix" ){
        leave_level();
      }
    }

  }


  // Will points to a level after some start of definition, "to" or : typically
  let new_word_level : ParseLevel = null;


  function eval_begin_definition(){
  // Called when entering a new word definition, "to"" or : typically
  // ToDo: should be an immediate primitive
    enter_level( "define" );
    level.codes       = Array< MachineCode >();
    level.codes_count = 0;
    new_word_level    = level;
    // Next token is special, it's anything until some space
    tokenizer.eager_mode = true;
  }

  eval_begin_definition_function = eval_begin_definition;


  function eval_end_definition(){
  // Called when terminating a new word definition, . or ; typically

    // ToDo: should be an immediate defining word

    const tag_cell = make_tag_cell( new_word_level.name );

    // Allocate cells, including space for header and final return
    let def = allocate_bytes(
      ( new_word_level.codes.length + 2 ) * size_of_cell
    );

    // flags and length need an extra word, so does then ending "return"
    de&&mand_eq( get_cell_value( def ), 0 );
    set_cell_value( def, new_word_level.codes_count + 1 );

    // Skip that header
    def += words_per_cell;

    // Copy word definition into newly allocated memory
    let ii = 0;
    let w : MachineCode;
    while( ii < new_word_level.codes_count ){
      w = new_word_level.codes[ ii ];
      raw_set_cell( def + ii * words_per_cell, w.type, w.name, w.value );
      ii++;
    }

    // Add code to return from word, aka "return" special code
    set_return_cell( def + ii * words_per_cell );

    const word_cell = make_inox_word( get_cell_name( tag_cell ), def );

    // Update the global variable that definition flag setters use
    the_last_inox_word_defined = get_cell_name( word_cell );

    if( de ){
      const chk_def = get_inox_word_definition_by_text_name( new_word_level.name );
      de&&mand_eq( chk_def, def );
      de&&mand_eq( get_cell_value( chk_def + ii * words_per_cell ), 0 );
    }

    leave_level();

    // Change compilation state
    new_word_level = null;

    eval_de&&bug( "\n" + inox_word_cell_to_text_definition( word_cell ) );

  } // eval_add_new_inox_word()

  eval_end_definition_function = eval_end_definition;


  function is_compiling() : boolean {
    if( new_word_level )return true;
    if( level.codes    )return true;
    return false;
  }


  function eval_do_literal( cell ){

    eval_de&&bug( "Eval. push literal " + cell
    + " is " + cell_to_text( cell ) );

    if( is_compiling() && immediate_mode_level == 0 ){
      level.codes[ level.codes_count++ ] = {
        type:  get_cell_type( cell ),
        name:  get_cell_name( cell ),
        value: get_cell_value( cell )
      };

    }else{
      copy_cell( cell, that.push() );
      stack_de&&bug( stacks_dump( that.tos(), that.csp() ) );
    }

  };

  eval_do_literal_function = eval_do_literal;


  function add_machine_code( code_id ){
  // Add a word to the beeing built block or new word

    de&&mand( is_compiling() );

    // If code is not a word id due to inlining, add it as it is
    // This occurs after inox-quote typically
    // if( ( code_id >>> 14 ) != 0 ){
    //  level.codes[ level.codes_count++ ] = code_id;
    //  return;
    // }

    // Inline code definition if it is very short or if word requires it
    const definition = get_inox_word_definition_by_tag( code_id );
    const length = get_definition_length( definition ) - 1;  // skip "return"
    if( length <= 1 || is_inline_inox_word( code_id ) ){
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
        value: 0 // ToDo: could precompute cache using value: definition
      }
    }

    // Remember last code added
    set_cell_value( the_last_token_cell, word_id );

  }


  function eval_do_machine_code( code_id : InoxName ){

    eval_de&&bug(
      "Eval. do_machine_code " + code_id + " " + inox_word_id_to_text( code_id )
    );

    // Run now or add to definition of a new word?
    if( ! is_compiling()
    || is_immediate_inox_word( code_id )
    || immediate_mode_level != 0
    ){
      eval_de&&bug( "Immediate" );
      // Remember in control stack what word is beeing entered
      set_cell_info( that.csp(), pack( type_void_id, code_id ) );
      that.set_ip( get_inox_word_definition_by_tag( code_id ) );
      // bug( inox_word_to_text_definition( code_id ) );
      de&&mand( that.tos() <= ACTOR.stack );
      // ToDo: should reverse control and never use .run(), ie be stack less
      if( de && that.ip() == 0 ){
        bug( "Eval, do_machine_code invalid " + code_id );
        debugger;
      }else{
        that.run();
      }
      de&&mand( that.tos() <= ACTOR.stack );
      if( de ){
        stack_de&&bug( stacks_dump( that.tos(), that.csp() ) );
        if( that.csp() != old_csp ){
          bug( "??? Eval. do_machine_code, CSP changed by "
          + inox_word_id_to_text( code_id ) );
          debugger;
          that.set_csp( old_csp );
        }
        let ip = that.ip();
        if( ip && ip != old_ip ){
          bug( "??? Eval. do_machine_code, IP changed by "
          + inox_word_id_to_text( code_id ) );
          debugger;
          that.set_ip( old_ip );
        }
      }

    // When adding to the definition of a new word
    }else{
      eval_de&&bug( "Compile" );
      add_machine_code( code_id );
    }

  };

  eval_do_machine_code_function = eval_do_machine_code;


  let must_not_compile_next_token = false;

  eval_quote_next_token_function = function eval_quote_next_token(){
    must_not_compile_next_token = true;
  };


  function eval_begin_block(){
    enter_level( "block {" );
    // ToDo: value could be a qualifier about the block
    eval_do_machine_code( get_inox_word_id_by_text_name( "inox-block" ) );
    level.block_start = level.codes_count;
    // Reserve one word for block's length, like for word definitions
    level.codes[ level.codes_count++ ] = {
      type:  type_integer_id,
      name:  tag_block_length,
      value: 0
    };
  }

  eval_begin_block_function = eval_begin_block;


  function eval_end_block(){
    // Add a "return" at the end of the block
    level.codes[ level.codes_count++ ] = {
      type:  type_void_id,
      name:  tag_inox_return,
      value: 0
    };
    const block_length = level.codes_count - level.block_start;
    // Set argument for inox-block, make it look like a valid literal
    de&&mand_eq( level.codes[ level.block_start ].name, tag_block_length )
    level.codes[ level.block_start ].value
    // = 0x80000000 | 0x20000000 | ( block_length - 1 );
    = block_length - 1;
    // -1 not to add the length word
    leave_level();
  }

  eval_end_block_function = eval_end_block;

  // Word to start a new word definition
  let define : text = "to";
  // That's for the Inox dialect, Forth uses shorter :

  function operand_X( value: text ) {
    // remove first character, ex .a becomes a
    if( value.length <= 1 )return value;
    return value.slice( 1 );
  }

  function operand__X( value: text ) {
    // remove firts two characters
    if( value.length <= 2 ) return value;
    return value.slice( 2 );
  }

  function operand_X_( value: text ){
    // remove first and last characters
    if( value.length <= 2 )return value;
    return value.slice( 1, value.length - 1);
  }

  function operandX_( value: text)  {
    // remove last character
    if( value.length <= 1 )return value;
    return value.slice( 0, value.length - 1);
  }

  // Eval loop, until error or eof
  // ToDo: stackless eval loop
  let done : boolean = false;;
  while( true ){

    done = false;

    de&&mand( that.tos() <= ACTOR.stack );

    token = get_next_token();

    type  = token.type;
    value = token.value;

    if( de && value == "token-debugger" ){
      debugger;
      continue;
    }

    //if( value == "." && level.type == "keyword:" )debugger;

    // eval_de&&bug( "Eval. token " + type + "/" + value );

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
    // ToDo: handle this better, : and to could be words as in Forth
    if( tokenizer.style == "forth" ){
      define = ":";
    }else if( tokenizer.style == "inox" ){
      define = "to";
    }

    // "to" is detected only at the base level
    // ToDo: enable nested definitions?
    if( level.type == "base"
    &&  value == define
    && ( type == "word" || type == define )
    ){
      // ToDo: make that a primitive
      eval_begin_definition();
      continue;
    }

    // If name for the new Inox word
    if( new_word_level && new_word_level.name == "" ){
      // ToDo: make that a primitive
      new_word_level.name = value;
      if( tokenizer.eager_mode ){
        tokenizer.eager_mode = false;
      }
      eval_de&&bug( "Parser. New definition for word " + value );
      if( false && value == "if:do:" ){
        token_de = true;
        debugger;
      }
      // Update global for primitive_inox_immediate & co
      set_cell_name(
        the_last_token_cell,
        get_cell_name( tag( value ) )
      );
      set_cell_value(
        the_last_token_cell,
        get_cell_name( the_last_token_cell )
      );
      continue;
    } // name of new word

    // Else, if decreased Indentation turn that into a dot to end the definition
    if( type == "terminating;" ){
      type = "word";
      value = tokenizer.end_define;
    }

    // If . or ; or ) or } terminator, first close all postponed infix operators
    if( level.type == "infix"
    && ( type == "word" )
    && ( value == ";"
      || value == ")"
      || value == "}"
      || value == tokenizer.end_define // "."
    )){
      leave_level();
    }

    // A common error is to forget some ; ) or }
    if( new_word_level && value == define && type == "word" ){
      bug( "Parser. Nesting error, unexpected " + value
      + " at line " + token.line
      + " while expecting the end of " + level.type
      + " in definition of " + new_word_level.name
      + " at line " + level.line
      );
      debugger;
      break;
    }

    // From now it is most often either a literal or a word.
    // If compiling a word, that literal or word is added to the current word.

    // If text literal
    if( type == "text" ){
      eval_do_literal( make_text_cell( value ) );
      continue;
    }

    // If not word then there is bug somewhere
    if( type != "word" ){
      bug( "Eval. Invalid type of token " + type
        + " with value " + value
        + " at line " + token.line
      );
      debugger;
      break;
    }

    // If some form of quotation is involved, process as a tag to push now
    if( must_not_compile_next_token ){
      de&&bug( "Eval. must not compile, " + value );
      must_not_compile_next_token = false;
      // ToDo: should store text?
      copy_cell( make_tag_cell( value ), this.push() );
      continue;
    }

    // OK. It's a word.

    word_id = get_inox_word_id_by_text_name( value );
    if( word_id == 0 ){
      parse_de&&bug( "Parser. Encontering an undefined word : " + value );
      // debugger;
    }

    // What happens next with the new word depends on multiple factors:
    // a) The type of nested structure we're currently in:
    //   "call("     - after some xxx( and until the closing ).
    //   "subexpr (" - after ( and until the closing ).
    //   "infix"     - after an operator and until another one.
    //                 or the end of the enclosing structure.
    //   "keyword"   - after xxxx: and until ; or the end of the
    //                 enclosure structure.
    //   "base"      - the top level structure.
    // b) Is the word defined?
    //

    // If existing word, we're almost done
    let is_operator = false;
    if( word_id != 0 ){

      is_operator = !!is_operator_inox_word( word_id );

      // If operator, transform order to get to RPN, Reverse Polish Notation
      if( is_operator
      && ( level.type != "define" && level.type != "block {" )
      && ( level.type == "call("
        || level.type == "subexpr ("
        || level.type == "infix"
        || level.type == "keyword:"
        || true
      )){

        if( level.type != "call("
        &&  level.type != "subexpr ("
        &&  level.type != "infix"
        &&  level.type != "keyword:"
        )debugger;

        // If after another operator, left association
        // ToDo: configurable associativity and precedence
        if( level.type == "infix" ){
          leave_level();
        }

        // Otherwise processing occurs later at ; or start of keyword
        enter_level( "infix" );
        level.word = word_id;
        continue;
      }

      is_operator = false;

      // function calls, keyword method calls and sub expressions
      if( level.depth > 0 && level.word == 0 ){

        // If building a function call and expecting the function name
        if( level.type == "call(" &&  level.name == "" ){
          level.name = value;
          level.word = word_id;
          continue;
        }

        // If building a keyword method call
        if( level.type == "keyword:" && value.slice( -1 ) == ":" ){
          level.name += value;
          eval_de&&bug( "Eval. Collecting keywords:" + level.name );
          continue;
        }
      }

    } // if existing word

    // It's some undefined word but neither an operator nor xxx( nor some xxx:

    // What is it then?
    // It's some special form like operators, : terminated keywords
    // or some other weird tricks that should be handled better.
    // Including

    // Sometimes it is the last character that help understand
    let last_ch = value.length > 1 ? value[ value.length - 1 ] : "";

    // If known word, run it or add it to the new word beeing built
    // Unless operators and pieces of keyword calls.
    if( word_id && !is_operator && last_ch != ":" ){
      // This does not apply to operators and keyword calls
      eval_do_machine_code( word_id );
      continue;
    }

    de&&mand( type == "word" );

    // If end of definition of the new Inox word reached
    if( new_word_level
    // && type == "word"
    && value == tokenizer.end_define
    && level.type == "define"
    ){
      eval_end_definition();
      continue;
    }

    let first_ch  = value.length > 0 ? value[ 0 ] : "";
    let second_ch = value.length > 1 ? value[ 1 ] : "";

    // If xxx: it's some piece of a keyword call
    // This is inspired by Smalltalk's syntax.
    // See https://learnxinyminutes.com/docs/smalltalk/
    if( last_ch == ":" ){

      // first close all previous nested infix operators
      if( level.type == "infix" ){
        leave_level();
      }

      // If already collecting keywords of call, add new keyword item
      if( level.type == "keyword:" ){
        level.name += value;

      // If first element of a xxx: aaa yyy: bbb keyword call
      }else{
        enter_level( "keyword:" );
        level.name = value;
      }

      continue;
    }

    // xxx( type of call or ( xxx yyy ) sub expression
    if( last_ch == "(" ){

      // if ( expr )
      if( value == "(" ){
        enter_level( "subexpr (" );

      // if xxx() or .xxx() calls
      }else{
        enter_level( "call(" );
        const operand = operandX_( value );
        level.name = operand;
        level.word = get_inox_word_id_by_text_name( operand );
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

      if( level.type == "block {" ){
        eval_end_block();

      // Premature/unexpected }
      }else{
        bug( "Parser. Nesting warning, unexpected } "
        + " at line " + token.line
        + " while expecting the end of " + level.type );
      }

    // ) to end a function call or sub expression
    }else if( first_ch == ")"
    && ( level.type == "subexpr (" || level.type == "call(" )
    ){

      // If xxx( )
      if( level.word ){
        // Existing word was detected by tokenizer
        // ToDo: move that logic out of the tokenizer
        eval_do_machine_code( level.word );

      // If .xxx( )
      }else if( level.name.length > 1 && level.name[0] == "." ){
        // ToDo: what would be the meaning of .( xxxx ) ?
        // It could call some xxxx.call method of the target object
        // popped from the data stack. This would be convenient
        // for word value and some block, function, callable, etc, objects.
        eval_do_literal( make_tag_cell( operand_X( level.name ) ) );
        eval_do_machine_code( tag( "inox-call-method-by-name" ) );

      // If xxx( ) but word is missing
      }else if( level.name.length != 0 ){
        eval_do_literal( make_tag_cell( level.name ) );
        eval_do_machine_code( get_inox_word_id_by_text_name( "word-missing" ) );
      }

      // If )abc, name result
      if( value.length > 1 ){
        eval_do_literal( make_tag_cell( operand_X( value ) ) );
        eval_do_machine_code( get_inox_word_id_by_text_name( "inox-rename" ) );
      }

      leave_level();

    // ; (or .) marks the end of the keyword method call, if any
    }else if( ( value == ";" || value == tokenizer.end_define )
    && level.type == "keyword:"
    // ToDo: }, ) and ] should also do that
    ){

      // if( value == "." )debugger;

      while( level.type == "keyword:" ){

        // If .xx: ... yy: ... ; method call
        if( level.name[0] == "." ){
          eval_do_literal( make_tag_cell( level.name.slice( 1 ) ) );
          eval_do_machine_code( tag( "inox-call-method-by-name" ) );

        // If not a method call
        }else{

          word_id = get_inox_word_id_by_text_name( level.name );

          // If word does not exist, use word-missing instead
          if( word_id == 0 ){
            // Tell method_missing about the number of arguments?
            // set_cell_value( the_integer_work_cell, level.length );
            set_cell_value( the_tag_work_cell, tag( level.name ) );
            eval_do_literal( the_tag_work_cell );
            // Add call to method_missing
            eval_do_machine_code( get_inox_word_id_by_text_name( "word-missing" ) );
            // Method missing will add the class of the target to find the
            // method or will call a class specific method_missing found in the
            // class hierarchy
            // This implements a dynamic dispatch

          }else{
            eval_do_machine_code( word_id );
          }
        }
        leave_level();

        // Close all calls if terminating ., not when ;
        if( value == ";" )break;

      }

      if( value == tokenizer.end_define ){
        unget_token( token );
      }

    // If /xxxx, it's a tag
    }else if( first_ch == "/" ){
      eval_do_literal( make_tag_cell( operand_X( value ) ) );

    // If xxx/, it's a tag too. good for test/wwww types of call, eqv /test xxxx
    }else if( last_ch == "/" ){
      eval_do_literal( make_tag_cell( operandX_( value ) ) );

    // If xxxx|, it's a create in the control stack
    }else if( last_ch == "|" ){
      eval_do_literal( make_tag_cell( operandX_( value ) ) );
      eval_do_machine_code( tag( "inox-control-create" ) );

    // If |xxxx!, it's a lookup in the control stack with store
    }else if( first_ch == "|" && last_ch == "!" ){
      eval_do_literal( make_tag_cell( operand_X_( value ) ) );
      eval_do_machine_code( tag( "inox-control-set" ) );

    // If |xxxx, it's a lookup in the control stack with fetch
    }else if( first_ch  == "|" ){
      eval_do_literal( make_tag_cell( operand_X( value ) ) );
      eval_do_machine_code( tag( "inox-control-get" ) );

    // If .:xxxx, it's a method call
    }else if( first_ch == "." && second_ch == ":" ){
      eval_do_literal( make_tag_cell( operand__X( value ) ) );
      eval_do_machine_code( tag( "inox-call-method-by-name" ) );

    // If .xxxx!, it's a lookup in an object with store
    }else if( first_ch == "." && last_ch == "!" ){
      eval_do_literal( make_tag_cell( operand_X_( value ) ) );
      eval_do_machine_code( tag( "inox-object-set" ) );

    // If .xxxx, it's a lookup in an object with fetch
    }else if( first_ch  == "." && value.length > 1 ){
      eval_do_literal( make_tag_cell( operand_X( value ) ) );
      eval_do_machine_code( tag( "inox-object-get" ) );

    // If _xxxx!, it's a lookup in the data stack with store
    }else if( first_ch == "_" && last_ch == "!" ){
      eval_do_literal( make_tag_cell( operand_X_( value ) ) );
      eval_do_machine_code( tag( "inox-data-set" ) );

    // If _xxxx, it's a lookup in the data stack with fetch
    }else if( first_ch == "_" ){
      eval_do_literal( make_tag_cell( operand_X( value ) ) );
      eval_do_machine_code( tag( "inox-data-get" ) );

    // If xxx_, it's a naming operation, similar to xxx| but in data stack
    }else if( last_ch == "_" ){
      // ToDo: optimize the frequent literal /tag inox-rename sequences
      eval_do_literal( make_tag_cell( operandX_( value ) ) );
      eval_do_machine_code( tag( "inox-rename" ) );

    // If :xxxx, it's a naming operation, explicit, Forth style compatible
    }else if( first_ch == ":" ){
      // ToDo: optimize the frequent literal /tag inox-rename sequences
      eval_do_literal( make_tag_cell( operand_X( value ) ) );
      eval_do_machine_code( tag( "inox-rename" ) );

    // ( start of subexpression
    }else if( value == "(" ){
        enter_level( "subexpr (" );

    // if xxx(
    }else if( last_ch == "(" ){

      enter_level( "call(" );

      // If early binding function call, xxx( ... )
      if( first_ch != "." ){
        word_id = get_inox_word_id_by_text_name( operand_X( value ) );
        // If xxx is a defined word then it has to be called last
        if( word_id != 0 ){
          level.name = value;
          level.word = word_id;

        // If word is not defined, use it as a tag literal
        }else{
          // ToDo: if / prefixed word, use it as a tag?
          eval_do_literal( make_tag_cell( value ) );
        }
     }

    // Else, this is a literal, either a number or a tag
    }else{
      if( first_ch == "-" && is_integer( value.substring( 1 ) ) ){
        eval_do_literal( make_integer_cell( - text_to_integer( value) ) );
      }else if( is_integer( value ) ){
        eval_do_literal( make_integer_cell(   text_to_integer( value) ) );
      }else{
        if( value == "." ){
          // ToDo: fix me
          bug( "Parser. Annoying extra . dot token, skip it..." )
        }else{
          eval_do_literal( make_tag_cell( value ) );
        }
      }
    }
  }

  // Free closures
  eval_do_literal_function       = null;
  eval_do_machine_code_function  = null;
  eval_quote_next_token_function = null;
  eval_begin_block_function      = null;
  eval_end_block_function        = null;
  eval_begin_definition_function = null;
  eval_end_definition_function   = null;

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
  console.log( "\nOUTPUT " + cell_to_text( this.tos() ) );
}
primitive( "inox-trace", primitive_trace );


primitive( "out", function primitive_out(){
  primitive_trace.call( this );
  clear_cell( this.pop() );
} );


primitive( "inox-trace-stacks", function primitive_inox_trace_stacks(){
  bug( stacks_dump( this.tos(), this.csp() ) );
} );


define_alias( "forth",  ".",      "out" );

// In some other dialects there are other names for this
define_alias( "sh",     "echo",   "out")
define_alias( "basic",  "PRINT",  "out" );
define_alias( "icon",   "write",  "out" );
define_alias( "python", "print",  "out" );
define_alias( "c",      "printf", "out" );
define_alias( "prolog", "write",  "out" );


// Compile the bootstrap vocabulary; ANSI Forth core inspired
let bootstrap_code : text =
`( let's go forth )

: ." " inox-input-until LITERAL inox-quote . inox-machine-code ; IMMEDIATE

`;


const temp_bootstrap_cell = make_text_cell( bootstrap_code );
copy_cell( temp_bootstrap_cell, DSP );
free_cell( temp_bootstrap_cell );
run_inox_word( "inox-eval" );


/* ----------------------------------------------------------------------------
 *  exports
 */

function evaluate( source_code : string ) : string {
  const text_cell = make_text_cell( source_code );
  move_cell( text_cell, DSP );
  free_cell( text_cell );
  run_inox_word( "inox-eval" );
  const result = cell_to_text( DSP );
  clear_cell( DSP );
  return result;
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

  // ToDo: build state object and push it onto the data stack.
  // ToDo: build event object and push it onto the data stack.

  // If source code was provided, push it on the parameter stack
  // See http://c2.com/cybords/pp4.cgi?muforth/README

  const temp_text_cell = make_text_cell( source_code );
  move_cell( temp_text_cell, DSP );
  free_cell( temp_text_cell );
  run_inox_word( "inox-eval" );

  // ToDo: return diff to apply instead of new state
  // ToDo: cell_to_json_text( DSP );
  let new_state = JSON.stringify( cell_to_text( DSP ) );
  clear_cell( DSP );
  // ToDo: check that stacks are empty
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

const smoke = require( "fs" ).readFileSync( "lib/test/smoke.nox", 'utf8');

I.process( "{}", "{}", smoke );


// Pseudo code for a statefull event processor. Async requires promises.
/*
function processor( identity: string ){
  while( true ){
    const event = await get_next_event( identity );
    const state = await load_state( identity );
    const source_code = state.source_code;
    const diff = await inox.process( state, event, source_code );
    const new_state = apply( state, diff )
    await store_state( identity, new_state );
  }
}
*/

exports.inox = inox;
