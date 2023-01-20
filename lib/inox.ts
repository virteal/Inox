/*  inox.ts
 *    Inox is an object oriented concatenative script language.
 *
 *  june  3 2021 by jhr
 *  june  7 2021 by jhr, move from .js to .ts, ie Typescript, AssemblyScript
 *  june 10 2021 by jhr, .nox file extension
 *  june 27 2021 by jhr, forth hello world is ok, use literate comment in Inox
 *  july 17 2021 by jhr, turing complete
 *  july 28 2021 by jhr, use 64 bits instructions, code and data unification
 *  october  10 2021 by jhr, source code cleanup
 *  december  7 2022 by jhr, class, object, malloc/free, refcount gc
 *  decembre 26 2022 by jhr, reactive dataflows and reactive sets from Toubkal
 */


import assert from "assert";

function inox(){

/*
 *  Starts running an Inox machine, returns a json encoded new state (ToDo).
 *  ToDo: return diff instead of new state.
 *  The source parameter is a string, maybe the content of a .nox text file.
 *
 *  This is the reference implementation. It defines the syntax and semantic
 *  of the language. Production quality version of the virtual machine would
 *  have to be hard coded in some machine code to be efficient I guess.
 */



/* -----------------------------------------------------------------------------
 *  Let's go.
 *   Some debug tools first.
 */

// My de&&bug darling.
let    de : boolean = true;  // true if debug mode
const nde = false;           // not debug. To easely comment out a de&&bug

// Traces can be enabled "by domain", ie "by category"
let mem_de   : boolean = de &&  true;  // Check for very low level load/store
let alloc_de : boolean = de &&  true;  // Heap allocations integrity check
let check_de : boolean = de &&  true;  // Enable runtime error checking, slow
let token_de : boolean = de && false;  // Trace tokenization
let parse_de : boolean = de && false;  // Trace parsing
let eval_de  : boolean = de && false;  // Trace evaluation by text interpretor
let run_de   : boolean = de && false;  // Trace execution by word runner
let stack_de : boolean = de && false;  // Trace stacks
let step_de  : boolean = de && false;  // Invoke debugger before each step

// Global flag to filter out all console.log until one needs them.
// See inox-log primitive to enable/disable traces.
var can_log = false;
var bug = !can_log ? debug : console.log;

// In "fail fast" mode, any assert that fails is a FATAL error.
let fail_fast = false;
let error_message = "";


function debug( msg: string ) : void {
// de&&bug( a_message ) to log a message using console.log()
  if( !can_log ){
    // See primitive inox-log.
    bug = console.log;
    return;
  }
  // AssemblyScript supports a simpler version of console.log()
  assert( typeof msg == "string" );
  console.log( msg );
}


function mand( condition : boolean ) : boolean {
// de&&mand( a_condition ), aka asserts. Return true if assertion fails.
  // ToDo: should raise an exception?
  if( condition )return false;
  breakpoint();
  fail_fast && assert( false );
  return true;
};


function mand_eq( a : any, b : any ) : boolean {
// Check that two numbers are equal, return true if that's not the case
  if( a == b )return false;
  breakpoint();
  assert( false, "bad eq " + a + " / " + b );
  return true;
}


function mand_neq( a : any, b : any ) : boolean {
  if( a != b )return false;
  breakpoint();
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

// Let's say Typescript is AssemblyScript for a while (june 7 2021)
type u8    = number;
type u32   = number;

// ToDo: should do that when?
// require( "assemblyscript/std/portable" );


/* -----------------------------------------------------------------------------
 *  Types and constants related to types
 */

type InoxAddress = u32;    // Address in VM memory, aka a raw pointer
type Cell        = u32;    // Address of a cell's value, type and name
type InoxWord    = u32;    // Smallest entities at an InoxAddress in VM memory
type InoxIndex   = u32;    // Index in rather small arrays usually
type InoxCount   = u32;    // A counter, never negative
type InoxSize    = u32;    // Size of something, in bytes
type InoxLength  = u32;    // Size in number of items, often cells
type InoxBoolean = u32;    // 0 is false, 1 or anything else is true
type InoxOid     = u32;    // Proxy objects have a unique id
type Value       = u32;    // Payload. ToDo: should be an int32
type Info        = u32;    // Type & name info parts of a cell's value
type Type        = u8;     // Packed with name, 4 bits, at most 16 types
type InoxName    = u32;    // 28 bits, type + name makes info, total is 32 bits
type Tag         = u32;    // The id of a tag, an InoxName actually
type text        = string; // Shorthand for string, 4 vs 6 letters
type InoxText    = text;


// Memory is made of words that contains cells. Cells are made of a value and
// informations, info. Info is the type and the name of the value. See pack().
const size_of_word    = 8;   // 8 bytes, 64 bits
const size_of_value   = 4;   // 4 bytes, 32 bits
const size_of_info    = 4;   // type & name, packed
const size_of_cell    = size_of_value + size_of_info;
const words_per_cell  = size_of_cell  / size_of_word;

// Other layouts could work too. 2 bytes word, 4 bytes value, 2 bytes info.
// This would make 6 bytes long cells instead of 8. ok for a 32 bits cpu.
// 4 bytes cells using 2 bytes word, 2 bytes value & 2 bytes info.
// This would mean short integers and names, ok for an ESP32 style cpu.


/* ---------------------------------------------------------------------------
 *  Low level memory management.
 *  The Inox virtual machine uses an array of 32 bits words to store both
 *  the content of "cells" (2 words) and arrays of "code tokens" (2 words). A
 *  cell is the basic value manipulated everywhere. A code is a token that
 *  reference either a javascript defined primitive or an user defined word.
 *  The notion of user defined "words" comes from the Forth language.
 *  This is like user defined functions in classical languages except that
 *  there is no formal parameters, the data stack is the parameter.
 *  Classical functions can be built over that basic mechanism using local
 *  variables stored in the control stack, dynamic scope at this point.
 */


// -----------------------------------------------------------------------------
// ToDo: if( PORTABLE ){

// Portable versions of access to memory using "cells" and "words".
// For the webassembly version, see https://wasmbyexample.dev/examples/webassembly-linear-memory/webassembly-linear-memory.assemblyscript.en-us.html


// This is "the data segment" of the virtual machine.
// the "void" first cell is allocated at absolute address 0.
// It's an array of 64 bits words indexed using 28 bits addresses.
// That's a 31 bits address space, 2 giga bytes, plenty.
// ToDo: study webassembly modules
// See https://webassembly.github.io/spec/core/syntax/modules.html

const INOX_HEAP_SIZE = 1024 * 256; // 256 kb, > 30k cells

const mem8  = new ArrayBuffer( INOX_HEAP_SIZE  ); // 256 kb
const mem32 = new Int32Array( mem8 );
// ToDo: with AssemblyScript const mem64 = new Int64Array( mem8 );


const breakpoint_cell = 100000; // Write access triggers a debugger breakpoint

function set_value( c : Cell, v : Value ) : void  {
  if( de && c == breakpoint_cell )debugger;
  mem32[ c << 1 ] = v |0;
}

function set_info( c : Cell, i : Info  ) : void  {
  if( de && c == breakpoint_cell )debugger;
  mem32[ ( c << 1 ) + 1 ] = i |0;
}

function value( c : Cell ) : Value {
  // return mem64[ c ] & 0xffffffff
  return mem32[ c << 1 |0 ];
}

function info( c : Cell ) : Info {
  // return mem64[ c ] >>> 32;
  return mem32[ ( c << 1 ) + 1 ] |0;
}

function reset_cell( c : Cell ) : void {
  if( de && c == breakpoint_cell )debugger;
  // mem64[ c ] = 0;
  mem32[   c << 1       ] = 0;
  mem32[ ( c << 1 ) + 1 ] = 0;
}


function reset_cell_value( c : Cell ) : void {
  if( de && c == breakpoint_cell )debugger;
  mem32[ c << 1 ] = 0;
}


function reset_cell_info( c : Cell ) : void {
  if( de && c == breakpoint_cell )debugger;
  mem32[ ( c << 1 ) + 1 ] = 0;
}


function init_cell( c : Cell, v : Value, i : Info ) : void{
  if( de && c == breakpoint_cell )debugger;
  // mem64[ c ] = v | ( i << 32 );
  mem32[   c << 1       ] = v |0;
  mem32[ ( c << 1 ) + 1 ] = i |0;
}


function init_copy_cell( dst : Cell, src : Cell ) : void {
// Initialize a cell, using another one, raw copy.
  if( de && dst == breakpoint_cell )debugger;
  mem32[   dst << 1       ] = mem32[   src << 1       ] |0;
  mem32[ ( dst << 1 ) + 1 ] = mem32[ ( src << 1 ) + 1 ] |0;
}


function pack( t : Type, n : InoxName ) : Info { return n | t << 28; }
function unpack_type( i : Info )        : Type { return i >>> 28; } // 4 bits
function unpack_name( i : Info )        : Tag  { return i << 4 >>> 4; }

function type( c : Cell ) : Type { return unpack_type( info( c ) ); }
function name( c : Cell ) : Tag  { return unpack_name( info( c ) ); }

function set_type( c : Cell, t : Type ) : void{
  // The type of the singleton tag cell that defines the tag must never change
  if( de && is_a_tag_cell( c ) && is_a_tag_singleton( c ) ){
    // Tag void is the exception, it's type is 0, aka void.
    if( c == 0 ){
      de&&mand_eq( t, 0 );
    }else{
      de&&mand_eq( t, 1 );
    }
  }
  set_info( c, pack( t, unpack_name( info( c ) ) ) );
}

function set_name( c : Cell, n : Tag ) : void{
  // The name of the tag cell that defines the tag must never change.
  if( de && type( c ) == 1 && c == value( c ) ){
    de&&mand_eq( n, c );
  }
  set_info( c, pack( unpack_type( info( c ) ), n ) );
}

// }  // PORTABLE

function test_pack(){
  // copilot generated code
  de&&mand( pack( 0, 0 ) === 0 );
  de&&mand( pack( 1, 0 ) === 1 << 28 );
  de&&mand( pack( 0, 1 ) === 1 );
  de&&mand( pack( 1, 1 ) === ( 1 << 28 ) + 1 );
  de&&mand( unpack_type( pack( 0, 0 ) ) === 0 );
  de&&mand( unpack_type( pack( 1, 0 ) ) === 1 );
  de&&mand( unpack_type( pack( 0, 1 ) ) === 0 );
  de&&mand( unpack_type( pack( 1, 1 ) ) === 1 );
  de&&mand( unpack_name( pack( 0, 0 ) ) === 0 );
  de&&mand( unpack_name( pack( 1, 0 ) ) === 0 );
  de&&mand( unpack_name( pack( 0, 1 ) ) === 1 );
  de&&mand( unpack_name( pack( 1, 1 ) ) === 1 );
  const test_cell = 0;;
  set_value( test_cell, 0 );
  de&&mand( value( test_cell ) === 0 );
  set_value( test_cell, 1 );
  de&&mand( value( test_cell ) === 1 );
  set_info( test_cell, 0 );
  de&&mand( info( test_cell ) === 0 );
  set_info( test_cell, 1 );
  de&&mand( info( test_cell ) === 1 );
  init_cell( test_cell, 0, 0 );
  de&&mand( value( test_cell ) === 0 );
  de&&mand( info( test_cell ) === 0 );
  init_cell( test_cell, 1, 1 );
  de&&mand( value( test_cell ) === 1 );
  de&&mand( info( test_cell ) === 1 );
  init_cell( test_cell, 0, 1 );
  de&&mand( value( test_cell ) === 0 );
  de&&mand( info( test_cell ) === 1 );
  init_cell( test_cell, 1, 0 );
  de&&mand( value( test_cell ) === 1 );
  de&&mand( info( test_cell ) === 0 );
  reset_cell( 0 );
  de&&mand( value( test_cell ) === 0 );
  de&&mand( info( test_cell ) === 0 );
}
test_pack(); // Better fail early.


/* -----------------------------------------------------------------------------
 *  Not portable version is AssemblyScript syntax.
 *  ToDo: figure out what @inline means exactly
 *  ToDo: figure out some solution to avoid the right shift when
 *  optimizing for speed instead of for memory
 *  The resulting vm would then have access to less cells,
 *  half of them, but faster.
 */

 /* if( ! PORTABLE ){
@inline function load32( index : InoxAddress ) : u32 {
  return load< u32 >( index << 3 );
}
@inline function store32( index : InoxAddress, value : InoxValue ) : void {
  store< InoxValue >( index << 3, value );
}
*/


/* -----------------------------------------------------------------------------
  *  Cell
  *
  *  A memory cell seats at an address and has a type, a value and a name.
  *  When the name is "list", the value is the address of the rest of the list.
  *  Else the name is a "tag", a fixed abritrary value. In some languages
  *  like Lisp tags are called "atoms" or "symbols".
  *
  *  The encoding stores all of that in a 64 bits word.
  *  cell's type is a numeric id, 0..7
  *  cell's name is the address of a tag type of cell.
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

// In this implementation, the name is a 28 bits pointer that points
// to 64 bits words, this is equivalent to a 31 bits pointer
// pointing to bytes. That's 2 giga bytes or 256 millions of cells.
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
const cell_0 = 0;

// Some basic memory allocation, purely growing.
// This is like sbrk() on Unix
// See https://en.wikipedia.org/wiki/Sbrk
// There is some reallocation of cells when some of them are
// freed, see fast_allocate_cell()
// Smart pointers use a malloc/free scheme with reference counters.

// This last cell would be HERE in Forth
// See https://forth-standard.org/standard/core/HERE
let the_last_cell : InoxAddress = cell_0 - words_per_cell;


function allocate_cell() : Cell {
// Called by fast_allocate_cell() only, when the free list is empty.
  // The heap grows upward.
  the_last_cell += words_per_cell;
  return the_last_cell;
}


function allocate_cells( how_many : InoxIndex ) : Cell {
// Allocate a number of consecutive cells. Static. See also allocate_bytes().
  // Cells allocated this way are not freeable unless very quickly.
  const cell = the_last_cell + words_per_cell;
  the_last_cell += how_many * words_per_cell;
  return cell;
}


// This is initialy the sentinel tail of the list of reallocatable cells
let nil_cell : Cell = 0 // it will soon be the void/void/void cell

// Linked list of free cells.
var the_first_free_cell : Cell = nil_cell;


function fast_allocate_cell() : Cell {
// Allocate a new cell or reuse a free one
  let cell = the_first_free_cell;
  if( cell == nil_cell ){
    cell = allocate_cell();
  } else {
    the_first_free_cell = next_cell( cell );
  }
  return cell;
}


function free_cell( cell : Cell ) : void {
// Free a cell, add it to the free list

  // Check that cell is empty
  de&&mand_eq( type(  cell ), 0 );
  de&&mand_eq( name(  cell ), 0 );
  de&&mand_eq( value( cell ), 0 );

  // Special case when free is about the last allocated cell.
  if( cell == the_last_cell ){
    // It happens with tempory cells that are needed sometimes.
    // ToDo: get rid of that special case.
    free_last_cell( cell );
    return;
  }
  // Else, add cell to the linked list of free cells
  set_next_cell( cell, the_first_free_cell );
  the_first_free_cell = cell;

}


function free_last_cell( cell : Cell ) : void {
// Called by fast_allocate_cell() only
  // ToDo: alloc/free for tempory cells is not efficient.
  de&&mand_eq( cell, the_last_cell );
  the_last_cell -= words_per_cell;
}


function free_cells( cell : Cell, how_many : InoxLength ) : void {
// Free a number of consecutive cells
  // ToDo: not used yet but it would make sense for stack style allocations.
  // If the area is big enough, it is better to add it to the dynamic pool.
  for( let ii = 0 ; ii < how_many ; ii++ ){
    free_cell( cell + ii * words_per_cell );
  }
}


function make_cell( t  : Type, n  : InoxName, v : Value ) : Cell {
// Allocate a new cell or reuse one, then initialize it
  let c : Cell = fast_allocate_cell();
  set_cell( c, t, n, v );
  // Because we copy another cell's value, it matters if it's a reference.
  if( is_reference_type( t ) ){
    // ToDo: is it the best place to do this?
    increment_object_ref_count( value( c ) );
  }
  return c;
}


function mand_empty_cell( cell : Cell ) : boolean {
// Check that a cell is empty
  return mand_eq( type(  cell ), type_void )
  ||     mand_eq( name(  cell ), tag_void  )
  ||     mand_eq( value( cell ), 0         );
}


function raw_make_cell( t : Type, n : InoxName, v : Value )
: Cell {
// Like make_cell() but doen't increment reference counters
  let cell : Cell = fast_allocate_cell();
  set_cell( cell, t, n, v );
  return cell;
}


function set_cell( c : Cell, t : Type, n : InoxName, v : Value ){
  init_cell( c, v, pack( t, n ) );
  if( mem_de ){
    de&&mand_eq( type(  c ), t );
    de&&mand_eq( name(  c ), n );
    de&&mand_eq( value( c ), v );
  }
}


function is_a_list_cell( c : Cell ) : boolean {
// Returns true if the cell is a list cell
  return name( c ) == tag_list;
}


function mand_list_cell( c : Cell ) : void {
// Check that a cell is a list cell
  mand_eq( name( c ), tag_list );
}


function next_cell( c : Cell ) : Cell {
// Assuming cell is a list member, return next cell in list
  // When a cell is unused, the name is changed into "list" and the value
  // is used to store the next cell in some list.
  // ToDo: use a native type instead of this trickery?
  de&&mand_list_cell( c );
  return value( c );
}


function set_next_cell( c : Cell, next : Cell ) : void {
// Turn cell into a list member, set the next cell in list
  init_cell( c, next, tag_list );
  mem_de&&mand_eq( next_cell( c ), next );
}


function copy_cell( source : Cell, destination : Cell ) : void {
// Copy the content of a cell, handling references.
  clear_cell( destination );
  init_copy_cell( destination, source );
  if( mem_de ){
    de&&mand_eq( type(  destination ), type(  source ) );
    de&&mand_eq( name(  destination ), name(  source ) );
    de&&mand_eq( value( destination ), value( source ) );
  }
  // If the source was a reference, increment the reference counter
  if( is_reference_cell( source ) ){
    // This would not be necessary if there were a classical GC.
    // However, I may implement some destructor logic when an object
    // goes out of scope and it sometimes make sense to have that logic
    // excuted immediately instead of later on as would happen with a
    // classical GB. I could also have the best of both world depending
    // on some flag set inside the referenced object.
    // ToDo: make sure copy cell is called when a destructor could be
    // executed without corrupting anything. Alternatively the queue of
    // destructors could be processed by inox-return.
    increment_object_ref_count( value( source ) );
  }
}


function move_cell( source : Cell, destination : Cell ) : void {
// Move the content of a cell, taking care of clearing the destination first.
  clear_cell( destination );
  init_copy_cell( destination, source );
  reset_cell( source );
}


function raw_move_cell( source : Cell, destination : Cell ) : void {
// Move the content of a cell. Assume destination is empty.
  de&&mand_empty_cell( destination );
  init_copy_cell( destination, source );
  reset_cell( source );
}


function clear_cell_value( cell : Cell ) : void {
  de&&mand( ! is_reference_cell( cell ) );
  reset_cell_value( cell );
}


function clear_cell( cell : Cell ) : void {
// If reference, decrement reference counter and free if needed.

  if( ! is_reference_cell( cell ) ){
    if( de ){
      if( type(  cell ) == type_tag
      &&  value( cell ) == cell
      ){
        FATAL( "clear_cell() on " + cell_dump( cell ) );
        return;
      }
    }
    reset_cell( cell );
    return;
  }

  const is_pointer = is_a_pointer_cell( cell );
  const reference  = value( cell );
  reset_cell( cell );

  if( !is_last_reference_to_area( reference ) ){
    decrement_object_ref_count( reference );
    return;
  }

  // Last reference reached, need to free the area

  // If object, first clear all it's attributes
  if( is_pointer ){
    // ToDo: avoid recursion?
    const length = object_length( reference );
    for( let ii = 0 ; ii < length ; ii++ ){
      clear_cell( reference + ii * words_per_cell );
    }

  // Else it is some other type of reference, a proxy ultimately
  }else{
    free_proxy( reference );
  }

  // Then safely free the area
  free_area( reference );
}


function raw_clear_cell( cell : Cell ) : void {
// Like clear_cell() when target can safely be overwritten
  reset_cell( cell );
}


/* ---------------------------------------------------------------------------
 *  Void. Type 0
 *
 */

const type_void = 0;


/* ---------------------------------------------------------------------------
 *  Boolean. Type 1
 */

const type_boolean  = 1;
const boolean_false = 0;
const boolean_true  = 1;


function make_boolean_cell( v : Value ) : Cell {
  de&&mand( v == boolean_false || v == boolean_true );
  return make_cell( type_boolean, tag_boolean, v );
}


function cell_boolean( c : Cell ) : Value {
  de&&mand_eq( type( c ), type_boolean );
  return value( c );
}


/* ---------------------------------------------------------------------------
 *  Tag, type 2
 *
 *  Tags have an id, it is an address. Whenever the value of a tag
 *  is required as a number, that id is used. Whenever it is the text
 *  representation that is required, it's the name of the tag that
 *  is used.
 *
 *  Special tag /void is a falsy value. It's id is 0.
 *  ToDo: maybe only boolean false is false and all other values are truthy?
 *
 *  For each tag there exists a singleton cell whose address is the id
 *  of the tag. Other cells can then reference that singleton cell so
 *  that two tag cells with the same value are considered equal.
 */

const type_tag = 2;


// the dictionary of tag ids <-> tag cells
// ToDo: should be a regular object
const all_tag_singleton_cells_by_text_name = new Map< text, Tag  >();
const all_tag_singleton_text_names_by_id   = new Map< Tag,  text >()


function tag( tag : text ) : Tag {
// Create the singleton cell for a tag, if needed.
  if( !all_tag_singleton_cells_by_text_name.has( tag ) ){
    const cell = fast_allocate_cell();
    init_cell( cell, cell, pack( type_tag, cell ) );
    eval_de&&bug( "Creating tag " + tag );
    all_tag_singleton_cells_by_text_name.set( tag, cell );
    all_tag_singleton_text_names_by_id.set(  cell, tag  );
    // ToDo: create a /xxx word, a constant?
    // I would then be able to use that word id as the tag id?
    // This would make the tags available in the Forth dialect.
    return cell;
  }
  return all_tag_singleton_cells_by_text_name.get( tag );
}


function make_tag_cell( text_name : text ) : Cell {
// Create a tag cell for a tag with the given text name

  const new_cell = fast_allocate_cell();

  // Check if tag was properly internalized
  if( de && !all_tag_singleton_cells_by_text_name.has( text_name ) ){
    bug( "Error, tag must be internalized first: " + text_name );
    // Return a void cell. ToDo: return some /void ?
    return new_cell;
  }

  const tag_cell = all_tag_singleton_cells_by_text_name.get( text_name );
  if( de ){
    if( type( tag_cell ) != type_tag && text_name != "void" ){
      bug( "Error, tag singleton cell must have type tag: " + text_name );
      return new_cell;
    }
    if( name( tag_cell ) != value( tag_cell ) ){
      bug( "Error, tag singleton cell must have name == value: " + text_name );
      return new_cell;
    }
    if( tag_cell != value( tag_cell ) ){
      bug( "Error, tag singleton cell must have value == cell: " + text_name );
      return new_cell;
    }
  }

  copy_cell( tag_cell, new_cell );

  return new_cell;

}


// First cell ever. Tag with id 0 is /void
const the_first_cell_ever = tag( "void" );
de&&mand_eq( the_first_cell_ever, 0 );

const the_void_cell = tag_singleton_cell_by_name( "void" );
de&&mand_eq( the_void_cell, 0 );
de&&mand_eq( type( the_void_cell ), type_tag );

// Hack: patch type of void cell to 0
set_type( the_void_cell, type_void );

// First tag so far, /void is id 0.
de&&mand_eq( tag( "void" ), 0 );
de&&mand_eq( type( tag( "void" ) ), type_void );

// /true comes next. It should ideally be id 1, but it's not if
// cells needs multiple words. Fortunately, size_of_word can be
// set to size of cell, in this implementation. But this may
// prove impossible in some future cases.
tag( "true" );
de&&mand_eq( tag( "true" ), 1 * words_per_cell ); // ToDo: 1 vs 2?
de&&mand_eq( type( tag( "true" ) ), type_tag );


function is_valid_tag( id : Tag ) : boolean {
// True if tag was internalized
  const exists = all_tag_singleton_text_names_by_id.has( id );
  if( de ){
    if( exists ){
      const singleton = all_tag_singleton_text_names_by_id.get( id );
      de&&mand( is_a_tag_singleton( id ) );
    }
  }
  return exists;
}


function tag_singleton_cell_by_id( id : InoxName ) : Cell {
// Check internal integrity about tag singleton cells
  if( !de )return id;
  mand_eq( type(  id ), type_tag );
  if( id != 0 ){
    mand_neq( name( id ), 0 );
  }else{
    // /void is a special case
    mand_eq( name( id ), 0 );
  }
  mand( is_a_tag_singleton( id ) );
  mand_eq( value( id ), id );
  mand_eq( name(  id ), id );
  return id;
}


function tag_exists( n : text ) : boolean {
// Return true if the tag singleton cell with the given name exists
  const exists = all_tag_singleton_cells_by_text_name.has( n );
  if( de ){
    const singleton = tag_singleton_cell_by_name( n );
    mand( is_a_tag_singleton( singleton ) );
  }
  return exists;
}


function tag_singleton_cell_by_name( n : text ) : Cell {
// Return the address of the cell that holds the tag singleton

  if( ! all_tag_singleton_cells_by_text_name.has( n ) ){
    return 0;
  }

  const found = all_tag_singleton_cells_by_text_name.get( n );

  if( de ){
    if( n != "void" ){
      mand_neq( found, 0 );
      mand_neq( name( found ), 0 );
    }
    mand_eq( value( found ), found );
    mand_eq( name(  found ), found );
    if( n != "void" ){
      mand_eq( type(  found ), type_tag );
    }
    mand( is_a_tag_singleton( found ) );
  }

  return found;

}


/* -----------------------------------------------------------------------
 *  Integer, type 3, 32 bits
 *  ToDo: Double integers, 64 bits.
 *  ToDo: BigInt objects to deal with arbitrary long integers.
 *  ToDo: type_f64, type_bigint, type_f32
 */


const type_integer = type_tag + 1;


function make_integer_cell( v : Value ) : Cell {
  return make_cell( type_integer, tag_integer, v );
}


function is_an_integer_cell( c : Cell ) : boolean {
  return type( c ) == type_integer
}


function cell_integer( c : Cell ) : Value {
  de&&mand_eq( type( c ), type_integer );
  return value( c );
}


/* ---------------------------------------------------------------------------
 * Dynamic areas of cells.
 *  Dynamic memory allocation of cells in the heap.
 *  Bytes areas are allocated and freed using a reference counter.
 *  Each busy area has two header cells that contain the reference counter and
 *  a size. When the area is free, the first header links to the next free area.
 *  ToDo: should reuse the platform provided malloc/free to the extend
 *  it is possible?
 *  All ptr are to regular InoxCells, all sizes are number of bytes. The header
 *  is two cells long and is stored before the area.
 *  ToDo: size optimisation where name of ref counter also encodes the size.
 *  This would be usefull for small areas, boxed values and proxied objects.
 *  dynrc1 would mean one cell, ie 8 bytes + 8 bytes header. This
 *  is a total of 16 bytes versus the non optimized 24 bytes.
 */


// The first cell of a busy header is the reference counter.
const tag_dynamic_ref_count = tag( "_dynrc" );

// When the area is freed, that header is overwritten with this tag.
const tag_dynamic_next_area = tag( "_dynxt" );

// The second cell of the header is the ajusted size of the area in bytes.
const tag_dynamic_area_size = tag( "_dynsz" );

// This is where to find the size relative to the area first header address.
const offset_of_area_size = words_per_cell;

// Linked list of free byte areas, initialy empty, malloc/free related
var the_free_area      : Cell = cell_0;
var the_free_area_tail : Cell = the_free_area;


function area_header( area : Cell ) : Cell {
// Return the address of the first header cell of a byte area, the ref count.
  return area - 2 * words_per_cell;
}

function header_to_area( header : Cell ) : Cell {
// Return the address of an area given the address of it's first header cell.
  return header + 2 * words_per_cell;
}


function area_ref_count( area : Cell ) : Value {
// Return the reference counter of a byte area
  alloc_de&&mand( is_busy_area( area ) );
  return value( area_header( area ) );
}


function set_area_busy( area : Cell ) : void {
// Set the tag of the header of a byte area to tag_dynamic_ref_count
  set_name( area_header( area ), tag_dynamic_ref_count );
}


function set_area_free( area : Cell ) : void {
// Set the tag of the header of a byte area to tag_dynamic_next_area
  set_name( area_header( area ), tag_dynamic_next_area );
}


function is_busy_area( area : Cell ) : boolean {
// Return true if the area is busy, false if it is free
  return name( area_header( area ) ) == tag_dynamic_ref_count;
}


function is_free_area( area : Cell ) : boolean {
// Return true if the area is free, false if it is busy
  return name( area_header( area ) ) == tag_dynamic_next_area;
}


function is_dynamic_area( area : Cell ) : boolean {
// Return true if the area is a dynamic area, false otherwise
  // This is maybe not 100% reliable, but it is good enough.
  const first_header_ok  = is_busy_area( area ) || is_free_area( area );
  if( ! first_header_ok )return false;
  const second_header_ok
  = name( area_header( area ) + words_per_cell ) == tag_dynamic_area_size;
  return second_header_ok;
}


function free_if_area( area : Cell ) : void {
// Unlock the area if it is a dynamic area
  if( is_dynamic_area( area ) ){
    free_area( area );
  }
}


function next_area( area : Cell ) : Cell {
// Return the address of the next free area
  alloc_de&&mand( is_free_area( area ) );
  return value( area_header( area ) );
}


function set_next_area( area : Cell, next : Cell ) : void {
// Set the address of the next free area
  alloc_de&&mand( is_free_area( area ) );
  set_value( area_header( area ), next );
}


function set_area_ref_count( area : Cell, v : Value ) : void {
// Set the reference counter of a byte area
  alloc_de&&mand( is_busy_area( area ) );
  set_value( area_header( area ), v );
}


function area_size( area : Cell ) : InoxSize {
// Return the size of a byte area, in bytes
  return value( area_header( area ) + offset_of_area_size );
}


function set_area_size( area : Cell, v : InoxSize ) : void {
// Set the size of a byte area
  set_value( area_header( area ) + offset_of_area_size, v );
}


function set_area_size_tag( area : Cell ) : void {
// Set the tag of the second header of a byte area to tag_dynamic_area_size
  // The second header is after the first one, ie after the ref count.
  set_name(
    area_header( area ) + offset_of_area_size,
    tag_dynamic_area_size
  );
}


function adjusted_bytes_size( size : InoxSize ) : InoxSize {
// Align on size of cells and add size for heap management
  // The header is two cells, first is the ref count, second is the size.
  let aligned_size = 2 * size_of_cell
  + ( size + ( size_of_cell - 1 ) ) & ~( size_of_cell - 1 );
  //+ ( size         + ( size_of_cell - 1 ) )
  //  & ( 0xffffffff - ( size_of_cell - 1 )
  //);
  return aligned_size;
}


// All budy lists are empty at first, index is number of cells in area
const all_free_lists_by_area_length : Array< Cell >
= [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 ];


let   last_visited_cell = 0;
const collector_increment = 1000;
let   something_was_collected : boolean = false;


function area_garbage_collector() : boolean {
// Garbage collect the dynamic areas. Return false if nothing was collected.

  // Set the default return value
  something_was_collected = false;

  // First empty all the "per length" free lists, they interfere.
  for( let ii = 0 ; ii < 10 ; ii++ ){
    let free : Cell;
    while( ( free = all_free_lists_by_area_length[ ii ] ) != 0 ){
      if( free == 0 )continue;
      all_free_lists_by_area_length[ ii ] = next_area( free );
      set_next_area( free, the_free_area_tail );
      the_free_area_tail = free;
      something_was_collected = true;
    }
  }

  // Then scan the entire heap and coalesce consecutive free areas.
  // Limiting the time taken using incremental garbage collection.
  let cell = last_visited_cell;
  let count_visited = 0;

  while( true ){

    // Exit loop if too much time has been spent, unless nothing was collected
    if( count_visited > collector_increment && something_was_collected )break;

    // Time is proportional to the number of cells visited
    count_visited++;

    // We're not supposed to visit cells after the last cell
    if( de && count_visited > the_last_cell ){
      bug( "Error, internal, area_garbage_collector: infinite loop" );
      return false;
    }

    // OK, advance to next cell
    cell += words_per_cell;

    // Time to stop if last cell was reached
    if( cell >= the_last_cell ){
      // Next time it will start from the beginning
      last_visited_cell = 0;
      // If nothing was collected, return false
      if( something_was_collected )break;
      return false;
    }

    // If something looks like two consecutive free areas, maybe coalesce them
    if( !is_free_area( cell ) )continue;

    // Coalesce consecutive free areas, as long as there are some
    while( true ){

      const potential_next_area = cell + area_size( cell );

      if( potential_next_area >= the_last_cell
      || !is_free_area( potential_next_area )
      || !is_dynamic_area(  cell )
      || !is_dynamic_area(  potential_next_area )
      )break;

      // Coalesce consecutive two free areas
      let total_size = area_size( cell ) + area_size( potential_next_area );
      set_area_size( cell, total_size );
      set_next_area( cell, next_area( potential_next_area ) );
      raw_clear_cell( area_header( potential_next_area ) );
      raw_clear_cell( area_header( potential_next_area ) + words_per_cell );
      something_was_collected = true;

    } // End of while( true ) over consecutive free areas

  } // End of while( true ) over all cells

  return something_was_collected;

}


function area_garbage_collector_all() : void {
// Run garbage collector until nothing is collected
  while( area_garbage_collector() );
}


function allocate_area( size : InoxSize ) : InoxAddress {
// Allocate a byte area, return its address, or 0 if not enough memory

  if( de ){
    if( size > 1000 ){
      if( size != 4096 ){
        bug( "Large memory allocation, " + size );
        debugger;
      }
    }
    // alloc_de&&mand( size != 0 );
  }

  // Align on 64 bits, size of a cell, plus size of headers
  var adjusted_size = adjusted_bytes_size( size );

  // Search in "per length" free lists if size is small enough
  if( adjusted_size <= 10 * size_of_cell ){
    let try_length = adjusted_size / size_of_cell;
    while( true ){
      let buddy_free_area
      = all_free_lists_by_area_length[ try_length ];
      if( buddy_free_area ){
        all_free_lists_by_area_length[ try_length ]
        = next_area( buddy_free_area );
        set_area_busy(      buddy_free_area );
        set_area_ref_count( buddy_free_area, 1 );
        set_area_size(      buddy_free_area, try_length * size_of_cell );
        return buddy_free_area;
      }else{
        // Try with a bigger area
        try_length++;
        if( try_length > 10 )break;
      }
    }
  }

  // ToDo: search for free area
  let area : InoxAddress = the_free_area;
  let previous_area : InoxAddress = cell_0;
  while( area ){
    alloc_de&&mand_eq( info( area ), tag_dynamic_next_area );
    const area_sz = area_size( area );
    if( area_sz < adjusted_size ){
      previous_area = area;
      area = next_area( area );
      continue;
    }
    // The area is big enough, use it
    // Break big area and release extra space
    let remaining_size = area_sz - adjusted_size;
    // Only split if the remaining area is big enough for headers
    if( remaining_size >= 2 * size_of_cell ){
      let remaining_area = area + size / size_of_cell;
      set_area_free( remaining_area );
      set_area_size( remaining_area, remaining_size );
      set_next_area( remaining_area, next_area( area ) );
      if( previous_area ){
        set_next_area( previous_area, remaining_area );
      }else{
        the_free_area = remaining_area;
      }
    }else{
      // The area is too small to split, use it all
      adjusted_size = area_sz;
    }
    break;
  }

  // If nothing was found, use flat space further
  if( ! area ){
    // ToDo: check limit, ie out of memory
    area = the_last_cell + words_per_cell + 2 * words_per_cell;
    // Divide by 4 because memory is 32 bits words, not bytes
    the_last_cell += ( adjusted_size / size_of_word ); // - words_per_cell;
    mem_de&&mand_eq( value( area ), 0 );
  }

  // Area is locked initialy, once, see lock_bytes()
  set_area_busy(      area );
  set_area_ref_count( area, 1 );

  // Remember size of area, this does include the header overhead
  set_area_size_tag( area );
  set_area_size(     area, adjusted_size );

  // Return an address that is after the header, at the start of the payload
  alloc_de&&mand( is_safe_area( area ) );
  alloc_de&&mand( is_busy_area( area ) );
  alloc_de&&mand( is_last_reference_to_area( area) );
  return area;

}


function resize_area( address : InoxAddress, size : InoxSize ) : InoxAddress {
  de&&mand( is_safe_area( address ) );
  const new_mem = allocate_area( size );
  let ii : InoxIndex = area_size( address );
  while( true ){
    ii -= size_of_cell;
    // ToDo: should copy cell if previous area is referenced somewhere?
    alloc_de&&mand( area_ref_count( address ) <= 1 );
    move_cell( address + ii * size_of_cell, new_mem + ii * size_of_cell );
    if( ii == 0 )break;
  }
  free_area( address );
  return new_mem;
}


function free_area( area : InoxAddress ){
  // ToDo: add to pool for malloc()
  // ToDo: a simple solution is to split the array into cells
  // and call free_cell() for each of them. That's easy.
  // Another solution is to keep lists of free zones of
  // frequent sizes.
  // Other malloc/free style solution would not be much more complex.
  if( area == 0 ){
    // Assume it's about the empty text, ""
    debugger;
    return;
  }
  alloc_de&&mand( is_safe_area( area ) );
  const old_count = area_ref_count( area );
  // Free now if not locked
  if( old_count == 1 ){

    const size = area_size( area );

    // The whole area should be full of zeros, ie cleared
    if( de ){
      // The size includes the header overhead, currently 2 cells
      let ncells = size / size_of_cell - 2;
      for( let ii = 0 ; ii < ncells ; ii += words_per_cell ){
        mand_eq( value( area + ii ), 0 );
        mand_eq( info(  area + ii ), 0 );
      }
    }

    // Add to a "per length" free list if small enough area
    if( size <= 10 * size_of_cell ){
      set_area_free( area );
      set_next_area( area, all_free_lists_by_area_length[ size / size_of_cell ] );
      all_free_lists_by_area_length[ size / size_of_cell ] = area;
      // ToDo: this can degenerate when too many small areas are unused.
      // I should from time to time empty the free lists and add areas to the
      // global pool, the older areas first to maximize locality.
      return;
    }

    // Add area in free list, at the end to avoid premature reallocation
    // ToDo: insert area in sorted list instead of at the end?
    // I should do this to coalesce adjacent free areas to avoid fragmentation
    set_area_free( area );
    set_next_area( area, the_free_area_tail );
    the_free_area_tail = area;
    return;
  }
  // Decrement reference counter
  const new_count = old_count - 1;
  set_area_ref_count( area, new_count );
}


function lock_area( area : InoxAddress ) : void {
// Increment reference counter of bytes area allocated using allocate_bytes().
// When free_bytes() is called, that counter is decremented and the area
// is actually freed only when it reaches zero.
  if( area == 0 ){
    // Assume it's about the empty text, "".
    return;
  }
  alloc_de&&mand( is_safe_area( area ) );
  alloc_de&&mand( is_busy_area( area ) );
  const old_count = area_ref_count( area );
  // Increment reference counter
  const new_count = old_count + 1;
  set_area_ref_count( area, new_count );
}


function is_last_reference_to_area( area : InoxAddress ) : boolean {
// When the last reference disappears the bytes must be freed.
// To be called by clear_cell() only, on non zero adresses.
  alloc_de&&mand( is_safe_area( area ) );
  alloc_de&&mand( is_busy_area( area ) );
  return area_ref_count( area ) == 1;
}


const the_first_ever_area = the_last_cell;


function is_safe_area( area : InoxAddress ) : boolean {
// Try to determine if the address points to a valid area allocated
// using allocates_area() and not already released.

  if( !de )return true;

  // This helps to debug unbalanced calls to lock_area() and free_area().
  // zero is ok for both reference counter & size because it never happens
  if( area == 0 ){
    return true;
  }

  // The address must be aligned on a cell boundary
  if( area % ( size_of_cell / size_of_word ) != 0 ){
    bug( "Invalid area " + area + " not aligned on a cell boundary" );
    return false;
  }

  // The address must be in the heap
  if( area < the_first_ever_area ){
    bug( "Invalid area " + area + " before the first cell" );
    return false;
  }

  if( area > the_last_cell ){
    if( area_size( area ) == 2 * size_of_cell
    && area == the_last_cell + words_per_cell
    ){
      // It's ok, it's a recent alloc( 0 ) for a proxy
    }else{
      bug( "Invalid area " + area + " after the last cell" );
      return false;
    }
  }


  if( is_busy_area( area ) ){

    // The reference counter must be non zero if busy
    const reference_counter = area_ref_count( area );
    if( reference_counter == 0 ){
      bug( "Invalid reference counter " + reference_counter + " for area " + area );
      return false;
    }

    // When one of the 4 most significant bits is set, that's a type id probably
    if( reference_counter >= ( 1 << 28 ) ){
      const type = unpack_type( reference_counter );
      bug( "Invalid counter for area " + area + ", type " + type + "?" );
      return false;
    }

  }

  // The size must be bigger than the size of the headers
  const size = area_size( area );
  if( size <= 2 * ( size_of_cell / size_of_word ) ){
    bug( "Invalid size " + size + " for area " + area );
    return false;
  }

  // When one of the 4 most significant bits is set, that's a type id probably
  if( size >= ( 1 << 29 ) ){
    const type = unpack_type( size );
    bug( "Invalid counter for area " + area + ", type " + type + "?" );
    return false;
  }

  // The size must be a multiple of the size of a cell
  if( size % ( size_of_cell / size_of_word ) != 0 ){
    bug( "Invalid size " + size + " for area " + area );
    return false;
  }

  // The size must be smaller than the heap size
  if( size > ( the_last_cell - the_first_ever_area ) * size_of_cell ){
    bug( "Invalid size " + size + " for area " + area );
    return false;
  }

  return true;
}

function increment_object_ref_count( cell : Cell ){
  lock_area( cell );
}


function decrement_object_ref_count( cell : Cell ){
  free_area( cell );
}


function area_test_suite(){
  const the_area = allocate_area( 10 );
  de&&mand( is_safe_area( the_area ) );
  de&&mand( is_busy_area( the_area ) );
  free_area( the_area );
  de&&mand( is_free_area( the_area ) );
  const the_area2 = allocate_area( 10 );
  de&&mand( is_safe_area( the_area2 ) );
  de&&mand( is_busy_area( the_area2 ) );
  lock_area( the_area2 );
  de&&mand( is_busy_area( the_area2 ) );
  de&&mand( is_safe_area( the_area2 ) );
  free_area( the_area2 );
  de&&mand( is_safe_area( the_area2 ) );
  de&&mand( is_busy_area( the_area2 ) );
  free_area( the_area2 );
  de&&mand( is_free_area( the_area ) );
}


/* -----------------------------------------------------------------------
 *  Pointer, type 4, 32 bits to reference a dynamically allocated array
 *  of cells, aka a smart pointer to an Inox object.
 */

const type_pointer  = type_integer + 1;


function make_pointer_cell( v : Value ) : Cell {
  return make_cell( type_pointer, tag_pointer, v );
}


function cell_pointer( c : Cell ) : Value {
  check_de&&mand_eq( is_a_pointer_cell( c ), 1 );
  return value( c );
}


/* -----------------------------------------------------------------------
 *  Proxy opaque object, type 5
 *  These objects are platform provided objects. Access is done using an
 *  indirection table.
 *  ToDo: implement using dynamically allocated bytes.
 *  ToDo: define a base class to be derived by more specific classes.
 */

const type_proxy = type_pointer + 1;


// Some types are reference types, some are value types.
const is_reference_type_array = [
  false, false, false, false,  // void, boolean, tag, integer
  true,  true,  true,          // pointer, proxy, string
  false, false,                // flow, invalid
         false, false, false,  // filler
  false, false, false, false   // filler, total is 16 types
]

function is_reference_type( type : Type ){
  return is_reference_type_array[ type ];
}


function is_reference_cell( c : Cell ){ return is_reference_type( type( c ) ); }


// Access to proxied object is opaque, there is an indirection
// Each object has an id which is a cell address. Cells that
// reference proxied object use that cell address as a pointer.
// Indirection table to get access to an object using it's id.
// The id is the address of a dynamically allocated cell that is
// freed when the reference counter reaches zero.
// When that happens, the object is deleted from the map.
let all_proxied_objects_by_id = new Map< Cell, any >();


function make_proxy( object : any ){
  const proxy = allocate_area( 0 ); // size_of_cell );
  all_proxied_objects_by_id.set( proxy, object );
  // de&&mand_eq( value( proxy ), 0 );
  // de&&mand_eq( info(  proxy ), 0 );
  // ToDo: cache an _inox_tag into the constructor to avoid call to tag()
  // const class_name = tag( object.constructor.name );
  // Proxy cell does not actually exists, only the id is used
  alloc_de&&mand( is_safe_area( proxy ) );
  return proxy;
}


function proxy_class_name( proxy : Cell ){
  return unpack_name( info( proxy ) );
}


function make_proxy_cell( object : any ) : Cell {
  // ToDo: return object directly, it fits inside a cell's 32 bits value
  const proxy = make_proxy( object );
  alloc_de&&mand( is_safe_area( proxy ) );
  const class_name = proxy_class_name( proxy );
  const cell = raw_make_cell( type_proxy, class_name, proxy );
  return cell;
}


function free_proxy( proxy : Cell ){
  // This is called by clear_cell() when reference counter reaches zero
  alloc_de&&mand( is_safe_area( proxy ) );
  // reset_cell( proxy );
  all_proxied_objects_by_id.delete( proxy );
}


function proxied_object_by_id( id : Cell ) : any {
  alloc_de&&mand( is_safe_area( id ) );
  return all_proxied_objects_by_id.get( id );
}


function cell_proxy( cell : Cell ) : InoxAddress {
  const proxy = value( cell );
  alloc_de&&mand( is_safe_area( proxy ) );
  return proxy;
}


function cell_proxied_object( cell : Cell ) : any {
  const proxy = cell_proxy( cell );
  alloc_de&&mand( is_safe_area( proxy ) );
  return proxied_object_by_id( proxy );
}


function proxy_to_text( id : Cell ) : text {
  alloc_de&&mand( is_safe_area( id ) );
  // Some special case 0 produces the empty string.
  if( !id )return "";
  if( !all_proxied_objects_by_id.has( id ) ){
    if( de ){
      bug( "Attempt to convert a non proxy object to text" );
      debugger;
    }
    return "";
  }
  let obj = all_proxied_objects_by_id.get( id );
  // ToDo: should check if object understands toString()
  return obj.toString();
}


function proxy_cell_to_text_cell( cell : Cell ){
  // ToDo: shallow copy if already a text
  // ToDo: check type, should be proxy
  const proxy = cell_proxy( cell );
  alloc_de&&mand( is_safe_area( proxy ) );
  const new_proxy = make_proxy( proxy_to_text( proxy ) );
  // Forget previous proxy
  free_proxy( proxy );
  // Keep name but change type
  set_value( cell, new_proxy );
  set_type(  cell, type_text );
}


/* -----------------------------------------------------------------------
 *  Text, type 6
 *  Currently implemented using a proxy object, a string.
 */

const type_text  = type_proxy + 1;


function make_text_cell( txt : text ) : Cell {
  if( txt.length == 0 )return the_empty_text_cell;
  // ToDo: share text object of preexisting tags?
  // ToDo: always return same cell for same text?
  const proxy = make_proxy( txt )
  const cell = raw_make_cell(
    type_text,
    tag_text,
    proxy
  );
  de&&mand_eq( cell_to_text( cell ), txt );
  return cell;
}


/* -----------------------------------------------------------------------
 *  Word, type 7
 *  The name of the Inox word is an integer id, an index in the tag table.
 *  The value is the address where the Inox word is defined is the VM
 *  memory. That definition is built using regular 64 bits cells.
 *  Words are never deallocated, like tags.
 *  ToDo: unify words with blocks, enable dynamic allocation of words.
 */

const type_word  = type_text + 1;


// The dictionary of all Inox words, including class.method words.
// ToDo: There should be a global dictionnary and local ones. This is
// necessary when importing words from modules.
let all_inox_word_cells_by_tag      = new Map< Tag, Cell >();
let all_inox_word_tags_by_text_name = new Map< text, InoxName >()
let all_inox_word_cells_by_hashcode = new Map< Value, Cell >();


function make_inox_word( word_tag : Tag, def_first_cell : Cell )
: Cell {
// Define an Inox word. It's name is the name of the cell that's returned.
  // The cell's value is the address of another cell where the word definition
  // starts. There is a header is the previous cell, for length & flags.
  // The definition is an array of words with primitive ids and
  // word ids, aka a block. See runner() where the definition is interpreted.
  // ToDo: Forth also requires a pointer to the previous definition of
  // the word.

  const word_cell = make_cell( type_word, word_tag, def_first_cell );

  // Don't add anonymous words to the dictionary, name them
  const is_anonymous = word_tag == 0;
  let true_name : Cell;
  if( is_anonymous ){
    // The name of the word in the disctionnary is its address.
    true_name = word_cell;
    // But the word itself has no name, hence void.
    set_name( word_cell, 0 )
  }else{
    true_name = word_tag;
  }

  all_inox_word_cells_by_tag.set( true_name, word_cell );
  let fullname = tag_to_text( word_tag );
  if( is_anonymous ){
    fullname += "-" + true_name;
  }
  all_inox_word_tags_by_text_name.set( fullname, word_tag );

  // Detect cccc.mmmmm words
  if( !is_anonymous ){
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
  }

  return word_cell;
}


function inox_word_cell_by_tag( id : Tag ) : Cell {
  // ToDo: use .has()
  if( !all_inox_word_cells_by_tag.has( id ) )return cell_0;
  return all_inox_word_cells_by_tag.get( id );
}


function inox_word_cell_by_text_name( name : text ) : Cell {
  if( !all_inox_word_tags_by_text_name.has( name ) )return 0;
  let id = all_inox_word_tags_by_text_name.get( name );
  return inox_word_cell_by_tag( id );
}


function inox_word_to_text_name( id : Tag ): text {
  let word_cell = inox_word_cell_by_tag( id );
  let n = name( word_cell );
  let str_name : text = tag_to_text( n );
  return str_name;
}


function inox_word_definition_by_text_name( text_name : text ) : InoxAddress {
  // ToDo: pointer to previous
  let id   : InoxIndex;
  let cell : Cell;
  if( all_inox_word_tags_by_text_name.has(      text_name ) ){
    id   = all_inox_word_tags_by_text_name.get( text_name );
    cell = all_inox_word_cells_by_tag.get( id );
  }else if( all_primitive_ids_by_text_name.has( text_name ) ){
    id   = all_primitive_ids_by_text_name.get(  text_name );
    cell = all_primitive_cells_by_id[ id ];
  }else{
    // Not found, return void cell, aka 0
    de&&bug( "Word definition not found by text name: " + text_name );
    if( text_name == "." )debugger;
    return 0;
  }
  // Return the value of the found word cell, ie it's definition.
  return value( cell );
}


function inox_word_tag_by_text_name( text_name : text ) : Tag {
  if( all_inox_word_tags_by_text_name.has( text_name ) ){
    return all_inox_word_tags_by_text_name.get( text_name );
  }else{
    // Not found, return void, aka 0
    de&&bug( "Word tag not found by text name: " + text_name );
    return 0;
  }
}


function inox_word_tag_by_tag( tag : Tag ) : Tag {
// The id of a word is it's name, as a tag
  if( all_inox_word_cells_by_tag.has( tag ) ){
    de&&mand_eq( name( all_inox_word_cells_by_tag.get( tag ) ), tag );
    return tag;
  }else{
    // Not found, return void, aka 0
    de&&bug(
      "Word not found by tag: " + tag + " ( " + tag_to_text( tag ) + " )"
    );
    return 0;
  }
}


function definition_by_tag( id : InoxIndex  ) : InoxAddress {
// Given a word, as a tag, return the address of its definition
  if( !all_inox_word_cells_by_tag.has( id ) )return 0;
  let cell : Cell = all_inox_word_cells_by_tag.get( id );
  const def = value( cell );
  de&&mand( def != 0 )
  return def;
}


function definition_length( def : InoxAddress ) : InoxIndex {
  // The header with length & flags is right before the code
  const length = value( def - words_per_cell ) & 0xfff;
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

const immediate_word_flag = 0x800000; // When compiling a new word, run vs store
const hidden_word_flag    = 0x400000; // ToDo: skipped when lookup
const operator_word_flag  = 0x200000; // Parser knows about left associativity
const block_word_flag     = 0x100000; // True for blocks, false for words
const inline_word_flag    = 0x080000; // When compiling inline definition


function set_inox_word_flag( id : InoxWord, flag : Value ){
  const header = definition_by_tag( id ) - words_per_cell;
  set_value( header, value( header ) | flag );
}


function test_inox_word_flag( id : InoxWord, flag : Value ){
  const header = definition_by_tag( id ) - words_per_cell;
  return ( value( header ) & flag ) == flag ? 1 : 0;
}


function set_inox_word_immediate_flag( id : InoxIndex ) : void {
  set_inox_word_flag( id, immediate_word_flag );
}


function is_immediate_inox_word( id : InoxIndex ) : Value {
  return test_inox_word_flag( id, immediate_word_flag );
}


function set_inox_word_hidden_flag( id : InoxIndex ) : void {
  set_inox_word_flag( id, hidden_word_flag );
}


function is_hidden_inox_word( id : InoxIndex ) : Value {
   return test_inox_word_flag( id, hidden_word_flag )
}


function set_inox_word_operator_flag( id : InoxIndex ) : void {
  set_inox_word_flag( id, operator_word_flag );
}


function is_operator_inox_word( id : InoxIndex ) : Value {
  return test_inox_word_flag( id, operator_word_flag );
}


function set_inox_word_block_flag( id : InoxIndex ) : void {
  set_inox_word_flag( id, block_word_flag );
}


function is_an_inline_block_cell( id : InoxIndex ) : Value {
  return test_inox_word_flag( id, block_word_flag );
}


function is_block_ip( ip : InoxAddress ) : boolean {
  de&&mand_name( name( ip ), tag_inox_block );
  return ( value( ip ) & block_word_flag ) != 0;
}


function set_inline_inox_word_flag( id : InoxIndex ) : void {
  set_inox_word_flag( id,  inline_word_flag );
}


function is_inline_inox_word( id : InoxIndex ) : Value {
  return test_inox_word_flag( id, inline_word_flag );
}


/* -----------------------------------------------------------------------------
 *  Flow, type 8
 *  ToDo: Reactive dataflows on reactive data sets from Toubkal.
 *  Currently implemented using a proxy object.
 *  See https://github.com/ReactiveSets/toubkal
 */

const type_flow = type_word + 1;


// a flow is about statefull/stateless, sync/async, greedy/lazy.
// a flow carries data sets.
// add/remove/update events change the data set.
// one can subscribe to such events or generate them.
// open/close events change the flow state.


/* -----------------------------------------------------------------------------
 *  type invalid is for debugging mainly.
 */

const type_invalid = type_flow + 1;
de&&mand_eq( type_invalid, 0x9 );


// There is a tag for each type
const tag_void_cell    = 0;
const tag_void         = name( tag_void_cell );
const tag_boolean_cell = tag( "boolean" );
const tag_boolean      = name( tag_boolean_cell );
const tag_tag_cell     = tag( "tag" );
const tag_tag          = name( tag_tag_cell );
const tag_integer_cell = tag( "integer" );
const tag_integer      = name( tag_integer_cell );
const tag_proxy_cell   = tag( "proxy" );
const tag_proxy        = name( tag_proxy_cell );
const tag_pointer_cell = tag( "pointer" );
const tag_pointer      = name( tag_pointer_cell );
const tag_text_cell    = tag( "text" );
const tag_text         = name( tag_text_cell );
const tag_word_cell    = tag( "word" );
const tag_word         = name( tag_word_cell );
const tag_flow_cell    = tag( "flow" );
const tag_flow         = name( tag_flow_cell );
const tag_invalid_cell = tag( "invalid" );
const tag_invalid      = name( tag_invalid_cell );

de&&mand_eq( tag_void, 0 );
de&&mand_eq( tag_void, tag( "void" ) );
de&&mand_eq( tag_void, value( tag_void_cell ) );
de&&mand_eq( tag_void, name( tag_void_cell ) );
// void is the only tag whose type is not tag but void.
de&&mand_eq( type( tag_void_cell ), type_void );
de&&mand_eq( tag_void_cell, 0 );

// tag /list is used to create a list of cells. ToDo
const tag_list = tag( "list" );
de&&mand_eq( type( tag_list ), type_tag );


const the_empty_string_proxy = make_proxy( "" );

const the_empty_text_cell = raw_make_cell(
  type_text,
  tag_text,
  the_empty_string_proxy
);


// Patch proxied object map to have "" be at id 0 so that "" is falsy.
all_proxied_objects_by_id.set( 0, the_empty_string_proxy );
set_value( the_empty_text_cell, 0 );
de&&mand( cell_looks_safe( the_empty_text_cell ) );


// It's only now that testing the area allocator is possible.
area_test_suite();


function memory_dump() : number {
  // First, let's collect all garbage.
  area_garbage_collector_all();
  // Then let's dump each cell.
  let count = 0
  let delta_void = 0;
  let count_voids = 0;
  let last = 0
  mem32.forEach( function( v, i ){
    // Dump 64 bits at a time, ie skip odd words.
    if( ( i & 0x1 ) != 0 ) return;
    // I would prefer a mem64 but it's not available.
    i = i >> 1; // ToDo: change that if size of word changes
    // Skip void cells.
    if( v == 0 && info( i ) == 0 ) return;
    // Non void after the_last_cell is problematic...
    if( i > the_last_cell ){
      console.log( "Warning: " + i + " > the_last_cell" );
    }
    // Trace about consecutive skipped void cells
    if( i != last + words_per_cell ){
      delta_void = ( i - last ) / words_per_cell
      console.log( "void - " + delta_void + " cells" );
      count_voids += delta_void;
    }
    console.log( "" + i + ": " + cell_dump( i ) );
    count++;
    last = i;
  } );
  const total_cells = count + count_voids;
  console.log(
    "Total: "
    + ( total_cells ) + " cells, "
    + count                        + " busy & "
    + count_voids                  + " void, "
    + total_cells * words_per_cell + " words & "
    + total_cells * size_of_cell   + " bytes, "
    + count       * size_of_cell   + " bytes busy & "
    + count_voids * size_of_cell   + " bytes void"
  );
  return count;
}


/* -----------------------------------------------------------------------------
 *  Tempory work cells
 */

const the_tag_work_cell = make_tag_cell( "tag" );
set_name( the_tag_work_cell, tag_tag );

const the_integer_work_cell = make_integer_cell( 0 );
set_name( the_integer_work_cell, tag_integer );

const the_boolean_work_cell = make_boolean_cell( 0 );
set_name( the_boolean_work_cell, tag_boolean );

const the_block_work_cell = make_integer_cell( 0 );
set_name( the_block_work_cell, tag( "block" ) );


/* -----------------------------------------------------------------------------
 *  Float, Array, Map, List
 *  ToDo: Currently implemented as proxy objects
 *  ToDo: implement arrays as dynamically allocated arrays of cells
 *  ToDo: implement maps as dynamically allocated arrays of cells
 *  ToDo: implement lists using name and value of cell?
 */


function make_float( f : number ){
  return make_proxy_cell( f );
}


function make_array( obj? : Object ) : Cell {
  let array = obj;
  if( ! obj ){
    array = new Array< Cell >();
  }
  return make_proxy_cell( array );
}


function make_map( obj? : Object ){
  let map = obj;
  if( ! obj ){
    map = new Map< InoxOid, Cell >();
  }
  return make_proxy_cell( map );
}

function make_list( obj? : Object ) : Cell {
  // ToDo: value should a linked list of cells
  let list = obj;;
  if( ! obj ){
    list = new Array< Cell >();
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
let TOS : InoxAddress = 0;


class CpuContext {
  ip  : InoxAddress; // Current instruction pointer in code
  tos : Cell;    // Data stack pointer, goes downward
  csp : Cell;    // Control stack pointer, goes downward
  constructor( ip  : InoxAddress, tos : Cell, csp : Cell ){
    this.ip  = ip;
    this.tos = tos;
    this.csp = csp;
  }
}


class Actor {
// Inox machines run cooperative actors.

  cell          : Cell;     // Proxy cell that references this object
  parent        : Cell;     // Parent actor
  act           : Cell;     // ToDo: Current activation record
  size          : InoxSize; // Total size of data stack and control stack
  stack         : Cell;     // Base address of data stack
  control_stack : Cell;     // Base address of control stack
  ctx           : CpuContext; // ip, tos & csp

  constructor(
    parent   : Cell,
    act      : InoxAddress,
    ip       : InoxAddress,
    ram_size : Value
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

  init( ip : InoxAddress, ram_size : InoxSize ){
    // Round size to the size of a cell, half for data, half for control
    var size = ( ram_size / size_of_cell ) * size_of_cell / 2;
    this.size  = size;
    this.stack         = allocate_area( size )
    + size / size_of_cell - 1 * words_per_cell;
    this.control_stack = allocate_area( size )
    + size / size_of_cell - 1 * words_per_cell;
    this.ctx = new CpuContext( ip, this.stack, this.control_stack );
    de&&mand_eq( this.ctx.tos, this.stack );
    de&&mand_eq( this.ctx.csp, this.control_stack );
  }

  context() : CpuContext {
    return this.ctx;
  }

  save_context(){
    this.ctx.ip  = IP;
    this.ctx.tos = TOS;
    this.ctx.csp = CSP;
  }

  restore_context() : void {
    ACTOR = this;
    IP    = this.ctx.ip;
    TOS   = this.ctx.tos;
    CSP   = this.ctx.csp;
  }

  switch_to( next_actor : Actor ){
    this.save_context();
    next_actor.restore_context();
  }

}


function make_actor( parent : Cell, act : Cell ) : Cell {
  let size = 1024 * size_of_cell;  // for parameters & control stacks; ToDo
  var new_actor = new Actor( parent, act, 0, size );
  // Fill parameter stack with act's parameters
  // ToDo [ act.locals ];
  let cell = make_proxy_cell( new_actor );
  new_actor.cell = cell;
  return cell;
};


// Current actor is the root actor
const root_actor: Cell = make_actor( the_void_cell, the_void_cell );
ACTOR = cell_proxied_object( root_actor );

// Current actor changes at context switch
ACTOR.restore_context();

// There is nothing in the free list
let free_actors = the_void_cell;


function allocate_actor( parent : Cell, act:Cell ) : Cell {
  if( free_actors == the_void_cell )return make_actor( parent, act );
  let actor = free_actors;
  let actor_object = cell_proxied_object( actor );
  actor_object.ctx.ip = 1;
  actor_object.parent = parent;
  actor_object.act = act;
  return actor;
}


function free_actor( actor : Cell ){
// add actor to free list
  set_next_cell( actor, free_actors );
  free_actors = actor;
}


// primitive to switch to another actor
function primitive_inox_actor_switch() : void {
  const tos = POP();
  const next_actor = cell_proxied_object( tos )
  clear_cell( tos );
  ACTOR.switch_to( next_actor );
}


function primitive_inox_make_actor() : void {
  let ip : InoxAddress = value( TOS );
  var act = 0 // ToDo: allocate_act( ACTOR.cell );
  var new_actor : Cell = allocate_actor( ACTOR.cell, act );
  // ToDo: push( parameters ); into new actor
  let t : Actor = cell_proxied_object( new_actor );
  t.ctx.ip = ip;
  // ToDo: should be move_cell instead of copy_cell ?
  copy_cell( new_actor, TOS );
  de&&mand( t.ctx.tos <= t.stack );
};


/* -----------------------------------------------------------------------
 *  primitives
 */

let all_primitive_cells_by_id      = new Map< InoxName, Cell       >();
let all_primitive_functions_by_id  = new Map< InoxName, () => void >();
let all_primitive_ids_by_text_name = new Map< text,     InoxIndex  >();

const tag_inox_return = tag( "inox-return" );

function no_operation() : void { /* Does nothing */ }


function primitive_function_by_id( id : InoxIndex ){
  if( ! all_primitive_functions_by_id.has( id ) )return no_operation;
  return all_primitive_functions_by_id.get( id );
}


function set_return_cell( cell : Cell ){
  reset_cell( cell ); // named void instead of tag_inox_return
}


function primitive( n : text, fn : () => void ) : Cell {
// Helper to define a primitive
// It also defines an Inox word that calls that primitive

  // Allocate a proxy cell that points to the Function object
  let function_cell = make_proxy( fn );

  // Will store primitive's name as a tag
  let tag_cell = tag( n );

  // Make sure the name of the cell is as desired
  set_info(
    function_cell,
    pack( type( function_cell ), name( tag_cell ) )
  );

  // Assign a new primitive id to the new primitive
  let name_id = name( tag_cell );

  // Associate name, primitive id and cell in all directions
  all_primitive_cells_by_id.set(      name_id, function_cell );
  all_primitive_functions_by_id.set(  name_id, fn            );
  all_primitive_ids_by_text_name.set( n,       name_id       );

  // Make also an Inox word that calls the primitives
  const header : InoxAddress = allocate_area( 3 * size_of_cell );

  // flags and length, ToDo: use two cells?
  set_cell( header, type_word, name_id, 2 );

  // Skip that header
  const def = header + 1 * words_per_cell;

  // Add machine code to invoke the primitive, ie type void, see RUN()
  set_cell( def + 0 * words_per_cell, type_void, name_id, 0 );

  // Add "return", 0 actually.
  set_return_cell( def + 1 * words_per_cell );;

  // Allocate a word cell that points to the definition
  let word_cell = make_inox_word( tag( n ), def );

  de&&mand_eq( definition_by_tag( name_id ), def  );
  de&&mand_eq(
    name( definition_by_tag( name_id ) ),
    name_id
  );

  nde&&bug( inox_word_cell_to_text_definition( word_cell ) );

  return word_cell;

}


function immediate_primitive( name : text, fn : () => void ) : Cell {
// Helper to define an immediate primitive
// In inox-eval, immediate Inox words are executed instead of being
// added to the new Inox word definition that follows the "define" word
  let cell = primitive( name, fn );
  set_inox_word_immediate_flag( inox_word_tag_by_text_name( name ) );
  return cell;
}


function operator_primitive( name : text, fn : () => void ) : Cell {
// Helper to define an operator primitive
  let cell = primitive( name, fn );
  set_inox_word_operator_flag( inox_word_tag_by_text_name( name ) );
  return cell;
}


primitive( "inox-return", function primitive_inox_return(){
// primitive "return" is jump to return address
  // ToDo: this should be primitive 0
  const csp : Cell = CSP;
  const new_csp = csp + words_per_cell;
  CSP = new_csp;
  const new_ip = value( csp );
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
    + name( csp ) );
  }
  raw_clear_cell( csp );
  IP = new_ip;
} );


// Special case for primitive inox-return, it gets two ids, 0 and normal.
// ToDo: avoid this
de&&mand_eq( tag_void, 0x0000 );
all_primitive_cells_by_id.set(
  tag_void,
  all_primitive_cells_by_id.get( tag_inox_return )
);
all_primitive_functions_by_id.set(
  0,
  all_primitive_functions_by_id.get( tag_inox_return )
);
// Patch word definition to reference word 0
set_return_cell( definition_by_tag( tag_inox_return ) );


function breakpoint() : void {
  bug( "BREAKPOINT\n" + stacks_dump() );
  debugger;
}


primitive( "inox-breakpoint", primitive_inox_breakpoint );
function primitive_inox_breakpoint(){
  breakpoint();
}

primitive( "inox-memory-dump", memory_dump );


primitive( "inox-cast", primitive_inox_cast );
function primitive_inox_cast(){
// Change the type of a value. That's unsafe.
  const type = value( POP() );
  check_de&&mand( type < type_invalid )&&_or_FATAL( "Invalid type" );
  set_type( TOS, type );
}


primitive( "inox-rename",  primitive_inox_rename );
function                   primitive_inox_rename(){
// Change the name of a value. ~~ value name -- renamed_value
  check_de&&mand_eq( type( TOS ), type_tag );
  const n = value( TOS );
  raw_clear_cell( TOS );
  POP()
  set_name( TOS, n );
  de&&mand_eq( name( TOS ), n );
}


const tag_inox_rename = tag( "inox-rename" );


primitive( "inox-goto", primitive_inox_goto );
function                primitive_inox_goto(){
// Primitive is "jump" to some absolute position, a branch
  // ToDo: conditional jumps
  IP = value( POP() );
}


primitive( "make_actor",   primitive_inox_make_actor   );
primitive( "actor_switch", primitive_inox_actor_switch );

// ToDo: core dictionary


/* ----------------------------------------------------------------------------
 *  Primitives to tests the type of a cell
 */


function is_a_void_cell( cell : Cell ) : InoxBoolean {
  if( type( cell ) == type_void )return 1;
  return 0;
}


primitive( "inox-is-a-void", primitive_inox_is_a_void );
function                     primitive_inox_is_a_void(){
  const it_is = is_a_void_cell( TOS );
  if( it_is ){
    set_value( TOS, 1 );
  }else{
    clear_cell( TOS );
    set_value( TOS, 0 );
  }
  set_type( TOS, type_boolean );
  set_name( TOS, tag( "void?" ) );
}


function is_a_tag_cell( cell : Cell ) : InoxBoolean {
  if( type( cell ) == type_tag )return 1;
  return 0;
}


primitive( "inox-is-a-tag", primitive_inox_is_a_tag );
function                    primitive_inox_is_a_tag(){
  const it_is = is_a_tag_cell( TOS );
  if( it_is ){
    set_value( TOS, 1 );
  }else{
    clear_cell( TOS );
    set_value(  TOS, 0 );
  }
  set_type( TOS, type_boolean );
  set_name( TOS, tag( "tag?" ) );
}


function is_a_boolean_cell( cell : Cell ) : InoxBoolean {
  if( type( cell ) == type_boolean )return 1;
  return 0;
}


primitive( "inox-is-a-boolean", primitive_inox_is_a_boolean );
function                        primitive_inox_is_a_boolean(){
  const it_is = is_a_boolean_cell( TOS );
  if( it_is ){
    set_value( TOS, 1 );
  }else{
    clear_cell( TOS );
    set_value(  TOS, 0 );
  }
  set_type( TOS, type_boolean );
  set_name( TOS, tag( "boolean?" ) );
}


function is_a_integer_cell( cell : Cell ) : InoxBoolean {
  if( type( cell ) == type_integer )return 1;
  return 0;
}


primitive( "inox-is-an-integer", primitive_inox_is_an_integer );
function                         primitive_inox_is_an_integer(){
  const it_is = is_a_integer_cell( TOS );
  if( it_is ){
    set_value( TOS, 1 );
  }else{
    clear_cell( TOS );
    set_value( TOS, 0 );
  }
  set_type( TOS, type_boolean );
  set_name( TOS, tag( "integer?" ) );
}


function is_a_text_cell( cell : Cell ) : InoxBoolean {
  if( type( cell ) == type_text )return 1;
  return 0;
}


primitive( "inox-is-a-text", primitive_inox_is_a_text );
function                     primitive_inox_is_a_text(){
  const it_is : InoxBoolean = is_a_text_cell( TOS );
  clear_cell( TOS );
  set_value(  TOS, it_is );
  set_type(   TOS, type_boolean );
  set_name(   TOS, tag( "text?" ) );
}


function is_a_pointer_cell( cell : Cell ) : InoxBoolean {
  if( type( cell ) == type_pointer )return 1;
  return 0;
}


primitive( "inox-is-a-pointer", primitive_inox_is_a_pointer );
function                        primitive_inox_is_a_pointer(){
  const it_is : InoxBoolean = is_a_pointer_cell( TOS );
  clear_cell( TOS );
  set_value(  TOS, it_is );
  set_type(   TOS, type_boolean );
  set_name(   TOS, tag( "pointer?" ) );
}


function is_a_word_cell( cell : Cell ) : InoxBoolean {
  if( type( cell ) == type_word )return 1;
  return 0;
}


primitive( "inox-is-a-word", primitive_inox_is_a_word );
function                    primitive_inox_is_a_word(){
  const it_is : InoxBoolean = is_a_word_cell( TOS );
  if( it_is ){
    set_value( TOS, 1 );
  }else{
    clear_cell( TOS );
    set_value( TOS, 0 );
  }
  set_type( TOS, type_boolean );
  set_name( TOS, tag( "word?" ) );
}


function is_a_proxy_cell( cell : Cell ) : InoxBoolean {
  if( type( cell ) == type_proxy )return 1;
  return 0;
}


primitive( "inox-is-a-proxy", primitive_inox_is_a_proxy );
function                      primitive_inox_is_a_proxy(){
  const it_is : InoxBoolean = is_a_proxy_cell( TOS );
  clear_cell( TOS );
  set_value(  TOS, it_is );
  set_type(   TOS, type_boolean );
  set_name(   TOS, tag( "proxy?" ) );
}


/* -----------------------------------------------------------------------------
 *  Forth style data stack manipulations.
 */


primitive( "push", function primitive_push() { PUSH() } );


primitive( "drop", function primitive_drop() { clear_cell( POP() ) } );


primitive( "drops", function primitive_drops(){
// Like "drop" but drops n cells from the data stack.
  const tos = TOS;
  check_de&&mand_cell_type( tos, type_integer );
  const n = value( POP() );
  check_de&&mand( n >= 0 )&&_or_FATAL( "Invalid number of drops" );
  raw_clear_cell( tos );
  for( let ii = 0 ; ii < n ; ii++ ){
    clear_cell( POP() );
  }
} );


primitive( "dup",  function primitive_dup(){
  copy_cell( TOS, PUSH() );
} );


primitive( "?dup", function primitive_dup_if(){
// Like dup but only if the top of the stack is true.
  if( value( TOS ) ){
    copy_cell( TOS, PUSH() );
  }
} );


primitive( "dups", function primitive_dups(){
// Like "dup" but duplicates n cells from the data stack.
  const n = value( POP() );
  check_de&&mand( n >= 0 )&&_or_FATAL( "Invalid number of dups" );
  for( let ii = 0 ; ii < n ; ii++ ){
    copy_cell( TOS, PUSH() );
  }
} );


primitive( "nip", function primitive_nip(){
// Like "drop" but drops the second cell from the top of the stack.
  move_cell( POP(), TOS );
} );


const tmp_cell = make_cell( type_void, tag_void, 0 );


primitive( "tuck", function primitive_tuck(){
// Like "nip" but pushes the second cell from the top of the stack.
  const tos = TOS;
  const tos1 = tos + words_per_cell;
  move_cell( tos,      tmp_cell );
  move_cell( tos1,     tos );
  move_cell( tmp_cell, tos1 );
} );


primitive( "swap",  function primitive_swap(){
  const tos0 = TOS;
  const tos1 = tos0 + words_per_cell;
  move_cell( tos0,     tmp_cell );
  move_cell( tos1,     tos0 );
  move_cell( tmp_cell, tos1 );
} );


primitive( "over", function primitive_over(){
  copy_cell( TOS + words_per_cell, PUSH() );
} );


primitive( "rotate", function primitive_rotate(){
  const tos0 = TOS;
  const tos1 = tos0 + words_per_cell;
  const tos2 = tos1 + words_per_cell;
  move_cell( tos0,     tmp_cell );
  move_cell( tos1,     tos0 );
  move_cell( tos2,     tos1 );
  move_cell( tmp_cell, tos2 );
} );


primitive( "roll", function primitive_roll(){
// Like "rotate" but rotates n cells from the top of the stack.
  const n = value( POP() );
  check_de&&mand( n >= 0 )&&_or_FATAL( "Invalid number of rolls" );
  const tos = TOS;
  for( let ii = 0 ; ii < n ; ii++ ){
    move_cell( tos + ii * words_per_cell, tmp_cell );
    move_cell( tos + ( ii + 1 ) * words_per_cell, tos + ii * words_per_cell );
    move_cell( tmp_cell, tos + ( ii + 1 ) * words_per_cell );
  }
} );


primitive( "pick", primitive_pick );
function           primitive_pick(){
  const tos = TOS;
  const nth = cell_integer( tos );
  copy_cell( tos + nth * words_per_cell, tos );
}


const tag_depth = tag( "depth" );


primitive( "inox-data-depth", primitive_inox_data_depth );
function                      primitive_inox_data_depth(){
// Push the depth of the data stack.
  const depth = ( ACTOR.stack - TOS ) / words_per_cell;
  de&&mand( depth >= 0 );
  const new_tos = PUSH();
  init_cell( new_tos, depth, pack( type_integer, tag_depth ) );
}


primitive( "inox-clear-data", primitive_inox_clear_data );
function                      primitive_inox_clear_data(){
// Clear the data stack.
  const depth = ( ACTOR.stack - TOS ) / words_per_cell;
  de&&mand( depth >= 0 );
  for( let ii = 0 ; ii < depth ; ii++ ){
    clear_cell( POP() );
  }
}


primitive( "inox-data-dump", primitive_inox_data_dump );
function                     primitive_inox_data_dump(){
  let buf = "DATA STACK";
  const depth = ( ACTOR.stack - TOS ) / words_per_cell;
  de&&mand( depth >= 0 );
  for( let ii = 0 ; ii < depth ; ++ii ){
    const c      = TOS + ii * words_per_cell;
    const i      = info(         c );
    const t      = unpack_type(  i );
    const n      = unpack_name(  i );
    const n_text = tag_to_text(  n );
    const t_text = type_to_text( t );
    const v_text = cell_to_text( c );
    buf += "\n" + ii + " " +  t_text + " " + n_text + " " + v_text;;
  }
  console.log( buf );
}


primitive( "inox-control-depth", primitive_inox_control_depth );
function                         primitive_inox_control_depth(){
// Push the depth of the control stack
  const depth = ( ACTOR.control_stack - CSP ) / words_per_cell;
  de&&mand( depth >= 0 );
  const new_tos = PUSH();
  init_cell( new_tos, depth, pack( type_integer, tag_depth ) );
}


primitive( "inox-clear-control", primitive_inox_control_clear );
function                         primitive_inox_control_clear(){
// Clear the control stack
  const depth = ( ACTOR.control_stack - CSP ) / words_per_cell;
  de&&mand( depth >= 0 );
  for( let ii = 0 ; ii < depth ; ii++ ){
    clear_cell( CSP - ii * words_per_cell );
  }
  CSP = ACTOR.control_stack;
}


primitive( "inox-control-dump", primitive_inox_control_dump );
function                        primitive_inox_control_dump(){
// Dump the control stack.
  const depth = ( CSP - ACTOR.control_stack ) / words_per_cell;
  let buf = "Control stack:";
  for( let ii = 0 ; ii < depth ; ii++ ){
    const c      = CSP - ii * words_per_cell;
    const i      = info(         c );
    const t      = unpack_type(  i );
    const n      = unpack_name(  i );
    const n_text = tag_to_text(  n );
    const t_text = type_to_text( t );
    const v_text = cell_to_text( c );
    buf += "\n" + ii + " " + t_text + " " + n_text + " " + v_text;;
  }
  console.log( buf );
}


function integer_to_text( v : Value ) : text { return "" + v; }


function integer_cell_to_text( c : Cell ) : text {
  de&&mand_eq( is_an_integer_cell( c ), 1 );
  return integer_to_text( value( c ) );
}


/* -----------------------------------------------------------------------------
 *  Some memory integrity checks.
 */


function is_safe_proxy( proxy : InoxAddress ) : boolean {
  return all_proxied_objects_by_id.has( proxy )
}


function is_safe_pointer( pointer : InoxAddress ) : boolean {
  if( !is_safe_area( pointer ) )return false;
  return true;
}


function cell_looks_safe( c : Cell ) : boolean {
// Try to determine if a cell looks like a valid one

  const v : Value = value( c );
  const i : Info  = info( c );
  const t : Type  = unpack_type( i );

  let referencee : Cell = v;

  switch( t ){

  case type_boolean :
    if( v != 0 && v != 1 ){
      bug( "Invalid boolean value " + v + " for cell " + c );
      return false;
    }
    break;

  case type_text :
    if( !is_safe_proxy( referencee ) ){
      bug( "Invalid proxy " + referencee + " for text cell " + c );
      return false;
    }
    // ToDo: check it is a string
    return true;

  case type_proxy :
    return is_safe_proxy( referencee );

  case type_pointer :
    return is_safe_pointer( referencee );

  case type_tag :
    const tag = v;
    if( ! is_valid_tag( tag ) ){
      bug( "Invalid tag " + tag + " for cell " + c );
    }
    return true;

  case type_integer :
    return true;

  case type_word :
    // ToDo: check
    return true;

  case type_void :
    return true;

  default :
    bug( "Invalid type " + t + " for cell " + c );
    return false;

  }
}


function tag_to_text( tag : Tag ) : text {
  if( !all_tag_singleton_text_names_by_id.has(  tag  ) ){
    bug( "Invalid tag " + tag );
    return "<invalid tag " + tag + ">";
  }
  const name = all_tag_singleton_text_names_by_id.get( tag );
  de&&mand_neq( name, "" );
  return name;
}


function cell_to_text( cell : Cell ) : text {

  alloc_de&&mand( cell_looks_safe( cell ) );

  const v : Value = value( cell );
  const i : Info  = info(  cell );
  const t : Type  = unpack_type( i );

  // ToDo: optimize with a switch?
  if( t == type_text ){
    return proxy_to_text( v );
  }else if( t == type_tag ){
    return tag_to_text( v );
  }else if( t == type_boolean ){
    return v ? "true" : "";
  }else if( t == type_integer ){
    return integer_to_text( v );
  }else if( t == type_word ){
    return ""; // ToDo: return word name if not anonymous?
  }else if( t == type_pointer ){
    // ToDo: reenter the inner interpreter to call a to-text method?
    return "";
  }else if( t == type_void ){
    return "";
  }else{
    return "";
  }

}


/* ----------------------------------------------------------------------------
 *  Debug tool
 */


function is_a_tag_singleton( c : Cell ) : boolean {
  if( !is_a_tag_cell( c ) )return false;
  return value( c ) == c;
}


// The header of each block of machine codes.
const tag_inox_block = tag( "inox-block" );


function is_a_block_cell( c : Cell ) : boolean {
  return name( c ) == tag_inox_block;
}


function is_a_word_block( c : Cell ) : boolean {
// True when block is the definition of a word vs inline code.
  return is_a_block_cell( c ) && !is_an_inline_block_cell( c );
}


function block_dump( ip : InoxAddress ) : text {
  de&&mand( is_a_block_cell( ip ) );
  const length = block_length( ip );
  let buf = "";
  buf += "Block " + ip + ", length " + length;
  // ToD: decode flags
  if( is_immediate_inox_word( ip ) ){
    buf += ", immediate";
  }
  if( is_an_inline_block_cell( ip ) ){
    buf += ", inline {]";
  }else{
    buf += ", word definition";
  }
  return buf;
}


let cell_dump_entered = false;


function cell_dump( c : Cell ) : text {

  // Detect recursive calls
  if( cell_dump_entered ){
    return "Error, reentered cell_dump( " + c + " )";
  }
  cell_dump_entered = true;

  const is_valid = cell_looks_safe( c );

  let v : Value = value( c );
  let i : Info  = info(  c );
  let t : Type  = unpack_type( i );
  let n : Tag   = unpack_name( i );

  let buf : text = "";

  switch( t ){

    case type_void :

      if( n == tag_dynamic_ref_count ){
        // Check integrity of dynamic area
        if( !is_safe_area( header_to_area( c ) ) ){
          buf += "Invalid dynamic area, ";
        }else{
          cell_dump_entered = false;
          return "busy " + v;
        }

      }else if( n == tag_dynamic_next_area ){
        // Check integrity of dynamic area
        if( !is_safe_area( header_to_area( c ) ) ){
          buf += "Invalid dynamic free area, ";
        }else{
          cell_dump_entered = false;
          return "free " + v;
        }

      }else if( n == tag_dynamic_area_size ){
        // Check integrity of dynamic area
        if( !is_safe_area( header_to_area( c - words_per_cell ) ) ){
          buf += "Invalid dynamic area, ";
        }else{
          cell_dump_entered = false;
          if( is_busy_area( header_to_area( c - words_per_cell ) )){
            let length = ( v - 2 * size_of_cell ) / size_of_cell;
            // 0 length is what proxied objects use
            if( length == 0 ){
              const proxy_id = c + words_per_cell;
              const obj = proxied_object_by_id( proxy_id );
              const proxy_class_name = obj.constructor.name;
              buf += " - <PROXY-" + proxy_id + "> "
              + proxy_class_name + "@" + c + ">";
              return buf;
            }else{
              return "length " + ( v - 2 * size_of_cell ) / size_of_cell;
            }
          }else{
            return "size " + v;
          }
        }

      }else if( n == tag_inox_block ){
        // Block description often comes next
        if( is_a_block_cell( c + words_per_cell ) ){
          cell_dump_entered = false;
          return "inox-block definition";
        }
      }

      if( n != tag_void || v != 0 ){
        buf += tag_to_text( n );
      }
      if( v == 0 ){
        // buf += ":<void>";
      }else{
        buf += ":<void:" + v + ">";
      }
    break;

    case type_boolean :
      if( n != tag_boolean ){
        buf += tag_to_text( n ) + ":";
      }
      buf += v ? "true" : "false";
    break;

    case type_tag :
      if( n == v ){
        buf += "/" + tag_to_text( n );
        if( is_a_tag_singleton( c ) ){
          buf += " - <SINGLETON>";
        }
      }else{
        buf += tag_to_text( n ) + ":/" + tag_to_text( v );
      }
    break;

    case type_integer :
      if( n == tag_inox_block ){
        const block_dump_text = block_dump( c );
        cell_dump_entered = false;
        return block_dump_text;
      }
      if( n != tag_integer ){
        buf += tag_to_text( n ) + ":";
      }
      buf += integer_to_text( v );
    break;

    case type_pointer :
      // ToDo: add class
      const class_name_tag = name( v );
      buf += tag_to_text( n )
      + "<" + tag_to_text( class_name_tag ) + "@" + v + ">";
    break;

    case type_proxy :
      const obj = proxied_object_by_id( v );
      const proxy_class_name = obj.constructor.name;
      buf += tag_to_text( n )
      + "<proxied-" + proxy_class_name + "@" + v + ">";
    break;

    case type_text :
      let text = cell_to_text( c );
      // ToDo: truncate somewhere else
      if( text.length > 31 ){
        text = text.slice( 0, 31 ) + "..." + text.length;
      }
      if( n != tag_text ){
        buf += tag_to_text( n )  + ":";
      }
      // ToDo: better escape
      text = text
      .replace( "\n",  () => "\\n"  )
      .replace( "\"",  () => "\\\"" )
      .replace( "\t",  () => "\\t"  )
      .replace( "\r",  () => "\\r"  )
      .replace( "\\",  () => "\\\\" )
      buf += "\"" + text + "\"";
      if( c == the_empty_text_cell ){
        buf += " - <SINGLETON>";
      }else if( text.length == 0 && v != 0 ){
        buf += " - <INVALID_EMPTY_TEXT>";
      }
    break;

    case type_word :
      // ToDo: add name
      buf += tag_to_text( n );
      if( v != 0 ){
        buf += ":<word:" + v + ">";
      }
    break;

    case type_flow :
      // ToDo: add name
      buf += tag_to_text( n ) + ":<flow:" + v + ">";
    break;

    default :
      de&&mand( false );
      buf += tag_to_text( n ) + ":<invalid type " + t + ":" + v + ">";
      breakpoint()
    break;

  }

  cell_dump_entered = false;

  buf += " - " + t + "/" + n + "/" + v
  + " " + type_to_text( t ) + " @" + c
  + ( is_valid ? "" : " - INVALID" );
  return buf;

}


function stacks_dump() : text {
// Returns a text dump of the cells of the data and control stacks, stack trace

  const tos = TOS;
  const csp = CSP;

  let buf  = "DATA STACK:";
  let ptr  = tos;

  // Checks that cells that were at the top of the stack were correctly cleared
  if( value( ptr - 2 * words_per_cell ) != 0 ){
    buf += "\n-2 DIRTY -> " + cell_dump( ptr - 2 * words_per_cell );
    debugger;
  }
  if( value( ptr - words_per_cell ) != 0 ){
    buf += "\n-1 DIRTY -> " + cell_dump( ptr - 1 * words_per_cell );
    debugger;
  }

  let base = ACTOR.stack;

  if( ptr > base ){
    bug(
      "Data stack underflow, top " + tos + ", base " + base
      + ", delta " + ( base - tos )
      + ", excess pop " + ( ( base - tos ) / words_per_cell )
    )
    base = ptr + 5 * words_per_cell;
  }

  let nn = 0;
  while( ptr <= base ){
    buf += "\n"
    + nn + " -> "
    + cell_dump( ptr )
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

  if( value( ptr - 2 * words_per_cell ) != 0 ){
    buf += "\n-2 DIRTY -> " + cell_dump( ptr - 2 * words_per_cell );
    debugger;
  }
  if( value( ptr - 1 * words_per_cell ) != 0 ){
    buf += "\n-1 DIRTY -> " + cell_dump( ptr - 1 * words_per_cell );
    debugger;
  }

  let return_base = ACTOR.control_stack;

  if( ptr > return_base ){
    bug(
      "Control stack underflow, top " + csp + ", base " + return_base
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
    + cell_dump( ptr )
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


primitive( "inox-debugger", primitive_inox_debugger );
function                    primitive_inox_debugger(){
// Activate lots of trace and invoke host debugger if any
  step_de  = true;
  run_de   = true;
  stack_de = true;
  eval_de  = true;
  token_de = true;
  debugger;
}


primitive( "inox-log", primitive_inox_log );
function primitive_inox_log(){
// Control logging of trace messages
  const verb_cell = POP();
  const typ = type( verb_cell );
  if( typ == type_tag ){
    const verb = value( verb_cell );
    if( verb == tag( "do-not" ) ){
      can_log = false;
    }
    if( verb == tag( "do" ) ){
      can_log = true;
    }
    bug = can_log ? console.log : debug;
    if( verb == tag( "enable" ) ){
      const domain_cell = POP();
      const domain_id = value( domain_cell );
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
      const domain_cell = POP();
      const domain_id = value( domain_cell );
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
}


/* -----------------------------------------------------------------------------
 *  Low level access to values, their packed type and name.
*/

const tag_type  = tag( "type"   );
const tag_name  = tag( "name"   );
const tag_value = tag( "value"  );
const tag_info  = tag( "info"   );

const pack_void    = pack( type_void,     tag_void     );
const pack_tag     = pack( type_tag,      tag_tag      );
const pack_integer = pack( type_integer,  tag_integer  );
const pack_text    = pack( type_text,     tag_text     );
const pack_pointer = pack( type_pointer,  tag_pointer  );
const pack_proxy   = pack( type_proxy,    tag_proxy    );
const pack_word    = pack( type_word,     tag_word     );


primitive( "inox-type", primitive_inox_type );
function                primitive_inox_type(){
// Get type as a tag
  const t = type( TOS );
  const tag = type_to_tag( t );
  clear_cell( TOS );
  init_cell(  TOS, tag, pack( type_tag, tag_type ) );
}


primitive( "inox-name", primitive_inox_name );
function                primitive_inox_name(){
// Get name as a tag
  const n = name( TOS );
  clear_cell( TOS );
  init_cell(  TOS, n, pack( type_tag, tag_name ) );
}


primitive( "inox-value", primitive_inox_value );
function primitive_inox_value(){
// Get value as an integer
  let v = value( TOS );
  clear_cell( TOS );
  init_cell(  TOS, v, pack( type_integer, tag_value ) );
}


primitive( "inox-info", function primitive_inox_info(){
// Get info as an integer, see inox-pack-info
  let i = info( TOS );
  clear_cell(   TOS );
  init_cell(    TOS, i, pack( type_integer, tag_info ) );
} );


primitive( "inox-pack-info", primitive_inox_pack_info );
function                     primitive_inox_pack_info(){
// Pack type and name into an integer, see inox-unpack-type and inox-unpack-name
  const name_cell= POP();
  const type_cell = TOS;
  const type_id = tag_to_type( value( type_cell ) );
  de&&mand( type_id != type_invalid );
  const info = pack( type_tag, value( name_cell ) );
  clear_cell( type_cell );
  clear_cell( name_cell );
  init_cell(  TOS, info, pack( type_integer, tag_info ) );
}


primitive( "inox-unpack-type", primitive_inox_unpack_type );
function                       primitive_inox_unpack_type(){
// Unpack type from an integer, see inox-pack-info
  const info = value( TOS );
  const type = unpack_type( info );
  const type_tag = type_to_tag( type );
  clear_cell( TOS );
  init_cell(  TOS, type, pack( type_tag, tag_type ) );
}


primitive( "inox-unpack-name", primitive_inox_unpack_name );
function                       primitive_inox_unpack_name(){
// Unpack name from an integer, see inox-pack-info
  const info = value( TOS );
  const name = unpack_name( info );
  clear_cell( TOS );
  init_cell(  TOS, name, pack( type_tag, tag_name ) );
}


/* ---------------------------------------------------------------------------
 *  Some type checking. They work only when the global "de" flag is set.
 *  This is true if the interpreter was compiled in so called debug or
 *  development mode. Once a program is considered deployable, it is usually
 *  run by a runtime that does not provide most of the facilities that
 *  are available in debug/development mode, for speed reasons and compactness.
 */


// Type is encoded using 4 bits, hence there exists at most 16 types.
const all_type_text_names_by_type_id  = new Array< text >;
const all_type_tags_by_type_id        = new Array< Tag >;
const all_type_ids_by_text_name       = new Map< text, Type >;
const all_type_ids_by_tag             = new Map< Tag, InoxIndex >;


all_type_text_names_by_type_id[ type_void    ] = "void";
all_type_text_names_by_type_id[ type_boolean ] = "boolean";
all_type_text_names_by_type_id[ type_tag     ] = "tag";
all_type_text_names_by_type_id[ type_integer ] = "integer";
all_type_text_names_by_type_id[ type_pointer ] = "pointer";
all_type_text_names_by_type_id[ type_proxy   ] = "proxy";
all_type_text_names_by_type_id[ type_text    ] = "text";
all_type_text_names_by_type_id[ type_word    ] = "word";
all_type_text_names_by_type_id[ type_flow    ] = "flow";
all_type_text_names_by_type_id[ type_invalid ] = "invalid";

all_type_tags_by_type_id[       type_void    ] = tag_void;
all_type_tags_by_type_id[       type_boolean ] = tag_boolean;
all_type_tags_by_type_id[       type_tag     ] = tag_tag;
all_type_tags_by_type_id[       type_integer ] = tag_integer;
all_type_tags_by_type_id[       type_pointer ] = tag_pointer;
all_type_tags_by_type_id[       type_proxy   ] = tag_proxy;
all_type_tags_by_type_id[       type_text    ] = tag_text;
all_type_tags_by_type_id[       type_word    ] = tag_word;
all_type_tags_by_type_id[       type_flow    ] = tag_flow;
all_type_tags_by_type_id[       type_invalid ] = tag_invalid;

all_type_ids_by_text_name.set( "void",           type_void     );
all_type_ids_by_text_name.set( "boolean",        type_boolean  );
all_type_ids_by_text_name.set( "tag",            type_tag      );
all_type_ids_by_text_name.set( "integer",        type_integer  );
all_type_ids_by_text_name.set( "pointer",        type_pointer  );
all_type_ids_by_text_name.set( "proxy",          type_proxy    );
all_type_ids_by_text_name.set( "text",           type_text     );
all_type_ids_by_text_name.set( "word",           type_word     );
all_type_ids_by_text_name.set( "flow",           type_flow     );
all_type_ids_by_text_name.set( "invalid",        type_invalid  );

all_type_ids_by_tag.set(        tag_void,        type_void     );
all_type_ids_by_tag.set(        tag_tag,         type_tag      );
all_type_ids_by_tag.set(        tag_integer,     type_integer  );
all_type_ids_by_tag.set(        tag_pointer,     type_pointer  );
all_type_ids_by_tag.set(        tag_proxy,       type_proxy    );
all_type_ids_by_tag.set(        tag_text,        type_text     );
all_type_ids_by_tag.set(        tag_word,        type_word     );
all_type_ids_by_tag.set(        tag_flow,        type_flow     );
all_type_ids_by_tag.set(        tag_invalid,     type_invalid  );


function type_to_text( type_id : InoxIndex ) : text {
// Convert a type id, 0..8, into a text.
  if( type_id < 0 || type_id >= type_invalid ){
    return "invalid";
  }
  return all_type_text_names_by_type_id[ type_id ];
}


function type_to_tag( type_id : InoxIndex ) : Tag {
// Convert a type id, 0..8, into it's tag.
  if( type_id < 0 || type_id >= type_invalid )return tag_invalid;
  return all_type_tags_by_type_id[ type_id ];
}


function tag_to_type( tag : Tag ) : Type {
// Convert a tag into a type id in range 0..9 where 9 is invalid.
  if( all_type_ids_by_tag.has( tag ) )return all_type_ids_by_tag.get( tag );
  return type_invalid;
}


function type_name_to_type( name : text ) : Type {
// Convert a type text name into a type id in range 0..9 where 9 is invalid.
  if( all_type_ids_by_text_name.has( name ) )return all_type_ids_by_text_name.get( name );
  return type_invalid;
}


function mand_type( actual : InoxIndex, expected : InoxIndex ){
  if( actual == expected )return;
  bug( "Bad type, " + actual   + " (" + type_to_text( actual   ) + ")"
  + " vs expected " + expected + " (" + type_to_text( expected ) + ")" );
  mand_eq( actual, expected );
}


function mand_name( actual : InoxIndex, expected : InoxIndex ){
  if( actual == expected )return;
  bug( "Bad name, " + actual   + " (" + tag_to_text( actual )   + ")"
  + " vs expected " + expected + " (" + tag_to_text( expected ) + ")" );
  mand_eq( actual, expected );
}


function mand_cell_type( cell : Cell, type_id : InoxIndex ): void {
// Assert that the type of a cell is the expected type.
  const actual_type = type( cell );
  if( actual_type == type_id )return;
  bug( "Bad type for cell " + cell
  + ", expected " + type_id + " (" + type_to_text( type_id ) + ")"
  + " vs actual "
  + actual_type + "/" + type_to_text( actual_type ) );
  // ToDo: should raise a type error
  mand_type( type( cell ), type_id );
}


function mand_void_cell( cell : Cell ) : void {
// Assert that the type of a cell is the integer type.
  mand_cell_type( cell, type_void );
}


function mand_boolean_cell( cell : Cell ) : void {
// Assert that the type of a cell is the boolean type.
  mand_cell_type( cell, type_boolean );
}


function mand_tag_cell( cell  : Cell ){
// Assert that the type of a cell is the pointer type.
  mand_cell_type( cell, type_tag );
}


function mand_pointer_cell( cell : Cell ) : void {
// Assert that the type of a cell is the integer type.
  mand_cell_type( cell, type_pointer );
}


function mand_proxy_cell( cell : Cell ) : void {
// Assert that the type of a cell is the integer type.
  mand_cell_type( cell, type_proxy );
}


function mand_text_cell( cell  : Cell ){
// Assert that the type of a cell is the text type.
  mand_cell_type( cell, type_text );
}


function mand_word_cell( cell : Cell ) : void {
// Assert that the type of a cell is the integer type.
  mand_cell_type( cell, type_word );
}


function cell_class_tag( cell : Cell ) : Tag {
// Get the most specific type of a cell's value
  const t = type( cell );
  // For pointers, it's the name stored in the first cell of the object
  if( t == type_pointer ){
    return name( value( cell ) );
  }
  // For proxied object, it's the class name of the proxied object
  if( t == type_proxy ){
    const proxied_obj = proxied_object_by_id( value( cell ) );
    const js_type = typeof proxied_obj;
    if( typeof proxied_obj == "object" ){
      return tag( proxied_obj.constructor.name );
    }
    return tag( js_type );
  }
  return type_to_tag( type( cell ) );
}


const tag_class = tag( "class" );


primitive( "inox-class", function inox_get_class(){
// Get the most specific type name (as a tag) of the top of stack cell
  const tos = TOS;
  const class_tag = cell_class_tag( tos );
  clear_cell( tos );
  set_value( tos, class_tag );
  set_info( tos, pack( type_tag, tag_class ) );
} );


/* ---------------------------------------------------------------------------
 *  Some ...
 */


primitive( "inox-if", primitive_inox_if );
function              primitive_inox_if(){
// Disable block unless next of stack is true. ( bool block -- block-or-f )
  const block = POP();
  if( value( TOS ) != 0 ){
    move_cell( block, TOS );
  // Else inox-call will detect false and do nothing accordingly
  }else{
    clear_cell( block );
  }
}


primitive( "inox-if-else", primitive_inox_if_else );
function                   primitive_inox_if_else(){
// keep one of two blocks  ( bool then-block else-block -- block )
  const else_block = POP();
  const then_block = POP();
  if( value( TOS ) != 0 ){
    move_cell( then_block, TOS );
    clear_cell( else_block );
  }else{
    move_cell( else_block, TOS );
    clear_cell( then_block );
  }
}


primitive( "inox-to-control", primitive_inox_to_control )
function                      primitive_inox_to_control(){
  // >R in Forth
  CSP -= words_per_cell;
  move_cell( POP(), CSP );
}


primitive( "inox-from-control", primitive_inox_from_control );
function                        primitive_inox_from_control(){
  // R> in Forth
  move_cell( CSP, PUSH() );
  CSP += words_per_cell;
}


primitive( "inox-fetch-control", function primitive_inox_fetch_control(){
  // R@ in Forth
  copy_cell( CSP, PUSH() );
} );


function FATAL( message : text ){
// Display error and stacks. Clear stack & get back to eval loop
  bug( "\nFATAL: " + message + "\n" + stacks_dump() );
  SET_CSP( ACTOR.control_stack );
  SET_TOS( ACTOR.stack );
  SET_IP( 0 );
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
const tag_inox_loop_until      = tag( "inox-loop-until" );
const tag_inox_looo_while      = tag( "inox-loop-while" );


primitive( "inox-while-1", function primitive_inox_while_1(){
// Low level words to build inox-while( { condition } { body } )
  // : inox-while
  //   inox-while-1 ( save blocks in control stack )
  //   inox-while-2 ( run condition block )
  //   inox-while-3 ( if condition ok, run body & jump to while-2 )
  // . inox-inline
  const body_block      = POP();
  const condition_block = POP();
  // IP is expected to points to inox-while-2
  de&&mand_eq( name( IP ), tag_inox_while_2 );
  // Save info for inox-break-loop, it would skip to after inox-while-3
  let new_csp = CSP;
  new_csp -= words_per_cell;
  de&&mand_eq( value( new_csp ), 0 );
  init_cell(
    new_csp,
    IP + 2 * words_per_cell, tag_inox_break_sentinel
  );
  // Move condition and body to control stack
  new_csp -= words_per_cell;
  move_cell( body_block, new_csp );
  if( de ){
    set_info( new_csp, tag_inox_while_body );
  }
  new_csp -= words_per_cell;
  move_cell( condition_block, new_csp );
  if( de ){
    set_info( new_csp, tag_inox_while_condition );
  }
  CSP = new_csp;
  // The control stack now holds:
  //   IP for inox-break, named inox-loop-sentinel
  //   IP for the body block
  //   IP for the condition block
  // Execution continues inside inox-while-2
} );


primitive( "inox-while-2", function primitive_inox_while_2(){
  // IP is expected to point to inox-while-3
  de&&mand_eq( name( IP ), tag_inox_while_3 );
  const csp = CSP;
  const condition_block = value( csp );
  // Invoke condition, like inox-call would
  const next_csp = csp - words_per_cell;
  de&&mand_eq( value( next_csp ), 0 );
  init_cell( next_csp, IP, tag_inox_goto_while_3 );
  CSP = next_csp;
  // Jump into block, skip length header
  IP = condition_block + 1 * words_per_cell;
  // The control stack now holds:
  //   IP for the body block, named /inox-while-body in debug mode
  //   IP for the condition block, named /inox-while-condition in debug mode
  //   IP addres of inox-while-3, the condition block will return to it
} );


function primitive_inox_while_3(){

  const csp = CSP;
  const tos = POP();
  let   bool = value( tos );
  clear_cell( tos );

  // If the condition is met, run the body and loop
  if( bool != 0 ){
    const body_block = value( csp + words_per_cell );
    // The inox-return of the body block must jump to inox-while-2
    const next_csp = csp - words_per_cell;
    de&&mand_eq( value( next_csp ), 0 );
    // ip currently points after this primitive, hence while-2 is before
    init_cell(
      next_csp,
      IP - 2 * words_per_cell,
      tag_inox_goto_while_2
    );
    CSP = next_csp;
    // CSP must now point to inox-while-2 primitive word
    de&&mand_eq(
      name( value( CSP ) ),
      tag_inox_while_2
    );
    // Jump into the body block, after the block length header
    IP = body_block + 1 * words_per_cell;

  // The while condition is not met, it's time to exit the loop
  }else{
    // Drop loop sentinel, condition and body from control stack.
    // ToDo: use lookup instead of fixed value if optimistic guess failed.
    const new_csp = csp + 3 * words_per_cell;
    de&&mand_eq(
      name( new_csp - words_per_cell ),
      tag_inox_break_sentinel
    );
    CSP = new_csp;
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
  if( value( TOS ) == 0 ){
    set_value( TOS, 1 );
  }else{
    set_value( TOS, 0 );
  }
  primitive_inox_while_3();
} );


primitive( "inox-loop", function primitive_loop(){
  const tos = POP();
  const body_block = value( tos );
  clear_cell( tos );
  // Save info for inox-break-loop, it would skip to after inox-loop
  let new_csp = CSP - words_per_cell;
  de&&mand_eq( value( new_csp ), 0 );
  init_cell( new_csp, IP, tag_inox_break_sentinel );
  // Invoke body block, it will return to itself, loopimg until some break
  new_csp -= words_per_cell;
  init_cell(
    new_csp,
    body_block + 1 * words_per_cell,
    tag_inox_loop_body
  );
  CSP = new_csp;
  // Jump into boby block, skip length header
  IP = body_block + 1 * words_per_cell;
} );


function lookup_sentinel( csp : Cell, tag : InoxName ) : Cell {
  let next_csp = csp + words_per_cell;
  // ToDo: init actor with a sentinel in the control stack
  let limit = 10000;
  // Drop anything until sentinel
  while( limit-- ){
    // ToDo: test type against Act boundary
    if( name( next_csp ) == tag )return next_csp ;
    next_csp += words_per_cell;
  }
  return 0;
}


primitive( "inox-break", function inox_break(){
// Like inox-return but to exit a control structure, a non local return
  const csp : Cell = CSP;
  let sentinel_csp = lookup_sentinel( csp, tag_inox_break_sentinel );
  // ToDo: raise exception if not found
  if( sentinel_csp == 0 ){
    FATAL( "inox-break sentinel is missing" );
    return;
  }
  // Return to IP previously saved in break sentinel
  IP = value( sentinel_csp );
  // Clear control stack up to sentinel
  let cell = csp;
  while( cell <= sentinel_csp ){
    raw_clear_cell( cell );
    cell += words_per_cell;
  }
  const new_csp = sentinel_csp + words_per_cell;
  CSP = new_csp;
} );


primitive( "inox-sentinel", function primitive_inox_sentinel(){
  const tos = POP();
  de&&mand_eq( type( tos ), type_tag );
  const sentinel_name = name( tos );
  raw_clear_cell( tos );
  let new_csp = CSP - words_per_cell;
  de&&mand_eq( value( new_csp ), 0 );
  init_cell( new_csp, IP, sentinel_name );
  CSP = new_csp;
} );


primitive( "inox-jump", function inox_jump(){
// Non local return to some sentinel set using inox-sentinel
  const tos = POP();
  de&&mand_eq( type( tos ), type_tag );
  const sentinel_name = name( tos );
  raw_clear_cell( tos );
  const csp : Cell = CSP;
  const sentinel_csp = lookup_sentinel( csp, sentinel_name );
  // ToDo: raise exception if not found
  if( sentinel_csp == 0 ){
    FATAL(
      "inox-jump, missing sentinel " + tag_to_text( sentinel_name )
    );
    return;
  }
  // ToDo: "continue" word to return to IP previously saved in sentinel
  // IP = cell_value( sentinel_csp ) );
  // Clear control stack up to sentinel
  let new_csp = csp;
  while( new_csp <= sentinel_csp ){
    clear_cell( new_csp );
    new_csp += words_per_cell;
  }
  CSP = new_csp;
} );


primitive( "inox-loop-until", primitive_inox_loop_until );
function primitive_inox_loop_until(){
  const condition_block_cell = POP();
  const condition_block = value( condition_block_cell );
  clear_cell( condition_block_cell );
  const body_block_cell = POP();
  const body_block = value( body_block_cell );
  clear_cell( body_block_cell );
  // ToDo: implement this
  debugger;

}


primitive( "inox-loop-while", primitive_inox_loop_while );
function primitive_inox_loop_while(){
  const condition_block_cell = POP();
  const condition_block = value( condition_block_cell );
  clear_cell( condition_block_cell );
  const body_block_cell = POP();
  const body_block = value( body_block_cell );
  clear_cell( body_block_cell );
  // ToDo: implement this
  debugger;
}



/* -----------------------------------------------------------------------------
 *  Polymorphic methods.
 */

const tag_missing_method   = tag( "missing-method"   );
const tag_missing_word     = tag( "missing-word"     );
const tag_missing_operator = tag( "missing-operator" );


function dispatch_binary_operator(
  operator_tag : InoxIndex,
  target_type  : InoxIndex
) : void {

  const tos = TOS;
  const target = tos + words_per_cell;

  const target_class_name = !is_reference_type( target_type )
  ? type_to_text( target_type )
  : tag_to_text( name( target ) );
  const full_name = target_class_name + "." + tag_to_text( operator_tag );

  let word_id = inox_word_tag_by_text_name( full_name );
  if( word_id == 0 ){
    // ToDo: lookup in class hierarchy
    // ToDo: on the fly creation of the target method if found
    if( word_id == 0 ){
      // ToDo: lookup based on type, unless pointer
      if( target_type != type_pointer ){
        // ToDo: get type as string, then add : and method name
      }
      if( word_id == 0 ){
        set_text_cell( PUSH(), full_name );
        word_id = inox_word_tag_by_tag( tag_missing_operator );
      }
    }
  }
  CSP = CSP - words_per_cell;
  init_cell( CSP, IP, tag( full_name ) );
  IP = definition_by_tag( word_id );

}


// Arithmetic works on integers but also on the values of void & tag types
const all_integer_like_type_tags = [
  tag_void,
  tag_tag,
  tag_integer
];

type PrimitiveFunction      = () => void;
type UnaryOperatorFunction  = ( p : Value ) => Value;
type BinaryOperatorFunction = ( a : Value, b : Value ) => Value;

// Maps integer.+ to some BinaryOperatorFunction, for all operators
const all_binary_operator_functions_by_tag
= new Map< InoxName, BinaryOperatorFunction >;

// Maps integer.not? to some UnaryOperatorFunction, for all operators
const all_unary_operator_functions_by_tag
= new Map< InoxName, UnaryOperatorFunction >;


function inox_word_id_by_type_and_word(
  target_type : Tag,
  name : Tag
) : InoxIndex {
  const fullname = tag_to_text( target_type ) + "." + tag_to_text( name );
  return all_primitive_ids_by_text_name.get( fullname );
}


function define_class_binary_operator_primitive(
  target_type : Type,
  operator_name : Tag,
  fun : BinaryOperatorFunction
){

  const primitive_name
  = tag_to_text( target_type ) + "." + tag_to_text( operator_name );

  // For reference types
  if( is_reference_type( target_type ) ){


  // For not reference types, including integer
  }else{

    const tos = TOS;
    const target = tos + words_per_cell;

    let word_id = inox_word_id_by_type_and_word(
      target_type,
      operator_name
    );
    if( word_id == 0 ){
      // ToDo: lookup in class hierarchy
      // ToDo: on the fly creation of the target method if found
      if( word_id == 0 ){
        set_text_cell( PUSH(), primitive_name );
        word_id = inox_word_tag_by_text_name( "operator-missing" );
      }
    }
    CSP = CSP - words_per_cell;
    init_cell( CSP, IP, tag( primitive_name ) );
    IP = definition_by_tag( word_id );
  }

}


function define_overloaded_binary_operator_primitives(
  operator_name : Text,
  fun : BinaryOperatorFunction,
){

  let primitive_name : text;
  let class_name : Tag;

  for( class_name of all_integer_like_type_tags ){
    define_class_binary_operator_primitive(
      class_name,
      tag( primitive_name ),
      fun
    );
  };

}



operator_primitive( "+", function primitive_add(){

  const tos = TOS;
  const target = tos + words_per_cell;
  const target_type = type( target );

  if( !is_reference_type( target_type ) ){
    const p2 = POP();
    const p1 = TOS;
    if( check_de ){
      if( type( p2 ) != type_integer ){
        clear_cell( p2 );
        bug( "bad type, expecting integer second operand to +" );
        assert( false );
        return;
      }
      if( type( p1 ) != type_integer ){
        bug( "bad type, expecting integer first operand to +" );
        assert( false );
        return;
      }
    }
    const x2 = value( p2 );
    raw_clear_cell( p2 );
    const x1 = value( p1 );
    const r  = x1 + x2;
    set_value( p1, r );
    return;
  }

  // Polymorphic case, with operator overloading
  dispatch_binary_operator( tag( "+" ), target_type );

} );


/*
 * =? - value equality
 */

const tag_is_equal = tag( "=?" );


function primitive_inox_is_equal(){

  const p2 = POP();
  const p1 = TOS;
  const value1 = value( p1 );
  const value2 = value( p2 );
  const type1  = type(  p1 );
  const type2  = type(  p2 );

  // Simple case if when both type and value are the same
  if( type1 == type2 ){
    if( value1 == value2 ){
      clear_cell( p2 );
      clear_cell( p1 );
      set_value(  p1, 1 );
      set_type(   p1, type_integer );
      set_name(   p1, tag_boolean )
      return;
    }
    // If not references, then they're necesseraly different
    if( !is_reference_cell( p1 ) ){
      clear_cell( p2 );
      clear_cell( p1 );
      set_value(  p1, 0 );
      set_type(   p1, type_integer );
      set_name(   p1, tag_boolean );
      return;
    }
    // For text, compare content
    if( type1 == type_text  ){
      const text1 : text = cell_proxied_object( p1 );
      const text2 : text = cell_proxied_object( p2 );
      clear_cell( p2 );
      clear_cell( p1 );
      // If same content
      if( text2 == text1 ){
        set_value(  p1, 1 );
      }else{
        set_value(  p1, 0 );
      }
      set_type(   p1, type_integer );
      set_name(   p1, tag_boolean );
      return;
    }
    // p1 is an object or a proxied object
    // ToDo: delegate to p1
    clear_cell( p1 );
    clear_cell( p2 );
    set_type( p1, type_integer );
    set_name( p1, tag_boolean );
    return;
  }

  // It's getting complex, let's delegate to the first operand if possible
  if( type1 != type_pointer ){
    clear_cell( p1 );
    clear_cell( p2 );
    set_type( p1, type_integer );
    set_name( p1, tag_boolean );
    return;
  }

  // ToDo: p1 is a pointer, let's delegate to the object it points to
  clear_cell( p1 );
  clear_cell( p2 );
  set_type( p1, type_integer );
  set_name( p1, tag_boolean );

}


operator_primitive( "=?", primitive_inox_is_equal );


/*
 * <>? - value inequality, the boolean opposite of =? value equality.
 */


operator_primitive( "<>?", function primitive_inox_is_not_equal(){
  primitive_inox_is_equal();
  const tos = TOS;
  const v = value( tos );
  if( v == 0 ){
    set_value( tos, 1 );
  }else{
    clear_cell( tos );
  }
} );


/*
 * ==? - object identicallity, ie shallow equality, not deep equality.
 */


function primitive_inox_is_identical(){

  const p2     = POP();
  const p1     = TOS;
  const value1 = value( p1 );
  const value2 = value( p2 );
  const type1  = type(  p1 );
  const type2  = type(  p2 );

  clear_cell( p2 );
  clear_cell( p1 );

  // Simple case if when both type and value are the same
  if( value1 == value2 && type1 == type2 ){
    set_value( p1, 1 );
  }else{
    set_value( p1, 0 );
  }

}


operator_primitive( "==?", primitive_inox_is_identical );


/*
 *  not==? - object inquality, boolean opposite of ==? shallow equality.
 */


operator_primitive( "not==?", function primitive_inox_is_not_identical(){
  primitive_inox_is_identical();
  const tos = TOS;
  const v = value( tos );
  if( v == 0 ){
    set_value( tos, 1 );
  }else{
    set_value( tos, 0 );
  }
} );


function operator( name : text, fun : Function ) : void {
// Build an operator primitive. Also built integer.xx, tag.xx
// and void.xx corresponding primitives.

  operator_primitive(
    name,
    function primitive_binary_operator(){
      const p2 = POP();
      const p1 = TOS;
      if( check_de ){
        if( type( p2 ) != type_integer ){
          clear_cell( p2 );
          bug( "bad type, expecting integer second operand" );
          assert( false );
          return;
        }
        if( type( p1 ) != type_integer ){
          bug( "bad type, expecting integer first operand" );
          assert( false );
          return;
        }
      }
      const r = fun( value( p1 ), value( p2 ) );
      raw_clear_cell( p2 );
      set_value( p1, r );
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
 *  Generic solution for arithmetic and boolean unary operations.
 */

function unary_operator( name : text, fun : Function ) : void {
  operator_primitive( name, function primitive_unary_operator(){
    const p0 = TOS;
    const r  = fun( value( p0 ) );
    set_value( p0, r );
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
 *  & - text concatenation
 */


function primitive_inox_join_text(){
// Text concatenation, t1 t2 -- t3
  const p1 = POP();
  const p0 = TOS;
  const r  = make_text_cell( cell_to_text( p0 ) + cell_to_text( p1 ) );
  clear_cell( p1 );
  copy_cell( r, p0 );
}


operator_primitive( "&", primitive_inox_join_text );

primitive( "inox-join-text", primitive_inox_join_text );


/*
 *  as" - string representation
 */


operator_primitive( "as\"\"", function primitive_as_text(){
  const p = TOS;
  if( type( p ) == type_text )return;
  // ToDo: free cell
  copy_cell( make_text_cell( cell_to_text( p ) ), p );
} );


/*
 *  is""? - true only if value is the empty text.
 *  ToDo: can"? - true if some string representation is possible.
 */

const the_empty_text_value = value( the_empty_text_cell );
de&&mand_eq( the_empty_text_value, 0 );


operator_primitive( "is-\"\"?", function primitive_is_empty_text(){
  const p0 = TOS;
  set_value(
    the_boolean_work_cell,
    type( p0 ) == type_text
    && value( p0 ) == 0  // the_empty_text_value
    ? 1 : 0
  );
  copy_cell( the_boolean_work_cell, p0 );
} );


/* -----------------------------------------------------------------------------
 *
 */


function inox_machine_code_cell_to_text( c : Cell ){
// Decompilation of a single machine code.

  // What type of code is this, Inox word, primitive, literal, jump?
  let t                 : Type;
  let n                 : Tag;
  let word_cell         : Cell;
  let word_name_id      : InoxName;
  let primitive_cell    : Cell;
  let primitive_name_id : InoxName;
  let name_text         : InoxText;
  let fun               : Function;

  t = type( c );
  n = name( c );

  // If code is a primitivse. That's when type is void; what a trick!
  if( t == type_void ){
    if( !all_primitive_cells_by_id.has( n ) ){
      debugger;
      return "Invalid primitive cell " + c + " named " + n
      + " (" + tag_to_text( n ) + ")";
    }
    primitive_cell = all_primitive_cells_by_id.get( n );
    primitive_name_id = name( primitive_cell );
    if( de && n != 0x0000 ){
      // inox-return is special. ToDo: it should not be special.
      de&&mand_eq( primitive_name_id, n );
    }
    if( !all_primitive_functions_by_id.has( n ) ){
      debugger
      return "Invalid primitive cell " + c + ", bad function named " + n
      + " ( " + primitive_name_id + ", " + tag_to_text( n ) + ")";
    }
    fun = all_primitive_functions_by_id.get( n );
    name_text = tag_to_text( primitive_name_id );
    return "cell " + c + " is " + name_text
    + " ( primitive " + primitive_name_id + ", " + fun.name + " )";

  // If code is the integer id of an Inox word, an execution token
  }else if ( t == type_word ){
    word_cell    = inox_word_cell_by_tag( n );
    word_name_id = name( word_cell );
    name_text    = tag_to_text( word_name_id );
    if( word_name_id == 0x0000 ){
      debugger;
      name_text = "cell " + c + " is word inox-return 0x0000";
    }
    return "cell " + c + " is " + name_text + " ( word " + word_name_id + " )";

  // If code is a literal
  }else{
    return "cell " + c + " is " + cell_dump( c ) + " ( literal )";
  }

}


function inox_word_to_text_definition( id : InoxIndex ) : text {
// Return the decompiled source code that defines the Inox word.
  // A non primitive Inox word is defined using an array of cells that
  // are either other words, primitives or literal values

  let text_name = inox_word_to_text( id );

  // The definition is an array of cells
  let def : Cell = definition_by_tag( id );

  // The prior cell stores flags & length
  let flags_and_length = value( def - words_per_cell );
  let flags  = flags_and_length & 0xffff0000;
  let length = flags_and_length &     0xffff;

  // ToDo: add a pointer to the previous word definition

  let buf = ": ( definition of " + text_name + ", word " + id
  + ", cell " + def
  + ( flags ? ", flags " : "" )
  + ", length " + length + " )\n";

  let ip   : InoxIndex = 0;
  let cell : Cell;

  while( ip < length ){
    cell = def + ip * words_per_cell;
    // Filter out final "return"
    if( ip + 1 == length ){
      de&&mand_eq( value( cell ), 0x0 );
      de&&mand_eq( type(  cell ), type_void );
      // de&&mand_eq( cell_name(  cell ), tag_return_id );
      break;
    }
    buf += ip + ": " + inox_machine_code_cell_to_text( cell ) + "\n";
    ip++;
  }

  return buf;

}


function inox_word_to_text( id : InoxIndex ) : text {
  let word_cell = inox_word_cell_by_tag( id );
  let name_id   = name( word_cell );
  return tag_to_text( name_id );
}


function inox_word_cell_to_text_definition( cell : Cell ) : text {
  const word_id = name( cell );
  return inox_word_to_text_definition( word_id );
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

const cell_tag_thing   = tag( "thing" );
const cell_tag_value   = tag( "value" );
const cell_tag_number  = tag( "number" );
const cell_tag_integer = tag( "integer" );
const cell_tag_object  = tag( "object" );
const cell_tag_native  = tag( "native" );
const cell_tag_block   = tag( "block" );


primitive( "thing.class", function(){
  copy_cell( cell_tag_thing, PUSH() );
} );


primitive( "value.class", function(){
  copy_cell( cell_tag_value, PUSH() );
} );


primitive( "object.class", function(){
  copy_cell( cell_tag_object, PUSH() );
} );


primitive( "number.class", function(){
  copy_cell( cell_tag_number, PUSH() );
} );


primitive( "native.class", function(){
  copy_cell( cell_tag_native, PUSH() );
} );


primitive( "void.class", function(){
  copy_cell( cell_tag_native, PUSH() );
} );


primitive( "integer.class", function(){
  copy_cell( cell_tag_integer, PUSH() );
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
  copy_cell( TOS, value( TOS ) );
} );


primitive( "inox-poke", function primitive_inox_poke(){
// Set the value of a cell, using a cell's address. Low level, unsafe.
  const address_cell = POP();
  const value_cell   = POP();
  move_cell( value_cell, value( address_cell ) );
  raw_clear_cell( address_cell );
} );


primitive( "inox-create-constant", primitive_inox_create_constant );
function                           primitive_inox_create_constant() : void {
// Create a getter word that pushes a literal onto the data stack

  // Get value, then name
  const value_cell = POP();

  // Create a word to get the content, first get it's name
  const name_cell = POP();
  const constant_name = cell_to_text( name_cell );
  //if( constant_name == "void" )debugger;
  const name_id = tag( constant_name );
  raw_clear_cell( name_cell );

  // Allocate space for word header, value and return instruction
  // ToDo: use allocate_cells() instead?
  const header = allocate_area( ( 1 + 1 + 1 ) * size_of_cell );

  // flags and length
  set_cell( header, type_integer, name_id, 1 + 1 );

  // Skip that header
  const def = header + 1 * words_per_cell;

  // Add Literal value
  move_cell( value_cell, def + 0 * words_per_cell );

  // Add return instruction
  set_return_cell( def + 1 * words_per_cell );

  if( de ){

    const word_cell = make_inox_word( name_id, def );

    // Anonymous words are given a void-nnnn name
    let true_name : Cell;
    if( name_id == 0 ){
      true_name = word_cell;
    }else{
      true_name = name_id;
    }

    de&&mand_eq( definition_by_tag( true_name ), def );
    de&&mand_eq(
      value(
        definition_by_tag( true_name ) + words_per_cell
      ),
      0x0000  // inox-return
    );

  }

}


const tag_peek = tag( "peek" );
const tag_poke = tag( "poke" );


primitive( "inox-create-global", function primitive_inox_create_global(){
// Create two words, a getter and a setter, unlike create-constant that
// creates only a getter.
// ToDo: @x to get the address of the global variable

  // Get info from data stack, expecting a value at the top of it and then a tag
  const tos = TOS;
  const name_cell = tos - words_per_cell;
  de&&mand_eq( type( name_cell ), type_tag );

  // Create a getter word to read the global variable like constants does
  primitive_inox_create_constant();

  // Create a setter word to write the global variable, xxx!
  const name_id = value( name_cell );
  const name = tag_to_text( name_id );
  const setter_name = name + "!";
  const setter_name_id = tag( setter_name );

  // Allocate space for word header, cell address, getter and return instruction
  // ToDo: use allocate_cells() instead?
  let setter_header = allocate_area( ( 1 + 3 ) * size_of_cell );

  // flags and length need an extra word, so does the ending "return"
  set_cell( setter_header, type_integer, name_id, 1 + 1 + 1 + 1 );

  // Skip that header
  const setter_def = setter_header + 1 * words_per_cell;

  // Use the cell in the constant as the parameter for poke
  const getter_def = definition_by_tag( name_id );
  init_cell( setter_def + 0 * words_per_cell, getter_def, setter_name_id );

  // Add call to primitive poke to set the value when word runs
  init_cell( setter_def + 1 * words_per_cell, tag_poke, 0 );

  // Add return instruction
  set_return_cell( setter_def + 2 * words_per_cell );

  make_inox_word( setter_name_id, setter_def );

  // Create a constant named @xxx to get the address of the variable
  const at_name_id = tag( "@" + name );
  set_value( name_cell, at_name_id );
  primitive_inox_create_constant();
  const at_def = definition_by_tag( at_name_id );
  init_cell( at_def, getter_def, at_name_id );

} );


primitive( "inox-create-control", primitive_inox_create_control );
function                          primitive_inox_create_control(){
// Create a control variable in the control stack, with some initial value
  const csp = CSP;
  const new_csp = csp - words_per_cell;
  CSP = new_csp;
  const name_cell = POP();
  const n = name( name_cell );
  raw_clear_cell( name_cell );
  const value_cell = POP();
  move_cell( value_cell, new_csp );
  set_name( new_csp, n );
}


const tag_inox_with = tag( "inox-with" );


primitive( "inox-with", primitive_inox_with );
function                primitive_inox_with(){
// Push inox-with sentinel on the data stack
  set_name( PUSH(), tag_inox_with );
}


const tag_rest = tag( "rest" );


primitive( "inox-with-parameters", primitive_inox_with_parameters );
function                           primitive_inox_with_parameters(){
// Create variables in the control stack for words with formal parameters.
// Up to inox-with sentinel. Usage : with /a /b xxxx inox-without-parameters

  let tos = TOS;
  let csp = CSP;

  // Count formal parameters up to inox-with sentinel included
  let new_tos = tos;
  let new_csp = csp;
  let count = 0;
  let parameter_name;
  while( true ){
    parameter_name = name( new_tos );
    count++;
    if( parameter_name == tag_rest ){
      // ToDo: special /rest parameter should make a list of the rest
    }
    if( parameter_name == tag_inox_with )break;
    if( count > 10 ){
      bug( "Too many parameters, more then ten" );
      debugger;
      break;
    }
    new_tos += words_per_cell;
  }

  // Set value of parameters using values from the data stack
  let copy_count = 0;
  let delta_tos = count * words_per_cell;
  let n : InoxName;

  // Go from sentinel argument back to tos, push each actual parameter
  const sentinel_tos = new_tos;
  let actual_argument_cell  = csp;
  let formal_parameter_cell = new_tos;
  let source_argument_cell  = new_tos + ( count - 1 ) * words_per_cell;

  let sentinel_csp : Cell;
  de&&mand_name( name( sentinel_tos ), tag_inox_with );
  de&&mand_type( type( sentinel_tos ), type_tag );

  while( copy_count < count ){

    // Process sentinel cell, actual argument is number of formal parameters
    if( copy_count == 0 ){
      de&&mand_name( name( formal_parameter_cell ), tag_inox_with );
      actual_argument_cell  -= words_per_cell;
      move_cell( sentinel_tos, actual_argument_cell );
      set_type(  actual_argument_cell, type_integer );
      set_value( actual_argument_cell, count - 1 );
      formal_parameter_cell -= words_per_cell;
      de&&mand_name( value( formal_parameter_cell ), tag( "a") );
      de&&mand_name( name(  formal_parameter_cell ), tag( "a") );
      copy_count++;
      continue;
    }

    if( copy_count == 1 ){
      mand_name( value( formal_parameter_cell ), tag( "a" ) );
      mand_name( name( formal_parameter_cell ), tag( "a" ) );
    }
    if( copy_count == 2 ){
      mand_name( name( formal_parameter_cell ), tag( "b" ) );
    }

    actual_argument_cell  -= words_per_cell;
    move_cell( source_argument_cell, actual_argument_cell );
    source_argument_cell  -= words_per_cell;

    n = name( formal_parameter_cell );
    clear_cell( formal_parameter_cell ); // ToDo: raw?
    formal_parameter_cell -= words_per_cell;

    if( copy_count == 1 ){
      mand_name( n, tag( "a" ) );
    }
    if( copy_count == 2 ){
      mand_name( n, tag( "b" ) );
    }

    set_name( actual_argument_cell, n );

    // Check that names match
    if( de  ){
      mand_name( name( actual_argument_cell ), n );
    }

    copy_count++;
    if( copy_count == count ){
      break;
    }
  }

  // Adjust both stack pointers
  new_tos = tos + ( 2 * count - 1 ) * words_per_cell;
  SET_TOS( new_tos );
  new_csp = csp - count  * words_per_cell;
  CSP = new_csp;

}


primitive( "inox-without-parameters", primitive_inox_without_parameters );
function                              primitive_inox_without_parameters()
{

  let csp = CSP;
  const limit = csp + 10 * words_per_cell;

  while( name( csp ) != tag_inox_with ){
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
  CSP = csp;

}


/*
 *  Read/write access to variables inside the control stack.
 */


primitive( "inox-get-control", primitive_inox_get_control );
function                       primitive_inox_get_control(){
// Copy the value of a control variable from the control stack to the data one
  const tos = TOS;
  check_de&&mand_eq( type( tos ), type_tag );
  const n = value( tos );
  let   ptr = CSP;
  while( name( ptr ) != n ){
    ptr += words_per_cell;
    if( check_de ){
      if( ptr >= ACTOR.control_stack ){
        FATAL( "Local variable not found, named " + tag_to_text( n ) );
        return;
      }
    }
  }
  copy_cell( ptr, tos );
}


primitive( "inox-set-control", primitive_inox_set_control );
function                       primitive_inox_set_control(){
// Set the value of a control variable in the control stack
  const tos   = POP();
  check_de&&mand_eq( type( tos ), type_tag );
  const n = value( tos );
  raw_clear_cell( tos );
  let ptr = CSP;
  while( name( ptr ) != n ){
    ptr += words_per_cell;
    if( check_de ){
      if( ptr >= ACTOR.control_stack ){
        FATAL( "Local variable not found, named " + tag_to_text( n ) );
        return;
      }
    }
  }
  const value_cell = POP();
  move_cell( value_cell, ptr );
  set_name( ptr, n );
}


/*
 *  Read/write access to variables inside the data stack.
 */


primitive( "inox-get-data", primitive_inox_get_data );
function                    primitive_inox_get_data(){
// Copy the value of a data variable from the data stack
  const tos  = TOS;
  check_de&&mand_eq( type( tos ), type_tag );
  const n = value( tos );
  let   ptr  = tos + words_per_cell;
  while( name( ptr ) != n ){
    ptr += words_per_cell;
    if( check_de ){
      if( ptr > ACTOR.stack ){
        FATAL( "Data variable not found, named " + tag_to_text( n ) );
        return;
      }
    }
  }
  copy_cell( ptr, tos );
}


primitive( "inox-set-data", primitive_inox_set_data );
function                    primitive_inox_set_data(){
// Set the value of a data variable in the data stack
  const tos  = POP();
  check_de&&mand_eq( type( tos ), type_tag );
  const n = value( tos );
  const cell = POP();
  let   ptr  = cell + words_per_cell;
  while( name( ptr ) != n ){
    ptr += words_per_cell;
    if( check_de ){
      if( ptr > ACTOR.stack ){
        FATAL( "Data variable not found, named " + tag_to_text( n ) );
        return;
      }
    }
  }
  clear_cell( tos );
  copy_cell( cell, ptr );
  set_name( ptr, n );
}


primitive( "inox-size-of-cell", function primitive_inox_size_of_cell(){
  const cell = PUSH();
  copy_cell( the_integer_work_cell, cell );
  de&&mand_eq( value( cell ), 0 );
  set_value( cell, size_of_cell );
} );


/*
 *  Indirect access to variables, like pointers in C
 */


function cell_lookup(
  start : Cell,
  end : Cell,
  tag : Tag,
  nth : InoxIndex
) : Cell {
  let found = 0;
  let ptr = start;
  if( start < end ){
    while( true ){
      if( name( ptr ) == tag ){
        if( nth == 0 ){
          found = ptr;
          break;
        }else{
          nth--;
        }
      }
      if( ptr == end )break;
      ptr++;
    }
  }else if( start > end ){
    while( true ){
      if( name( ptr ) == tag ){
        if( nth == 0 ){
          found = ptr;
          break;
        }else{
          nth--;
        }
      }
      if( ptr == end )break;
      ptr--;
    }
  }else{
    found = name( ptr ) == tag && nth == 0 ? ptr : 0;
  }
  return found;
}


primitive( "inox-lookup", primitive_lookup );
function                  primitive_lookup(){
// Get the address of the nth named value inside a range of cells, or void
  de&&mand_eq( type( TOS ), type_integer );
  const nth        = value( POP() );
  de&&mand_eq( type( TOS ), type_integer );
  const end_ptr    = value( POP() );
  de&&mand_eq( type( TOS ), type_integer );
  const start_ptr  = value( POP() );
  de&&mand_eq( type( TOS ), type_tag );
  const n = name( TOS );
  let found = cell_lookup( start_ptr, end_ptr, n, nth );
  if( found ){
    set_value( TOS, found );
  }else{
    raw_clear_cell( TOS )
  }
}


primitive( "inox-upper-control", primitive_upper_control );
function                         primitive_upper_control(){
// Get the value of the nth named value inside the control stack, or void
  de&&mand_eq( type( TOS ), type_integer );
  const nth        = value( POP() );
  de&&mand_eq( type( TOS ), type_tag );
  const n = name( TOS );
  let found = cell_lookup( CSP, ACTOR.control_stack, n, nth );
  if( found ){
    copy_cell( found, TOS );
  }else{
    raw_clear_cell( TOS )
  }
}

primitive( "inox-upper-data", primitive_upper_data );
function                      primitive_upper_data(){
// Get the value of the nth named value inside the data stack, or void
  de&&mand_eq( type( TOS ), type_integer );
  const nth        = value( POP() );
  de&&mand_eq( type( TOS ), type_tag );
  const n = name( TOS );
  let found = cell_lookup( TOS - words_per_cell, ACTOR.stack, n, nth );
  if( found ){
    copy_cell( found, TOS );
  }else{
    raw_clear_cell( TOS )
  }
}


primitive( "inox-set-upper-control", primitive_set_upper_control );
function                             primitive_set_upper_control(){
// Set the value of the nth named value inside the control stack
  const cell = POP();
  const nth  = value( POP() );
  de&&mand_eq( type( TOS ), type_tag );
  const n = name( TOS );
  de&&mand_eq( type( cell ), type_tag );
  let found = cell_lookup( CSP, ACTOR.control_stack, n, nth );
  if( found ){
    copy_cell( cell, found );
  }else{
    FATAL( "Control nth" + nth
    + " variable not found, named " + tag_to_text( n ) );
  }
}


primitive( "inox-set-upper-data", primitive_set_upper_data );
function                          primitive_set_upper_data(){
// Set the value of the nth named value inside the data stack
  const cell = POP();
  const nth  = value( POP() );
  de&&mand_eq( type( TOS ), type_tag );
  const n = name( TOS );
  de&&mand_eq( type( cell ), type_tag );
  let found = cell_lookup( TOS - words_per_cell, ACTOR.stack, n, nth );
  if( found ){
    copy_cell( cell, found );
  }else{
    FATAL( "Data nth" + nth
    + " variable not found, named " + tag_to_text( n ) );
  }
}


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
  const cell = allocate_area( length * size_of_cell );

  // First cell is name:length
  init_cell( cell, length, pack( type_integer, class_name ) );
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
  let val;
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
    val = obj[ key ];
    if( array_part ){
      name = tag_item;
    }else{
      name = tag( key );
    }
    // Depending on type
    let new_cell : Cell;
    const js_type = typeof val;

    if( js_type == "number" ){
      if( Number.isInteger( val ) ){
        new_cell = make_integer_cell( val );
      }else{
        // ToDo: new_cell = make_float_cell( val )
      }

    }else if( js_type == "boolean" ){
      new_cell = make_integer_cell( val ? 1 : 0 );

    }else if( js_type == "string" ){
      new_cell = make_text_cell( val );

    }else if( js_type == "object" ){
      new_cell = make_circular_object_from_js( val, met );
    }
    if( new_cell == the_void_cell ){
      // Already void
    }else{
      move_cell( new_cell, top );
      set_name( top, name );
      free_cell( new_cell );
    }
    top += words_per_cell;
  }

  return cell;

}


function make_object_from_js( obj : any ) : Cell {
// Build a new Inox object from a Javascript one, a deep clone.
  // Handle circular pointers
  let met_objects = new Map< String, any >;
  const new_cell = make_circular_object_from_js( obj, met_objects );
  // Free whatever memory the map uses
  met_objects = null;
  return new_cell;
}


function object_length( header : Cell ) : InoxIndex {
// Get the number of cells of the object
  // This does not include the header used for memory management
  // The first cell of the object contains the length, whereas the
  // it's name is the class of the object.
  const length = value( header );
  return length;
}


primitive( "inox-make-object", function primitive_inox_make_object() {
// Make an object from values plus header. v1 v2 ... vnn name:nn -- name:ptr
// Returns a pointer value that points to the new object in dynamic memory.
// Whenever that pointer is copied, a reference counter is incremented.
// Whenever a pointer is disposed, the counter is decremented.
// When the counter reaches zero, each member is also disposed and the
// dynamic memory to store the object is released back to the heap of
// cells.

  const class_name = name( TOS );
  check_de&&mand_type( type( TOS ), type_integer );
  const nattr  = value( TOS );
  const length = nattr + 1; // +1 for the header
  check_de&&mand( length > 1 && length < 100 );

  // Allocate a cell for the class/length and cells for the values
  const dest   = allocate_area( length * size_of_cell );
  if( dest == 0 ){
    // ToDo: raise an exception
    set_value( the_integer_work_cell, 0 );
    copy_cell( the_integer_work_cell, TOS );
    return;
  }

  // Set header, name is class, value is length, type is integer
  move_cell( TOS, dest );
  set_value( dest, length )

  // Move values from the stack to the object
  for( let ii = 1 ; ii < length; ii++ ) {
    move_cell(
      TOS + ( length - ii ) * words_per_cell,
      dest + ii * words_per_cell
    );
  }
  // The first element is the named length
  de&&mand_eq( value( dest ), length );
  // Adjust TOS to pop the values and the name
  TOS += nattr * words_per_cell;
  set_cell( TOS, type_pointer, class_name, dest );
} );


primitive( "inox-object-get", function primitive_inox_object_get(){
// Copy the value of an instance variable from an object
  const tos = POP();
  const obj = TOS;
  let ptr = value( obj );
  // ToDo: Void from void?
  if( ptr == 0x0 ){
    de&&mand( info( obj ) == 0 );
    clear_cell( tos );
    clear_cell( obj );
    return
  }
  if( check_de ){
    mand_cell_type( tos, type_tag );
    mand_cell_type( obj, type_pointer );
    // ToDo: fatal error
  }
  let limit;
  if( check_de ){
    limit = ptr + object_length( ptr ) * words_per_cell;
  }
  // Skip the class name & length header first cell
  ptr += words_per_cell;
  const n = name( tos );
  while( name( ptr ) != n ){
    // ToDo: go backward? That would process the array as a stack
    ptr += words_per_cell;
    if( check_de ){
      if( ptr > limit ){
        FATAL( "Object variable not found, named " + tag_to_text( n ) );
        return;
      }
    }
  }
  clear_cell( tos );
  copy_cell( ptr, obj );
} );


primitive( "inox-object-set", function primitive_inox_object_set(){
// Set the value of an instance variable of an object.
  const name_cell = POP();
  check_de&&mand_type( type( name_cell ), type_tag );
  const n = value( name_cell );
  const obj = POP();
  if( check_de ){
    if( type( obj ) != type_pointer ){
      // ToDo: fatal error
      de&&mand_eq( type( obj ), type_pointer );
      return;
    }
  }
  let ptr = value( obj );
  let limit : InoxAddress;
  if( check_de ){
    limit = ptr + object_length( ptr ) * words_per_cell;
  }
  // Skip the class name & length header first cell
  ptr += words_per_cell;
  // Find the cell with the same name
  while( name( ptr ) != n ){
    // ToDo: go backward?
    ptr += words_per_cell;
    if( check_de ){
      if( ptr > limit ){
        FATAL( "Object variable not found, named " + tag_to_text( n ) );
        return;
      }
    }
  }
  clear_cell( ptr );
  move_cell( POP(), ptr );
  // Preserve initial name
  set_name( ptr, n );
  clear_cell( obj );
  clear_cell( name_cell );
} );


primitive( "inox-with-it", function primitive_inox_with_it(){
// Create and initialize an it control variable in the control stack
  CSP -= words_per_cell;     // : with-it /it rename >R ;
  move_cell( POP(), CSP );
  set_name( CSP, tag_it );
} );


primitive( "inox-without-it", function primitive_inox_without_it(){
// Clear the control stack down to the it control variable included
  let cell = CSP;
  let found = false;
  let limit = 10;
  while( !found ){
    if( name( cell ) === tag_it ){
      found = true;
    }
    clear_cell( cell );
    cell += words_per_cell;
    if( limit-- == 0 ){
      FATAL( "inox-without-it, it is missing" );
      return;
    }
  }
  CSP = cell;
} );


primitive( "inox-without", function primitive_inox_without(){
// Clear control stack down to the specified control variable included
  const tos = POP();
  de&&mand_eq( type( tos ), type_tag );
  const n = name( tos );
  raw_clear_cell( tos );
  let cell = CSP;
  let found = false;
  let limit = 10;
  while( !found ){
    if( name( cell ) === n ){
      found = true;
    }
    clear_cell( cell );
    cell += words_per_cell;
    if( limit-- == 0 ){
      FATAL( "inox-without, missing " + tag_to_text( n ) );
      return;
    }
  }
  CSP = cell;
} );

primitive( "inox-it", function primitive_inox_it(){
// Push the value of the it control variable onto the data stack
  let   ptr  = CSP;
  while( name( ptr ) != tag_it ){
    ptr += words_per_cell;
    if( check_de ){
      if( ptr >= ACTOR.control_stack ){
        FATAL( "Local variable 'it' not found" );
        return;
      }
    }
  }
  const tos = PUSH();
  copy_cell( ptr, tos );
} );


function set_text_cell( cell : Cell, text : text ){
// Make a cell into a text cell
  const temp_text = make_text_cell( text );
  move_and_free_cell( temp_text, cell );
}


function set_tag_cell( cell : Cell, name : Tag ){
  clear_cell( cell );
  init_cell( cell, name, pack( type_tag, name ) );
}


primitive( "inox-call-method-by-name", primitive_inox_call_method_by_name );
function                               primitive_inox_call_method_by_name(){
// Call method by name
  const tos = POP();
  const name_id = value( tos );
  const name = tag_to_text( name_id );
  clear_cell( tos );
  let target = TOS;
  const target_type = type( target );
  // ToDo: lookup using name of value ?
  let target_class_name = tag_to_text( cell_class_tag( target ) );
  const full_name = target_class_name + "." + name;
  let word_id = inox_word_tag_by_text_name( full_name );
  if( word_id == 0 ){
    // ToDo: lookup in class hierarchy
    // ToDo: on the fly creation of the target method if found
    if( word_id == 0 ){
      // ToDo: lookup based on type, unless pointer
      if( target_type != type_pointer ){
        // ToDo: get type as string, then add : and method name
      }
      if( word_id == 0 ){
        set_tag_cell( PUSH(), name_id );
        word_id = tag_missing_method;
      }
    }
  }
  CSP = CSP - words_per_cell;
  init_cell( CSP, IP, tag( full_name ) );
  IP = definition_by_tag( word_id );
}


primitive( "inox-call-method-by-tag", primitive_inox_call_method_by_tag );
function                              primitive_inox_call_method_by_tag(){
// Call method by tag
  primitive_inox_call_method_by_name();
}


primitive( "inox-call-with-it", primitive_inox_call_with_it );
function                        primitive_inox_call_with_it(){
// Like inox-call but with an it control variable.
  const tos = POP();
  const block = value( tos );
  // Do nothing if none, just pop the block & the target
  if( block == 0 ){
    clear_cell( tos );
    clear_cell( POP() );
    return;
  }
  check_de&&mand_cell_type( tos, type_integer );
  raw_clear_cell( tos );
  if( de && block < 4000 ){
    FATAL( "Not a block at " + block );
    return;
  }
  // Create and initialize an it control variable in the control stack
  CSP -= words_per_cell;
  move_cell( POP(), CSP );
  set_name( CSP, tag_it );
  // Push return address onto control stack
  CSP -= words_per_cell;
  init_cell( CSP, IP, tag_inox_call );
  // Jump into block definition
  IP = block + 1 * words_per_cell;
}


/* ---------------------------------------------------------------------------
 *  low level unsafe access to csp, tos & ip registers
 */

primitive( "inox-words-per-cell", function primitive_inox_words_per_cell(){
  set_value( the_integer_work_cell, words_per_cell );
  copy_cell( the_integer_work_cell, PUSH() );
} );


primitive( "inox-csp", function primitive_inox_csp(){
  set_value( the_integer_work_cell, CSP );
  copy_cell( the_integer_work_cell, PUSH() );
} );


primitive( "inox-set-csp", function primitive_set_csp(){
  CSP = value( POP() );
} );


primitive( "inox-tos", function primitive_inox_tos(){
  set_value( the_integer_work_cell, TOS );
  copy_cell( the_integer_work_cell, PUSH() );
} );


primitive( "inox-set-csp", function primitive_set_csp(){
  CSP = value( POP() );
} );


primitive( "inox-ip", function primitive_inox_ip(){
  set_value( the_integer_work_cell, IP );
  copy_cell( the_integer_work_cell, PUSH() );
} );


primitive( "inox-set-ip", function primitive_set_ip(){
  IP = value( POP() );
} );


/* -----------------------------------------------------------------------
 *  runner, fast, execute Inox words
 */


const type_primitive = type_void;


function ip(){  return IP;  }
function csp(){ return CSP; }
function tos(){ return TOS; }
function set_ip(  v : InoxAddress ){ IP  = v; }
function set_csp( v : InoxAddress ){ CSP = v; }
function set_tos( v : InoxAddress ){ TOS = v; }
function push(){ return TOS -= words_per_cell; }
function pop(){  return TOS += words_per_cell; }


class InoxExecutionContext {
  ip:      Function;  // The instruction pointer
  csp:     Function;  // top of control stack pointer
  tos:     Function;  // top of data stack pointer
  set_ip:  Function;  // Set the instruction pointer
  set_csp: Function;  // Set top of control stack pointer
  set_tos: Function;  // Set top of data stack pointer
  pop:     Function;  // Returns tos++
  push:    Function;  // Returns --tos
  run:     Function;  // Points to RUN()
}

const TheInoxExecutionContext = new InoxExecutionContext();


function init_the_execution_context(){
  const inox = TheInoxExecutionContext;
  inox.ip      = ip;
  inox.csp     = csp;
  inox.tos     = tos;
  inox.set_ip  = set_ip;
  inox.set_csp = set_csp;
  inox.set_tos = set_tos;
  inox.push    = push;
  inox.pop     = pop;
  inox.run     = RUN;
}

init_the_execution_context();


function SET_IP(  v ){ IP  = v; }
function SET_CSP( v ){ CSP = v; }
function SET_TOS( v ){ TOS = v; }
function PUSH(){ return TOS -= words_per_cell; }
function POP(){  const x = TOS; TOS += words_per_cell; return x; }


function RUN(){
// This is the one function that needs to run fast.
// It should be optimized by hand depending on the target CPU.
  // See https://muforth.nimblemachines.com/threaded-code/
  // Also http://www.ultratechnology.com/1xforth.htm
  // and http://www.bradrodriguez.com/papers/moving1.htm

  de&&mand( TOS <= ACTOR.stack );
  de&&mand( !! IP );

  // primitives have a limited access to the environment, but fast
  const inox = TheInoxExecutionContext;
  inox.ip  = function ip(){  return IP;  };
  inox.csp = function csp(){ return CSP; };
  inox.tos = function tos(){ return TOS; };
  // ToDo: gmp & tmp, global memory pointer and actor memory pointer
  // ToDo: act, current Act pointer
  inox.set_ip  = function set_ip(  v : InoxAddress ){ IP  = v; };
  inox.set_csp = function set_csp( v : InoxAddress ){ CSP = v; };
  inox.set_tos = function set_tos( v : InoxAddress ){ TOS = v; };

  inox.push = function push(){
    return TOS -= words_per_cell;
  };

  inox.pop = function pop(){
    const x = TOS;
    TOS += words_per_cell;
    return x;
  }

  // Avoid infinite loops. ToDo: should be global variables
  let credit_increment = 1000000;
  let remaining_credit = credit_increment;
  let total  = 0;
  let must_stop = false;

  inox.run = RUN;

  // inox.run = runner;

  // function runner(){

  let fun = no_operation;
  loop: while( true ){

    // ToDo: there should be a method to break this loop
    if( must_stop )break;

    // ToDo: the credit could vary depending on speed, ie instructions/second.
    remaining_credit = credit_increment;

    let i : Info;
    let t : Type;

    // ToDo: there should be a method to break this loop
    inner_loop: while( remaining_credit-- ){

      if( !IP )break loop;
      i = info( IP );

      // The non debug loop is realy short
      if( !de ){
        t = unpack_type( i );
        // If primitive
        if( t == type_primitive /* 0 */ ){
          IP += words_per_cell;
          primitive_function_by_id( i )();
        // If Inox defined word
        }else if( t == type_word ){
          CSP -= words_per_cell;
          set_value( CSP, IP + words_per_cell );
          // I could use a cached new IP
          // IP = cell_value( cell ); if( IP )continue;
          IP = definition_by_tag( unpack_name( i ) );
          // ToDo: I could cache the result inside the cell's value
          // set_cell_value( cell, IP );
        // If literal
        }else{
          TOS -= words_per_cell;
          copy_cell( IP, TOS );
          IP += words_per_cell;
        }
        continue inner_loop;
      }

      // The debug mode version has plenty checks and traces

      if( stack_de ){
        bug( "\nRUN IP: " + inox_machine_code_cell_to_text( IP ) + "\n"
        + stacks_dump() );
      }else if( run_de ){
        bug( "\nRUN IP: " + inox_machine_code_cell_to_text( IP ) );
      }

if( step_de )debugger;

      // Special "next" code, 0x0000, is a jump to the return address.
      // Machine code equivalent would be a return from subroutine.
      if( i == 0x0000 ){
        IP = value( CSP );
        if( run_de ){
          bug( "run, return to IP " + IP + " from "
          + name( CSP ) );
        }
        raw_clear_cell( CSP );
        if( IP == 0x0000 )break loop;  // That's the only way to exit the loop
        CSP += words_per_cell;
        continue;
      }

      // What type of code this is, primitive, Inox word or literal
      t = unpack_type( i );

      // Call to another word, the name of the cell names it
      if( t == type_word ){
        // Push return address into control stack
        CSP -= words_per_cell;
        set_value( CSP, IP + words_per_cell );
        // Store routine name also, cool for stack traces
        // ToDo: set type to Act?
        // ToDo: i could encode a word to execute that would sometimes
        // do something more sophisticated that just change the IP.
        set_info( CSP, i );
        // ToDo: The indirection could be avoided.
        // ToDo: cache the address of the defininition into cell's value
        // ToDo: alternatively the cache could be precomputed by add_code()
        IP = definition_by_tag( unpack_name( i ) );
        // bug( inox_word_to_text_definition( unpack_name( word ) ) );
        continue;
      }

      // Call to a primitive, the name of the cell names it.
      // ToDo: use a type instead of tricking the void type?
      if( t == type_void /* 0 */ ){

        IP += words_per_cell;

        // Some debug tool to detect bad control stack or IP manipulations
        let word_id = info;
        if( run_de && i != 61 ){  // inox-quote is special

          let old_ip  = IP;
          let old_csp = CSP;

          if( !all_primitive_functions_by_id.has( i ) ){
            FATAL( "Run. Primitive function not found for id " + i );
          }else{
            fun = all_primitive_functions_by_id.get( i );
            fun();
          }

          if( CSP != old_csp
          && i != tag( "inox-return" )
          && i != tag( "inox-call" )
          && i != tag( "inox-if-call" )
          && i != tag( "inox-call-by-name" )
          && i != tag( "inox-call-by-tag" )
          && i != tag( "inox-call-method-by-name" )
          && i != tag( "inox-returns" )
          && i != tag( "inox-while-1" )
          && i != tag( "inox-while-2" )
          && i != tag( "inox-while-3" )
          && i != tag( "inox-until-3" )
          && i != tag( "inox-loop" )
          && i != tag( "inox-break" )
          && i != tag( "inox-with-it" )
          && i != tag( "inox-without-it" )
          && i != tag( "inox-from-control" )
          && i != tag( "inox-create-control" )
          && i != tag( "inox-without" )
          && i != tag( "inox-sentinel" )
          && i != tag( "inox-jump" )
          && i != tag( "inox-with-parameters" )
          && i != tag( "inox-without-parameters" )
          && i != tag( "inox-call-with-it" )
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
          fun = all_primitive_functions_by_id.get( i );
          fun();
          // if( IP == 0 )break loop;
        }

        continue;
      }

      // Else, push literal
      TOS -= words_per_cell;
      copy_cell( IP, TOS );
      // ToDo: optimize by inlining copy_cell()
      // set_cell_value( TOS, cell_value( IP ) );
      // set_cell_info(  TOS, word );
      // if( is_reference_cell( IP ) ){
      //   increment_object_refcount( cell_value( IP ) );
      // }
      IP += words_per_cell;

    }  // while( credit-- > 0 )

    // Update total number of instructions
    total += credit_increment - remaining_credit;

  }  // until must stop

  // } // runner()

  // runner();

} // RUN()


function run(){

  // ToDo: better check for stacks overflow and underflow
  const actor = ACTOR;
  de&&mand( TOS <= ACTOR.stack );

  RUN();

  // ToDo: better check for stacks overflow and underflow
  de&&mand( actor == ACTOR );
  de&&mand( TOS <= ACTOR.stack );

}


function run_inox_word( word : text ){
  IP = inox_word_definition_by_text_name( word );
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


function define_alias( style : text, alias : text, new_text : text ){
// Set the definition of an alias inside a dialect/style.
  let aliases = aliases_by_style( style );
  aliases.set( alias, new_text );
}


function alias( a : text ){
// Get the potential aliased text for an alias in the durrent dialect/style.
  if( !  the_current_style_aliases.has( a ) )return null;
  return the_current_style_aliases.get( a );
}


function set_alias_style( style : text ) : void {
  the_current_style_aliases = all_aliases_by_style.get( style );
}


function aliases_by_style( style : text ) : Map< text, text > {
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
let sh_aliases         = make_style_aliases( "sh"         );
let c_aliases          = make_style_aliases( "c"          );
let javascript_aliases = make_style_aliases( "javascript" );
let lisp_aliases       = make_style_aliases( "lisp"       );


primitive( "inox-inox-dialect", primitive_inox_inox_dialect );
function                        primitive_inox_inox_dialect(){
  set_style( "inox" );
}


function text_to_cell( text : text ) : Cell {
  const cell = make_text_cell( text );
  return cell;
}


function clear_and_free_cell( cell : Cell ){
  clear_cell( cell );
  free_cell(  cell );
}


function move_and_free_cell( cell : Cell, to : Cell ){
  move_cell( cell, to );
  clear_and_free_cell( cell );
}


function push_text( text : text ){
  PUSH();
  set_text_cell( TOS, text );
}


primitive( "inox-current-dialect", primitive_inox_current_dialect );
function                           primitive_inox_current_dialect(){
  push_text( toker.style );
  set_name( TOS, tag( "dialect" ) );
}


primitive( "inox-forth-dialect", primitive_inox_forth_dialect );
function                         primitive_inox_forth_dialect(){
  set_style( "forth" );
}


primitive( "inox-dialect", primitive_inox_dialect );
function                   primitive_inox_dialect(){
  set_style( cell_to_text( TOS ) );
  clear_cell( POP() );
}


primitive( "inox-alias", primitive_inox_alias );
function                 primitive_inox_alias(){
// Add an alias to the current style/dialect
  const new_text_cell = POP();
  const new_text = cell_to_text( new_text_cell );
  clear_cell( new_text_cell );
  const old_text_cell = POP();
  const word = cell_to_text( old_text_cell );
  // ToDo: should check that old text is a token
  clear_cell( old_text_cell );
  define_alias( toker.style, word, new_text );
}


primitive( "inox-dialect-alias", primitive_inox_dialect_alias );
function                         primitive_inox_dialect_alias(){
// Add an alias to a style/dialect, eg "to" "To" "inox" --
  const style_cell = POP();
  const style = cell_to_text( style_cell );
  clear_cell( style_cell );
  const new_text_cell = POP();
  const new_text = cell_to_text( new_text_cell );
  clear_cell( new_text_cell );
  const old_text_cell = POP();
  const old_text = cell_to_text( old_text_cell );
  define_alias( style, old_text, new_text)
}


/* ----------------------------------------------------------------------------
 *  word and block compilation related.
 */

// In that mode, Inox source code evaluator treats all words as if immediate.
let immediate_mode_level : InoxIndex = 0;

// This is the id of the word beeing defined or last defined
let the_last_defined_inox_word : InoxIndex = 0;

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


primitive( "inox-literal", primitive_inox_literal );
function                   primitive_inox_literal(){
// Add a literal to the Inox word beeing defined or to a block
  const cell = fast_allocate_cell();
  move_cell( POP(), cell );
  eval_do_literal_function( cell );
  free_cell( cell );
}


primitive( "inox-machine-code", primitive_inox_do_machine_code );
function                        primitive_inox_do_machine_code(){
// Add an Inox word code id to the Inox word beeing defined or to a block
  const tos = POP();
  de&&mand_eq( type( tos ), type_integer );
  eval_do_machine_code_function( value( tos ) );
  raw_clear_cell( tos );
}


primitive( "inox", primitive_inox );
function           primitive_inox(){
// Read the next token from the source code input stream
// and get it's Inox word code id. Defaults to 0 if next token in source
// is not a defined Inox word.
// ToDo: could return a string instead of 0.
  eval_quote_next_token_function();
}


primitive( "inox-quote", primitive_inox_quote );
function primitive_inox_quote(){
// Get the next word from the currently executing word and skip it
  // MUST BE INLINED
  const ip = IP;
  let word_id = name( ip );
  the_last_quoted_word_id = word_id;
  set_value( the_integer_work_cell, word_id );
  copy_cell( the_integer_work_cell, PUSH() );
  // Skip the quoted word
  IP = ip + words_per_cell;
}


primitive( "inox-immediate", primitive_inox_immediate );
function primitive_inox_immediate(){
  set_inox_word_immediate_flag( the_last_defined_inox_word );
}


primitive( "inox-hidden", function primitive_inox_hidden(){
  set_inox_word_hidden_flag( the_last_defined_inox_word );
} );


primitive( "inox-operator", function primitive_inox_operator(){
  set_inox_word_operator_flag( the_last_defined_inox_word );
} );


primitive( "inox-inline", function primitive_inox_inline(){
  set_inline_inox_word_flag( the_last_defined_inox_word );
} );


primitive( "inox-immediate", function primitive_inox_immediate(){
  set_inox_word_immediate_flag( the_last_defined_inox_word );
} );


primitive( "inox-last-token", function primitive_inox_last_token(){
  copy_cell( the_last_token_cell, PUSH() );
} );


/* -------------------------------------------------------------------------
 *  ip manipulation
 */

primitive( "inox-tag", primitive_inox_tag );
function               primitive_inox_tag(){
// Make a tag, from a text typically
  set_value( the_tag_work_cell, tag( cell_to_text( TOS ) ) );
  copy_cell( the_tag_work_cell, TOS );
}


function call_word( word_id : InoxIndex ){

  // Push return address onto control stack
  const next_csp = CSP - words_per_cell;
  CSP = next_csp;
  de&&mand_eq( value( next_csp), 0 );
  set_value( next_csp, IP );
  set_name( next_csp,  word_id );

  // Jump to word definition
  const def = definition_by_tag( word_id );
  de&&mand( def != 0 );
  IP = def;
}


primitive( "inox-call-by-tag", primitive_inox_call_by_tag );
function                       primitive_inox_call_by_tag(){
// Call word by tag

  const tos = TOS;
  de&&mand_type( type_tag, type( tos ) );
  let word_tag = value( tos );

  // Lookup word, detect missing ones
  let word_id = inox_word_tag_by_tag( word_tag );
  if( word_id == 0 ){
    word_id = inox_word_tag_by_tag( tag_missing_word );
  }else{
    POP();
    raw_clear_cell( tos );
  }

  call_word( word_id );
}


primitive( "inox-call-by-name", primitive_inox_call_by_text_name );
function                        primitive_inox_call_by_text_name(){
// Call word by text name.

  const tos = TOS;
  de&&mand_type( type_text, type( tos ) );
  const name = cell_to_text( tos );

  // Lookup word, detect missing ones
  let word_id = inox_word_tag_by_text_name( name );
  if( word_id == 0 ){
    word_id = inox_word_tag_by_tag( tag_missing_word );
  }else{
    POP();
    clear_cell( tos );
  }

  call_word( word_id );
}


primitive( "inox-call-word", primitive_inox_call_word );
function                     primitive_inox_call_word(){
  de&&mand_type( type_word, type( TOS ) );
  const word_id = value( TOS );
  raw_clear_cell( TOS );
  call_word( word_id );
}


primitive( "inox-definition", primitive_inox_definition );
function primitive_inox_definition(){
// Get the address of the first element of the definition of a word
  const tos = TOS;
  const name = cell_to_text( tos );
  const word_id = inox_word_tag_by_text_name( name );
  if( word_id == 0 ){
    set_value( the_integer_work_cell, 0 );
    copy_cell( the_integer_work_cell, tos );
    return;
  }
  const ip = definition_by_tag( word_id );
  set_value( the_integer_work_cell, ip );
  copy_cell( the_integer_work_cell, tos );
}

// ToDo: inox-block-length & inox-word-flags


const tag_inox_call = tag( "inox-call" );


primitive( "inox-call", primitive_inox_call );
function                primitive_inox_call(){
// run block unless none
  // Get block address
  const block = value( TOS );
  // Do nothing if none
  if( block == 0 ){
    raw_clear_cell( POP() );
    return;
  }
  check_de&&mand_cell_type( TOS, type_integer );
  raw_clear_cell( POP() );
  if( de && block < 3000 ){
    FATAL( "Not a block at " + block );
    return;
  }
  // Push return address onto control stack
  CSP = CSP - words_per_cell;
  init_cell( CSP, IP, tag_inox_call );
  // Jump into block definition, skip length
  IP = block + 1 * words_per_cell;
}


primitive( "inox-if-call", primitive_inox_if_call );
function                   primitive_inox_if_call(){
  primitive_inox_if();
  primitive_inox_call();
}


primitive( "inox-run", function primitive_inox_run(){
  // "inox Hello inox-run" does what Hello does alone
  IP = definition_by_tag( value( POP() ) );
  // ToDo: check missing word
} );


function block_length( ip : InoxAddress ){
// Get the length of the block at ip.
  check_de&&mand_eq( name( ip ), tag_inox_block );
  const block_length = value( ip ) & 0xffff;
  return block_length;
}


function block_flags( ip : InoxIndex ){
// Get the flags of the block at ip.
  check_de&&mand_eq( name( ip ), tag_inox_block );
  const block_flags = value( ip ) >> 16;
  return block_flags;
}


primitive( "inox-block", function primitive_inox_block(){
// Skip block code after IP but push it's address. Ready for inox-call
  const ip = IP;
  check_de&&mand_type( type( ip ), type_integer );
  check_de&&mand_name( name( ip ), tag_inox_block );
  let length = block_length( ip );
  // If block is actually the block of a word then it is stored elsewhere
  if( de && is_block_ip( ip ) ){
    de&&mand_neq( length, 0 );
  }
  if( check_de ){
    de&&mand( length != 0 || !is_block_ip( ip ) );
    // For debugging purpose I store the block's ip somewhere
    set_value( the_block_work_cell, ip );
    copy_cell( the_block_work_cell, PUSH() );
  }else{
    const new_tos = PUSH();
    de&&mand_eq( value( new_tos ), 0 );
    set_value( new_tos, ip );
  }
  const new_ip = ip + ( 1 + length ) * words_per_cell;
  if( de ){
    // There should be a return opcode at the end of the block
    const previous_cell = new_ip - words_per_cell;
    const previous_cell_value = value( previous_cell );
    const previous_cell_type  = type( previous_cell );
    const previous_cell_name  = name( previous_cell );
    de&&mand_eq( previous_cell_value, 0 );
    de&&mand_eq( previous_cell_type, type_void );
    de&&mand_eq( previous_cell_name, 0x0 ); // tag_inox_return );
    //if( previous_cell_name != tag( "void" ) ){
    //  bug( "Bad opcode, not void, " + tag_to_text( previous_cell_name))
    //}
    //de&&mand_eq( previous_cell_name, tag( "void" ) );
  }
  IP = new_ip;
} );


/* -----------------------------------------------------------------------
 *  Tokenizer
 */

type Token = {
  type      : text,
  text      : text,
  position  : u32,
  line_no   : u32,
  column_no : u32
};

const void_token : Token = {
  type      : "",
  text      : "",
  position  : 0,
  line_no   : 0,
  column_no : 0
};


abstract class TextStreamIterator {
  // Get next text to tokenize. REPL would readline() on stdin typically
  abstract next() : text;
}


class Tokenizer {

  stream       : TextStreamIterator;  // ToDo: for future REPL

  text         : text           = ""; // source that is tokenized
  text_length  : number         = 0;
  text_cursor  : number         = 0;
  line_no      : number         = 0;
  column_no    : number         = 0;
  alias_cursor : number         = 0;

  // When set, whitespaces are the only separators, as in Forth
  eager_mode : boolean = false;

  back_token   : Token = void_token;  // One token ahead sometime
  post_literal_name : text = "";  // ToDo: weird, explain

  // Indentation an based definitions and keywords auto close
  indentation          = 0;
  previous_indentation = 0;
  non_space_seen       = false;

  // The last seen token
  token : Token = {
    type      : "",
    text      : "",
    position  : 0,
    line_no   : 0,
    column_no : 0
  };

  style : text                  = "";
  define : text                 = "";  // "to" when Inox style
  end_define : text             = "";  // "." when Inox style
  terminator_sign : text        = ";"; // ";" when Inox style
  cosmetic_sign : text          = ","; // "," ignored

  comment_monoline_begin        = "";  // "~~" when Inox style
  comment_monoline_begin_begin  = "";
  comment_multiline_begin       = "";  // "~|" when Inox style
  comment_multiline_end         = "";  // |~" when Inox style
  comment_multiline_begin_begin = "";
  comment_multiline_end_end     = "";

  first_comment_seen : boolean  = false;  // For style auto detection

}


// toker is short name for "the tokenizer singleton"
var toker : Tokenizer = new Tokenizer();


function set_comment_mono_line( begin : text ) : void {
  toker.comment_monoline_begin = begin;
  toker.comment_monoline_begin_begin = begin ? begin[ 0 ] : "";
  set_comment_multi_line( "", "" );
}

function set_comment_multi_line( begin : text, end : text ) : void {
  toker.comment_multiline_begin = begin;
  toker.comment_multiline_begin_begin = begin ? begin[ 0 ] : "";
  toker.comment_multiline_end = end;
  toker.comment_multiline_end_end = end ? end[ end.length - 1 ] : "";
}


function set_style( new_style : text ) : void {
// Set the new style for future tokens detections

  set_alias_style( new_style );

  if( new_style == "inox" ){
    set_comment_mono_line( "~~" );
    set_comment_multi_line( "~|", "|~" );
    // Using "to" is Logo style, it's turtles all the way down
    toker.define = "to";
    toker.end_define = ".";

  }else if( new_style == "c"
  ||        new_style == "javascript"
  ){
    set_comment_mono_line( "//" );
    set_comment_multi_line( "/*", "*/" );
    if( new_style == "javascript" ){
      toker.define = "function";
      toker.end_define = "}";
    }

  }else if( new_style == "sh" ){
    set_comment_mono_line( "#" );
    toker.define = "function";
    toker.end_define = "}";

  }else if( new_style == "forth" ){
    set_comment_mono_line( "\\" );
    set_comment_multi_line( "(", ")" );
    toker.define = ":";
    toker.end_define = ";";

  }else if( new_style == "lisp" ){
    set_comment_mono_line( ";" );
    toker.define = "defn";
    toker.end_define = ")";

  }else if( new_style == "prolog" ){
    set_comment_mono_line( "%" );
    toker.define = "clause";
    toker.end_define = ".";
  }

  toker.style = new_style;

  // Don't guess the style because user made it explicit
  toker.first_comment_seen = true;

}


function tokenizer_set_stream( stream : TextStreamIterator ){
  toker.stream = stream;
}


function tokenizer_restart( source : text ){

  // The source code to process.
  toker.stream      = null;
  toker.text        = source;
  toker.text_length = source.length;

  // Track progress in the source code
  toker.text_cursor = 0;
  toker.line_no     = 1;
  toker.column_no   = 0;

  // Default style
  set_style( "inox" );

  // First char of source code defines style of comments and aliases
  toker.first_comment_seen = false;

  // Obviously there is no previously detected token to deliver
  toker.back_token  = void_token;

  // Idem for the past literal name
  toker.post_literal_name = "";

  // Idem regarding indentation, restart fresh
  toker.indentation = 0;
  toker.previous_indentation = 0;
  toker.non_space_seen = false;

  // ToDo: make it reentrant
  // some enter/leave logic could stack the tokenizer state

}


primitive( "inox-start-input", function(){
  tokenizer_restart( cell_to_text( TOS ) );
  clear_cell( POP() );
} );


primitive( "inox-input", function primitive_inox_input(){
// Get next character in source code, or void
  const ch = tokenizer_peek();
  set_text_cell( PUSH(), ch );
} );


const tag_token = tag( "token" );


primitive( "inox-input-until", function primitive_inox_input_until(){
  const tos = TOS;
  let limit = cell_to_text( tos );
  clear_cell( tos );
  let buf = "";
  let ch : text ;
  while( true ){
    ch = tokenizer_peek();
    if( ch == "" && limit != "" ){
      // Return void if source is empty
      clear_cell( tos );
      return;
    }
    if( ch == limit ){
      set_text_cell( tos, buf );
      set_name( tos, tag_token );
      return;
    }
    buf += ch;
  }
} );


function unget_token( token : Token ) : void {
  toker.back_token = token;
}


primitive(
  "inox-pushback-token",
  function primitive_inox_pushback_token(){
    const cell = POP();
    const n = name( cell );
    unget_token( {
      type:   tag_to_text( n ),
      text:  cell_to_text( cell ),
      position:  0,
      line_no:   0,
      column_no: 0
    } );
  }
);


function tokenizer_peek() : text {
// Get/consume next character and advance cursor, or ""
// ToDo: bad name, peek should not eat the token.
  // ToDo: handle stream?
  if( toker.text_cursor >= toker.text_length )return "";
  const ch = toker.text[ toker.text_cursor++ ];
  return ch;
}


function tokenizer_pushback( ch : "" ){
  // ToDo: do I need this?
}


function next_token() : Token {
// Split source code into syntax tokens

  // ToDo: horn clauses, prolog syle
  // See http://tau-prolog.org/files/doc/grammar-specification.pdf

  // ToDo: lisp like nil and lists
  // See https://www.cs.cmu.edu/Groups/AI/html/cltl/clm/node9.html

  // ToDo: study Scheme implementations
  // See https://legacy.cs.indiana.edu/~dyb/pubs/3imp.pdf

  // If there is some token already, delivers it
  let token : Token = toker.back_token;
  if( token !== void_token ){
    toker.back_token = void_token;
    return token;
  }
  token = toker.token;

  // Get to where things were before
  let ii = toker.text_cursor;

  // Where the new token starts
  let start_ii = ii;

  // Default to "word" type of token
  token.type      = "word";
  token.text      = "";
  token.position  = start_ii;
  token.line_no   = toker.line_no;
  token.column_no = toker.column_no;

  let state = toker.first_comment_seen ? "base" : "comment";;

  // Buffer to collect token text
  let buf = "";

  // One character at a time
  let ch       = "";
  let is_space = false;
  let is_eol   = false;
  let is_eof   = false;

  // Space is the normal limit between words, there are speciql cases
  let is_limit = false;

  // Some small lookahead to detect some constructs
  // ToDo: use a "    " fixed size text?
  let next_ch  = [ " ", " ", " ", " " ];
  let next_ch_ii = 0;


  function ch_is_space( ch : text ){
    return ch == "\n" || ch == "\r" || ch == "\t" || ch == " ";
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
    if( toker.eager_mode )return false;
    if( toker.style != "inox" )return false;
    if( ch == ":"
    ||  ( ch == ";" ) // ToDo: ?
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
      if( ( ii + jj ) >= toker.text_length ){
        next_ch[ jj ] = " ";
      }else{
        next_ch[ jj ] = toker.text[ ii + jj ];
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

  const is_forth = toker.style == "forth";

  eat: while( true ){

    if( de ){
      if( ii == previous_ii && state == previous_state ){
        bug( "Infinite loop detected in next_token" );
        debugger;
        ii = toker.text_length;
      }
      previous_ii    = ii;
      previous_state = state;
    }

    // EOF, end of file
    if( ii == toker.text_length ){
      // If there is a stream, try to get more text from it
      if( toker.stream ){
        const more_text = toker.stream.next();
        if( more_text != "" ){
          toker.text = more_text;
          toker.text_length = more_text.length;
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
      ch = toker.text[ ii++ ];
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
        toker.line_no++;
      }
      front_spaces = 0;
      toker.non_space_seen = false;
      // Process it as if it were a space
      ch = " ";
      is_space = true;

    // Count front spaces on new line to detect changed indentation
    }else if( ! toker.non_space_seen ){
      if( is_space ){
        front_spaces++;
      // If first non space on new line, emit some indentation token
      }else{
        toker.non_space_seen = true;
        // Emit either "++", "--" or "==" identation token
        if( state == "base" ){
          if( front_spaces > toker.indentation ){
            token.type = "indent";
            token.text = "++"
          }else if( front_spaces < toker.indentation ){
            token.type = "indent";
            token.text = "--"
          }else{
            token.type = "indent";
            token.text = "==";
          }
          token.column_no = front_spaces;
          toker.previous_indentation = toker.indentation;
          toker.indentation = front_spaces;
          toker.column_no = front_spaces; // ToDo: needs updates
          // Make sure first non space is processed normally next time
          ii--
          break eat;
        }
        // Emit an indentation decrease token if decreasing, a terminator
        if( state == "base"
        && front_spaces < toker.indentation
        && front_spaces == 0  // ToDo: make it possible not just one level 0
        ){
          token.type = "terminating;";
          toker.indentation = front_spaces;
          // Make sure non space is processed next time
          ii--
          break eat;
        }
        toker.indentation = front_spaces;
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
        continue eat;

      // Texts start with ", unless Forth
      // ToDo: make it configurable?
      }else if( ch == "\"" && !is_forth ){
        // ToDo: handle single quote 'xx' and backquote `xxxx`
        // ToDo: handle template text literals
        state = "text";
        start_ii = ii;
        continue eat;
      }

      // Comments start differently depending on style
      buf += ch;

      // If start of comment, change state
      if( buf == toker.comment_monoline_begin
      ||  buf == toker.comment_multiline_begin
      ){
        buf = buf.slice( 0, -1 );
        state = "comment";
        start_ii = ii;

      }else{

        // If potential start of comment, keep eating
        if( buf == toker.comment_monoline_begin_begin
        || buf == toker.comment_multiline_begin_begin
        ){
          continue eat;
        }

        // Forget buffer but keep the false start of comment part
        if( buf[0] == toker.comment_monoline_begin_begin
        ||  buf[0] == toker.comment_multiline_begin_begin
        ){
          buf = buf.slice( 0, -1 );
        } else {
          buf = "";
        }

        // Change state, the new ch will be added to the buffer, see below
        state = "word";
        start_ii = ii;
      }

    } // base state

    // Collect comment
    if( state == "comment" ){

      buf += ch;

      // When inside the first comment at the very beginning of the file
      // Different programming language have different styles
      // Icon uses literate programming with code lines started using >
      // See https://en.wikipedia.org/wiki/Comment_(computer_programming)

      if( ! toker.first_comment_seen && !is_space ){

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
      && toker.comment_monoline_begin != ""
      && ( buf.slice( 0, toker.comment_monoline_begin.length )
        == toker.comment_monoline_begin )
      ){
        // Emit token, without start of comment sequence and without lf
        token.type = "comment";
        token.text = buf.slice(
          toker.comment_monoline_begin.length,
          buf.length - 1  // - tokenizer.comment_monoline_begin.length
        );
        state = "base";
        break eat;
      }

      // If this terminates the multiline comment, emit the comment
      if( ch == toker.comment_multiline_end_end
      && buf.slice( buf.length - toker.comment_multiline_end.length )
        == toker.comment_multiline_end
      && buf.slice( 0, toker.comment_multiline_begin.length )
        == toker.comment_multiline_begin
      ){
        // Emit token, without start & end of comment sequence
        token.type = "comment_multiline";
        token.text = buf.slice(
          toker.comment_multiline_begin.length,
           buf.length - toker.comment_multiline_end.length
        );
        state = "base";
        break eat;
      }

      // Premature end of file, something else was expected
      if( is_eof ){
        token.type  = toker.first_comment_seen
        ? "error" : "eof";
        token.text = toker.first_comment_seen
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
        token.text = buf;
        break eat;
      }

      if( ch == "\n" ){
        toker.line_no++;
        toker.column_no = 0;
      }

      // ToDo: handle escape sequences
      buf += ch;
      continue eat;

    } // text state

    // Collect word characters until some limit
    if( state == "word" ){

      // If a xxx: naming prefix was there, it will come next
      if( toker.post_literal_name != "" ){
        unget_token( {
          type:      "word",
          text:      toker.post_literal_name,
          position:  start_ii,
          line_no:   toker.line_no,
          column_no: 0
        } );
        toker.post_literal_name = "";
      }

      // Comma is ignored, it is there for readability only, unless Forth
      if( ch == "," && !is_forth ){
        continue eat;
      }

      // space is a word delimiter
      if(  is_space ){
        // ToDo: refactor
        let aliased = alias( buf );
        // If simple word substitution with an alias
        if( aliased && aliased.indexOf( " " ) == -1 ){
          token.text = aliased;
          state = "base";
          break eat;
        // Unless no alias or alias expands into more than a simple word
        }else if( !aliased ){
          token.text = buf;
          state = "base";
          break eat;
        }
      }

      // Forth only uses spaces as delimiters
      if( is_forth ){
        buf += ch;
        continue eat;
      }

      // Get next next characters, some lookahead helps sometimes
      refill_next_ch();

      // Handle line continuation when \ is last character on line, unless Forth
      if( ch == "\\"
      && ch_is_eol( next_ch[ 0 ] )
      && !is_forth
      ){
        ii++;
        // Handle crlf
        if( next_ch[ 0 ] == "\n" ){
          ii++;
        }
        continue eat;
      }

      // . is a token if alone
      if( ch == toker.end_define
      && !toker.eager_mode
      ){
        is_limit = buf.length != 0 || ch_is_space( next_ch[ 0 ] );

      // ; is a token
      }else if( ch == toker.terminator_sign
      && !toker.eager_mode
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
        if( ch == "/" ){
          buf = "/";
          continue eat;
        }else{
          start_ii = ii - 1;
          token.text = ch;
          break eat;
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
          ||  next_ch[ 0 ] == "-"
          ||  ch_is_digit( next_ch[ 0 ] )
          ||  ch_is_limit( next_ch[ 0 ], "" )
          ){
            // ToDo: get rid of post_literal_name
            toker.post_literal_name = ":" + buf;
            unget_token( {
              type:      "word",
              text:      toker.post_literal_name,
              position:  start_ii,
              line_no:   toker.line_no,
              column_no: toker.column_no
            } );
            toker.post_literal_name = "";
            buf = "";
          }else{
            buf += ":";
          }
          continue eat;
        }

        // A well separated word was collected, before or with the limit
        ii--;

        // Change word if some alias was defined for it
        let word_alias = alias( buf );

        // In Inox style the aliases can expand into multiple words
        if( toker.style == "inox" && word_alias ){
          let index_space = word_alias.indexOf( " " );
          if( index_space != -1 ){
            token_de&&bug( "alias for " + buf + " is " + word_alias );
            // When this happens, restart as if from new source, base state.
            // Change source code to insert the extra stuff and scan again
            // ToDo: this breaks the index/line/column scheme
            toker.text = word_alias + toker.text.substring( ii );
            toker.text_length  = toker.text.length;
            toker.alias_cursor = word_alias.length;
            ii = 0;
            buf = "";
            state = "base";
            continue eat;
          }
        }

        token.text = word_alias || buf;
        break eat;

      }

    } // depending on word state

    // ??? state
    token.type  = "error";
    token.text = "error, bad state in next_token()";
    break eat;

  } // eat loop


  // If a xxx: naming prefix was there, it comes next
  if( toker.post_literal_name != "" ){
    unget_token( {
      type:      "word",
      text:      toker.post_literal_name,
      position:  start_ii,
      line_no:   toker.line_no,
      column_no: toker.column_no
    } );
    toker.post_literal_name = "";
  }

  // Save state for next call to next_token()
  toker.text_cursor = ii;

  if( token_de ){

    function extract_line( text, ii ){
    // Extract the line containing the token.
      let line_extract = "";
      // Cut whatever is after eol
      let part = text.slice( ii );
      let index = part.indexOf( "\n" );
      if( index != -1 ){
        line_extract = part.slice( 0, index );
      }else{
        line_extract = part;
      }
      // Add whatever is before, up to previous eol
      part = text.slice( 0, ii );
      index = part.lastIndexOf( "\n" );
      if( index != -1 ){
        line_extract = part.slice( index + 1 )
        + "<TOKEN>"
        + line_extract;
      }else{
        line_extract = "<TOKEN>" + line_extract;
      }
      if( line_extract.length > 70 ){
        line_extract = line_extract.slice( 0, 77 ) + "...";
      }
      return line_extract;
    }

    const line_extract = extract_line( toker.text, ii );

    // Trace the token, truncate long lines
    token_de&&bug( "\n"
      + "Token. next is " + token.type + " " + token.text + ", "
      + "line " + toker.line_no + " is " + line_extract + "."
    );

  }

  return token;

} // next_token()


// Some basic tests of the tokenizer

function test_token( typ : text, val : text ){

  // Save tokenizer context
  const save_cursor = toker.text_cursor;
  const save_seen   = toker.first_comment_seen;
  let token = next_token();
  // Skip indentation related tokens
  if( token.type == "indent" ){ token = next_token(); }
  let error = false;
  if( token.type != typ  ){
    bug( "Bad type from next_token(), " + token.type
    + " vs expected " + typ + "." );
    error = true;
  }
  if( val != null && token.text != val ){
    bug( "Bad value from next_token(), " + token.text
    + " vs expected " + val + "." );
    error = true;
  }
  if( error ){
    // Restore tokenizer context
    toker.text_cursor = save_cursor;
    toker.first_comment_seen = save_seen;
    debugger;
    test_token( typ, val );
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

tokenizer_restart( "() 0 1234 \",\" + : abc, ; , ." );
test_token( "comment_multiline", "" );
test_token( "word", "0"     );
test_token( "word", "1234"  );
test_token( "word", "\",\"" );
test_token( "word", "+"     );
test_token( "word", ":"     );
test_token( "word", "abc,"  );
test_token( "word", ";"     );
test_token( "word", ","     );
test_token( "word", "."     );
test_token( "eof", ""       );

tokenizer_restart( "~~\n \",\" + : -: ( ) () o( o() (| |) (- -) (( )) [ ] " );
test_token( "comment", "" );
test_token( "text", ","  );
test_token( "word", "+"  );
test_token( "word", ":"  );
test_token( "word", "-:" );
test_token( "word", "("  );
test_token( "word", ")"  );
test_token( "word", "("  );
test_token( "word", ")"  );
test_token( "word", "o(" );
test_token( "word", "o(" );
test_token( "word", ")"  );
test_token( "word", "(|" );
test_token( "word", "|)" );
test_token( "word", "(-" );
test_token( "word", "-)" );
test_token( "word", "((" );
test_token( "word", "))" );
test_token( "word", "["  );
test_token( "word", "]"  );
test_token( "eof", ""    );

tokenizer_restart( "~~\n a, abc;,. [[ ]] #[ ]# xxx.[ ] " );
test_token( "comment", "" );
test_token( "word", "a"   );
test_token( "word", "abc" );
test_token( "word", ";"   );
test_token( "word", "."   );
test_token( "word", "[["  );
test_token( "word", "]]"  );
test_token( "word", "#["  );
test_token( "word", "]#"  );
test_token( "word", "xxx" );
test_token( "word", ".["  );
test_token( "word", "]"   );
test_token( "eof", ""     );

tokenizer_restart( "( forth )\n : .\" out abc ; a!" );
test_token( "comment_multiline", " forth " );
test_token( "word", ":"   );
test_token( "word", ".\"" );
test_token( "word", "out" );
test_token( "word", "abc" );
test_token( "word", ";"   );
test_token( "word", "a!"  );
test_token( "eof", ""     );

tokenizer_restart( "/**/ to debugger inox-debugger." );
test_token( "comment_multiline", "" );
test_token( "word", "to" );
test_token( "word", "debugger"     );
test_token( "word", "inox-debugger" );
test_token( "word", "."  );
test_token( "eof",  ""   );


tokenizer_restart(
  "~~\n to aa ct: void is: as_v( void:0 );bb. .)."
);
test_token( "comment", "" );
test_token( "word", "to"    );
test_token( "word", "aa"    );
test_token( "word", "ct:"   );
test_token( "word", "void"  );
test_token( "word", "is:"   );
test_token( "word", "as_v(" );
test_token( "word", "0"     );
test_token( "word", ":void" );
test_token( "word", ")"     );
test_token( "word", ";"     );
test_token( "word", "bb"    );
test_token( "word", "."     );
test_token( "word", ".)"    );
test_token( "word", "."     );
test_token( "eof", ""       );

tokenizer_restart(
  "~||~ to ct:is: aa:bb void:0 .x! x| |x |x!"
);
test_token( "comment_multiline", "" );
test_token( "word", "to"     );
test_token( "word", "ct:is:" );
test_token( "word", "aa:bb"  );
test_token( "word", "0"      );
test_token( "word", ":void"  );
test_token( "word", ".x!"    );
test_token( "word", "x|"     );
test_token( "word", "|x"     );
test_token( "word", "|x!"    );
test_token( "eof", ""        );

tokenizer_restart(
  "~||~ it.x dup.:m d.m: m() dup.m() a:,b:"
);
test_token( "comment_multiline", "" );
test_token( "word", "it"   );
test_token( "word", ".x"   );
test_token( "word", "dup"  );
test_token( "word", ".:m"  );
test_token( "word", "d"    );
test_token( "word", ".m:"  );
test_token( "word", "m("   );
test_token( "word", ")"    );
test_token( "word", "dup"  );
test_token( "word", ".m("  );
test_token( "word", ")"    );
test_token( "word", "a:b:" );
test_token( "eof",  ""     );

tokenizer_restart(
  "~||~ a/ /a /a/b/c a/b/c a:."
);
test_token( "comment_multiline", "" );
test_token( "word", "a/" );
test_token( "word", "/a" );
test_token( "word", "/a" );
test_token( "word", "/b" );
test_token( "word", "/c" );
test_token( "word", "a/" );
test_token( "word", "b/" );
test_token( "word", "c"  );
test_token( "word", "a:" );
test_token( "word", "."  );
test_token( "eof",  ""   );


primitive( "inox-input-token", function primitive_inox_input_token(){
  const token = next_token();
  const cell = make_text_cell( token.text );
  set_name( cell, tag( token.type ) );
  move_cell( cell, PUSH() );
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
 *  Once a new word is defined, it can be executed by the machine code
 *  interpretor that can be found in the RUN() function.
 */

//const tag_inox_block             = tag( "inox-block"               );
const tag_inox_call_method_by_name = tag( "inox-call-method-by-name" );
const tag_inox_call_method_by_tag  = tag( "inox-call-method-by-tag"  );
const tag_inox_get_control         = tag( "inox-get-control"         );
const tag_inox_set_control         = tag( "inox-set-control"         );
const tag_inox_get_data            = tag( "inox-get-data"            );
const tag_inox_set_data            = tag( "inox-set-data"            );
const tag_inox_object_get          = tag( "inox-object-get"          );
const tag_inox_object_set          = tag( "inox-object-set"          );


// Stack pointers should get back to base across calls to "eval"
const base_csp = CSP;
const base_tos = TOS;


function chk(){

  de&&mand_eq( value( base_csp ), 0x0000 );

  if( CSP != base_csp ){
    bug(
      "Control stack mismatch, now " + CSP
      + ", base " + base_csp
      + ", delta " + ( base_csp - CSP )
      + ", extra push " + ( base_csp - CSP ) / words_per_cell
      + stacks_dump()
    );
    de&&mand_eq( CSP, base_csp );
    CSP = base_csp;
  }

  if( TOS != base_tos ){
    bug(
      "Data stack mismatch, now " + TOS
      + ", base "                 +   base_tos
      + ", delta "                + ( base_tos - TOS )
      + ", extra push "           + ( base_tos - TOS ) / words_per_cell
      + "\n" + stacks_dump()
    );
    // de&&mand_eq( TOS, base_tos );
    TOS = base_tos;
  }

}


function is_integer( buf : text ) : boolean {
  return ! isNaN( parseInt( buf ) );
}


function text_to_integer( buf : text ) : Value {
  const parsed = parseInt( buf );
  de&&mand( ! isNaN( parsed ) )&&_or_FATAL( "failed text_to_integer " + buf );
  return parsed |0;
}


immediate_primitive( "inox-begin-block",
  function  primitive_inox_begin_block(){ eval_begin_block_function(); }
);


immediate_primitive( "inox-end-block",
  function  primitive_inox_end_block(){ eval_end_block_function(); }
);


immediate_primitive( "inox-begin-definition",
  function  primitive_inox_begin_definition(){
    eval_begin_definition_function();
  }
);


immediate_primitive( "inox-end-definition",
  function  primitive_inox_end_definition(){ eval_end_definition_function(); }
);


const tag_create_control = tag( "inox-create-control" );
const tag_set_control    = tag( "inox-set-control"    );
const tag_get_control    = tag( "inox-get-control"    );
const tag_create_data    = tag( "inox-create-data"    );
const tag_set_data       = tag( "inox-set-data"       );
const tag_get_data       = tag( "inox-get-data"       );


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
  const old_csp = CSP;
  const old_ip  = IP;

  // The source code to evaluate is at the top of the stack, get it
  const tos = TOS;
  const source : text = cell_to_text( tos );
  clear_cell( tos );

  // Reinitialize the stream of tokens
  tokenizer_restart( source );
  eval_de&&bug( "inox-eval " + source.slice( 0, 100 ) );

  let tok     : Token;     // The next token to process
  let typ     : text;      // It's type
  let val     : text;      // It's value
  let word_id : InoxIndex; // An existing word named like the token's value

  // ToDo: these should be globals

  // A word is made of named values, like cells. Let's name that Machine Codes.
  // ToDo: use actual cells.
  type MachineCode = { type: InoxIndex, name: InoxName, value: Value };

  // A block is an array of encoded words from {} delimited source code.
  // The first cell is named inox-block, it contains the number of cells
  // in the block, including the first one and flags.
  // ToDo: it could be a normal array of cells, dynamically allocated.
  type InoxBlock = Array< MachineCode >;

  // Some syntactic constructions can nest: calls, sub expressions, etc.
  // ToDo: this should be a normal array of cells too, behaving like a stack.
  type ParseLevel = {
    depth           : InoxIndex;  // Levels nest, starting with a "base" level 0
    type            : text;       // Type of node in the AST
    name            : text;       // Often the name of a word
    word            : InoxWord;   // It's code id when such word is defined
    codes           : InoxBlock;  // Compiled machine code
    codes_count     : InoxLength; // How many machine codes in codes array
    block_start     : InoxIndex;  // For type "{", blocks, where it starts
    line_no         : InoxIndex;  // Position in source code, for err messages
    column_no       : InoxIndex;
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
    codes           : null,
    codes_count     : 0,
    block_start     : 0,
    line_no         : 0,
    column_no       : 0,
  };

  // The current level is the base level
  let level = levels[ 0 ];

  function bug_levels( title : string ){
    let buf = "Parser. Level. " + title + " ";
    let ii = 0;
    while( ii <= level.depth ){
      buf += "\n" + ii + " " + levels[ ii ].type
      + ( levels[ ii ].name ? " = " + levels[ ii ].name : "" )
      + ", line " + level.line_no
      + ".";
      ii++;
    }
    bug( buf );
  }

  function enter_level( type : text, name ){
  // Entering a ( xx yy ), a f( xx yy ), a key: x word: y; or a {} block
    let next_level = levels[ level.depth + 1 ] = {
      depth           : level.depth + 1,
      type            : type,
      name            : name,
      word            : 0,
      codes           : level.codes,        // Share codes with upper level
      codes_count     : level.codes_count,
      block_start     : 0,
      line_no         : tok.line_no ? tok.line_no : level.line_no,
      column_no       : tok.column_no ? tok.column_no : level.column_no
    };
    level = next_level;
    parse_de&&bug_levels( "Parser. Entering level, type is "
    + type + ", depth is " + level.depth + ", name is " + name);
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
  // Called when entering a new word definition, "to" if Inox dialect.
  // ToDo: should be an immediate primitive
    enter_level( "definition", "" );
    level.codes       = Array< MachineCode >();
    level.codes_count = 0;
    new_word_level    = level;
    // Next token is special, it's anything until some space
    toker.eager_mode = true;
  }

  eval_begin_definition_function = eval_begin_definition;


  function eval_end_definition(){
  // Called when terminating a new word definition, . or ; typically

    // ToDo: should be an immediate defining word

    de&&mand_neq( new_word_level.name, "" );
    //if( new_word_level.name == "ii" )debugger;
    de&&mand( new_word_level.codes_count > 0 );

    const tag_cell = tag( new_word_level.name );
    de&&mand( name( tag_cell ) != 0 );
    de&&mand_eq( name( tag_cell ), value( tag_cell ) );

    // Allocate cells, including space for header and final return
    const header = allocate_area(
      ( new_word_level.codes.length + 2 ) * size_of_cell
    );

    // flags and length need an extra word, so does the ending "return"
    set_value( header, new_word_level.codes_count + 1 );

    // Skip that header
    const def = header + 1 * words_per_cell;

    // Copy word definition into newly allocated memory
    let ii = 0;
    let w : MachineCode;
    while( ii < new_word_level.codes_count ){
      w = new_word_level.codes[ ii ];
      if( de && w.name == tag_inox_block && w.type != 0 ){
        mand_neq( w.value & block_word_flag, 0 );
      }
      set_cell( def + ii * words_per_cell, w.type, w.name, w.value );
      ii++;
    }

    // Add code to return from word, aka "return" special code
    set_return_cell( def + ii * words_per_cell );
    //if( new_word_level.name == "ii" )debugger;

    const new_word_tag_id = name( tag_cell );
    de&&mand( new_word_tag_id != 0 );
    const word_cell = make_inox_word( new_word_tag_id, def );

    // Update the global variable that definition flag setters use
    the_last_defined_inox_word = name( word_cell );

    if( de ){
      mand_eq( name( tag_cell ), tag( new_word_level.name ) );
      const chk_def = inox_word_definition_by_text_name( new_word_level.name );
      de&&mand_eq( chk_def, def );
      //  Check that there is a final return.
      de&&mand_eq( value( chk_def + ii * words_per_cell ), 0 );
    }

    leave_level();

    // Change compilation state
    new_word_level = null;

    eval_de&&bug( "\n" + inox_word_cell_to_text_definition( word_cell ) );
    //debugger

  } // eval_add_new_inox_word()

  eval_end_definition_function = eval_end_definition;


  function is_compiling() : boolean {
    if( new_word_level )return true;
    if( level.codes    )return true;
    return false;
  }


  function eval_do_literal( c ){
    eval_de&&bug( "Eval. push literal " + cell_dump( c ) );
    if( is_compiling() && immediate_mode_level == 0 ){
      eval_de&&bug( "Eval. Compile literal " + cell_dump( c ) );
      level.codes[ level.codes_count++ ]
      = { type: type( c ), name: name( c ), value: value( c ) };
      raw_clear_cell( c );
    }else{
      move_cell( c, PUSH() );
      stack_de&&bug( "PUSH LITERAL\n" + stacks_dump() );
    }
  };

  eval_do_literal_function = eval_do_literal;


  function eval_do_text_literal( t : text ){
    eval_de&&bug( "Eval. Do text literal " + t );
    if( t == ".\"" )debugger;
    const temp = make_text_cell( t );
    eval_do_literal( temp );
    clear_and_free_cell( temp );
  }


  function eval_do_tag_literal( t : text ){
    eval_de&&bug( "Eval. Do tag literal " + t );
    //if( t == "void" )debugger;
    tag( t );
    const temp = make_tag_cell( t );
    eval_do_literal( temp );
    raw_clear_cell( temp );
    free_cell( temp );
  }


  function eval_do_integer_literal( i : number ){
    eval_de&&bug( "Eval. Do integer literal " + i );
    const temp = make_integer_cell( i );
    eval_do_literal( temp );
    raw_clear_cell( temp );
    free_cell( temp );
  }


  function add_machine_code( code : Tag ){
  // Add a word to the beeing built block or new word
    de&&mand( is_compiling() );
    // Inline code definition if it is very short or if word requires it
    const def = definition_by_tag( code );
    const length = definition_length( def ) - 1;  // skip "return"
    if( length <= 1 || is_inline_inox_word( code ) ){
      for( let ii = 0 ; ii < length ; ii++ ){
        const c = def + ii * words_per_cell;
        level.codes[ level.codes_count++ ]
        = { type: type( c ), name: name( c ), value: value( c )};
      }
    }else{
      // ToDo: I should use the value to store the definition address.
      // But then what happens when the definition is changed?
      // Should the old or new definition be used?
      // If the old definition is used, it may optionaly jump to the new one.
      // So that it is possible to redefine a word without breaking existing
      // code that uses it. However, this means that there is now an overhead
      // for all the old definitions. But is it worse than the overhead of
      // looking up the definition address each time the word is used?
      // There could also be a "final" flag that would tell the compiler
      // that the definition of the word will not change anymore. In that
      // case, the compiler can use the value to store the definition address.
      // One may still redefine the word, ignoring the final flag, but then
      // the new definition will be for new words only, it would not affect
      // existing code that would still use the old definition, at full speed.
      // I will study this later, avoiding premature optimization.
      level.codes[ level.codes_count++ ]
      = { type: type_word, name: code, value: 0 }
    }
    // Remember last added code, see inox-last-token
    set_value( the_last_token_cell, code );
  }


  function eval_do_machine_code( tag : InoxName ){

    const code_id = inox_word_tag_by_tag( tag );
    if( code_id == 0 ){
      bug( "Eval. do_machine_code, unknown word " + tag_to_text( tag ) );
      debugger;
      return;
    }

    // Run now or add to definition of a new word?
    if( ! is_compiling()
    || is_immediate_inox_word( code_id )
    || immediate_mode_level != 0
    ){
      eval_de&&bug(
        "Eval. do_machine_code, RUN "
        + code_id + " " + inox_word_to_text( code_id )
      );

      // Remember in control stack what word is beeing entered
      set_info( CSP, pack( type_void, code_id ) );
      SET_IP( definition_by_tag( code_id ) );

      // bug( inox_word_to_text_definition( code_id ) );
      de&&mand( TOS <= ACTOR.stack );

      // ToDo: should reverse control and never use .run(), ie be stack less
      if( de && IP == 0 ){
        bug( "Eval, do_machine_code, RUN, invalid " + code_id );
        debugger;
        return;
      }

      stack_de&&bug( "Eval. Before immediate RUN of "
        + inox_word_to_text( code_id )
        + "\n" + stacks_dump()
      );
      RUN();

      de&&mand( TOS <= ACTOR.stack );
      if( de ){
        stack_de&&bug( "\nEval. After immediate RUN of "
          + inox_word_to_text( code_id )
          + "\n" + stacks_dump()
        );
        if( CSP != old_csp ){
          bug( "??? Eval. do_machine_code, CSP changed by "
          + inox_word_to_text( code_id ) );
          debugger;
          SET_CSP( old_csp );
        }
        let ip = IP;
        if( ip && ip != old_ip ){
          bug( "??? Eval. do_machine_code, IP changed by "
          + inox_word_to_text( code_id ) );
          debugger;
          SET_IP( old_ip );
        }
      }

    // When adding to the definition of a new word or block
    }else{
      eval_de&&bug(
        "Eval. do_machine_code, compile "
        + code_id + " " + inox_word_to_text( code_id )
      );
      add_machine_code( code_id );
    }

  };

  eval_do_machine_code_function = eval_do_machine_code;


  let must_not_compile_next_token = false;

  eval_quote_next_token_function = function eval_quote_next_token(){
    must_not_compile_next_token = true;
  };

  function eval_begin_block(){
    enter_level( "block {", "" );
    // ToDo: value could be a qualifier about the block
    eval_do_machine_code( tag_inox_block );
    level.block_start = level.codes_count;
    // Reserve one word for block's length, like for word definitions
    level.codes[ level.codes_count++ ] = {
      type:  type_integer,
      name:  tag_inox_block,
      value: 0
    };
  }

  eval_begin_block_function = eval_begin_block;


  function eval_end_block(){
    // Add a "return" at the end of the block
    level.codes[ level.codes_count++ ] = {
      type:  type_void,
      name:  0, // ToDo: ? tag_inox_return,
      value: 0
    };
    const block_length = level.codes_count - level.block_start;
    // Set argument for inox-block, make it look like a valid literal
    de&&mand_eq( level.codes[ level.block_start ].name, tag_inox_block )
    level.codes[ level.block_start ].value
    // = 0x80000000 | 0x20000000 | ( block_length - 1 );
    = ( block_length - 1 ) | block_word_flag;
    // -1 not to add the length word
    leave_level();
  }

  eval_end_block_function = eval_end_block;

  // Word to start a new word definition
  let define : text = "to";
  // That's for the Inox dialect, Forth uses shorter :

  // Helpers to strip prefix and suffix from a word
  const operand_X  = ( v ) => v.slice( 1 );
  const operand__X = ( v ) => v.slice( 2 );
  const operand_X_ = ( v ) => v.slice( 1, v.length - 1 );
  const operandX_  = ( v ) => v.slice( 0, v.length - 1 );

  /*
  function operand_X( v : text ) {
    // remove first character, ex .a becomes a
    if( v.length <= 1 )return v;
    return v.slice( 1 );
  }
  function operand__X( v : text ) {
    // remove firts two characters
    if( v.length <= 2 ) return v;
    return v.slice( 2 );
  }
  function operand_X_( v : text ){
    // remove first and last characters
    if( v.length <= 2 )return v;
    return v.slice( 1, v.length - 1);
  }
  function operandX_( v : text)  {
    // remove last character
    if( v.length <= 1 )return v;
    return v.slice( 0, value.length - 1);
  }
  */

  /* ---------------------------------------------------------------------------
   *  Eval loop, until error or eof
   */

  // ToDo: stackless eval loop
  let done : boolean = false;
  let new_word_name = "";
  while( true ){

    de&&mand( TOS <= ACTOR.stack );

    tok = next_token();

    typ = tok.type;
    val = tok.text;

    word_id = 0;

    if( new_word_level ){
      new_word_name = new_word_level.name;
    }

    //if( val == "init-globals"  )debugger;
    //if( val == "cast(" )debugger;
    //if( val == "constant:" )debugger;
    //if( val == "inox-version" )debugger;
    //if( val == "is:" )debugger;
    //if( val == ")" )debugger;
    //if( val == ":void" )debugger;


    if( de && val == "token-debugger" )debugger;

    //if( value == "." && level.type == "keyword:" )debugger;

    // eval_de&&bug( "Eval. token " + type + "/" + value );

    // ~~ ? skip comments
    if( typ == "comment" || typ == "comment_multiline" ){
      // ToDo: word for definitions should be normal words
     continue;
    }

    // error ? exit loop on error
    if( typ == "error" ){
      bug( "Eval, syntax error " + val
      + " at line " + tok.line_no + ", column " + tok.column_no );
      break;
    }

    // eof ? exit loop at end of input stream
    if( typ == "eof" ){
      // ToDo: signal premature end of file
      if( level.type != "base" ){
        bug( "Eval, premature end of file" );
        debugger;
      }
      break;
    }

    // to ? it starts an Inox word definition
    // ToDo: handle this better, : and to could be words as in Forth
    // ToDo: should be outside the loop but can change inside...
    let is_forth = ( toker.style == "forth" );
    if( is_forth ){
      define = ":";
    }else if( toker.style == "inox" ){
      define = "to";
    }

    // "to" is detected only at the base level
    // ToDo: enable nested definitions?
    if( val == define && typ == "word" ){
      // As a convenience it may terminate an unfinished previous definition.
      if( level.type == "definition"
      &&  tok.column_no == 0
      &&  level.codes_count > 0
      ){
        eval_end_definition();
      }
      if( level.type == "base" ){
        eval_begin_definition();
        continue;
      }
    }

    // lf an absence of indentation may terminate a definition.
    if( typ == "indent"
    && val == "--"
    && tok.column_no == 0
    && level.type == "definition"
    && level.codes_count > 0
    ){
      eval_end_definition();
      continue;
    }

    // to xxx ? if name for the new Inox word
    if( is_compiling() && new_word_level.name == "" ){
      // ToDo: make that a primitive
      new_word_level.name = val;
      if( toker.eager_mode ){
        toker.eager_mode = false;
      }
      eval_de&&bug( "Parser. New definition for word " + val );
      if( false && val == "if:do:" ){
        token_de = true;
        debugger;
      }
      // Update global variables for primitive_inox_immediate & co
      set_name(  the_last_token_cell, tag( val ) );
      set_value( the_last_token_cell, tag( val ) );
      continue;
    } // name of new word

    // lf ? if decreased Indentation to column 0 detect the end of a definition
    if( tok.column_no == 0 && typ == "indent" && val == "--" ){
      if( is_compiling() && level.type != "definition" ){
        typ = "word";
        val = toker.end_define;
      }
    }

    // . or ; or ) or } terminator ? first close all postponed infix operators
    if( level.type == "infix"
    && ( typ == "word" )
    && ( ( val == ";" && !is_forth )
      || val == ")"
      || val == "}"
      || val == toker.end_define // "."
    )){
      leave_level();
    }

    // to again ? common error is to forget some ; ) or }
    if( new_word_level && val == define && typ == "word" ){
      bug( "Parser. Nesting error, unexpected " + val
      + " at line " + tok.line_no
      + " while expecting the end of " + level.type
      + " in definition of " + new_word_level.name
      + " at line " + level.line_no + ", column " + level.column_no
      );
      debugger;
      break;
    }

    // From now it is most often either a literal or a word.
    // If compiling a word, that literal or word is added to the current word.

    // "..." ? if text literal
    if( typ == "text" ){
      eval_do_text_literal( val );
      continue;
    }

    // If not word then there is a bug somewhere
    if( typ != "word" && typ != "indent" ){
      bug(
        "Eval. Invalid token " + typ + ", value " + val
        + ", line " + tok.line_no + ", column " + tok.column_no
      );
      debugger;
      break;
    }

    // If some form of quotation is involved, process as a tag to push now
    if( must_not_compile_next_token ){
      de&&bug( "Eval. Must not compile, " + val );
      must_not_compile_next_token = false;
      // ToDo: should store text?
      copy_cell( tag( val ), PUSH() );
      continue;
    }

    if( typ != "word" )continue;
    de&&mand( val != "" );

    // OK. It's a word.
    done = false;

    // Sometimes it is the last character that help understand
    let first_ch = val[0];
    let last_ch  = val.length > 1 ? val[ val.length - 1 ] : first_ch;

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

    // In Forth no word is special
    // ToDo: ; { and } are still special, they should be words too
    if( is_forth
    && val != ";" && val != "{" && val != "}"
    && !is_integer( val )
    ){
      word_id = inox_word_tag_by_text_name( val );
      if( word_id == 0 ){
        parse_de&&bug( "Parser. Undefined word: " + val );
        debugger;
      }

    // In Inox some words are special, they are not defined in the dictionary
    }else{
      if( first_ch != ":" && first_ch != "/"
      &&  first_ch != "." && first_ch != "|" && first_ch != "_"
      &&  last_ch  != ":" && last_ch  != "/" && last_ch  != "|" && last_ch  != "_"
      &&  last_ch  != "("
      &&  val != ")" && val != "{" && val != "}" && val != ";" && val != "."
      ){
        if( !is_integer( val ) ){
          word_id = inox_word_tag_by_text_name( val );
          if( word_id == 0 ){
            parse_de&&bug( "Parser. Undefined word: " + val );
            // ToDo: warning, user enabled
            // debugger;
          }
        }
      }
    }

    // If existing word, we're almost done
    let is_operator = false;
    if( word_id != 0 ){

      is_operator = !is_forth && !!is_operator_inox_word( word_id );

      // If operator, transform order to get to RPN, Reverse Polish Notation
      if( is_operator
      && ( level.type != "definition" && level.type != "block {" )
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
        enter_level( "infix", val );
        level.word = word_id;
        continue;
      }

      is_operator = false;

      // function calls, keyword method calls and sub expressions
      if( level.depth > 0 && level.word == 0 ){

        // If building a function call and expecting the function name
        if( level.type == "call(" &&  level.name == "" ){
          level.name = val;
          level.word = word_id;
          continue;
        }

        // If building a keyword method call
        if( level.type == "keyword:" && last_ch == ":" ){
          level.name += val;
          eval_de&&bug( "Eval. Collecting keywords:" + level.name );
          continue;
        }
      }

    } // if existing word

    // It's some undefined word but neither an operator nor xxx( nor some xxx:

    // What is it then?
    // It's some special form like operators, : terminated keywords
    // or some other weird tricks that should be handled better.


    // If known word, run it or add it to the new word beeing built
    // Unless operators and pieces of keyword calls.
    if( word_id != 0 && !is_operator ){
      // This does not apply to operators and keyword calls
      eval_do_machine_code( word_id );
      continue;
    }

    de&&mand( typ == "word" || typ == "indent" );

    // If end of definition of the new Inox word reached
    if( is_compiling()
    // && type == "word"
    && val == toker.end_define
    && level.type == "definition"
    && level.codes_count > 0
    ){
      eval_end_definition();
      continue;
    }

    let second_ch = val.length > 1 ? val[ 1 ] : "";

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
        level.name += val;

      // If first element of a xxx: aaa yyy: bbb keyword call
      }else{
        enter_level( "keyword:", val );
      }

      continue;
    }

    // if ( of xxx( type of call or ( of ( xxx yyy ) sub expression
    if( last_ch == "(" ){

      // if ( of ( expr )
      if( val == "(" ){
        enter_level( "subexpr (", "" );

      // if ( of xxx() or .xxx() calls
      }else{
        de&&mand( val.length > 1 );
        const operand = operandX_( val );
        enter_level( "call(", operand );
      }
      done = true;

    // If { start of a block inside a new word definition
    }else if( val == "{" && is_compiling() ){
      eval_begin_block();
      done = true;

    // If { start of a block but not within a definition
    }else if( val == "{" ){
      // ToDo: handle this case, avoiding memory leak
      bug( "Cannot compile block, not in a definition, "
      + "at line " + tok.line_no + ", column " + tok.column_no );
      debugger;
      done = true;

    // if } end of a block
    }else if( val == "}" ){

      if( level.type == "block {" ){
        eval_end_block();
        done = true;

      // Premature/unexpected }
      }else{
        bug( "Parser. Nesting warning, unexpected } "
        + " at line " + tok.line_no + ", column " + tok.column_no
        + ", while expecting the end of " + level.type );
        done = true;
      }

    // ) to end a function call or sub expression
    }else if( first_ch == ")"
    && ( level.type == "subexpr (" || level.type == "call(" )
    ){

      // If ) of .xxx( )
      if( level.name.length > 1 && level.name[0] == "." ){
        // ToDo: what would be the meaning of .( xxxx ) ?
        // It could call some xxxx.call method of the target object
        // popped from the data stack. This would be convenient
        // for word value and some block, function, callable, etc, objects.
        // ToDo: should it be a tag or a text literal?
        eval_do_tag_literal( operand_X( level.name ) );
        eval_do_machine_code( tag_inox_call_method_by_name );
        done = true;

      // If ) of xxx( )
      }else if( level.name.length != 0 ){
        word_id = inox_word_tag_by_text_name( level.name );
        level.word = word_id;
        if( word_id ){
          eval_do_machine_code( level.word );
        }else{
          eval_do_text_literal( level.name );
          eval_do_machine_code( tag_missing_word );
          bug( "Warning, missing word " + level.name );
        }
        done = true;
      }

      // If )abc, name result
      if( val.length > 1 ){
        eval_do_tag_literal( operand_X( val ) );
        eval_do_machine_code( tag_inox_rename );
      }

      leave_level();
      done = true;

    // ; (or .) marks the end of the keyword method call, if any
    }else if( ( val == ";" || val == toker.end_define )
    && level.type == "keyword:"
    // ToDo: }, ) and ] should also do that
    ){

      while( level.type == "keyword:" ){

        // If .xx: ... yy: ... ; method call
        if( level.name[0] == "." ){
          // ToDo: should it be a tag or a text literal?
          // Hint: use a tag if it already exist? a text otherwise?
          eval_do_tag_literal( level.name.slice( 1 ) );
          eval_do_machine_code( tag_inox_call_method_by_tag );

        // If not a method call
        }else{

          word_id = inox_word_tag_by_text_name( level.name );

          // If word does not exist, use missing-word instead
          if( word_id == 0 ){
            eval_do_text_literal( level.name );
            eval_do_machine_code( tag_missing_word );
            bug( "Warning, missing word " + level.name );
          }else{
            eval_do_machine_code( word_id );
          }
        }
        leave_level();
        done = true;

        // Close all calls if terminating ., not when ;
        if( val == ";" )break;

      }

      // dot should close every levels up to the definition one
      if( val == toker.end_define ){
        unget_token( tok );
      }


    }else if( val.length > 1 && !is_forth ){
      done = true;

      // If /xxxx, it's a tag
      if( first_ch == "/" ){
        eval_do_tag_literal( operand_X( val ) );

      // If xxx/, it's a tag too.
      }else if( last_ch == "/" ){
        eval_do_tag_literal( operandX_( val ) );

      // If |xxxx!, it's a lookup in the control stack with store
      }else if( first_ch == "|" && last_ch == "!" && val.length > 2 ){
        eval_do_tag_literal( operand_X_( val ) );
        eval_do_machine_code( tag_inox_set_control );

      // If xxxx|, it's a create in the control stack
      }else if( last_ch == "|" ){
        eval_do_tag_literal( operandX_( val ) );
        eval_do_machine_code( tag_create_control );

      // If |xxxx, it's a lookup in the control stack with fetch
      }else if( first_ch  == "|" ){
        eval_do_tag_literal( operand_X( val ) );
        eval_do_machine_code( tag_inox_get_control );

      // If .:xxxx, it's a method call
      }else if( first_ch == "." && second_ch == ":" && val.length > 2 ){
        // ToDo: should it be a tag or a text operand?
        eval_do_tag_literal( operand__X( val ) );
        eval_do_machine_code( tag_inox_call_method_by_name );

      // If .xxxx!, it's a lookup in an object with store
      }else if( first_ch == "." && last_ch == "!" && val.length > 2 ){
        eval_do_tag_literal( operand_X_( val ) );
        eval_do_machine_code( tag_inox_object_set );

      // If .xxxx, it's a lookup in an object with fetch
      }else if( first_ch  == "." ){
        eval_do_tag_literal( operand_X( val ) );
        eval_do_machine_code( tag_inox_object_get );

      // If _xxxx!, it's a lookup in the data stack with store
      }else if( first_ch == "_" && last_ch == "!" && val.length > 2 ){
        de&&mand( val.length > 1 );
        eval_do_tag_literal( operand_X_( val ) );
        eval_do_machine_code( tag_inox_set_data );

      // If _xxxx, it's a lookup in the data stack with fetch
      }else if( first_ch == "_" ){
        eval_do_tag_literal( operand_X( val ) );
        eval_do_machine_code( tag_inox_get_data );

      // If xxx_, it's a naming operation, similar to xxx| but in data stack
      }else if( last_ch == "_" ){
        de&&mand( val.length > 1 );
        eval_do_tag_literal( operandX_( val ) );
        eval_do_machine_code( tag_inox_rename );

      // If :xxxx, it's a naming operation, explicit, Forth style compatible
      }else if( first_ch == ":" ){
        // ToDo: optimize the frequent literal /tag inox-rename sequences
        de&&mand( val.length > 1 );
        eval_do_tag_literal( operand_X( val ) );
        eval_do_machine_code( tag_inox_rename );
      }else{
        done = false;
      }
    }

    if( !done ){

      // ( start of subexpression
      if( val == "(" ){
          enter_level( "subexpr (", "" );

      // if xxx(
      }else if( last_ch == "(" ){

        enter_level( "call(", val );

        // If start of xxx( ... )
        if( first_ch != "." ){
          level.name = val;
          done = true;
        }

      // Else, this is a literal number or a missing word
      }else{
        if( first_ch == "-" && is_integer( val.slice( 1 ) ) ){
          eval_do_integer_literal( - text_to_integer( val.slice( 1 ) ) );
        }else if( is_integer( val ) ){
          eval_do_integer_literal( text_to_integer( val) );
        //}else if( word_id ){ // already done above
        //  eval_do_machine_code( word_id );
        }else{
          if( val == "." && false ){
            // ToDo: fix me
            bug( "Parser. Annoying extra . dot token, skip it..." )
          }else{
            eval_do_text_literal( val );
            // Add call to method_missing
            eval_do_machine_code( tag_missing_word );
          }
        }
        done = true;
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


function primitive_trace(){
  // ToDo: output to stdout when running on POSIX systems
  console.log( "\TRACE " + cell_to_text( TOS ) );
}
primitive( "inox-trace", primitive_trace );


primitive( "inox-out", function primitive_inox_out(){
  primitive_trace();
  clear_cell( POP() );
} );


primitive( "inox-trace-stacks", function primitive_inox_trace_stacks(){
  bug( "STACKS TRACE\n" + stacks_dump() );
} );


// In some other dialects there are other names for this
define_alias( "sh",     "echo",   "out")
define_alias( "basic",  "PRINT",  "out" );
define_alias( "icon",   "write",  "out" );
define_alias( "python", "print",  "out" );
define_alias( "c",      "printf", "out" );
define_alias( "prolog", "write",  "out" );


/*
 *  To/from ASCII codes.
 */


const tag_ascii = tag( "ascii" );


primitive( "inox-ascii-character", primitive_inox_ascii_character );
function                           primitive_inox_ascii_character(){
  const char_code = value( TOS );
  const ch = String.fromCharCode( char_code );
  clear_cell( TOS );
  const txt_cell = make_text_cell( ch );
  move_cell( txt_cell, TOS );
  free_cell( txt_cell );
  set_name( TOS, tag_ascii );
}


primitive( "inox-ascii-code", primitive_inox_ascii_code );
function                      primitive_inox_ascii_code(){
  const code = cell_to_text( TOS ).charCodeAt( 0 );
  clear_cell( TOS );
  set_cell( TOS, type_integer, code, tag_ascii );
}


/* ----------------------------------------------------------------------------
 *  exports
 */

function evaluate( source_code : string ) : string {
  const text_cell = make_text_cell( source_code );
  move_cell( text_cell, TOS );
  free_cell( text_cell );
  run_inox_word( "inox-eval" );
  const result = cell_to_text( TOS );
  clear_cell( TOS );
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
  move_cell( temp_text_cell, TOS );
  free_cell( temp_text_cell );
  run_inox_word( "inox-eval" );

  // ToDo: return diff to apply instead of new state
  // ToDo: cell_to_json_text( TOS );
  let new_state = JSON.stringify( cell_to_text( TOS ) );
  clear_cell( TOS );
  // ToDo: check that stacks are empty
  return new_state;

} // process()


const fun = {
  TOS: () => TOS,
  CSP: () => CSP,
  IP:  () => IP,
  SET_TOS,
  SET_CSP,
  SET_IP,
  POP,
  PUSH,
  RUN,
  type,
  name,
  value,
  tag,
  copy_cell,
  move_cell,
  clear_cell,
  cell_to_text,
  memory_dump
}

return {
  inox,
  fun,
  primitive,
  evaluate,
  process,
  // ToDo: to_genotype(), from_genotype(), to build & use precompiled species
};

} // inox()


/* --------------------------------------------------------------------------
 *  Bootstraping and smoke test.
 */

const I = inox();
const Fun = I.fun;


function bootstrap_with_file( name ){
  const source_code = require( "fs" ).readFileSync( "lib/" + name, 'utf8');
  I.process( "{}", "{}", source_code );
}


I.primitive( "inox-source", primitive_inox_source );
function                    primitive_inox_source(){
  const name : string = Fun.cell_to_text( Fun.TOS() );
  bootstrap_with_file( name );
}


bootstrap_with_file( "bootstrap.nox" );
bootstrap_with_file( "forth.nox" );
bootstrap_with_file( "test/smoke.nox" );


// Pseudo code for a statefull event processor. Async requires promises.
/*
function processor( identity: string ){
  while( true ){
    const event = await next_event( identity );
    const state = await load_state( identity );
    const source_code = state.source_code;
    const diff = await inox.process( state, event, source_code );
    const new_state = apply( state, diff )
    await store_state( identity, new_state );
  }
}
*/

exports.inox = inox;


/* ----------------------------------------------------------------------------
 *  REPL, Read/Eval/Print/Loop. Interactive shell.
 */


const repl = require( "node:repl" );


I.primitive( "inox-repl-out", primitive_inox_repl_dot );
function                      primitive_inox_repl_dot(){
  const text = Fun.cell_to_text( Fun.TOS() );
  process.stdout.write( text );
  Fun.clear_cell( Fun.POP() );
}


I.evaluate( "~| redefine output stream |~ to basic-out inox-repl-out." );
I.evaluate( "( . writes TOS on stdout )  : .  out ;" );

process.stdout.write( "Welcome to Inox!\n" );

const loop = repl.start( {
  prompt: "ok ",
  eval: ( cmd, context, filename, callback ) => {
    const result = I.evaluate( "~~\n" + cmd );
    callback( null, result );
  },
  input:  process.stdin,
  output: process.stdout,
  ignoreUndefined: true,
  writer: result => result
} );


loop.setupHistory( ".inox_history", ( err, repl ) => {
  if( err ){
    console.log( "Inox. Error while loading history: " + err );
  }
} );

loop.on( "exit", () => {
  console.log( "Inox. Received exit event from repl" );
  process.exit();
} );

loop.on( "reset", () => {
  console.log( "Inox. Received reset event from repl" );
} );

loop.on( "SIGINT", () => {
  console.log( "Inox. Received SIGINT event from repl" );
} );


// That's all Folks!
